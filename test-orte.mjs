#!/usr/bin/env node
/**
 * Prueft die Orteliste: ergaenzen, schalten, entfernen, kaputte Dateien
 * ueberstehen, und die kurze Nutzlast fuer den Telegram-Link.
 *
 *   node test-orte.mjs
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const WURZEL = dirname(fileURLToPath(import.meta.url));
const O = await import(join(WURZEL, "orte.mjs"));

let liste = O.leereListe();
const pruef = [];
const sag = (n, b, zusatz="") => pruef.push((b ? "ok  " : "FEHL") + "  " + n + (zusatz ? " — " + zusatz : ""));

// Ergänzen
let r = O.ergaenze(liste, { ort: "Tarifa", lat: 36.0139, lon: -5.6069, umkreisKm: 25 });
liste = r.liste;
sag("Ort ergänzt", r.neu && liste.orte.length === 1, r.ort.id);

// Derselbe Ort nochmal -> kein zweiter Eintrag
r = O.ergaenze(liste, { ort: "Tarifa", lat: 36.0141, lon: -5.6072, umkreisKm: 30 });
liste = r.liste;
sag("Derselbe Ort wird aufgefrischt statt verdoppelt", !r.neu && liste.orte.length === 1 && liste.orte[0].umkreisKm === 30);

// Zweiter Ort
r = O.ergaenze(liste, { ort: "Torbole", lat: 45.87, lon: 10.87, umkreisKm: 20 });
liste = r.liste;
sag("Zweiter Ort", liste.orte.length === 2);

// Schalten
const id = liste.orte[0].id;
liste = O.schalte(liste, id, false).liste;
sag("Abgeschaltet", liste.orte[0].aktiv === false);
sag("Nur noch ein aktiver Ort", O.aktiveOrte(liste, null).length === 1);
liste = O.schalte(liste, id).liste;
sag("Umgeschaltet zurück", liste.orte[0].aktiv === true);

// Entfernen
const weg = O.entferne(liste, id);
sag("Entfernt", weg.liste.orte.length === 1 && weg.ort.ort === "Tarifa");
sag("Unbekannte Kennung ändert nichts", O.entferne(liste, "gibtsnicht").liste.orte.length === 2);

// Alter Block
const alt = O.ausAltemBlock({ aktiv: true, ort: "Alt", lat: 46.9, lon: 7.4, umkreisKm: 15 });
sag("Alter reise-Block gilt weiter", alt && alt.ort === "Alt");
sag("Alter Block inaktiv wird ignoriert", O.ausAltemBlock({ aktiv: false, lat: 46.9, lon: 7.4 }) === null);
sag("Alter Block kommt in die aktiven Orte", O.aktiveOrte(liste, { aktiv: true, ort: "Alt", lat: 46.9, lon: 7.4 }).length === 3);

// Kaputte Datei
const kaputt = O.leseListe({ orte: [ {ort:"gut", lat:47, lon:7}, {ort:"ohne Koordinaten"}, null, {lat:"abc", lon:7}, {ort:"jenseits", lat:99, lon:7} ] });
sag("Kaputte Einträge fliegen raus", kaputt.orte.length === 1, kaputt.orte.length + " übrig");
sag("Gar keine Datei", O.leseListe(undefined).orte.length === 0);

// Grenzen
const eng = O.pruefeOrt({ ort:"x", lat:47, lon:7, umkreisKm: 500, maxSpots: 99, minFetchKm: 0 });
sag("Umkreis begrenzt", eng.umkreisKm === 60 && eng.maxSpots === 12 && eng.minFetchKm === 1.2);

// Obergrenze
let viele = O.leereListe();
for (let i = 0; i < 12; i++) viele = O.ergaenze(viele, { ort: "Ort" + i, lat: 40 + i, lon: 5 }).liste;
let geblockt = false;
try { O.ergaenze(viele, { ort: "zuviel", lat: 10, lon: 10 }); } catch { geblockt = true; }
sag("Obergrenze greift", geblockt && viele.orte.length === 12);

// Telegram-Nutzlast
for (const p of [
  { ort: "Tarifa", lat: 36.0139, lon: -5.6069, umkreisKm: 25 },
  { ort: "Ein sehr langer Ortsname mit vielen Zeichen", lat: -45.1234, lon: 168.9876, umkreisKm: 60 },
  { ort: "Zürich Übersee~Test", lat: 47.3, lon: 8.5, umkreisKm: 5 },
]) {
  const packet = O.packeOrt(p);
  const zurueck = O.entpackeOrt(packet);
  const passt = zurueck && Math.abs(zurueck.lat - p.lat) < 0.0001 && Math.abs(zurueck.lon - p.lon) < 0.0001
    && zurueck.umkreisKm === Math.max(3, Math.min(60, p.umkreisKm));
  sag(`Nutzlast "${p.ort.slice(0,18)}"`, packet.length <= 64 && packet.length > 0 && /^[A-Za-z0-9_-]+$/.test(packet) && passt,
      `${packet.length} Zeichen, zurück: ${zurueck && zurueck.ort}`);
}
sag("Unsinnige Nutzlast gibt null", O.entpackeOrt("!!!nicht base64!!!") === null || O.entpackeOrt("Zm9v") === null);

console.log(pruef.join("\n"));
console.log(pruef.some(z => z.startsWith("FEHL")) ? "\nEs gibt Fehler." : "\nAlles grün.");

process.exit(pruef.some(z => z.startsWith("FEHL")) ? 1 : 0);
