#!/usr/bin/env node
/**
 * Ein Lauf: Prognose holen, Fenster suchen, Dashboard schreiben, neue Fenster melden.
 *
 *   node run.mjs                        normaler Lauf
 *   node run.mjs --dry                  alles rechnen und schreiben, aber nichts senden
 *   node run.mjs --fixture datei        Prognose aus einer Datei statt aus dem Netz
 *   node run.mjs --kanal smtp           Meldekanal erzwingen
 *   node run.mjs --test                 nur eine Testmeldung schicken
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { holePrognose, alleFenster, schluessel, tagLabel, uhr } from "./lib.mjs";
import { baueSeite } from "./template.mjs";
import { melde, testMeldung, waehleKanal, pruefeZugang } from "./melder.mjs";
import { baueIcs, baueIcsEinzeln } from "./ics.mjs";

const WURZEL = dirname(fileURLToPath(import.meta.url));
const KONFIG = join(WURZEL, "spots.json");
const STAND = join(WURZEL, "state", "gemeldet.json");
const SEITE = join(WURZEL, "docs", "index.html");
const ROHDATEN = join(WURZEL, "docs", "prognose.json");
// Verhindert, dass GitHub Pages die fertige Seite noch durch Jekyll schickt.
const NOJEKYLL = join(WURZEL, "docs", ".nojekyll");
const KALENDER = join(WURZEL, "docs", "fenster.ics");

const args = process.argv.slice(2);
const trocken = args.includes("--dry");
const fixtureIdx = args.indexOf("--fixture");
const fixture = fixtureIdx >= 0 ? args[fixtureIdx + 1] : null;
const kanalIdx = args.indexOf("--kanal");
const kanalArg = kanalIdx >= 0 ? args[kanalIdx + 1] : null;

main().catch((err) => {
  console.error("Lauf fehlgeschlagen:", err.message);
  process.exit(1);
});

async function main() {
  // Testmeldung: prüft nur den Meldekanal, ohne Prognose und ohne Dashboard.
  if (args.includes("--test")) {
    const kanal = kanalArg || waehleKanal();
    console.log(`Testmeldung über ${kanal} …`);
    const r = await testMeldung({ kanal });
    if (!r.gesendet) {
      console.error(`Nicht gesendet: ${r.grund}`);
      console.log("---\n" + r.text + "\n---");
      process.exit(1);
    }
    console.log("Gesendet. Wenn sie ankommt, ist der Kanal fertig eingerichtet.");
    return;
  }

  const konfig = JSON.parse(await readFile(KONFIG, "utf8"));
  const kriterien = konfig.kriterien;
  const spots = konfig.spots;
  const aktive = spots.filter((s) => s.aktiv !== false);

  if (!aktive.length) {
    console.log("Kein Spot aktiv — nichts zu tun.");
    return;
  }

  const reihen = fixture
    ? JSON.parse(await readFile(fixture, "utf8"))
    : await holePrognose(aktive, kriterien);

  const gezaehlt = Object.values(reihen).reduce((n, r) => n + r.length, 0);
  console.log(`${gezaehlt} Prognosestunden für ${aktive.length} Spots.`);
  if (!gezaehlt) throw new Error("Die Prognose kam leer zurück — Lauf abgebrochen.");

  const treffer = alleFenster(spots, reihen, kriterien);
  console.log(`${treffer.length} Fenster gefunden.`);
  treffer.forEach((f) => {
    const t = tagLabel(f.datum);
    console.log(
      `  ${f.spotName} · ${t.kurz} ${t.datum} ${uhr(f.von)}–${uhr(f.bis)} · ` +
        `${f.wind} kn, Böen ${f.boe} kn, ${f.richtung}`
    );
  });

  const stand = neuesterStempel(reihen);

  await mkdir(dirname(SEITE), { recursive: true });
  await writeFile(
    SEITE,
    baueSeite({
      spots,
      kriterien,
      reihen,
      treffer,
      stand,
    })
  );
  await writeFile(ROHDATEN, JSON.stringify({ stand, kriterien, reihen, treffer }, null, 1));
  await writeFile(NOJEKYLL, "");

  // Kalenderdatei mit allen aktuellen Fenstern. Liegt fest unter docs/, damit
  // Outlook sie als Internetkalender abonnieren kann und sie sich selbst pflegt.
  const kalenderUrl = process.env.DASHBOARD_URL
    ? new URL("fenster.ics", process.env.DASHBOARD_URL.replace(/\/?$/, "/")).href
    : "";
  const ics = baueIcs(treffer, {
    zeitzone: kriterien.zeitzone,
    dashboardUrl: process.env.DASHBOARD_URL || "",
    status: process.env.KALENDER_STATUS || "BUSY",
  });
  await writeFile(KALENDER, ics);
  console.log(`Dashboard und Kalender geschrieben (${treffer.length} Termine).`);

  const gemeldet = await ladeStand();
  const heute = new Date().toISOString().slice(0, 10);
  const neue = treffer.filter((f) => !gemeldet[schluessel(f)]);

  if (!neue.length) {
    console.log("Keine neuen Fenster — keine Meldung.");
    await speichereStand(aufraeumen(gemeldet, heute));
    return;
  }

  const kanal = kanalArg || waehleKanal();
  const hindernis = trocken ? null : pruefeZugang(kanal);

  const ergebnis = await melde(neue, {
    kanal,
    trocken: trocken || Boolean(hindernis),
    // Je neuem Fenster eine eigene Datei: so kann man einzeln auswählen, was
    // im Kalender landet. Der abonnierbare Kalender enthält weiterhin alle.
    dateien: baueIcsEinzeln(neue, {
      zeitzone: kriterien.zeitzone,
      dashboardUrl: process.env.DASHBOARD_URL || "",
      status: process.env.KALENDER_STATUS || "BUSY",
    }),
    kalenderUrl,
  });

  if (!ergebnis.gesendet) {
    const grund = trocken ? "Trockenlauf" : hindernis || "nicht gesendet";
    console.log(`${grund} — die Nachricht über ${kanal} wäre:`);
    console.log("---\n" + ergebnis.text + "\n---");
    console.log(`(${ergebnis.text.length} Zeichen)`);
    // Nichts als gemeldet vormerken, aber die Datei anlegen: der Workflow
    // committet state/ und würde sonst über einen fehlenden Pfad stolpern.
    await speichereStand(aufraeumen(gemeldet, heute));
    return;
  }

  console.log(`Gemeldet über ${kanal}: ${neue.length} neue Fenster, ${ergebnis.text.length} Zeichen.`);

  neue.forEach((f) => (gemeldet[schluessel(f)] = new Date().toISOString()));
  await speichereStand(aufraeumen(gemeldet, heute));
}

/** Jüngster Zeitstempel über alle Reihen — der Stand, den das Dashboard zeigt. */
function neuesterStempel(reihen) {
  let erste = null;
  for (const zeilen of Object.values(reihen)) {
    if (zeilen.length && (!erste || zeilen[0].zeit < erste)) erste = zeilen[0].zeit;
  }
  return erste ?? new Date().toISOString().slice(0, 16);
}

async function ladeStand() {
  if (!existsSync(STAND)) return {};
  try {
    return JSON.parse(await readFile(STAND, "utf8"));
  } catch {
    return {};
  }
}

async function speichereStand(daten) {
  await mkdir(dirname(STAND), { recursive: true });
  await writeFile(STAND, JSON.stringify(daten, null, 1));
}

/** Einträge für vergangene Tage verfallen lassen, damit die Datei nicht wächst. */
function aufraeumen(gemeldet, heute) {
  const sauber = {};
  for (const [k, v] of Object.entries(gemeldet)) {
    const datum = k.split("|")[1];
    if (datum >= heute) sauber[k] = v;
  }
  return sauber;
}
