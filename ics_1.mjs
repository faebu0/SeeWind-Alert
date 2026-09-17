/**
 * Kalenderdatei (iCalendar, RFC 5545) aus den gefundenen Windfenstern.
 *
 * Zwei Verwendungen:
 *   - als Anhang zur Meldung, zum einmaligen Eintragen
 *   - als docs/fenster.ics auf GitHub Pages, den Outlook als Internetkalender
 *     abonnieren kann; dann pflegt sich der Kalender bei jedem Lauf selbst
 *
 * Zeiten werden in UTC geschrieben (Suffix Z). Das erspart einen VTIMEZONE-Block
 * und ist für jeden Kalender eindeutig — die Umrechnung passiert hier, mit der
 * echten Zeitzonendatenbank statt einem festen Offset, damit die Sommerzeit stimmt.
 */

const ZEILENENDE = "\r\n";

/**
 * @param {Array} fenster   Treffer aus lib.mjs
 * @param {object} o
 * @param {string} [o.zeitzone]      Standard Europe/Zurich
 * @param {string} [o.dashboardUrl]  landet in der Beschreibung
 * @param {string} [o.status]        BUSY (Standard), TENTATIVE oder FREE
 * @param {string} [o.name]          Kalendername in Outlook
 * @param {Date}   [o.jetzt]         nur für Tests
 */
export function baueIcs(fenster, o = {}) {
  const zone = o.zeitzone || "Europe/Zurich";
  const status = (o.status || "BUSY").toUpperCase();
  const jetzt = o.jetzt || new Date();
  const stempel = alsUtc(jetzt);

  const zeilen = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Seewind//Windalarm//DE",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escape(o.name || "Seewind — Windfenster")}`,
    `X-WR-TIMEZONE:${zone}`,
    // Wie oft ein abonnierender Kalender nachsehen soll.
    "REFRESH-INTERVAL;VALUE=DURATION:PT4H",
    "X-PUBLISHED-TTL:PT4H",
  ];

  for (const f of fenster) {
    zeilen.push(...baueEvent(f, { zone, status, stempel, dashboardUrl: o.dashboardUrl }));
  }

  zeilen.push("END:VCALENDAR");
  return zeilen.map(falte).join(ZEILENENDE) + ZEILENENDE;
}

/**
 * Eine Kalenderdatei je Fenster statt einer gemeinsamen.
 *
 * Outlook bietet beim Öffnen einer Datei mit mehreren Terminen nicht alle zur
 * Auswahl an — getrennte Dateien landen dagegen zuverlässig als einzelne
 * Termine, und man kann sich aussuchen, welche man überhaupt einträgt.
 *
 * @returns {Array<{dateiname: string, inhalt: string}>}
 */
export function baueIcsEinzeln(fenster, o = {}) {
  const zone = o.zeitzone || "Europe/Zurich";
  const status = (o.status || "BUSY").toUpperCase();
  const stempel = alsUtc(o.jetzt || new Date());
  const vergeben = new Set();

  return fenster.map((f) => {
    const zeilen = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Seewind//Windalarm//DE",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      ...baueEvent(f, { zone, status, stempel, dashboardUrl: o.dashboardUrl }),
      "END:VCALENDAR",
    ];
    return {
      dateiname: dateiname(f, vergeben),
      inhalt: zeilen.map(falte).join(ZEILENENDE) + ZEILENENDE,
    };
  });
}

/** "2026-09-16_Estavayer_12-20Uhr.ics" — ohne Umlaute und Sonderzeichen. */
function dateiname(f, vergeben) {
  const ort = entschaerfe(f.spotKurz || f.spotName);
  let name = `${f.datum}_${ort}_${uhr(f.von)}-${uhr(f.bis)}Uhr.ics`;
  // Zwei Fenster am selben Spot und Tag: durchnummerieren.
  let n = 2;
  while (vergeben.has(name)) {
    name = `${f.datum}_${ort}_${uhr(f.von)}-${uhr(f.bis)}Uhr_${n++}.ics`;
  }
  vergeben.add(name);
  return name;
}

function entschaerfe(s) {
  return String(s)
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue")
    .replace(/Ä/g, "Ae").replace(/Ö/g, "Oe").replace(/Ü/g, "Ue")
    .replace(/ß/g, "ss")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "Spot";
}

function baueEvent(f, { zone, status, stempel, dashboardUrl }) {
  const beginn = zuUtc(f.datum, f.von, zone);
  const ende = zuUtc(f.datum, f.bis, zone);

  const titel = `Wingfoil ${f.spotKurz || f.spotName} — ${f.wind} kn ${f.richtung}`;
  const beschreibung = [
    `${f.spotName} · ${f.see}`,
    `${f.wind} kn Mittelwind, Böen ${f.boe} kn, Richtung ${f.richtung}`,
    `Fenster ${uhr(f.von)}–${uhr(f.bis)} Uhr (${f.stunden} h), Modell ${f.modell}`,
    "",
    "Prognose, keine Zusage — vor der Fahrt nochmal nachsehen.",
    dashboardUrl ? `Dashboard: ${dashboardUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const e = [
    "BEGIN:VEVENT",
    // Gleiches Fenster, gleiche UID: ein erneuter Import aktualisiert den
    // Termin, statt einen zweiten anzulegen.
    `UID:${f.spotId}-${f.datum}-${uhr(f.von)}@seewind`,
    `DTSTAMP:${stempel}`,
    `DTSTART:${alsUtc(beginn)}`,
    `DTEND:${alsUtc(ende)}`,
    `SUMMARY:${escape(titel)}`,
    `DESCRIPTION:${escape(beschreibung)}`,
    `LOCATION:${escape(`${f.spotName}, ${f.see}`)}`,
    status === "FREE" ? "TRANSP:TRANSPARENT" : "TRANSP:OPAQUE",
    `X-MICROSOFT-CDO-BUSYSTATUS:${status}`,
    "CATEGORIES:Wingfoil",
    "SEQUENCE:0",
  ];
  if (Number.isFinite(f.lat) && Number.isFinite(f.lon)) {
    e.push(`GEO:${f.lat};${f.lon}`);
  }
  e.push("END:VEVENT");
  return e;
}

/* ------------------------------------------------------------------ *
 * Zeit
 * ------------------------------------------------------------------ */

/** "2026-09-16" + Stunde 13 in der Zone -> echtes Date in UTC. */
export function zuUtc(datum, stunde, zone) {
  const [j, m, t] = datum.split("-").map(Number);
  // Die Wanduhrzeit erst als UTC lesen, dann um den Zonenversatz korrigieren.
  // Zweiter Durchgang, weil der Versatz selbst vom Zeitpunkt abhängt (Sommerzeit).
  const roh = Date.UTC(j, m - 1, t, stunde, 0, 0);
  let ms = roh - versatz(roh, zone);
  const zweiter = versatz(ms, zone);
  if (zweiter !== versatz(roh, zone)) ms = roh - zweiter;
  return new Date(ms);
}

/** Versatz der Zone gegenüber UTC zu diesem Zeitpunkt, in Millisekunden. */
function versatz(ms, zone) {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const p = {};
  for (const teil of f.formatToParts(ms)) p[teil.type] = teil.value;
  const alsWaere = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour) % 24,
    Number(p.minute),
    Number(p.second)
  );
  return alsWaere - ms;
}

/** Date -> "20260916T110000Z" */
function alsUtc(d) {
  const p = (n) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}` +
    `T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`
  );
}

function uhr(s) {
  return String(s).padStart(2, "0");
}

/* ------------------------------------------------------------------ *
 * Format
 * ------------------------------------------------------------------ */

/** Backslash, Semikolon, Komma und Zeilenumbruch müssen maskiert werden. */
function escape(s) {
  return String(s)
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/**
 * Zeilen dürfen höchstens 75 Oktett lang sein; längere werden umgebrochen und
 * mit einem Leerzeichen fortgesetzt. Gezählt wird in Bytes, nicht in Zeichen —
 * sonst zerfallen Umlaute mitten im UTF-8-Zeichen.
 */
function falte(zeile) {
  const bytes = Buffer.from(zeile, "utf8");
  if (bytes.length <= 75) return zeile;

  const teile = [];
  let start = 0;
  let grenze = 75;
  while (start < bytes.length) {
    let ende = Math.min(start + grenze, bytes.length);
    // Nicht mitten in einem UTF-8-Zeichen trennen: Folgebytes beginnen mit 10xxxxxx.
    while (ende > start && ende < bytes.length && (bytes[ende] & 0xc0) === 0x80) ende--;
    teile.push(bytes.subarray(start, ende).toString("utf8"));
    start = ende;
    grenze = 74; // Fortsetzungszeilen beginnen mit einem Leerzeichen.
  }
  return teile.join(ZEILENENDE + " ");
}
