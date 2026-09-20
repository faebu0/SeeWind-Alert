#!/usr/bin/env node
/**
 * Lässt das Skript der fertigen Seite in Node laufen, gegen ein nachgebautes
 * DOM, und drückt dann die Knöpfe.
 *
 *   node test-seite.mjs
 *
 * Warum nicht einfach im Browser ausprobieren: weil dieser Test bei jeder
 * Änderung in Sekunden wiederholbar ist und keinen echten Zugangsschlüssel
 * braucht. Er findet die Sorte Fehler, die eine Syntaxprüfung durchlässt —
 * ein Name, den es nicht gibt, ein Knopf, der ins Leere greift, eine
 * Reihenfolge, in der etwas benutzt wird, bevor es existiert.
 *
 * Was er nicht kann: Aussehen, Karte, echtes Netz. Dafür gibt es den Browser.
 */

import { readFile } from "node:fs/promises";
import { createContext, runInContext } from "node:vm";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const WURZEL = dirname(fileURLToPath(import.meta.url));

/* ------------------------------------------------------------------ *
 * Ein DOM, gerade gross genug
 * ------------------------------------------------------------------ */

function macheElement(beschreibung = {}) {
  const el = {
    id: beschreibung.id || "",
    tagName: (beschreibung.tag || "div").toUpperCase(),
    type: beschreibung.type || "",
    value: beschreibung.value ?? "",
    textContent: "",
    hidden: beschreibung.hidden ?? false,
    disabled: false,
    href: "", target: "", rel: "",
    dataset: {},
    kinder: [],
    zuhoerer: {},
    attribute: Object.assign({}, beschreibung.attribute || {}),
    klassen: new Set(String(beschreibung.klasse || "").split(/\s+/).filter(Boolean)),
    style: { setProperty() {} },
  };

  Object.defineProperty(el, "className", {
    get() { return [...el.klassen].join(" "); },
    set(v) { el.klassen = new Set(String(v).split(/\s+/).filter(Boolean)); },
  });
  Object.defineProperty(el, "innerHTML", {
    get() { return el._html || ""; },
    set(v) { el._html = String(v); el.kinder = []; },
  });

  el.classList = {
    add: (...n) => n.forEach((x) => el.klassen.add(x)),
    remove: (...n) => n.forEach((x) => el.klassen.delete(x)),
    contains: (n) => el.klassen.has(n),
    toggle: (n, an) =>
      an === undefined
        ? (el.klassen.has(n) ? el.klassen.delete(n) : el.klassen.add(n))
        : (an ? el.klassen.add(n) : el.klassen.delete(n)),
  };
  el.setAttribute = (n, w) => { el.attribute[n] = String(w); };
  el.getAttribute = (n) => (n in el.attribute ? el.attribute[n] : null);
  el.removeAttribute = (n) => { delete el.attribute[n]; };
  el.addEventListener = (art, f) => { (el.zuhoerer[art] = el.zuhoerer[art] || []).push(f); };
  el.removeEventListener = () => {};
  el.appendChild = (k) => { el.kinder.push(k); k.elternteil = el; return k; };
  el.removeChild = (k) => { el.kinder = el.kinder.filter((x) => x !== k); return k; };
  el.focus = () => {};
  el.select = () => {};
  el.closest = (wahl) => (passt(el, wahl) ? el : null);
  el.querySelectorAll = (wahl) => alleUnter(el).filter((k) => passt(k, wahl));
  el.querySelector = (wahl) => {
    const treffer = el.querySelectorAll(wahl)[0];
    if (treffer) return treffer;
    // innerHTML wird nicht wirklich geparst: enthält es die gesuchte Klasse,
    // liefern wir ein Ersatzelement, damit der aufrufende Code weiterläuft.
    if (typeof wahl === "string" && wahl.startsWith(".") && (el._html || "").includes(wahl.slice(1))) {
      const ersatz = macheElement({ klasse: wahl.slice(1) });
      el.kinder.push(ersatz);
      return ersatz;
    }
    return null;
  };
  el.dispatchEvent = (ereignis) => {
    (el.zuhoerer[ereignis.type] || []).forEach((f) => f(ereignis));
    return true;
  };
  el.click = () => el.dispatchEvent({ type: "click", target: el, preventDefault() {} });
  return el;
}

function alleUnter(el) {
  const out = [];
  for (const k of el.kinder) { out.push(k); out.push(...alleUnter(k)); }
  return out;
}

function passt(el, wahl) {
  if (typeof wahl !== "string") return false;
  return wahl.split(",").map((s) => s.trim()).some((teil) => {
    if (teil.startsWith(".")) return el.klassen.has(teil.slice(1));
    if (teil.startsWith("#")) return el.id === teil.slice(1);
    const mitAttribut = teil.match(/^(\w*)\[([\w-]+)(?:="([^"]*)")?\]$/);
    if (mitAttribut) {
      const [, tag, name, wert] = mitAttribut;
      if (tag && el.tagName !== tag.toUpperCase()) return false;
      if (!(name in el.attribute)) return false;
      return wert === undefined || el.attribute[name] === wert;
    }
    return el.tagName === teil.toUpperCase();
  });
}

/** Baut aus dem HTML der Seite genug Elemente, dass das Skript sie findet. */
function bauDom(html) {
  const nachId = new Map();
  const alle = [];
  const regel = /<(\w+)([^>]*)>/g;
  let treffer;
  while ((treffer = regel.exec(html))) {
    const [, tag, rest] = treffer;
    const id = (rest.match(/\bid="([^"]+)"/) || [])[1];
    const klasse = (rest.match(/\bclass="([^"]+)"/) || [])[1];
    const wert = (rest.match(/\bvalue="([^"]*)"/) || [])[1];
    const typ = (rest.match(/\btype="([^"]*)"/) || [])[1];
    const attribute = {};
    for (const a of rest.matchAll(/\b(data-[\w-]+)="([^"]*)"/g)) attribute[a[1]] = a[2];
    const el = macheElement({
      tag, id, klasse, value: wert, type: typ, attribute,
      hidden: /\bhidden\b/.test(rest),
    });
    alle.push(el);
    if (id) nachId.set(id, el);
  }
  return { nachId, alle };
}

/* ------------------------------------------------------------------ *
 * Prüflauf
 * ------------------------------------------------------------------ */

const pruef = [];
const sag = (n, b, z = "") => {
  pruef.push((b ? "ok  " : "FEHL") + "  " + n + (z ? " — " + z : ""));
  return b;
};
function schluss() {
  console.log(pruef.join("\n"));
  const kaputt = pruef.some((z) => z.startsWith("FEHL"));
  console.log(kaputt ? "\nEs gibt Fehler." : "\nAlles grün.");
  process.exit(kaputt ? 1 : 0);
}

const seite = await readFile(join(WURZEL, "docs", "index.html"), "utf8");
const skripte = [...seite.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
const daten = (seite.match(/<script id="daten"[^>]*>([\s\S]*?)<\/script>/) || [])[1];
sag("Seite hat zwei Skripte und die Daten", skripte.length === 2 && Boolean(daten));

const { nachId, alle } = bauDom(seite);
const speicher = new Map();
const netzrufe = [];

let antworten = {};
function netz(url, optionen) {
  const o = optionen || {};
  netzrufe.push({
    url: String(url), methode: o.method || "GET",
    koerper: o.body || null, kopf: o.headers || {},
  });
  for (const [muster, mache] of Object.entries(antworten)) {
    if (String(url).includes(muster)) return Promise.resolve(mache(o));
  }
  return Promise.resolve(antwort(404, { message: "nicht nachgestellt" }));
}
function antwort(status, koerper) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => koerper,
    text: async () => JSON.stringify(koerper),
  };
}

const fenster = {
  location: {
    hostname: "schwendimann.github.io", pathname: "/seewind/",
    protocol: "https:", href: "https://schwendimann.github.io/seewind/",
  },
  localStorage: {
    getItem: (k) => (speicher.has(k) ? speicher.get(k) : null),
    setItem: (k, v) => speicher.set(k, String(v)),
    removeItem: (k) => speicher.delete(k),
  },
  navigator: { clipboard: { writeText: async () => {} } },
  fetch: netz,
  setTimeout, clearTimeout, setInterval, clearInterval,
  console, URL, TextEncoder, TextDecoder,
  btoa: (s) => Buffer.from(s, "binary").toString("base64"),
  atob: (s) => Buffer.from(s, "base64").toString("binary"),
  document: {
    getElementById: (id) => nachId.get(id) || null,
    createElement: (tag) => macheElement({ tag }),
    querySelectorAll: (wahl) => alle.filter((k) => passt(k, wahl)),
    querySelector: (wahl) => alle.find((k) => passt(k, wahl)) || null,
    body: macheElement({ tag: "body" }),
    addEventListener: () => {},
  },
};
fenster.window = fenster;
fenster.globalThis = fenster;
nachId.set("daten", Object.assign(macheElement({ id: "daten" }), { textContent: daten }));

const umgebung = createContext(fenster);

let fehler = null;
try {
  // Erst die eingebetteten Module …
  runInContext(skripte[0], umgebung, { filename: "module.js" });

  // … dann Kartensuche und Prognose durch Attrappen ersetzen: dieser Test
  // prüft die Bedienung, nicht die Geometrie. Die steckt in eigenen Tests.
  umgebung.Suche.ladeWasserkarte = async () => ({
    breite: 1792, hoehe: 1792, mpp: 26, fehlendeKacheln: [], wasseranteil: 0.3,
  });
  umgebung.Suche.findeUferpunkte = () => [{
    lat: 36.02, lon: -5.61, dirs: ["S", "SW", "W"],
    strecken: { N: 0.2, NO: 0.3, O: 0.4, SO: 2.1, S: 12, SW: 12, W: 8.4, NW: 0.6 },
    entfernungKm: 1.1, guete: 12,
  }];
  umgebung.Kern.holePrognose = async (spots) => {
    const reihen = {};
    spots.forEach((sp) => { sp.zeitzone = "Europe/Madrid"; reihen[sp.id] = []; });
    return reihen;
  };

  // … und zuletzt die Seite selbst.
  runInContext(skripte[1], umgebung, { filename: "seite.js" });
} catch (e) {
  fehler = e;
}
sag("Seitenskript läuft ohne Fehler durch", !fehler, fehler ? fehler.message : "");
if (fehler) {
  console.log(pruef.join("\n"));
  console.log("\nAbbruch:\n" + fehler.stack.split("\n").slice(0, 5).join("\n"));
  process.exit(1);
}

const $ = (id) => nachId.get(id);
const warte = () => new Promise((r) => setTimeout(r, 30));

/* ---- Umschalter ---- */
const reiseKnopf = alle.find((e) => e.getAttribute("data-modus") === "reise");
const standardKnopf = alle.find((e) => e.getAttribute("data-modus") === "standard");
const klickeModus = (knopf) =>
  $("modus").dispatchEvent({ type: "click", target: knopf, preventDefault() {} });

klickeModus(reiseKnopf);
sag("Reisemodus lässt sich öffnen", $("reise").hidden === false);
klickeModus(standardKnopf);
sag("Und wieder schliessen", $("reise").hidden === true);
klickeModus(reiseKnopf);

/* ---- Ohne Zugang ---- */
sag("Ohne Zugang steht es am Knopf", /Zugang nötig/.test($("ort-uebernehmen").textContent),
  $("ort-uebernehmen").textContent);
sag("Repository wird aus der Adresse geraten", $("zugang-repo").value === "schwendimann/seewind",
  $("zugang-repo").value);

/* ---- Zugang einrichten, gegen nachgestelltes GitHub ---- */
let dateiImRepo = null;
antworten = {
  "/contents/reiseorte.json": (o) => {
    if ((o.method || "GET") === "PUT") {
      const k = JSON.parse(o.body);
      dateiImRepo = {
        inhalt: Buffer.from(k.content, "base64").toString("utf8"),
        sha: "sha" + Date.now(),
      };
      return antwort(200, { content: { sha: dateiImRepo.sha } });
    }
    if (!dateiImRepo) return antwort(404, { message: "Not Found" });
    return antwort(200, {
      sha: dateiImRepo.sha,
      content: Buffer.from(dateiImRepo.inhalt, "utf8").toString("base64"),
    });
  },
  "/dispatches": () => antwort(403, { message: "kein Actions-Recht" }),
  "api.github.com/repos/schwendimann/seewind": () => antwort(200, { default_branch: "main" }),
  "geocoding-api.open-meteo.com": () => antwort(200, {
    results: [{
      name: "Tarifa", latitude: 36.0139, longitude: -5.6069,
      admin1: "Andalusien", country: "Spanien",
    }],
  }),
};

$("zugang-repo").value = "schwendimann/seewind";
$("zugang-token").value = "nachgestellter-schluessel";
$("zugang-speichern").click();
await warte();
sag("Zugang wird angenommen", /Zugang steht/.test($("zugang-status").textContent),
  $("zugang-status").textContent);
sag("Der Schlüssel liegt nur im Browserspeicher", speicher.has("seewind-gh-schluessel"));
sag("Knopfbeschriftung ohne Klammer", $("ort-uebernehmen").textContent === "Übernehmen");
sag("Kein Schlüssel im Netzpfad", netzrufe.every((r) => !r.url.includes("nachgestellter-schluessel")));
sag("Schlüssel geht als Kopfzeile mit",
  netzrufe.some((r) => (r.kopf.Authorization || "").includes("nachgestellter-schluessel")));

/* ---- Suchen wie ein Mensch ---- */
$("ort-eingabe").value = "Tarifa";
$("ort-suchen").click();
await warte();
const trefferKnopf = $("ort-treffer").kinder[0];
sag("Ortssuche liefert einen anklickbaren Treffer", Boolean(trefferKnopf));

if (trefferKnopf) trefferKnopf.click();
await warte(); await warte();
sag("Suche läuft durch", /gefunden/.test($("reise-status").textContent), $("reise-status").textContent);
sag("Ortszeit wird genannt", /Ortszeit/.test($("reise-status").textContent));
sag("Übernehmen taucht auf", $("uebernehmen").hidden === false);
// Der Link erscheint nur, wenn beim Bauen ein Botname gesetzt war.
const botName = JSON.parse(daten).botName;
if (botName) {
  sag("Telegram-Link zeigt auf den Bot", $("ort-telegram").hidden === false &&
    $("ort-telegram").href.startsWith("https://t.me/" + botName + "?start="), $("ort-telegram").href);
  const nutzlast = $("ort-telegram").href.split("start=")[1] || "";
  sag("Nutzlast ist kurz genug und url-sicher",
    nutzlast.length > 0 && nutzlast.length <= 64 && /^[A-Za-z0-9_-]+$/.test(nutzlast),
    nutzlast.length + " Zeichen");
} else {
  sag("Ohne Botnamen bleibt der Link versteckt", $("ort-telegram").hidden === true);
}
sag("Handweg zeigt einen Eintrag für die Liste",
  $("reise-json").textContent.includes('"ort"') && !$("reise-json").textContent.includes('"reise"'));

/* ---- Übernehmen ---- */
$("ort-uebernehmen").click();
await warte(); await warte();
sag("Ort ist übernommen", /übernommen/.test($("reise-status").textContent), $("reise-status").textContent);
sag("Datei im Repository geschrieben", Boolean(dateiImRepo));
const geschrieben = dateiImRepo ? JSON.parse(dateiImRepo.inhalt) : { orte: [] };
sag("Ein Ort in der Datei, scharf",
  geschrieben.orte.length === 1 && geschrieben.orte[0].aktiv === true,
  JSON.stringify(geschrieben.orte.map((o) => o.ort + ":" + o.aktiv)));
sag("Beim Schreiben ging der Zweig mit",
  netzrufe.some((r) => r.methode === "PUT" && JSON.parse(r.koerper).branch === "main"));
sag("Anstossen wurde versucht und darf scheitern",
  netzrufe.some((r) => r.url.includes("/dispatches")));

/* ---- Die Liste ---- */
const zeilen = () => $("orte-liste").kinder.filter((k) => k.klassen.has("ort-zeile"));
const knoepfeIn = (z) => z.kinder.filter((k) => k.tagName === "BUTTON");
sag("Liste zeigt den Ort", zeilen().length === 1);

let schalter = zeilen()[0] && knoepfeIn(zeilen()[0])[0];
sag("Schalter heisst ausschalten", Boolean(schalter) && schalter.textContent === "ausschalten",
  schalter && schalter.textContent);

if (schalter) schalter.click();
await warte(); await warte();
sag("Ausgeschaltet, auch in der Datei", JSON.parse(dateiImRepo.inhalt).orte[0].aktiv === false);
schalter = knoepfeIn(zeilen()[0])[0];
sag("Schalter heisst jetzt einschalten", schalter.textContent === "einschalten", schalter.textContent);

schalter.click();
await warte(); await warte();
sag("Wieder scharf", JSON.parse(dateiImRepo.inhalt).orte[0].aktiv === true);

/* ---- Entfernen braucht zwei Klicks ---- */
const weg = knoepfeIn(zeilen()[0])[1];
weg.click();
await warte();
sag("Erster Klick fragt nach",
  weg.textContent === "wirklich?" && JSON.parse(dateiImRepo.inhalt).orte.length === 1,
  weg.textContent);
weg.click();
await warte(); await warte();
sag("Zweiter Klick entfernt", JSON.parse(dateiImRepo.inhalt).orte.length === 0);
sag("Liste ist leer", zeilen().length === 0);

/* ---- Zugang wieder löschen ---- */
$("zugang-weg").click();
sag("Schlüssel ist weg", !speicher.has("seewind-gh-schluessel"));
sag("Knopf sagt wieder Zugang nötig", /Zugang nötig/.test($("ort-uebernehmen").textContent));

schluss();
