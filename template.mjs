import { tagLabel, uhr } from "./lib.mjs";

/**
 * Baut die statische Dashboard-Seite. Alle Daten werden eingebettet,
 * die Seite lädt zur Laufzeit nichts nach und funktioniert offline.
 */
export function baueSeite({ spots, kriterien, reihen, treffer, stand, quelleUrl }) {
  const nutzdaten = {
    kriterien,
    stand,
    spots: spots.map((s) => ({
      id: s.id,
      name: s.name,
      see: s.see,
      dirs: s.dirs,
      aktiv: s.aktiv !== false,
      minWindKn: s.minWindKn ?? kriterien.minWindKn,
      notiz: s.notiz ?? "",
    })),
    reihen,
  };

  const seen = [...new Set(spots.map((s) => s.see))];
  const naechstes = treffer[0] ?? null;

  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Seewind — Wingfoil-Fenster Berner Seen</title>
<meta name="description" content="Windfenster fürs Wingfoilen an Thuner-, Brienzer-, Bieler-, Neuenburger- und Murtensee, aus den MeteoSchweiz-Modellen ICON-CH1 und ICON-CH2.">
<meta name="color-scheme" content="light dark">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='.9em' font-size='90'%3E%F0%9F%AA%81%3C/text%3E%3C/svg%3E">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@500;600;800&family=IBM+Plex+Mono:wght@400;600&family=Source+Sans+3:wght@400;600&display=swap">
<style>
:root{
  --ground:#eef2f1; --surface:#ffffff; --surface-2:#f6f9f8;
  --ink:#10201f; --ink-2:#425957; --ink-3:#7a908d;
  --line:#dae3e1; --line-strong:#c2d0cd;
  --accent:#0d6b68; --accent-soft:#e0efee;
  --lv0:#dfe6e4; --lv0-ink:#8a9c99;
  --lv1:#e6a53a; --lv1-bg:#fbeed6;
  --lv2:#2d9a5f; --lv2-bg:#ddf0e4;
  --lv3:#cf4527; --lv3-bg:#fbe2da;
  --shadow:0 1px 2px rgba(16,32,31,.06),0 8px 24px -12px rgba(16,32,31,.18);
}
@media (prefers-color-scheme:dark){
  :root:not([data-theme="light"]){
    --ground:#0b1514; --surface:#13201f; --surface-2:#182726;
    --ink:#e8f0ee; --ink-2:#a6bcb9; --ink-3:#77908d;
    --line:#243634; --line-strong:#334a47;
    --accent:#4fc4bd; --accent-soft:#15302f;
    --lv0:#24332f; --lv0-ink:#6d817e;
    --lv1:#d9a044; --lv1-bg:#3a2e16;
    --lv2:#43b877; --lv2-bg:#14321f;
    --lv3:#e56a48; --lv3-bg:#3a1c13;
    --shadow:0 1px 2px rgba(0,0,0,.4),0 8px 24px -12px rgba(0,0,0,.6);
  }
}
*{box-sizing:border-box}
html,body{margin:0}
body{
  background:var(--ground);color:var(--ink);
  font-family:"Source Sans 3",system-ui,-apple-system,"Segoe UI",sans-serif;
  font-size:15px;line-height:1.5;-webkit-font-smoothing:antialiased;
  padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px);
}
.wrap{max-width:1080px;margin:0 auto;padding-inline:18px;padding-block:0 56px}
h1,h2,h3{font-family:Archivo,"Helvetica Neue",Arial,sans-serif;margin:0;text-wrap:balance}
.mono{font-family:"IBM Plex Mono",ui-monospace,monospace;font-variant-numeric:tabular-nums}

header.top{
  position:sticky;top:env(safe-area-inset-top,0px);z-index:20;
  background:color-mix(in srgb,var(--ground) 88%,transparent);
  backdrop-filter:blur(10px);border-bottom:1px solid var(--line);
}
.top-in{max-width:1080px;margin:0 auto;padding:14px 18px;display:flex;gap:14px;align-items:baseline;flex-wrap:wrap}
h1{font-size:19px;font-weight:800;letter-spacing:-.015em;font-stretch:112%}
.top-meta{font-size:12.5px;color:var(--ink-3);display:flex;gap:10px;flex-wrap:wrap;margin-left:auto}
.top-meta b{color:var(--ink-2);font-weight:600}

.verdict{margin-top:22px;background:var(--surface);border:1px solid var(--line);border-radius:4px;box-shadow:var(--shadow);overflow:hidden}
.verdict-bar{height:4px;background:var(--lv0)}
.verdict.hit .verdict-bar{background:linear-gradient(90deg,var(--lv2),var(--lv3))}
.verdict-in{padding:20px 22px 22px}
.eyebrow{font-family:Archivo,sans-serif;font-size:10.5px;font-weight:600;letter-spacing:.13em;text-transform:uppercase;color:var(--ink-3)}
.verdict h2{font-size:clamp(23px,5.2vw,33px);font-weight:800;letter-spacing:-.025em;margin-top:8px;line-height:1.12}
.verdict h2 em{font-style:normal;color:var(--accent)}
.verdict p{margin:10px 0 0;color:var(--ink-2);max-width:62ch}
.vstats{display:flex;gap:26px;flex-wrap:wrap;margin-top:18px;padding-top:16px;border-top:1px solid var(--line)}
.vstat .k{font-size:10.5px;letter-spacing:.11em;text-transform:uppercase;color:var(--ink-3);font-family:Archivo,sans-serif;font-weight:600}
.vstat .v{font-family:"IBM Plex Mono",monospace;font-size:20px;font-weight:600;font-variant-numeric:tabular-nums;margin-top:3px}

.tools{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-top:22px;padding:12px 14px;background:var(--surface-2);border:1px solid var(--line);border-radius:4px}
.tools label{font:600 10.5px Archivo,sans-serif;letter-spacing:.11em;text-transform:uppercase;color:var(--ink-3)}
.tools input[type=range]{flex:1;min-width:150px;max-width:280px;accent-color:var(--accent)}
.tools output{font-family:"IBM Plex Mono",monospace;font-weight:600;font-variant-numeric:tabular-nums;min-width:52px}
.tools .hint{font-size:12px;color:var(--ink-3);flex-basis:100%}
.tools .kalender{
  font-family:Archivo,sans-serif;font-size:12px;font-weight:600;letter-spacing:.04em;
  text-decoration:none;border:1px solid var(--accent);color:var(--accent);
  padding:6px 11px;border-radius:2px;white-space:nowrap;
}
.tools .kalender:hover{background:var(--accent);color:var(--surface)}

.lake{margin-top:30px}
.lake-head{display:flex;align-items:center;gap:12px;margin-bottom:12px}
.lake-head h3{font-size:12px;font-weight:600;letter-spacing:.13em;text-transform:uppercase;color:var(--ink-2);font-stretch:108%}
.lake-head .rule{flex:1;height:1px;background:var(--line)}

.spot{background:var(--surface);border:1px solid var(--line);border-radius:4px;margin-bottom:10px;overflow:hidden}
.spot.off{opacity:.5}
.spot-head{display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid var(--line);flex-wrap:wrap}
.spot-name{font-family:Archivo,sans-serif;font-weight:600;font-size:15px;letter-spacing:-.01em}
.dirs{font-size:11.5px;color:var(--ink-3);font-family:"IBM Plex Mono",monospace}
.spot-head .sp{flex:1}
.pill{font-family:Archivo,sans-serif;font-size:10.5px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;padding:3px 9px;border-radius:2px;white-space:nowrap}
.pill.l0{background:var(--lv0);color:var(--lv0-ink)}
.pill.l1{background:var(--lv1-bg);color:var(--lv1)}
.pill.l2{background:var(--lv2-bg);color:var(--lv2)}
.pill.l3{background:var(--lv3-bg);color:var(--lv3)}

.days{padding:4px 0 8px}
.dayrow{display:flex;align-items:center;gap:10px;padding:5px 14px}
.daylab{width:58px;flex:none;font-family:"IBM Plex Mono",monospace;font-size:11.5px;color:var(--ink-3);font-variant-numeric:tabular-nums}
.daylab b{display:block;color:var(--ink-2);font-weight:600;font-size:12px}
.strip,.hours{display:grid;grid-template-columns:repeat(var(--cols),1fr);gap:2px;flex:1;min-width:0}
.cell{position:relative;height:30px;border-radius:2px;background:var(--lv0);display:flex;align-items:center;justify-content:center;font-family:"IBM Plex Mono",monospace;font-size:10px;font-weight:600;color:var(--lv0-ink);font-variant-numeric:tabular-nums}
.cell.l1{background:var(--lv1-bg);color:var(--lv1)}
.cell.l2{background:var(--lv2-bg);color:var(--lv2)}
.cell.l3{background:var(--lv3-bg);color:var(--lv3)}
.cell.l2::after,.cell.l3::after{content:"";position:absolute;inset:auto 0 0 0;height:2px;background:currentColor;opacity:.55}
.cell.na{background:transparent}
.hours span{text-align:center;font-family:"IBM Plex Mono",monospace;font-size:9.5px;color:var(--ink-3)}

.legend{display:flex;gap:16px;flex-wrap:wrap;margin-top:26px;font-size:12px;color:var(--ink-3);align-items:center}
.legend i{display:inline-block;width:11px;height:11px;border-radius:2px;margin-right:5px;vertical-align:-1px}
footer{margin-top:28px;padding-top:18px;border-top:1px solid var(--line);font-size:12.5px;color:var(--ink-3);max-width:68ch}
footer a{color:var(--accent)}
footer p{margin:0 0 10px}
@media (max-width:560px){.daylab{width:46px}.cell{height:26px;font-size:9px}.top-meta{margin-left:0;width:100%}}
@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
</style>
</head>
<body>
<header class="top">
  <div class="top-in">
    <h1>Seewind</h1>
    <div class="top-meta">
      <span>Modell <b>ICON-CH1&nbsp;/&nbsp;CH2</b> · MeteoSchweiz</span>
      <span>Stand <b>${escape(standLabel(stand))}</b></span>
    </div>
  </div>
</header>

<div class="wrap">
  <section class="verdict${naechstes ? " hit" : ""}">
    <div class="verdict-bar"></div>
    <div class="verdict-in">
      <div class="eyebrow">Nächstes Zeitfenster</div>
      ${naechstes ? verdictTreffer(naechstes, treffer.length) : verdictLeer(kriterien)}
    </div>
  </section>

  <div class="tools">
    <a class="kalender" href="fenster.ics" download>Fenster als Termine ⤓</a>
    <span class="hint" style="flex-basis:auto">oder den Kalender in Outlook abonnieren — dann kommen neue Fenster von selbst dazu</span>
  </div>

  <div class="tools">
    <label for="schwelle">Schwelle testen</label>
    <input type="range" id="schwelle" min="6" max="25" step="1" value="${kriterien.minWindKn}">
    <output id="schwelle-out">${kriterien.minWindKn} kn</output>
    <span class="hint">Nur Vorschau in dieser Ansicht. Der Alarm rechnet mit den Werten aus <code>spots.json</code>.</span>
  </div>

  <div id="seen"></div>

  <div class="legend">
    <span><i style="background:var(--lv0)"></i>zu wenig oder falsche Richtung</span>
    <span><i style="background:var(--lv1)"></i>knapp</span>
    <span><i style="background:var(--lv2)"></i>fahrbar</span>
    <span><i style="background:var(--lv3)"></i>kräftig</span>
    <span class="mono">Zahl = Mittelwind in Knoten</span>
  </div>

  <footer>
    <p>Windwerte sind 10-m-Mittelwind und Böen aus den MeteoSchweiz-Modellen ICON-CH1 (1 km, bis rund 33 Stunden) und ICON-CH2 (2 km, darüber hinaus), bezogen über <a href="https://open-meteo.com/">Open-Meteo</a>. Ein Gitterpunkt am Seeufer bildet lokale Düsen- und Thermikeffekte nur näherungsweise ab.</p>
    <p>Die fahrbaren Richtungssektoren je Spot sind Startwerte und gehören angepasst, sobald du siehst, was am Spot wirklich läuft — sie stehen in <code>spots.json</code>.${quelleUrl ? ` <a href="${escape(quelleUrl)}">Repo</a>` : ""}</p>
  </footer>
</div>

<script id="daten" type="application/json">${jsonEinbetten(nutzdaten)}</script>
<script>
(function(){
  var D = JSON.parse(document.getElementById("daten").textContent);
  var OKT = ["N","NO","O","SO","S","SW","W","NW"];
  var WT = ["So","Mo","Di","Mi","Do","Fr","Sa"];
  var SEEN = ${JSON.stringify(seen)};
  var K = D.kriterien;
  var STUNDEN = [];
  for (var h = K.stundeVon; h <= K.stundeBis; h++) STUNDEN.push(h);

  function oktant(g){ g=((g%360)+360)%360; return OKT[Math.round(g/45)%8]; }
  function tag(datum){
    var p = datum.split("-").map(Number);
    var d = new Date(p[0], p[1]-1, p[2]);
    return { kurz: WT[d.getDay()], datum: p[2]+"."+p[1]+"." };
  }
  function stufe(z, spot, schwelle){
    var passt = spot.dirs.indexOf(oktant(z.grad)) >= 0;
    if (!passt) return (z.wind >= schwelle || z.boe >= K.minGustKn) ? 1 : 0;
    if (z.wind >= schwelle + 6) return 3;
    if (z.wind >= schwelle) return 2;
    if (z.wind >= schwelle - 3 || z.boe >= K.minGustKn) return 1;
    return 0;
  }
  function fenster(zeilen, spot, schwelle){
    var out = [], nachTag = {};
    zeilen.forEach(function(z){ (nachTag[z.datum] = nachTag[z.datum] || []).push(z); });
    Object.keys(nachTag).sort().forEach(function(datum){
      var liste = nachTag[datum].slice().sort(function(a,b){ return a.stunde-b.stunde; });
      var block = [];
      function zu(){
        if (block.length >= K.minStunden){
          var sp = block.reduce(function(m,z){ return z.wind > m.wind ? z : m; }, block[0]);
          out.push({ datum: datum, von: block[0].stunde, bis: block[block.length-1].stunde+1,
                     wind: sp.wind, boe: Math.max.apply(null, block.map(function(z){return z.boe;})),
                     richtung: oktant(sp.grad) });
        }
        block = [];
      }
      liste.forEach(function(z){
        if (block.length && z.stunde !== block[block.length-1].stunde + 1) zu();
        if (stufe(z, spot, schwelle) >= 2) block.push(z); else zu();
      });
      zu();
    });
    return out;
  }

  var host = document.getElementById("seen");
  var slider = document.getElementById("schwelle");
  var ausgabe = document.getElementById("schwelle-out");

  function zeichne(){
    var global = parseInt(slider.value, 10);
    ausgabe.textContent = global + " kn";
    host.innerHTML = "";
    SEEN.forEach(function(see){
      var spots = D.spots.filter(function(s){ return s.see === see; });
      if (!spots.length) return;
      var sec = document.createElement("section");
      sec.className = "lake";
      sec.innerHTML = '<div class="lake-head"><h3>' + see + '</h3><div class="rule"></div></div>';
      spots.forEach(function(spot){ sec.appendChild(karte(spot, global)); });
      host.appendChild(sec);
    });
  }

  function karte(spot, global){
    var schwelle = global;
    var zeilen = D.reihen[spot.id] || [];
    var treffer = spot.aktiv ? fenster(zeilen, spot, schwelle) : [];
    var best = treffer.reduce(function(m,f){ return !m || f.wind > m.wind ? f : m; }, null);

    var el = document.createElement("article");
    el.className = "spot" + (spot.aktiv ? "" : " off");

    var pille = '<span class="pill l0">ruhig</span>';
    if (!spot.aktiv) pille = '<span class="pill l0">aus</span>';
    else if (best) pille = '<span class="pill ' + (best.wind >= schwelle + 6 ? "l3" : "l2") + '">' +
      treffer.length + ' Fenster · bis ' + best.wind + ' kn</span>';
    else if (zeilen.some(function(z){ return stufe(z, spot, schwelle) === 1; }))
      pille = '<span class="pill l1">knapp</span>';

    var kopf = document.createElement("div");
    kopf.className = "spot-head";
    kopf.innerHTML = '<span class="spot-name">' + spot.name + '</span>' +
      '<span class="dirs">' + spot.dirs.join(" ") + ' · ab ' + schwelle + ' kn</span>' +
      '<span class="sp"></span>' + pille;
    el.appendChild(kopf);

    var tage = [];
    zeilen.forEach(function(z){ if (tage.indexOf(z.datum) < 0) tage.push(z.datum); });
    tage.sort();

    var raster = document.createElement("div");
    raster.className = "days";
    raster.style.setProperty("--cols", STUNDEN.length);

    var kopfzeile = document.createElement("div");
    kopfzeile.className = "dayrow";
    kopfzeile.innerHTML = '<div class="daylab"></div><div class="hours">' +
      STUNDEN.map(function(h){ return "<span>" + h + "</span>"; }).join("") + '</div>';
    raster.appendChild(kopfzeile);

    tage.forEach(function(datum){
      var t = tag(datum), proStunde = {};
      zeilen.forEach(function(z){ if (z.datum === datum) proStunde[z.stunde] = z; });
      var zellen = STUNDEN.map(function(h){
        var z = proStunde[h];
        if (!z) return '<div class="cell na"></div>';
        var lv = spot.aktiv ? stufe(z, spot, schwelle) : 0;
        var titel = t.kurz + " " + t.datum + " " + (h < 10 ? "0" + h : h) + ":00 — " +
          z.wind + " kn, Böen " + z.boe + " kn, " + oktant(z.grad) + " (" + z.grad + "°)";
        return '<div class="cell l' + lv + '" title="' + titel + '">' + z.wind + '</div>';
      }).join("");
      var zeile = document.createElement("div");
      zeile.className = "dayrow";
      zeile.innerHTML = '<div class="daylab"><b>' + t.kurz + '</b>' + t.datum + '</div>' +
        '<div class="strip">' + zellen + '</div>';
      raster.appendChild(zeile);
    });
    el.appendChild(raster);
    return el;
  }

  try {
    var gemerkt = localStorage.getItem("seewind-schwelle");
    if (gemerkt) slider.value = gemerkt;
  } catch (e) {}
  slider.addEventListener("input", function(){
    try { localStorage.setItem("seewind-schwelle", slider.value); } catch (e) {}
    zeichne();
  });
  zeichne();
})();
</script>
</body>
</html>`;
}

function verdictTreffer(f, anzahl) {
  const t = tagLabel(f.datum);
  const stats = [
    ["Mittelwind", `${f.wind} kn`],
    ["Böen", `${f.boe} kn`],
    ["Richtung", f.richtung],
    ["Revier", f.see],
  ];
  return (
    `<h2><em>${t.kurz} ${t.datum}</em> ${uhr(f.von)}–${uhr(f.bis)} Uhr · ${escape(f.spotName)}</h2>` +
    `<p>${f.stunden} Stunden über der Schwelle, Richtung ${f.richtung}. ` +
    (anzahl > 1
      ? `Insgesamt ${anzahl} Fenster in der Vorschau.</p>`
      : `Einziges Fenster in der Vorschau.</p>`) +
    `<div class="vstats">` +
    stats
      .map(([k, v]) => `<div class="vstat"><div class="k">${k}</div><div class="v">${escape(v)}</div></div>`)
      .join("") +
    `</div>`
  );
}

function verdictLeer(kriterien) {
  return (
    `<h2>Kein Fenster in den nächsten Tagen</h2>` +
    `<p>Nirgends ${kriterien.minStunden} zusammenhängende Stunden über ${kriterien.minWindKn} kn ` +
    `aus passender Richtung. Mit dem Regler unten siehst du, was eine andere Schwelle ergäbe.</p>`
  );
}

function standLabel(stand) {
  if (!stand) return "–";
  return `${stand.slice(8, 10)}.${stand.slice(5, 7)}. ${stand.slice(11, 16)}`;
}

function escape(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** JSON sicher in ein script-Tag einbetten. */
function jsonEinbetten(obj) {
  const zeilentrenner = new RegExp("[\\u2028\\u2029]", "g");
  return JSON.stringify(obj)
    .replace(/</g, "\\u003c")
    .replace(zeilentrenner, (c) => "\\u" + c.charCodeAt(0).toString(16));
}
