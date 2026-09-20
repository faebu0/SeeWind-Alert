/**
 * Reisemodus: aus einem Ort und einem Umkreis Spots machen.
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
 * @param {object} reise     der Block `reise` aus spots.json
 * @param {object} o
 * @param {string} [o.cache] Pfad der Merkdatei
 * @param {function} [o.ladeKachel] nur für Tests
 * @returns {Promise<Array>} Spots im selben Format wie die aus spots.json
 */
export async function reiseSpots(reise, o = {}) {
  const ort = ortAusKonfig(reise);
  const schluessel = JSON.stringify([
    runde(ort.lat), runde(ort.lon), ort.umkreisKm, ort.minFetchKm, ort.maxSpots,
  ]);

  if (o.cache && existsSync(o.cache)) {
    try {
      const alt = JSON.parse(await readFile(o.cache, "utf8"));
      if (alt.schluessel === schluessel && Array.isArray(alt.spots) && alt.spots.length) {
        return alt.spots;
      }
    } catch {
      // Kaputte Merkdatei ist kein Grund abzubrechen — dann eben neu suchen.
    }
  }

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
      `${karte.fehlendeKacheln.length} von ${kacheln} Kartenkacheln kamen nicht an — ` +
        `ohne Karte keine Suche. Nächster Lauf versucht es erneut.`
    );
  }

  const punkte = findeUferpunkte(karte, {
    lat: ort.lat,
    lon: ort.lon,
    umkreisKm: ort.umkreisKm,
    minFetchKm: ort.minFetchKm,
    maxSpots: ort.maxSpots,
  });

  const spots = baueSpots(punkte, ort);

  if (o.cache && spots.length) {
    await mkdir(dirname(o.cache), { recursive: true });
    await writeFile(
      o.cache,
      JSON.stringify(
        {
          schluessel,
          ort: ort.name,
          stand: new Date().toISOString(),
          wasseranteil: Math.round(karte.wasseranteil * 100) / 100,
          fehlendeKacheln: karte.fehlendeKacheln.length,
          spots,
        },
        null,
        1
      )
    );
  }

  return spots;
}

function runde(x) {
  return Math.round(x * 1000) / 1000;
}
