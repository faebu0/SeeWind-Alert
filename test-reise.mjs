#!/usr/bin/env node
/**
 * Prueft den Reisemodus im Lauf: mehrere Orte, eindeutige Kennungen, die
 * Merkdatei, und dass ein Ausfall an einem Ort die anderen nicht mitreisst.
 *
 *   node test-reise.mjs
 *
 * Die Kartenkacheln sind hier gezeichnet statt geladen — so braucht der Test
 * kein Netz und liefert bei jedem Lauf dasselbe.
 */

import { rm, readFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const WURZEL = dirname(fileURLToPath(import.meta.url));
const { reiseSpots } = await import(join(WURZEL, "reise.mjs"));
const { ausKachel } = await import(join(WURZEL, "spotsuche.mjs"));
const { leseListe, aktiveOrte } = await import(join(WURZEL, "orte.mjs"));

const MERK = join(WURZEL, "state", "test-reise.json");
const pruef = [];
const sag = (n, b, z = "") => { pruef.push((b ? "ok  " : "FEHL") + "  " + n + (z ? " — " + z : "")); return b; };

/** Zwei rechteckige Seen, weit auseinander. */
const SEEN = [
  { lat: [47.00, 47.10], lon: [7.00, 7.30] },
  { lat: [45.80, 45.95], lon: [10.80, 10.90] },
];
let geladeneKacheln = 0;

function lader(zoom, tx, ty) {
  geladeneKacheln++;
  const d = new Uint8ClampedArray(256 * 256 * 4);
  for (let py = 0; py < 256; py++) {
    for (let px = 0; px < 256; px++) {
      const k = ausKachel(tx + px / 256, ty + py / 256, zoom);
      const wasser = SEEN.some(
        (s) => k.lat > s.lat[0] && k.lat < s.lat[1] && k.lon > s.lon[0] && k.lon < s.lon[1]
      );
      const i = (py * 256 + px) * 4;
      d[i] = wasser ? 170 : 242;
      d[i + 1] = wasser ? 211 : 239;
      d[i + 2] = wasser ? 223 : 233;
      d[i + 3] = 255;
    }
  }
  return Promise.resolve(d);
}

function kaputterLader() {
  return Promise.reject(new Error("Kachelserver antwortet nicht"));
}

await rm(MERK, { force: true });
await mkdir(dirname(MERK), { recursive: true });
const still = () => {};

/* ---- Zwei Orte auf einmal ---- */
const liste = leseListe({
  orte: [
    { ort: "Testsee", lat: 47.05, lon: 7.15, umkreisKm: 20, maxSpots: 4, aktiv: true },
    { ort: "Zweitsee", lat: 45.87, lon: 10.85, umkreisKm: 15, maxSpots: 3, aktiv: true },
    { ort: "Ausgeschaltet", lat: 47.05, lon: 7.15, umkreisKm: 20, aktiv: false },
  ],
});
sag("Nur die scharfen Orte kommen durch", aktiveOrte(liste, null).length === 2);

const ersteRunde = await reiseSpots(aktiveOrte(liste, null), { cache: MERK, ladeKachel: lader, melde: still });
sag("Beide Orte liefern Stellen", ersteRunde.spots.length >= 4 && ersteRunde.fehler.length === 0,
  ersteRunde.spots.length + " Stellen");

const kennungen = ersteRunde.spots.map((s) => s.id);
sag("Kennungen sind eindeutig", new Set(kennungen).size === kennungen.length);
sag("Kennung trägt den Ort", kennungen.every((k) => k.includes("--reise-")), kennungen[0]);
sag("Jede Stelle weiss, zu welchem Ort sie gehört",
  ersteRunde.spots.every((s) => Boolean(s.ortId)));
sag("Alle Stellen sind global zu rechnen", ersteRunde.spots.every((s) => s.quelle === "global"));
sag("Beide Seen vertreten",
  new Set(ersteRunde.spots.map((s) => s.ortId)).size === 2);

/* ---- Zweite Runde nimmt die Merkdatei ---- */
const vorher = geladeneKacheln;
const zweiteRunde = await reiseSpots(aktiveOrte(liste, null), { cache: MERK, ladeKachel: lader, melde: still });
sag("Zweite Runde lädt keine Kacheln mehr", geladeneKacheln === vorher, geladeneKacheln + " insgesamt");
sag("Und liefert dasselbe", JSON.stringify(zweiteRunde.spots) === JSON.stringify(ersteRunde.spots));

/* ---- Geänderter Umkreis sucht neu ---- */
const geaendert = leseListe({
  orte: [{ id: liste.orte[0].id, ort: "Testsee", lat: 47.05, lon: 7.15, umkreisKm: 25, maxSpots: 4, aktiv: true }],
});
await reiseSpots(aktiveOrte(geaendert, null), { cache: MERK, ladeKachel: lader, melde: still });
sag("Geänderter Umkreis sucht neu", geladeneKacheln > vorher);

const merk = JSON.parse(await readFile(MERK, "utf8"));
sag("Nicht mehr gelistete Orte fliegen aus der Merkdatei",
  Object.keys(merk).length === 1, Object.keys(merk).join(", "));

/* ---- Ein Ausfall reisst die anderen nicht mit ---- */
let ruf = 0;
const teilweiseKaputt = (z, x, y) => (++ruf % 2 === 0 ? kaputterLader() : lader(z, x, y));
await rm(MERK, { force: true });
const mitAusfall = await reiseSpots(aktiveOrte(liste, null), {
  cache: MERK, ladeKachel: teilweiseKaputt, melde: still,
});
sag("Fehlende Kacheln werden als Fehler gemeldet, nicht verschwiegen",
  mitAusfall.fehler.length > 0 && /Kartenkacheln/.test(mitAusfall.fehler[0].grund),
  mitAusfall.fehler.map((f) => f.ort).join(", "));

await rm(MERK, { force: true });
const ganzKaputt = await reiseSpots(aktiveOrte(liste, null), {
  cache: MERK, ladeKachel: kaputterLader, melde: still,
});
sag("Alles kaputt heisst: keine Stellen, aber ein klarer Grund je Ort",
  ganzKaputt.spots.length === 0 && ganzKaputt.fehler.length === 2);

/* ---- Unsinnige Koordinaten ---- */
const unsinn = await reiseSpots([{ id: "x", ort: "Nirgendwo", lat: 999, lon: 999 }], {
  ladeKachel: lader, melde: still,
});
sag("Unmögliche Koordinaten werden abgewiesen",
  unsinn.spots.length === 0 && unsinn.fehler.length === 1, unsinn.fehler[0]?.grund);

await rm(MERK, { force: true });
console.log(pruef.join("\n"));
const kaputt = pruef.some((z) => z.startsWith("FEHL"));
console.log(kaputt ? "\nEs gibt Fehler." : "\nAlles grün.");
process.exit(kaputt ? 1 : 0);
