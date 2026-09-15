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

/**
 * Holt beide MeteoSchweiz-Modelle in je einem Aufruf für alle Spots.
 * ICON-CH1 (1 km) reicht rund 33 Stunden, danach übernimmt ICON-CH2 (2 km).
 */
export async function holePrognose(spots, kriterien, fetchImpl = fetch) {
  const lat = spots.map((s) => s.lat).join(",");
  const lon = spots.map((s) => s.lon).join(",");
  const basis =
    `${API}?latitude=${lat}&longitude=${lon}` +
    `&hourly=wind_speed_10m,wind_gusts_10m,wind_direction_10m` +
    `&wind_speed_unit=kn&timezone=${encodeURIComponent(kriterien.zeitzone)}` +
    `&forecast_days=${kriterien.prognoseTage}&models=`;

  const [fein, grob] = await Promise.all([
    hole(fetchImpl, basis + "meteoswiss_icon_ch1"),
    hole(fetchImpl, basis + "meteoswiss_icon_ch2"),
  ]);

  return verschmelze(spots, fein, grob, kriterien);
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
export function verschmelze(spots, fein, grob, kriterien, jetzt = new Date()) {
  const grenze = lokalerStempel(jetzt);
  const ergebnis = {};

  spots.forEach((spot, i) => {
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
        modell: feinBrauchbar ? "ch1" : "ch2",
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

/** "2026-09-15T14:00" in lokaler Zeit, als Vergleichsschwelle. */
function lokalerStempel(d) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:00`;
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
          datum,
          von: block[0].stunde,
          bis: block[block.length - 1].stunde + 1,
          stunden: block.length,
          wind: spitze.wind,
          boe: Math.max(...block.map((z) => z.boe)),
          richtung: oktant(spitze.grad),
          modell: block.every((z) => z.modell === "ch1") ? "ICON-CH1" : "ICON-CH1/CH2",
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

/** Alle Fenster über alle aktiven Spots, zeitlich sortiert. */
export function alleFenster(spots, reihen, kriterien) {
  const out = [];
  for (const spot of spots) {
    if (spot.aktiv === false) continue;
    out.push(...fenster(reihen[spot.id] ?? [], spot, kriterien));
  }
  out.sort((a, b) => (a.datum === b.datum ? a.von - b.von : a.datum < b.datum ? -1 : 1));
  return out;
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
