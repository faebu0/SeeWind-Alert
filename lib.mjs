/**
 * Kernlogik: Prognose holen, Stunden bewerten, Fenster erkennen.
 * Bewusst ohne Abhängigkeiten - läuft auf jedem Node ab Version 20.
 */

export const OKTANTEN = ["N", "NO", "O", "SO", "S", "SW", "W", "NW"];

/** Gradzahl auf Oktant abbilden (N = 337.5-22.5 usw.). */
export function oktant(grad) {
  const g = ((grad % 360) + 360) % 360;
  return OKTANTEN[Math.round(g / 45) % 8];
}

const API = "https://api.open-meteo.com/v1/forecast";

export const MODELLNAMEN = { ch1: "ICON-CH1", ch2: "ICON-CH2", global: "Best-Match" };

/**
 * Holt die Prognose für alle Spots.
 *
 * Zwei Sorten Spots, zwei Datenwege:
 *
 *   quelle "ch" (Standard) — die MeteoSchweiz-Modelle ICON-CH1 (1 km, rund
 *     33 Stunden) und ICON-CH2 (2 km, darüber hinaus). Nur über der Schweiz
 *     und den Alpen brauchbar, dort aber das Beste, was es gibt.
 *
 *   quelle "global" — für Orte im Reisemodus, irgendwo auf der Welt. Open-Meteo
 *     wählt dort selbst das beste verfügbare Modell. In Europa, Nordamerika,
 *     Skandinavien und Japan sind das 1 bis 3 km, sonst 9 bis 25 km.
 *
 * Nebenwirkung, bewusst: Bei "global" trägt diese Funktion die vom Dienst
 * gemeldete Zeitzone in den Spot ein. Ein Fenster in Tarifa soll in spanischer
 * Ortszeit im Kalender stehen, nicht in Schweizer.
 */
export async function holePrognose(spots, kriterien, fetchImpl = fetch) {
  const schweizer = spots.filter((s) => (s.quelle || "ch") !== "global");
  const globale = spots.filter((s) => (s.quelle || "ch") === "global");

  const [a, b] = await Promise.all([
    schweizer.length ? holeSchweiz(schweizer, kriterien, fetchImpl) : {},
    globale.length ? holeGlobal(globale, kriterien, fetchImpl) : {},
  ]);
  return { ...a, ...b };
}

async function holeSchweiz(spots, kriterien, fetchImpl) {
  const basis = anfrage(spots, kriterien, kriterien.zeitzone) + "&models=";
  const [fein, grob] = await Promise.all([
    hole(fetchImpl, basis + "meteoswiss_icon_ch1"),
    hole(fetchImpl, basis + "meteoswiss_icon_ch2"),
  ]);
  return verschmelze(spots, fein, grob, kriterien);
}

async function holeGlobal(spots, kriterien, fetchImpl) {
  // timezone=auto: die Stunden kommen in der Ortszeit des jeweiligen Punktes.
  const daten = await hole(fetchImpl, anfrage(spots, kriterien, "auto"));
  spots.forEach((spot, i) => {
    if (daten[i]?.timezone) spot.zeitzone = daten[i].timezone;
  });
  // Kein feines Modell: die grobe Reihe trägt allein.
  return verschmelze(spots, [], daten, kriterien, new Date(), "global");
}

function anfrage(spots, kriterien, zone) {
  const lat = spots.map((s) => s.lat).join(",");
  const lon = spots.map((s) => s.lon).join(",");
  return (
    `${API}?latitude=${lat}&longitude=${lon}` +
    `&hourly=wind_speed_10m,wind_gusts_10m,wind_direction_10m` +
    `&wind_speed_unit=kn&timezone=${encodeURIComponent(zone)}` +
    `&forecast_days=${kriterien.prognoseTage}`
  );
}

async function hole(fetchImpl, url) {
  const res = await fetchImpl(url, {
    headers: { "User-Agent": "wingfoil-alert (github actions)" },
  });
  if (!res.ok) {
    throw new Error(`Open-Meteo antwortete mit ${res.status} ${res.statusText}`);
  }
  const daten = await res.json();
  return Array.isArray(daten) ? daten : [daten];
}

/** Aus beiden Modellläufen eine Zeitreihe je Spot bauen. */
export function verschmelze(spots, fein, grob, kriterien, jetzt = new Date(), grobName = "ch2") {
  const ergebnis = {};

  spots.forEach((spot, i) => {
    // Die Stunden kommen in Ortszeit; abgeschnitten wird deshalb auch nach
    // Ortszeit. Der GitHub-Runner läuft in UTC — ohne das hätte das Dashboard
    // im Sommer zwei bereits vergangene Stunden angezeigt.
    const grenze = lokalerStempel(jetzt, spot.zeitzone || kriterien.zeitzone);
    const f = fein[i]?.hourly;
    const g = grob[i]?.hourly;
    if (!g) {
      ergebnis[spot.id] = [];
      return;
    }
    const feinIndex = new Map();
    if (f) f.time.forEach((t, k) => feinIndex.set(t, k));

    const zeilen = [];
    g.time.forEach((t, k) => {
      const stunde = Number(t.slice(11, 13));
      if (stunde < kriterien.stundeVon || stunde > kriterien.stundeBis) return;
      if (t < grenze) return;

      const k1 = feinIndex.has(t) ? feinIndex.get(t) : -1;
      const feinBrauchbar = k1 >= 0 && f.wind_speed_10m[k1] !== null && !istLeer(f, k1);

      const wind = feinBrauchbar ? f.wind_speed_10m[k1] : g.wind_speed_10m[k];
      const boe = feinBrauchbar ? f.wind_gusts_10m[k1] : g.wind_gusts_10m[k];
      const richtung = feinBrauchbar ? f.wind_direction_10m[k1] : g.wind_direction_10m[k];
      if (wind === null || wind === undefined) return;

      zeilen.push({
        zeit: t,
        datum: t.slice(0, 10),
        stunde,
        wind: Math.round(wind),
        boe: Math.round(boe ?? 0),
        grad: Math.round(richtung ?? 0),
        modell: feinBrauchbar ? "ch1" : grobName,
      });
    });
    ergebnis[spot.id] = zeilen;
  });

  return ergebnis;
}

/** ICON-CH1 liefert jenseits seines Horizonts Nullzeilen statt null. */
function istLeer(h, k) {
  return h.wind_speed_10m[k] === 0 && h.wind_gusts_10m[k] === 0 && h.wind_direction_10m[k] === 0;
}

/** "2026-09-15T14:00" in der angegebenen Zeitzone, als Vergleichsschwelle. */
function lokalerStempel(d, zone) {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone || undefined,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
  });
  const p = {};
  for (const teil of f.formatToParts(d)) p[teil.type] = teil.value;
  const stunde = String(Number(p.hour) % 24).padStart(2, "0");
  return `${p.year}-${p.month}-${p.day}T${stunde}:00`;
}

/**
 * Stufe einer einzelnen Stunde:
 *   0 zu wenig oder falsche Richtung, 1 knapp, 2 fahrbar, 3 kräftig.
 */
export function stufe(zeile, spot, kriterien) {
  const schwelle = spot.minWindKn ?? kriterien.minWindKn;
  const passt = spot.dirs.includes(oktant(zeile.grad));
  if (!passt) {
    return zeile.wind >= schwelle || zeile.boe >= kriterien.minGustKn ? 1 : 0;
  }
  if (zeile.wind >= schwelle + 6) return 3;
  if (zeile.wind >= schwelle) return 2;
  if (zeile.wind >= schwelle - 3 || zeile.boe >= kriterien.minGustKn) return 1;
  return 0;
}

/**
 * Zusammenhängende Blöcke ab `minStunden` auf Stufe 2 oder höher.
 * Blöcke enden am Tageswechsel, weil eine Session keine Nacht überspannt.
 */
export function fenster(zeilen, spot, kriterien) {
  const treffer = [];
  const nachTag = new Map();
  for (const z of zeilen) {
    if (!nachTag.has(z.datum)) nachTag.set(z.datum, []);
    nachTag.get(z.datum).push(z);
  }

  for (const datum of [...nachTag.keys()].sort()) {
    const tag = nachTag.get(datum).sort((a, b) => a.stunde - b.stunde);
    let block = [];

    const abschliessen = () => {
      if (block.length >= kriterien.minStunden) {
        const spitze = block.reduce((m, z) => (z.wind > m.wind ? z : m), block[0]);
        treffer.push({
          spotId: spot.id,
          spotName: spot.name,
          spotKurz: spot.kurz || "",
          see: spot.see,
          lat: spot.lat,
          lon: spot.lon,
          // Nur gesetzt, wo sie von der Schweizer Zeit abweicht — dann sind
          // "von" und "bis" Ortszeit am Spot, und der Kalender muss es wissen.
          zeitzone: spot.zeitzone || "",
          quelle: spot.quelle || "ch",
          datum,
          von: block[0].stunde,
          bis: block[block.length - 1].stunde + 1,
          stunden: block.length,
          wind: spitze.wind,
          boe: Math.max(...block.map((z) => z.boe)),
          richtung: oktant(spitze.grad),
          modell: [...new Set(block.map((z) => MODELLNAMEN[z.modell] || z.modell))].join("/"),
        });
      }
      block = [];
    };

    for (const z of tag) {
      const luecke = block.length && z.stunde !== block[block.length - 1].stunde + 1;
      if (luecke) abschliessen();
      if (stufe(z, spot, kriterien) >= 2) block.push(z);
      else abschliessen();
    }
    abschliessen();
  }
  return treffer;
}

/**
 * Bewertet ein Fenster mit 0 bis 100 Punkten, damit sich Fenster vergleichen
 * lassen. Die vier Teile sind bewusst getrennt und werden im Dashboard einzeln
 * ausgewiesen — eine Rangliste, deren Zustandekommen man nicht sieht, ist wertlos.
 *
 *   Wind   0-50  Stärke über der Schwelle; zu viel gibt wieder Abzug
 *   Dauer  0-25  wie lange das Fenster am Stück trägt
 *   Böen   0-15  je gleichmässiger, desto besser
 *   Nähe   0-10  je näher, desto verlässlicher die Prognose
 */
export function bewerte(f, spot, kriterien, heute = new Date()) {
  const g = kriterien.bewertung || {};
  const schwelle = spot?.minWindKn ?? kriterien.minWindKn;

  const idealUeber = g.idealUeberSchwelle ?? 8;
  const zuvielUeber = g.zuvielUeberSchwelle ?? 18;
  const ueber = f.wind - schwelle;
  let wind;
  if (ueber <= idealUeber) {
    wind = (ueber / idealUeber) * 50;
  } else {
    // Oberhalb des Optimums fällt die Bewertung wieder, aber nicht auf null:
    // viel Wind ist unbequem, nicht wertlos.
    const zuviel = Math.min((ueber - idealUeber) / (zuvielUeber - idealUeber), 1);
    wind = 50 - zuviel * 20;
  }
  wind = grenze(wind, 0, 50);

  const volleDauer = g.dauerVollStunden ?? 6;
  const dauer = (Math.min(f.stunden, volleDauer) / volleDauer) * 25;

  // Verhältnis Böe zu Mittelwind: 1.4 ist angenehm, ab 2.2 wird es ruppig.
  const verhaeltnis = f.wind > 0 ? f.boe / f.wind : 3;
  const boeen = 15 * (1 - grenze((verhaeltnis - (g.boeenGut ?? 1.4)) / ((g.boeenSchlecht ?? 2.2) - (g.boeenGut ?? 1.4)), 0, 1));

  const naehe = [10, 8, 5, 3][Math.min(tageBis(f.datum, heute), 3)] ?? 3;

  return {
    punkte: Math.round(wind + dauer + boeen + naehe),
    teile: {
      wind: Math.round(wind),
      dauer: Math.round(dauer),
      boeen: Math.round(boeen),
      naehe,
    },
  };
}

function grenze(x, min, max) {
  return Math.max(min, Math.min(max, x));
}

/** Volle Tage von heute bis zum Datum, nie negativ. */
function tageBis(datum, heute) {
  const [j, m, t] = datum.split("-").map(Number);
  const ziel = Date.UTC(j, m - 1, t);
  const start = Date.UTC(heute.getFullYear(), heute.getMonth(), heute.getDate());
  return Math.max(0, Math.round((ziel - start) / 86400000));
}

/**
 * Alle Fenster über alle aktiven Spots, zeitlich sortiert — mit Punktzahl und
 * Rang. Der Rang ergibt sich aus der Bewertung, die Reihenfolge der Liste
 * bleibt chronologisch: beides zusammen ist lesbarer als nur eines davon.
 */
export function alleFenster(spots, reihen, kriterien, heute = new Date()) {
  const out = [];
  for (const spot of spots) {
    if (spot.aktiv === false) continue;
    for (const f of fenster(reihen[spot.id] ?? [], spot, kriterien)) {
      const b = bewerte(f, spot, kriterien, heute);
      out.push({ ...f, punkte: b.punkte, teile: b.teile });
    }
  }

  // Rang nach Punkten; bei Gleichstand gewinnt das frühere Fenster.
  [...out]
    .sort((a, b) => (b.punkte !== a.punkte ? b.punkte - a.punkte : vergleicheZeit(a, b)))
    .forEach((f, i) => (f.rang = i + 1));

  out.sort(vergleicheZeit);
  return out;
}

function vergleicheZeit(a, b) {
  return a.datum === b.datum ? a.von - b.von : a.datum < b.datum ? -1 : 1;
}

/** Die besten n Fenster, nach Rang. */
export function besteFenster(fensterListe, n = 3) {
  return [...fensterListe].sort((a, b) => a.rang - b.rang).slice(0, n);
}

/** Stabiler Schlüssel, damit dasselbe Fenster nicht zweimal gemeldet wird. */
export function schluessel(f) {
  return `${f.spotId}|${f.datum}|${f.von}`;
}

const WOCHENTAGE = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

export function tagLabel(datum) {
  const [j, m, t] = datum.split("-").map(Number);
  const d = new Date(j, m - 1, t);
  return { kurz: WOCHENTAGE[d.getDay()], datum: `${t}.${m}.` };
}

export function uhr(stunde) {
  return String(stunde).padStart(2, "0");
}
