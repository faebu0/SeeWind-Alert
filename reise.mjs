/**
 * Reisemodus im Lauf: aus den scharf gestellten Orten Spots machen.
 *
 * Der Lauf soll dasselbe finden wie das Dashboard, deshalb rechnet er mit
 * demselben Modul (`spotsuche.mjs`). Unterschiedlich ist nur, woher die
 * Kartenkacheln kommen — im Browser über ein Bild, hier über einen eigenen
 * PNG-Leser.
 *
 * Gefundene Orte werden gemerkt. Zwei Gründe: es geht schneller, und die
 * Kachelserver von OpenStreetMap sind ein Gemeingut, das man nicht zweimal am
 * Tag für dasselbe Ergebnis behelligt. Neu gesucht wird erst, wenn sich Ort,
 * Umkreis oder Einstellungen ändern.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname } from "node:path";

import { ladeWasserkarte, findeUferpunkte, ortAusKonfig, baueSpots } from "./spotsuche.mjs";

/**
 * @param {Array} orte       geprüfte Orte aus orte.mjs
 * @param {object} o
 * @param {string} [o.cache] Pfad der gemeinsamen Merkdatei
 * @param {function} [o.ladeKachel] nur für Tests
 * @param {function} [o.melde] Ausgabe, Standard console.log
 * @returns {Promise<{spots: Array, fehler: Array<{ort: string, grund: string}>}>}
 */
export async function reiseSpots(orte, o = {}) {
  const melde = o.melde || console.log;
  const merk = o.cache ? await ladeMerk(o.cache) : {};
  const spots = [];
  const fehler = [];
  let merkGeaendert = false;

  for (const eintrag of orte) {
    try {
      const ort = ortAusKonfig(eintrag);
      const schluessel = JSON.stringify([
        ort.lat, ort.lon, ort.umkreisKm, ort.minFetchKm, ort.maxSpots,
      ]);

      const alt = merk[eintrag.id];
      if (alt && alt.schluessel === schluessel && Array.isArray(alt.spots) && alt.spots.length) {
        spots.push(...benenne(alt.spots, eintrag.id));
        melde(`  ${ort.name}: ${alt.spots.length} Stellen (gemerkt)`);
        continue;
      }

      const gefunden = await sucheEinenOrt(ort, o);
      merk[eintrag.id] = {
        schluessel,
        ort: ort.name,
        stand: new Date().toISOString(),
        spots: gefunden.spots,
        wasseranteil: gefunden.wasseranteil,
      };
      merkGeaendert = true;
      spots.push(...benenne(gefunden.spots, eintrag.id));
      melde(`  ${ort.name}: ${gefunden.spots.length} Stellen (neu gesucht)`);
    } catch (err) {
      // Ein Ausfall an einem Ort darf die anderen nicht mitreissen — und die
      // Seen zu Hause schon gar nicht.
      fehler.push({ ort: eintrag.ort || eintrag.id, grund: err.message });
      melde(`  ${eintrag.ort || eintrag.id}: übersprungen — ${err.message}`);
    }
  }

  // Orte, die nicht mehr in der Liste stehen, aus der Merkdatei werfen.
  const lebend = new Set(orte.map((e) => e.id));
  for (const id of Object.keys(merk)) {
    if (!lebend.has(id)) {
      delete merk[id];
      merkGeaendert = true;
    }
  }

  if (o.cache && merkGeaendert) await speichereMerk(o.cache, merk);
  return { spots, fehler };
}

async function sucheEinenOrt(ort, o) {
  const karte = await ladeWasserkarte({
    lat: ort.lat,
    lon: ort.lon,
    umkreisKm: ort.umkreisKm,
    ladeKachel: o.ladeKachel,
  });

  // Fehlende Kacheln machen lautlos aus einem See eine Wüste: die Maske bleibt
  // leer, die Suche findet nichts, und der Lauf meldete "0 Spots" statt zu
  // sagen, dass er gar keine Karte hatte.
  const kacheln = (karte.breite / 256) * (karte.hoehe / 256);
  if (karte.fehlendeKacheln.length > Math.max(1, Math.round(kacheln * 0.1))) {
    throw new Error(
      `${karte.fehlendeKacheln.length} von ${kacheln} Kartenkacheln kamen nicht an`
    );
  }

  const punkte = findeUferpunkte(karte, {
    lat: ort.lat,
    lon: ort.lon,
    umkreisKm: ort.umkreisKm,
    minFetchKm: ort.minFetchKm,
    maxSpots: ort.maxSpots,
  });

  return {
    spots: baueSpots(punkte, ort),
    wasseranteil: Math.round(karte.wasseranteil * 100) / 100,
  };
}

/**
 * Spot-Kennungen müssen über alle Orte eindeutig bleiben, sonst überschreibt
 * die Prognose des einen Orts die des anderen — und der Meldestand hielte zwei
 * verschiedene Stellen für dieselbe.
 */
function benenne(spots, ortId) {
  return spots.map((s) => ({ ...s, id: `${ortId}--${s.id}`, ortId }));
}

async function ladeMerk(pfad) {
  if (!existsSync(pfad)) return {};
  try {
    const daten = JSON.parse(await readFile(pfad, "utf8"));
    return daten && typeof daten === "object" && !Array.isArray(daten) ? daten : {};
  } catch {
    return {}; // Kaputte Merkdatei ist kein Grund abzubrechen — dann eben neu suchen.
  }
}

async function speichereMerk(pfad, daten) {
  await mkdir(dirname(pfad), { recursive: true });
  await writeFile(pfad, JSON.stringify(daten, null, 1));
}
