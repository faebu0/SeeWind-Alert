/**
 * Die Liste der scharf gestellten Reiseorte.
 *
 * Liegt bewusst in einer eigenen Datei, nicht in `spots.json`: geschrieben wird
 * sie von Knöpfen — im Dashboard und in Telegram — und was eine Maschine
 * schreibt, soll nicht in derselben Datei stehen wie das, was von Hand gepflegt
 * wird. So kann ein misslungener Schreibvorgang die Seen zu Hause nicht
 * beschädigen.
 *
 * Läuft ohne Node-Anteile, damit die Seite dieselben Funktionen benutzen kann.
 * Lesen und Schreiben der Datei macht der Aufrufer.
 */

const MAX_ORTE = 12;

/** Grundgerüst einer leeren Liste. */
export function leereListe() {
  return {
    _hinweis:
      "Wird vom Dashboard und von Telegram gepflegt. Von Hand aendern geht auch: " +
      "aktiv true oder false schaltet einen Ort ein und aus.",
    orte: [],
  };
}

/**
 * Macht aus allem, was in der Datei stehen könnte, eine saubere Liste.
 * Kaputte Einträge fliegen raus statt den Lauf abzubrechen — eine halb
 * geschriebene Datei darf den Windalarm nicht lahmlegen.
 */
export function leseListe(roh) {
  const liste = leereListe();
  const quelle = Array.isArray(roh?.orte) ? roh.orte : [];
  for (const eintrag of quelle) {
    const ort = pruefeOrt(eintrag);
    if (ort && !liste.orte.some((o) => o.id === ort.id)) liste.orte.push(ort);
  }
  return liste;
}

/**
 * Der alte `reise`-Block aus spots.json gilt weiter. Wer ihn eingetragen hat,
 * soll nicht merken, dass sich darunter etwas geändert hat.
 */
export function ausAltemBlock(reise) {
  if (!reise || reise.aktiv !== true) return null;
  return pruefeOrt({ ...reise, aktiv: true, quelle: "spots.json" });
}

/** Alle Orte, die gerade gemeldet werden sollen. */
export function aktiveOrte(liste, altBlock) {
  const alt = ausAltemBlock(altBlock);
  const alle = alt ? [alt, ...liste.orte] : [...liste.orte];
  const gesehen = new Set();
  return alle.filter((o) => {
    if (!o.aktiv || gesehen.has(o.id)) return false;
    gesehen.add(o.id);
    return true;
  });
}

/**
 * Ort ergänzen oder, wenn es ihn schon gibt, auffrischen und einschalten.
 * @returns {{liste: object, ort: object, neu: boolean}}
 */
export function ergaenze(liste, roh, jetzt = new Date()) {
  const ort = pruefeOrt({ ...roh, aktiv: true });
  if (!ort) throw new Error("Der Ort ist unvollständig — Name und Koordinaten fehlen.");

  const kopie = { ...liste, orte: [...liste.orte] };
  const i = kopie.orte.findIndex((o) => o.id === ort.id);
  if (i >= 0) {
    kopie.orte[i] = { ...kopie.orte[i], ...ort, seit: kopie.orte[i].seit || zeit(jetzt) };
    return { liste: kopie, ort: kopie.orte[i], neu: false };
  }

  if (kopie.orte.length >= MAX_ORTE) {
    throw new Error(
      `Mehr als ${MAX_ORTE} Orte werden nicht verwaltet — erst einen aus der Liste entfernen.`
    );
  }
  ort.seit = zeit(jetzt);
  kopie.orte.push(ort);
  return { liste: kopie, ort, neu: true };
}

/** An- oder abschalten. `an` weglassen kehrt um. */
export function schalte(liste, id, an) {
  const kopie = { ...liste, orte: [...liste.orte] };
  const i = kopie.orte.findIndex((o) => o.id === id);
  if (i < 0) return { liste, ort: null };
  const neu = { ...kopie.orte[i], aktiv: an === undefined ? !kopie.orte[i].aktiv : Boolean(an) };
  kopie.orte[i] = neu;
  return { liste: kopie, ort: neu };
}

/** Ganz aus der Liste nehmen. */
export function entferne(liste, id) {
  const ort = liste.orte.find((o) => o.id === id) || null;
  if (!ort) return { liste, ort: null };
  return { liste: { ...liste, orte: liste.orte.filter((o) => o.id !== id) }, ort };
}

/* ------------------------------------------------------------------ *
 * Prüfung
 * ------------------------------------------------------------------ */

export function pruefeOrt(roh) {
  if (!roh) return null;
  const lat = Number(roh.lat);
  const lon = Number(roh.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;

  const name = String(roh.ort || roh.name || "").trim().slice(0, 60) ||
    `${lat.toFixed(3)}, ${lon.toFixed(3)}`;

  return {
    id: roh.id && typeof roh.id === "string" ? roh.id.slice(0, 40) : ortId(name, lat, lon),
    ort: name,
    lat: Math.round(lat * 10000) / 10000,
    lon: Math.round(lon * 10000) / 10000,
    umkreisKm: grenze(Math.round(Number(roh.umkreisKm) || 25), 3, 60),
    minFetchKm: grenze(Number(roh.minFetchKm) || 1.2, 0.3, 20),
    maxSpots: grenze(Math.round(Number(roh.maxSpots) || 6), 1, 12),
    aktiv: roh.aktiv !== false,
    seit: typeof roh.seit === "string" ? roh.seit : "",
  };
}

/**
 * Kennung aus Name und Koordinaten. Derselbe Ort ergibt dieselbe Kennung —
 * wer Tarifa zweimal übernimmt, bekommt keinen zweiten Eintrag. Die Koordinaten
 * gehen auf zwei Nachkommastellen ein, also rund einen Kilometer genau: ein
 * Fingertipp daneben soll nicht als neuer Ort durchgehen.
 */
export function ortId(name, lat, lon) {
  const wort =
    String(name)
      .toLowerCase()
      .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 18) || "ort";
  const z = (x) => String(Math.round(x * 100)).replace("-", "m");
  return `${wort}-${z(lat)}-${z(lon)}`;
}

function grenze(x, min, max) {
  return Math.max(min, Math.min(max, x));
}

function zeit(d) {
  return new Date(d).toISOString().slice(0, 19) + "Z";
}

/* ------------------------------------------------------------------ *
 * Nutzlast für den Telegram-Link
 * ------------------------------------------------------------------ */

/**
 * Telegram erlaubt an einem t.me-Link höchstens 64 Zeichen Nutzlast, und nur
 * A-Z a-z 0-9 _ und -. Deshalb ein eigenes, knappes Format statt JSON:
 *
 *   <Name>~<lat>~<lon>~<Umkreis>   →  Base64 ohne Polsterung, url-sicher
 *
 * Passt der Name nicht mehr hinein, wird er gekürzt — die Koordinaten sind das,
 * worauf es ankommt.
 */
export function packeOrt(ort) {
  const zahl = (x) => String(Math.round(x * 10000) / 10000);
  for (let laenge = 24; laenge >= 0; laenge -= 2) {
    const name = String(ort.ort || "").slice(0, laenge).replace(/~/g, " ").trim();
    const roh = `${name}~${zahl(ort.lat)}~${zahl(ort.lon)}~${Math.round(ort.umkreisKm || 25)}`;
    const nutz = zuBase64Url(roh);
    if (nutz.length <= 64) return nutz;
  }
  return "";
}

export function entpackeOrt(nutzlast) {
  try {
    const teile = ausBase64Url(String(nutzlast)).split("~");
    if (teile.length < 3) return null;
    return pruefeOrt({
      ort: teile[0],
      lat: Number(teile[1]),
      lon: Number(teile[2]),
      umkreisKm: Number(teile[3]) || 25,
    });
  } catch {
    return null;
  }
}

/**
 * Base64 über UTF-8. `btoa` allein genügt nicht: es kennt nur Zeichen bis 255
 * und wirft bei jedem Umlaut. Die GitHub-Schnittstelle nimmt Dateiinhalte in
 * genau diesem Format entgegen, deshalb steht es hier und nicht in der Seite.
 */
export function zuBase64(text) {
  const bytes = new TextEncoder().encode(text);
  if (typeof btoa === "function") {
    let roh = "";
    // In Blöcken, damit ein langer Text den Aufrufstapel nicht sprengt.
    for (let i = 0; i < bytes.length; i += 8192) {
      roh += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
    }
    return btoa(roh);
  }
  return Buffer.from(bytes).toString("base64");
}

export function ausBase64(b64) {
  const sauber = String(b64).replace(/\s+/g, "");
  if (typeof atob === "function") {
    const roh = atob(sauber);
    const bytes = new Uint8Array(roh.length);
    for (let i = 0; i < roh.length; i++) bytes[i] = roh.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }
  return Buffer.from(sauber, "base64").toString("utf8");
}

function zuBase64Url(text) {
  return zuBase64(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function ausBase64Url(text) {
  const b64 = text.replace(/-/g, "+").replace(/_/g, "/");
  return ausBase64(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
}
