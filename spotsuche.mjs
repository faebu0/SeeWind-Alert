/**
 * Spotsuche im Umkreis — für den Reisemodus.
 *
 * Grundgedanke: aus OpenStreetMap-Kacheln eine Wasserkarte bauen und daraus
 * je Himmelsrichtung messen, wie weit das Wasser gegen den Wind reicht.
 *
 * Diese eine Zahl — die Anlaufstrecke — leistet zweierlei zugleich:
 *   - sie schliesst ablandigen Wind aus, denn gegen den Wind läge dann Land
 *   - sie verwirft Pfützen, auf denen sich ohnehin keine Welle aufbaut
 *
 * Bewusst über Kacheln statt über die Overpass-API: Overpass brauchte für einen
 * Umkreis von 25 km um den Gardasee über 45 Sekunden und lief in
 * Zeitüberschreitungen. Eine Kachel ist ein Bild, kommt in Millisekunden und
 * deckt mehrere Kilometer ab.
 *
 * Grenze, die man kennen muss: erkannt wird die Wasserfarbe des OSM-Standardstils.
 * Ändert sich dieser Stil, muss die Erkennung nachgezogen werden. Deshalb prüft
 * `ladeWasserkarte` das Ergebnis auf Plausibilität und meldet sich, wenn eine
 * Kachel gar kein bekanntes Land und kein Wasser enthält.
 */

const KACHELGROESSE = 256;
const ERDRADIUS_KM = 6371;

/* ------------------------------------------------------------------ *
 * Kachelrechnung
 * ------------------------------------------------------------------ */

export function zuKachel(lat, lon, zoom) {
  const n = 2 ** zoom;
  const la = (lat * Math.PI) / 180;
  return {
    x: ((lon + 180) / 360) * n,
    y: ((1 - Math.log(Math.tan(la) + 1 / Math.cos(la)) / Math.PI) / 2) * n,
  };
}

export function ausKachel(x, y, zoom) {
  const n = 2 ** zoom;
  const lon = (x / n) * 360 - 180;
  const k = Math.PI - (2 * Math.PI * y) / n;
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(k) - Math.exp(-k)));
  return { lat, lon };
}

/** Meter je Bildpunkt auf dieser Breite und Zoomstufe. */
export function meterProPixel(lat, zoom) {
  // 156543.03392 ist die Auflösung am Äquator auf Zoom 0 in Meter je Bildpunkt.
  // Sie ist bereits pro Bildpunkt gerechnet, nicht pro Kachel — deshalb hier
  // nur durch 2^zoom teilen. (Einmal durch 2^(zoom+8) geteilt, und die Karte
  // ist um den Faktor 256 zu fein: statt Dutzenden lädt sie Tausende Kacheln.)
  return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;
}

/* ------------------------------------------------------------------ *
 * Wassererkennung
 * ------------------------------------------------------------------ */

/**
 * Bewusst tolerant statt auf einen festen Farbwert: der OSM-Standardstil
 * zeichnet Wasser als helles Blau, variiert aber leicht (Uferkanten,
 * Beschriftungen, Untiefen).
 */
export function istWasserFarbe(r, g, b) {
  return b > r + 18 && b > g + 6 && b > 190 && r > 120 && r < 210;
}

/** Grün, grau, weiss, braun - alles, was klar kein Wasser ist. */
function istLandFarbe(r, g, b) {
  return !istWasserFarbe(r, g, b) && !(r === 0 && g === 0 && b === 0);
}

/* ------------------------------------------------------------------ *
 * Wasserkarte
 * ------------------------------------------------------------------ */

/**
 * Lädt die Kacheln, die den Umkreis abdecken, und liefert eine Karte mit
 * Abfragen in geografischen Koordinaten.
 *
 * @param {object} o
 * @param {number} o.lat
 * @param {number} o.lon
 * @param {number} o.umkreisKm
 * @param {number} [o.zoom]        Standard 12 (rund 25 m je Bildpunkt)
 * @param {function} [o.ladeKachel] (zoom,x,y) -> Uint8ClampedArray mit RGBA
 */
/** Grösserer Umkreis, gröbere Kacheln — sonst wird die Zahl der Kacheln unsinnig. */
export function passenderZoom(umkreisKm) {
  if (umkreisKm <= 12) return 13;
  if (umkreisKm <= 30) return 12;
  return 11;
}

export async function ladeWasserkarte(o) {
  const zoom = o.zoom ?? passenderZoom(o.umkreisKm);
  const lade = o.ladeKachel || standardLader();
  const mpp = meterProPixel(o.lat, zoom);
  const radiusPx = (o.umkreisKm * 1000) / mpp;

  const mitte = zuKachel(o.lat, o.lon, zoom);
  const von = {
    x: Math.floor(mitte.x - radiusPx / KACHELGROESSE),
    y: Math.floor(mitte.y - radiusPx / KACHELGROESSE),
  };
  const bis = {
    x: Math.floor(mitte.x + radiusPx / KACHELGROESSE),
    y: Math.floor(mitte.y + radiusPx / KACHELGROESSE),
  };

  const breite = (bis.x - von.x + 1) * KACHELGROESSE;
  const hoehe = (bis.y - von.y + 1) * KACHELGROESSE;
  const maske = new Uint8Array(breite * hoehe);

  let wasserPixel = 0;
  let landPixel = 0;
  const fehlend = [];

  // Kacheln nebeneinander holen statt nacheinander: ein Umkreis von 25 km sind
  // schnell ein paar Dutzend, und einzeln geladen wartet man zu lange.
  const offen = [];
  for (let ty = von.y; ty <= bis.y; ty++) {
    for (let tx = von.x; tx <= bis.x; tx++) offen.push({ tx, ty });
  }

  const gleichzeitig = o.gleichzeitig ?? 8;
  for (let i = 0; i < offen.length; i += gleichzeitig) {
    const block = offen.slice(i, i + gleichzeitig);
    const geladen = await Promise.all(
      block.map(({ tx, ty }) =>
        lade(zoom, tx, ty).catch(() => {
          fehlend.push(`${zoom}/${tx}/${ty}`);
          return null;
        })
      )
    );

    geladen.forEach((daten, j) => {
      if (!daten) return;
      const { tx, ty } = block[j];
      const ox = (tx - von.x) * KACHELGROESSE;
      const oy = (ty - von.y) * KACHELGROESSE;
      for (let py = 0; py < KACHELGROESSE; py++) {
        for (let px = 0; px < KACHELGROESSE; px++) {
          const k = (py * KACHELGROESSE + px) * 4;
          const r = daten[k], g = daten[k + 1], b = daten[k + 2];
          if (istWasserFarbe(r, g, b)) {
            maske[(oy + py) * breite + ox + px] = 1;
            wasserPixel++;
          } else if (istLandFarbe(r, g, b)) {
            landPixel++;
          }
        }
      }
    });

    if (o.fortschritt) o.fortschritt(Math.min(i + gleichzeitig, offen.length), offen.length);
  }

  const karte = {
    zoom,
    breite,
    hoehe,
    von,
    mpp,
    maske,
    fehlendeKacheln: fehlend,
    wasseranteil: wasserPixel / Math.max(1, wasserPixel + landPixel),

    /** Bildpunkt zu geografischer Koordinate. */
    pixelVon(lat, lon) {
      const k = zuKachel(lat, lon, zoom);
      return {
        px: Math.round((k.x - von.x) * KACHELGROESSE),
        py: Math.round((k.y - von.y) * KACHELGROESSE),
      };
    },
    koordinateVon(px, py) {
      return ausKachel(von.x + px / KACHELGROESSE, von.y + py / KACHELGROESSE, zoom);
    },
    istWasserPixel(px, py) {
      if (px < 0 || py < 0 || px >= breite || py >= hoehe) return false;
      return maske[py * breite + px] === 1;
    },
    istWasser(lat, lon) {
      const p = this.pixelVon(lat, lon);
      return this.istWasserPixel(p.px, p.py);
    },
  };

  return karte;
}

/** Im Browser über ein Bild, in Node über einen eigenen PNG-Leser. */
function standardLader() {
  if (typeof document !== "undefined" && typeof Image !== "undefined") {
    return browserLader();
  }
  return nodeLader();
}

function browserLader() {
  const leinwand = document.createElement("canvas");
  leinwand.width = KACHELGROESSE;
  leinwand.height = KACHELGROESSE;
  const ctx = leinwand.getContext("2d", { willReadFrequently: true });

  return (zoom, x, y) =>
    new Promise((erfuellen, ablehnen) => {
      const bild = new Image();
      bild.crossOrigin = "anonymous";
      bild.onload = () => {
        ctx.clearRect(0, 0, KACHELGROESSE, KACHELGROESSE);
        ctx.drawImage(bild, 0, 0);
        erfuellen(ctx.getImageData(0, 0, KACHELGROESSE, KACHELGROESSE).data);
      };
      bild.onerror = () => ablehnen(new Error("Kachel nicht ladbar"));
      bild.src = `https://tile.openstreetmap.org/${zoom}/${x}/${y}.png`;
    });
}

function nodeLader() {
  return async (zoom, x, y) => {
    const res = await fetch(`https://tile.openstreetmap.org/${zoom}/${x}/${y}.png`, {
      headers: { "User-Agent": "seewind-windalarm (github actions)" },
    });
    if (!res.ok) throw new Error(`Kachel ${zoom}/${x}/${y}: ${res.status}`);
    const { inflateSync } = await import("node:zlib");
    return dekodierePng(new Uint8Array(await res.arrayBuffer()), inflateSync);
  };
}

/* ------------------------------------------------------------------ *
 * PNG lesen (nur so viel, wie OSM-Kacheln brauchen)
 * ------------------------------------------------------------------ */

/**
 * Minimaler PNG-Leser für 8-bit-Kacheln, damit auch der Lauf ohne Browser
 * eine Wasserkarte bauen kann — und ohne zusätzliche Abhängigkeit.
 * Unterstützt Graustufen, RGB, Palette und RGBA, keine Interlace-Bilder.
 */
export function dekodierePng(bytes, inflate) {
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let i = 0; i < 8; i++) {
    if (bytes[i] !== sig[i]) throw new Error("Keine PNG-Datei");
  }

  let pos = 8;
  let breite = 0, hoehe = 0, tiefe = 0, farbtyp = 0, interlace = 0;
  const idat = [];
  let palette = null, transparenz = null;
  const sicht = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  while (pos < bytes.length) {
    const laenge = sicht.getUint32(pos);
    const typ = String.fromCharCode(bytes[pos + 4], bytes[pos + 5], bytes[pos + 6], bytes[pos + 7]);
    const daten = bytes.subarray(pos + 8, pos + 8 + laenge);

    if (typ === "IHDR") {
      breite = sicht.getUint32(pos + 8);
      hoehe = sicht.getUint32(pos + 12);
      tiefe = daten[8];
      farbtyp = daten[9];
      interlace = daten[12];
    } else if (typ === "PLTE") palette = daten.slice();
    else if (typ === "tRNS") transparenz = daten.slice();
    else if (typ === "IDAT") idat.push(daten);
    else if (typ === "IEND") break;

    pos += 12 + laenge;
  }

  if (tiefe !== 8) throw new Error(`Bittiefe ${tiefe} wird nicht gelesen`);
  if (interlace) throw new Error("Interlace wird nicht gelesen");

  const gesamt = new Uint8Array(idat.reduce((n, d) => n + d.length, 0));
  let o = 0;
  for (const d of idat) { gesamt.set(d, o); o += d.length; }
  const roh = new Uint8Array(inflate(gesamt));

  const kanaele = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[farbtyp];
  if (!kanaele) throw new Error(`Farbtyp ${farbtyp} wird nicht gelesen`);

  const zeile = breite * kanaele;
  const bild = new Uint8Array(hoehe * zeile);

  // Zeilenfilter rückgängig machen (PNG-Norm, Abschnitt 9).
  for (let y = 0; y < hoehe; y++) {
    const filter = roh[y * (zeile + 1)];
    const quelle = y * (zeile + 1) + 1;
    const ziel = y * zeile;
    for (let i = 0; i < zeile; i++) {
      const x = roh[quelle + i];
      const a = i >= kanaele ? bild[ziel + i - kanaele] : 0;
      const b = y > 0 ? bild[ziel - zeile + i] : 0;
      const c = y > 0 && i >= kanaele ? bild[ziel - zeile + i - kanaele] : 0;
      let wert;
      switch (filter) {
        case 0: wert = x; break;
        case 1: wert = x + a; break;
        case 2: wert = x + b; break;
        case 3: wert = x + ((a + b) >> 1); break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          wert = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
          break;
        }
        default: throw new Error(`Unbekannter Zeilenfilter ${filter}`);
      }
      bild[ziel + i] = wert & 0xff;
    }
  }

  // Auf RGBA vereinheitlichen, damit die Auswertung nur einen Fall kennt.
  const rgba = new Uint8ClampedArray(breite * hoehe * 4);
  for (let i = 0, j = 0; i < breite * hoehe; i++, j += 4) {
    if (farbtyp === 3) {
      const p = bild[i] * 3;
      rgba[j] = palette[p]; rgba[j + 1] = palette[p + 1]; rgba[j + 2] = palette[p + 2];
      rgba[j + 3] = transparenz && bild[i] < transparenz.length ? transparenz[bild[i]] : 255;
    } else if (farbtyp === 0) {
      rgba[j] = rgba[j + 1] = rgba[j + 2] = bild[i]; rgba[j + 3] = 255;
    } else if (farbtyp === 4) {
      rgba[j] = rgba[j + 1] = rgba[j + 2] = bild[i * 2]; rgba[j + 3] = bild[i * 2 + 1];
    } else if (farbtyp === 2) {
      rgba[j] = bild[i * 3]; rgba[j + 1] = bild[i * 3 + 1]; rgba[j + 2] = bild[i * 3 + 2];
      rgba[j + 3] = 255;
    } else {
      rgba[j] = bild[i * 4]; rgba[j + 1] = bild[i * 4 + 1];
      rgba[j + 2] = bild[i * 4 + 2]; rgba[j + 3] = bild[i * 4 + 3];
    }
  }
  return rgba;
}

/* ------------------------------------------------------------------ *
 * Anlaufstrecke und Richtungen
 * ------------------------------------------------------------------ */

const OKTANTEN = ["N", "NO", "O", "SO", "S", "SW", "W", "NW"];
const OKTANT_GRAD = { N: 0, NO: 45, O: 90, SO: 135, S: 180, SW: 225, W: 270, NW: 315 };

/**
 * Wie weit reicht das Wasser von diesem Punkt aus gegen den Wind?
 *
 * Windrichtungen werden als Herkunft angegeben: bei Wind aus NW liegt die
 * Anlaufstrecke nach NW. Steht dort Land, ist der Wind ablandig — und die
 * Strecke entsprechend kurz.
 */
export function anlaufstrecke(karte, lat, lon, gradVon, maxKm = 12) {
  const start = karte.pixelVon(lat, lon);
  const rad = (gradVon * Math.PI) / 180;
  // Bildkoordinaten: x nach Osten, y nach Süden.
  const dx = Math.sin(rad);
  const dy = -Math.cos(rad);

  const maxPixel = (maxKm * 1000) / karte.mpp;
  let gelaufen = 0;
  // Einzelne Störpixel (Beschriftungen, Bojen) dürfen nicht abbrechen.
  let luecke = 0;
  const maxLuecke = Math.max(2, Math.round(60 / karte.mpp));

  while (gelaufen < maxPixel) {
    gelaufen++;
    const px = Math.round(start.px + dx * gelaufen);
    const py = Math.round(start.py + dy * gelaufen);
    if (px < 0 || py < 0 || px >= karte.breite || py >= karte.hoehe) break;
    if (karte.istWasserPixel(px, py)) {
      luecke = 0;
    } else if (++luecke > maxLuecke) {
      gelaufen -= luecke;
      break;
    }
  }
  return Math.max(0, (gelaufen * karte.mpp) / 1000);
}

/**
 * Ein Oktant deckt 45 Grad ab, ein einzelner Strahl nur einen. Bei einem
 * schmalen See, dessen Achse schräg zu den Oktanten liegt, ginge der Strahl
 * sonst nach wenigen hundert Metern an Land — und die beste Richtung des Sees
 * fiele durch. Deshalb ein Fächer und davon die längste Strecke.
 *
 * Am Gardasee sichtbar: ohne Fächer verlor Torbole den Süd-Sektor, also
 * ausgerechnet die Ora.
 */
export function sektorStrecke(karte, lat, lon, grad, maxKm = 12) {
  let best = 0;
  for (const ab of [-15, 0, 15]) {
    best = Math.max(best, anlaufstrecke(karte, lat, lon, grad + ab, maxKm));
  }
  return best;
}

/**
 * Fahrbare Oktanten: jene, aus denen genug Wasser gegen den Wind liegt.
 * Liefert zusätzlich die gemessenen Strecken, damit die Herleitung sichtbar
 * bleibt statt als Zahl vom Himmel zu fallen.
 */
export function ableitenSektoren(karte, lat, lon, minFetchKm = 1.2) {
  const strecken = {};
  const dirs = [];
  for (const okt of OKTANTEN) {
    const km = sektorStrecke(karte, lat, lon, OKTANT_GRAD[okt]);
    strecken[okt] = Math.round(km * 10) / 10;
    if (km >= minFetchKm) dirs.push(okt);
  }
  return { dirs, strecken };
}

/* ------------------------------------------------------------------ *
 * Kandidaten finden
 * ------------------------------------------------------------------ */

/** Abstand zweier Koordinaten in Kilometern. */
export function abstandKm(aLat, aLon, bLat, bLon) {
  const r = (g) => (g * Math.PI) / 180;
  const dLat = r(bLat - aLat), dLon = r(bLon - aLon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(r(aLat)) * Math.cos(r(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * ERDRADIUS_KM * Math.asin(Math.sqrt(h));
}

/**
 * Sucht Stellen am Ufer: Wasser, aber nah genug am Land, dass man einsteigen
 * kann. Mitten auf dem See zu melden bringt niemandem etwas.
 *
 * Der Weg dahin geht bewusst nicht "Rasterpunkt nehmen, wenn zufällig Ufer in
 * der Nähe ist". Das hat beim ersten Versuch fast alles verschluckt: ein Ufer
 * ist ein schmales Band, und ein Raster von einem Kilometer trifft es nur
 * zufällig — bei einem geraden Ufer entweder immer oder nie. Ein rechteckiger
 * Testsee von 22 mal 11 Kilometern ergab so drei Punkte statt eines Dutzends.
 *
 * Stattdessen: von jedem Wasserpunkt aus das nächste Land suchen und den
 * Kandidaten davor setzen. Damit bringt jede Rasterzelle am Ufer auch einen
 * Punkt, und er liegt dort, wo man einsteigt — nicht dort, wo das Raster lag.
 *
 * @returns {Array<{lat,lon,dirs,strecken,entfernungKm,guete}>}
 */
export function findeUferpunkte(karte, o) {
  const { lat, lon, umkreisKm } = o;
  const minFetchKm = o.minFetchKm ?? 1.2;
  const mindestabstandKm = o.mindestabstandKm ?? 4;
  const uferAbstandM = o.uferAbstandM ?? o.maxUferM ?? 150;
  const schrittKm = o.schrittKm ?? 1;

  const schrittPx = Math.max(4, Math.round((schrittKm * 1000) / karte.mpp));
  const uferPx = Math.max(2, Math.round(uferAbstandM / karte.mpp));
  const kandidaten = [];
  const gesehen = new Set();

  for (let py = 0; py < karte.hoehe; py += schrittPx) {
    for (let px = 0; px < karte.breite; px += schrittPx) {
      if (!karte.istWasserPixel(px, py)) continue;

      const land = naechstesLand(karte, px, py, schrittPx);
      if (!land) continue; // mitten im offenen Wasser: kein Einstieg

      // Ein Stück vom Ufer weg ins Wasser zurück — dort steht man beim Start.
      const dx = px - land.x;
      const dy = py - land.y;
      const laenge = Math.hypot(dx, dy) || 1;
      const ux = Math.round(land.x + (dx / laenge) * uferPx);
      const uy = Math.round(land.y + (dy / laenge) * uferPx);
      if (!karte.istWasserPixel(ux, uy)) continue;

      // Benachbarte Rasterzellen finden oft dieselbe Uferstelle.
      const marke = `${Math.round(ux / uferPx)},${Math.round(uy / uferPx)}`;
      if (gesehen.has(marke)) continue;
      gesehen.add(marke);

      const k = karte.koordinateVon(ux, uy);
      const entfernung = abstandKm(lat, lon, k.lat, k.lon);
      if (entfernung > umkreisKm) continue;

      const { dirs, strecken } = ableitenSektoren(karte, k.lat, k.lon, minFetchKm);
      if (!dirs.length) continue;

      kandidaten.push({
        lat: k.lat,
        lon: k.lon,
        dirs,
        strecken,
        entfernungKm: Math.round(entfernung * 10) / 10,
        // Je länger die beste Anlaufstrecke, desto eher ein echtes Revier.
        guete: Math.max(...Object.values(strecken)),
      });
    }
  }

  // Reihenfolge: erst die längste Anlaufstrecke, bei gleichem Rang die Nähe.
  // Auf offener See laufen fast alle Strecken in die Begrenzung, und ohne den
  // zweiten Massstab lagen die Vorschläge für Tarifa zwanzig Kilometer weit
  // weg, obwohl direkt vor Ort dasselbe Wasser liegt. Auf ganze Kilometer
  // gerundet, damit hundert Meter Unterschied nicht über die Nähe entscheiden.
  kandidaten.sort((a, b) => {
    const ga = Math.round(a.guete);
    const gb = Math.round(b.guete);
    return ga !== gb ? gb - ga : a.entfernungKm - b.entfernungKm;
  });
  const behalten = [];
  for (const k of kandidaten) {
    if (behalten.some((b) => abstandKm(b.lat, b.lon, k.lat, k.lon) < mindestabstandKm)) continue;
    behalten.push(k);
    if (behalten.length >= (o.maxSpots ?? 12)) break;
  }
  return behalten;
}

/* ------------------------------------------------------------------ *
 * Aus Uferpunkten Spots machen
 * ------------------------------------------------------------------ */

/**
 * Liest den `reise`-Block aus spots.json (oder die Eingaben im Dashboard) und
 * macht daraus einen geprüften Ort mit Standardwerten. Steht hier und nicht in
 * `reise.mjs`, damit Seite und Lauf buchstäblich dieselbe Prüfung anwenden.
 */
export function ortAusKonfig(reise) {
  const lat = Number(reise.lat);
  const lon = Number(reise.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    throw new Error("Es fehlen Koordinaten (lat/lon) für den Ort.");
  }
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    throw new Error(`${lat}/${lon} liegt ausserhalb der Erde.`);
  }
  const name = String(reise.ort || "").trim() || `${lat.toFixed(3)}, ${lon.toFixed(3)}`;
  return {
    lat,
    lon,
    name,
    kurz: String(name).split(/[,(]/)[0].trim().slice(0, 18) || "Ort",
    umkreisKm: grenzeAuf(Number(reise.umkreisKm) || 25, 3, 60),
    minFetchKm: Number(reise.minFetchKm) || 1.2,
    maxSpots: grenzeAuf(Math.round(Number(reise.maxSpots) || 6), 1, 12),
  };
}

/** Uferpunkte in Spots im Format von spots.json. */
export function baueSpots(punkte, ort) {
  return punkte.map((p, i) => {
    const richtung = OKTANTEN[Math.round((peilung(ort.lat, ort.lon, p.lat, p.lon) % 360) / 45) % 8];
    // Ohne Ortsnamen aus einer Datenbank ist die Lage zum gesuchten Ort das
    // Ehrlichste, was sich sagen lässt — und auf der Karte sofort auffindbar.
    const lage = p.entfernungKm < 1 ? "direkt am Ort" : `${p.entfernungKm} km ${richtung}`;
    return {
      id: `reise-${i + 1}`,
      kurz: `${ort.kurz} ${i + 1}`,
      name: `${ort.name} — ${lage}`,
      see: `Umkreis ${ort.umkreisKm} km um ${ort.name}`,
      lat: Math.round(p.lat * 10000) / 10000,
      lon: Math.round(p.lon * 10000) / 10000,
      dirs: p.dirs,
      aktiv: true,
      quelle: "global",
      reise: true,
      strecken: p.strecken,
      entfernungKm: p.entfernungKm,
      notiz:
        `Aus der Ufergeometrie abgeleitet, längste Anlaufstrecke ${p.guete} km. ` +
        `Sagt nichts über Zugang, Einstieg oder örtliche Verbote — das gehört vor Ort geprüft.`,
    };
  });
}

/** Kurswinkel von A nach B, in Grad ab Nord. */
export function peilung(aLat, aLon, bLat, bLon) {
  const r = (g) => (g * Math.PI) / 180;
  const dLon = r(bLon - aLon);
  const y = Math.sin(dLon) * Math.cos(r(bLat));
  const x =
    Math.cos(r(aLat)) * Math.sin(r(bLat)) -
    Math.sin(r(aLat)) * Math.cos(r(bLat)) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function grenzeAuf(x, min, max) {
  return Math.max(min, Math.min(max, x));
}

/**
 * Nächster Landpunkt, ringweise nach aussen. Ausserhalb der Karte zählt nicht
 * als Land — sonst entstünde am Kartenrand ein Ufer, das es nicht gibt.
 */
function naechstesLand(karte, px, py, maxPx) {
  for (let r = 2; r <= maxPx; r += 2) {
    for (let grad = 0; grad < 360; grad += 12) {
      const x = Math.round(px + r * Math.cos((grad * Math.PI) / 180));
      const y = Math.round(py + r * Math.sin((grad * Math.PI) / 180));
      if (x < 0 || y < 0 || x >= karte.breite || y >= karte.hoehe) continue;
      if (!karte.istWasserPixel(x, y)) {
        if (!istEchtesLand(karte, x, y)) continue;
        return { x, y, r };
      }
    }
  }
  return null;
}

/**
 * Nicht alles, was nicht wasserfarben ist, ist Land. Die Karte zeichnet auch
 * Fährlinien, Seegrenzen und Beschriftungen aufs offene Wasser — und jede
 * solche Linie täuschte ein Ufer vor. In der Meerenge von Gibraltar landeten
 * so Vorschläge fünf Kilometer draussen auf See.
 *
 * Echtes Ufer hat rundherum viel Land; eine Linie im Wasser hat fast keins.
 * Gemessen: an der Küste bei Tarifa 0.44 bis 0.48, auf der Linie mitten in der
 * Meerenge 0.16.
 */
function istEchtesLand(karte, x, y, meter = 120, mindestens = 0.3) {
  const r = Math.max(2, Math.round(meter / karte.mpp));
  const schritt = Math.max(1, r >> 1);
  let land = 0;
  let alle = 0;
  for (let dy = -r; dy <= r; dy += schritt) {
    for (let dx = -r; dx <= r; dx += schritt) {
      const px = x + dx;
      const py = y + dy;
      if (px < 0 || py < 0 || px >= karte.breite || py >= karte.hoehe) continue;
      alle++;
      if (!karte.istWasserPixel(px, py)) land++;
    }
  }
  return alle > 0 && land / alle >= mindestens;
}

export { OKTANTEN, OKTANT_GRAD };
