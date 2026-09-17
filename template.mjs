import { tagLabel, uhr } from "./lib.mjs";

/**
 * Baut die statische Dashboard-Seite. Alle Daten werden eingebettet,
 * die Seite lädt zur Laufzeit nichts nach und funktioniert offline.
 */
export function baueSeite({ spots, kriterien, reihen, treffer, stand }) {
  const nutzdaten = {
    kriterien,
    stand,
    spots: spots.map((s) => ({
      id: s.id,
      name: s.name,
      see: s.see,
      dirs: s.dirs,
      lat: s.lat,
      lon: s.lon,
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
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.css">
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

.eyebrow{font-family:Archivo,sans-serif;font-size:10.5px;font-weight:600;letter-spacing:.13em;text-transform:uppercase;color:var(--ink-3)}

/* Karte */
.karte-box{margin-top:22px;background:var(--surface);border:1px solid var(--line);border-radius:4px;overflow:hidden}
.karte-kopf{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;padding:13px 15px 12px;border-bottom:1px solid var(--line)}
.karte-kopf h3{font-size:12px;font-weight:600;letter-spacing:.13em;text-transform:uppercase;color:var(--ink-2)}
.karte-kopf .wann{font-family:"IBM Plex Mono",monospace;font-size:14px;font-weight:600;font-variant-numeric:tabular-nums;color:var(--accent);margin-left:auto}
#karte{height:380px;width:100%;background:var(--surface-2);z-index:0}
.karte-steuer{display:flex;align-items:center;gap:12px;padding:12px 15px;border-top:1px solid var(--line);flex-wrap:wrap}
.karte-steuer input[type=range]{flex:1;min-width:140px;accent-color:var(--accent)}
.abspielen{
  flex:none;width:32px;height:32px;border-radius:50%;cursor:pointer;
  border:1px solid var(--line-strong);background:var(--surface);color:var(--ink-2);
  font-size:12px;display:grid;place-items:center;padding:0;
}
.abspielen:hover{border-color:var(--accent);color:var(--accent)}
.abspielen:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.abspielen.laeuft{background:var(--accent);border-color:var(--accent);color:var(--surface)}
:root[data-theme="dark"] .abspielen.laeuft,:root:not([data-theme="light"]) .abspielen.laeuft{color:#04201f}
.karte-hinweis{padding:12px 15px;font-size:13px;color:var(--ink-3);border-top:1px solid var(--line)}

/* Kachel-Ebene im dunklen Modus abdunkeln - OSM hat keine dunkle Variante. */
@media (prefers-color-scheme:dark){
  :root:not([data-theme="light"]) .leaflet-tile-pane{filter:invert(1) hue-rotate(180deg) brightness(.92) contrast(.9) saturate(.6)}
}
:root[data-theme="dark"] .leaflet-tile-pane{filter:invert(1) hue-rotate(180deg) brightness(.92) contrast(.9) saturate(.6)}
.leaflet-container{font-family:"Source Sans 3",system-ui,sans-serif;background:var(--surface-2)}
.leaflet-popup-content-wrapper,.leaflet-popup-tip{background:var(--surface);color:var(--ink);box-shadow:var(--shadow)}
.leaflet-popup-content{margin:11px 13px;font-size:13.5px;line-height:1.5}
.leaflet-popup-content b{font-family:Archivo,sans-serif}
.leaflet-control-attribution{background:color-mix(in srgb,var(--surface) 82%,transparent)!important;color:var(--ink-3)!important;font-size:10px!important}
.leaflet-control-attribution a{color:var(--ink-2)!important}

.nadel{display:grid;place-items:center}
.nadel .scheibe{
  width:34px;height:34px;border-radius:50%;display:grid;place-items:center;
  font-family:"IBM Plex Mono",monospace;font-size:12px;font-weight:600;
  border:1.5px solid var(--surface);box-shadow:0 1px 5px rgba(0,0,0,.28);
}
.nadel.l0 .scheibe{background:var(--lv0);color:var(--lv0-ink)}
.nadel.l1 .scheibe{background:var(--lv1);color:#fff}
.nadel.l2 .scheibe{background:var(--lv2);color:#fff}
.nadel.l3 .scheibe{background:var(--lv3);color:#fff}
.nadel.top .scheibe{border-color:var(--accent);border-width:2.5px;width:40px;height:40px;font-size:14px}
.nadel .pfeil{position:absolute;width:52px;height:52px;pointer-events:none}
.nadel .pfeil svg{width:100%;height:100%;display:block}
.nadel .pfeil path{fill:var(--ink);opacity:.75}
.nadel.l2 .pfeil path,.nadel.l3 .pfeil path{fill:var(--ink);opacity:.9}
.nadel .krone{
  position:absolute;top:-9px;font:600 8.5px Archivo,sans-serif;letter-spacing:.06em;
  background:var(--accent);color:var(--surface);padding:1px 5px;border-radius:2px;white-space:nowrap;
}
:root[data-theme="dark"] .nadel .krone,:root:not([data-theme="light"]) .nadel .krone{color:#04201f}

/* Rangliste */
.podium{margin-top:22px;display:grid;gap:10px}
.rang{background:var(--surface);border:1px solid var(--line);border-radius:4px;overflow:hidden;box-shadow:var(--shadow)}
.rang .balken{height:4px;background:var(--lv0)}
.rang.eins .balken{background:linear-gradient(90deg,var(--lv2),var(--lv3))}
.rang.zwei .balken,.rang.drei .balken{background:var(--lv2);opacity:.7}
.rang-in{padding:16px 18px 17px;display:flex;gap:16px;align-items:flex-start}
.rang.eins .rang-in{padding:20px 22px 22px}
.nr{
  flex:none;width:30px;height:30px;border-radius:50%;display:grid;place-items:center;
  font-family:"IBM Plex Mono",monospace;font-size:14px;font-weight:600;
  background:var(--surface-2);color:var(--ink-3);border:1px solid var(--line-strong);
}
.rang.eins .nr{width:38px;height:38px;font-size:17px;background:var(--accent);color:var(--surface);border-color:var(--accent)}
:root[data-theme="dark"] .rang.eins .nr,:root:not([data-theme="light"]) .rang.eins .nr{color:#04201f}
.rang .haupt{flex:1;min-width:0}
.rang .wann{font-family:Archivo,sans-serif;font-weight:800;letter-spacing:-.02em;font-size:18px;line-height:1.2}
.rang.eins .wann{font-size:clamp(21px,4.6vw,29px)}
.rang .wann em{font-style:normal;color:var(--accent)}
.rang .wo{color:var(--ink-2);margin-top:4px;font-size:14.5px}
.rang.eins .wo{font-size:16px}
.zahlen{display:flex;gap:18px;flex-wrap:wrap;margin-top:12px}
.zahlen div .k{font:600 9.5px Archivo,sans-serif;letter-spacing:.11em;text-transform:uppercase;color:var(--ink-3)}
.zahlen div .v{font-family:"IBM Plex Mono",monospace;font-size:15px;font-weight:600;font-variant-numeric:tabular-nums;margin-top:1px}
.rang.eins .zahlen div .v{font-size:19px}
.score{flex:none;width:118px;text-align:right}
.score .p{font-family:"IBM Plex Mono",monospace;font-size:22px;font-weight:600;font-variant-numeric:tabular-nums;line-height:1}
.rang.eins .score .p{font-size:28px}
.score .pl{font:600 9.5px Archivo,sans-serif;letter-spacing:.11em;text-transform:uppercase;color:var(--ink-3);margin-top:2px}
.teile{display:flex;height:5px;border-radius:3px;overflow:hidden;margin-top:9px;background:var(--lv0)}
.teile i{display:block;height:100%}
.teile i.w{background:var(--accent)}
.teile i.d{background:var(--accent);opacity:.65}
.teile i.b{background:var(--accent);opacity:.42}
.teile i.n{background:var(--accent);opacity:.24}
.teile-leg{display:flex;gap:9px;flex-wrap:wrap;justify-content:flex-end;margin-top:6px;font-family:"IBM Plex Mono",monospace;font-size:10px;color:var(--ink-3)}
.leer{background:var(--surface);border:1px solid var(--line);border-radius:4px;padding:20px 22px}
.leer h2{font-family:Archivo,sans-serif;font-size:clamp(20px,4.4vw,27px);font-weight:800;letter-spacing:-.02em}
.leer p{margin:9px 0 0;color:var(--ink-2);max-width:62ch}
@media (max-width:560px){
  .rang-in{flex-wrap:wrap;gap:12px}
  .score{width:100%;text-align:left;display:flex;align-items:baseline;gap:8px}
  .score .pl{margin-top:0}
  .teile{width:100%}
  .teile-leg{justify-content:flex-start}
}

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
:root[data-theme="dark"] .tools .kalender:hover,
:root:not([data-theme="light"]) .tools .kalender:hover{color:#04201f}
.tools .kalender.abo{background:var(--accent);color:var(--surface)}
:root[data-theme="dark"] .tools .kalender.abo,
:root:not([data-theme="light"]) .tools .kalender.abo{color:#04201f}
.tools .kalender.abo:hover{filter:brightness(1.08)}
.tools .kopieren{border-color:var(--line-strong);color:var(--ink-2);background:var(--surface);cursor:pointer;font-family:Archivo,sans-serif}
.tools .kopieren:hover{border-color:var(--accent);color:var(--accent);background:var(--surface)}
.tools .kopieren.ok{border-color:var(--lv2);color:var(--lv2)}
.tools .kalender:focus-visible,.tools .kopieren:focus-visible{outline:2px solid var(--accent);outline-offset:2px}

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
  <div id="podium"></div>

  <section class="karte-box" id="karte-box" hidden>
    <div class="karte-kopf">
      <h3>Wo der Wind steht</h3>
      <span class="wann" id="karte-wann">–</span>
    </div>
    <div id="karte"></div>
    <div class="karte-steuer">
      <button class="abspielen" type="button" id="abspielen" aria-label="Zeitverlauf abspielen">▶</button>
      <input type="range" id="zeit" min="0" max="0" step="1" value="0" aria-label="Prognosestunde">
    </div>
    <div class="karte-hinweis">
      Der Pfeil zeigt, wohin der Wind weht; die Zahl ist der Mittelwind in Knoten.
      Ein Spot färbt sich nur ein, wenn die Richtung zu <i>seinen</i> Sektoren passt —
      derselbe Wind kann am einen See fahrbar sein und am anderen nutzlos.
    </div>
  </section>

  <div class="tools">
    <a class="kalender" href="fenster.ics" download>Fenster als Termine ⤓</a>
    <a class="kalender abo" id="abo" href="fenster.ics" hidden>In Outlook abonnieren ↗</a>
    <button class="kalender kopieren" id="abo-kopieren" type="button" hidden>Adresse kopieren</button>
    <span class="hint" style="flex-basis:100%">
      Der Download trägt die Fenster einmalig ein. Das Abo hält den Kalender von
      selbst aktuell — nimmt Outlook den Link nicht direkt an, kopier die Adresse
      und füg sie unter <i>Kalender hinzufügen → Aus dem Internet abonnieren</i> ein.
    </span>
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
    <span class="mono">Punkte: W Wind · D Dauer · B Böen · N Nähe</span>
  </div>

  <footer>
    <p>Windwerte sind 10-m-Mittelwind und Böen aus den MeteoSchweiz-Modellen ICON-CH1 (1 km, bis rund 33 Stunden) und ICON-CH2 (2 km, darüber hinaus), bezogen über <a href="https://open-meteo.com/">Open-Meteo</a>. Ein Gitterpunkt am Seeufer bildet lokale Düsen- und Thermikeffekte nur näherungsweise ab.</p>
    <p>Die fahrbaren Richtungssektoren je Spot sind Startwerte und gehören angepasst, sobald du siehst, was am Spot wirklich läuft — sie stehen in <code>spots.json</code>.</p>
  </footer>
</div>

<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js"></script>
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
                     stunden: block.length,
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

  // Bewertung — muss dieselbe Formel sein wie in lib.mjs, sonst weicht die
  // Rangliste im Dashboard von der in der Meldung ab.
  function bewerte(f, schwelle){
    var g = K.bewertung || {};
    var idealUeber = g.idealUeberSchwelle != null ? g.idealUeberSchwelle : 8;
    var zuvielUeber = g.zuvielUeberSchwelle != null ? g.zuvielUeberSchwelle : 18;
    var ueber = f.wind - schwelle, wind;
    if (ueber <= idealUeber) wind = (ueber / idealUeber) * 50;
    else wind = 50 - Math.min((ueber - idealUeber) / (zuvielUeber - idealUeber), 1) * 20;
    wind = Math.max(0, Math.min(50, wind));

    var volleDauer = g.dauerVollStunden != null ? g.dauerVollStunden : 6;
    var dauer = (Math.min(f.stunden, volleDauer) / volleDauer) * 25;

    var gut = g.boeenGut != null ? g.boeenGut : 1.4;
    var schlecht = g.boeenSchlecht != null ? g.boeenSchlecht : 2.2;
    var verh = f.wind > 0 ? f.boe / f.wind : 3;
    var boeen = 15 * (1 - Math.max(0, Math.min(1, (verh - gut) / (schlecht - gut))));

    var naehe = [10, 8, 5, 3][Math.min(tageBis(f.datum), 3)];
    if (naehe == null) naehe = 3;

    return { punkte: Math.round(wind + dauer + boeen + naehe),
             teile: { wind: Math.round(wind), dauer: Math.round(dauer),
                      boeen: Math.round(boeen), naehe: naehe } };
  }
  function tageBis(datum){
    var p = datum.split("-").map(Number), n = new Date();
    var ziel = Date.UTC(p[0], p[1]-1, p[2]);
    var start = Date.UTC(n.getFullYear(), n.getMonth(), n.getDate());
    return Math.max(0, Math.round((ziel - start) / 86400000));
  }

  var podiumHost = document.getElementById("podium");
  var host = document.getElementById("seen");
  var slider = document.getElementById("schwelle");
  var ausgabe = document.getElementById("schwelle-out");

  function alleTreffer(schwelle){
    var alle = [];
    D.spots.forEach(function(spot){
      if (!spot.aktiv) return;
      fenster(D.reihen[spot.id] || [], spot, schwelle).forEach(function(f){
        var b = bewerte(f, schwelle);
        alle.push(Object.assign({ spot: spot, punkte: b.punkte, teile: b.teile }, f));
      });
    });
    alle.sort(function(a,b){
      if (b.punkte !== a.punkte) return b.punkte - a.punkte;
      return a.datum === b.datum ? a.von - b.von : (a.datum < b.datum ? -1 : 1);
    });
    alle.forEach(function(f,i){ f.rang = i + 1; });
    return alle;
  }

  var RANGKLASSE = ["eins", "zwei", "drei"];

  function podium(schwelle){
    var alle = alleTreffer(schwelle);
    podiumHost.innerHTML = "";

    if (!alle.length){
      var leer = document.createElement("div");
      leer.className = "leer";
      leer.innerHTML = '<div class="eyebrow">Rangliste</div>' +
        '<h2>Kein Fenster in den nächsten Tagen</h2>' +
        '<p>Nirgends ' + K.minStunden + ' zusammenhängende Stunden über ' + schwelle +
        ' kn aus passender Richtung. Mit dem Regler unten siehst du, was eine andere Schwelle ergäbe.</p>';
      podiumHost.appendChild(leer);
      return;
    }

    var eyebrow = document.createElement("div");
    eyebrow.className = "eyebrow";
    eyebrow.style.marginBottom = "10px";
    eyebrow.textContent = alle.length > 3
      ? "Die drei besten von " + alle.length + " Fenstern"
      : (alle.length === 1 ? "Das einzige Fenster" : "Die besten Fenster");
    podiumHost.appendChild(eyebrow);

    alle.slice(0, 3).forEach(function(f, i){
      podiumHost.appendChild(rangKarte(f, i));
    });
  }

  function rangKarte(f, i){
    var t = tag(f.datum);
    var el = document.createElement("article");
    el.className = "rang " + RANGKLASSE[i];

    var zahlen = [
      ["Mittelwind", f.wind + " kn"],
      ["Böen", f.boe + " kn"],
      ["Richtung", f.richtung],
      ["Dauer", f.stunden + " h"]
    ].map(function(z){
      return '<div><div class="k">' + z[0] + '</div><div class="v">' + z[1] + '</div></div>';
    }).join("");

    var p = f.teile;
    var segmente = [["w",p.wind],["d",p.dauer],["b",p.boeen],["n",p.naehe]].map(function(sg){
      return sg[1] > 0 ? '<i class="' + sg[0] + '" style="width:' + sg[1] + '%"></i>' : "";
    }).join("");

    el.innerHTML =
      '<div class="balken"></div>' +
      '<div class="rang-in">' +
        '<div class="nr">' + f.rang + '</div>' +
        '<div class="haupt">' +
          '<div class="wann"><em>' + t.kurz + " " + t.datum + '</em> ' +
            (f.von < 10 ? "0" : "") + f.von + '–' + (f.bis < 10 ? "0" : "") + f.bis + ' Uhr</div>' +
          '<div class="wo">' + f.spot.name + ' · ' + f.spot.see + '</div>' +
          '<div class="zahlen">' + zahlen + '</div>' +
        '</div>' +
        '<div class="score">' +
          '<div class="p">' + f.punkte + '</div>' +
          '<div class="pl">von 100</div>' +
          '<div class="teile">' + segmente + '</div>' +
          '<div class="teile-leg"><span>W ' + p.wind + '</span><span>D ' + p.dauer +
            '</span><span>B ' + p.boeen + '</span><span>N ' + p.naehe + '</span></div>' +
        '</div>' +
      '</div>';
    return el;
  }

  function zeichne(){
    var global = parseInt(slider.value, 10);
    ausgabe.textContent = global + " kn";
    podium(global);
    karteZeichnen(parseInt(zeitRegler.value, 10), global);
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

  /* ---------------- Kalender-Abo ---------------- */

  // Die Adresse ergibt sich aus dem eigenen Ort - so stimmt sie auch, wenn das
  // Repository anders heisst oder unter einer eigenen Domain liegt.
  (function(){
    var abo = document.getElementById("abo");
    var kopieren = document.getElementById("abo-kopieren");
    if (!abo || !kopieren) return;

    // Über file:// gibt es keinen Host, den ein Kalender abrufen könnte.
    if (location.protocol !== "http:" && location.protocol !== "https:") return;

    var https;
    try { https = new URL("fenster.ics", location.href).href; } catch (e) { return; }
    // webcal:// ist dieselbe Adresse mit anderem Schema - manche Outlook-Versionen
    // öffnen nur darauf direkt den Abo-Dialog.
    var webcal = https.replace(/^https?:/, "webcal:");

    abo.href = webcal;
    abo.title = https;
    abo.hidden = false;
    kopieren.hidden = false;

    kopieren.addEventListener("click", function(){
      var fertig = function(){
        kopieren.classList.add("ok");
        kopieren.textContent = "kopiert";
        setTimeout(function(){
          kopieren.classList.remove("ok");
          kopieren.textContent = "Adresse kopieren";
        }, 1800);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(https).then(fertig, function(){});
      } else {
        var t = document.createElement("textarea");
        t.value = https; document.body.appendChild(t); t.select();
        try { document.execCommand("copy"); fertig(); } catch (e) {}
        document.body.removeChild(t);
      }
    });
  })();

  /* ---------------- Karte ---------------- */

  // Alle Prognosestunden über alle Spots, chronologisch und eindeutig.
  var STUNDENLISTE = (function(){
    var gesehen = {}, liste = [];
    Object.keys(D.reihen).forEach(function(id){
      (D.reihen[id] || []).forEach(function(z){
        var k = z.datum + " " + z.stunde;
        if (!gesehen[k]) { gesehen[k] = 1; liste.push({ datum: z.datum, stunde: z.stunde }); }
      });
    });
    liste.sort(function(a,b){
      return a.datum === b.datum ? a.stunde - b.stunde : (a.datum < b.datum ? -1 : 1);
    });
    return liste;
  })();

  var lkarte = null, nadeln = {}, spielt = null;

  function pfeilSvg(grad){
    // 0° = Wind aus Norden, weht also nach Süden: Pfeil zeigt nach unten.
    return '<svg viewBox="0 0 52 52" style="transform:rotate(' + ((grad + 180) % 360) + 'deg)">' +
      '<path d="M26 4 L30.5 14 L26 11.6 L21.5 14 Z"/></svg>';
  }

  function nadelHtml(spot, z, schwelle, top){
    var lv = z ? stufe(z, spot, schwelle) : 0;
    return '<div class="nadel l' + lv + (top ? " top" : "") + '">' +
      (top ? '<div class="krone">PLATZ ' + top + '</div>' : "") +
      (z ? '<div class="pfeil">' + pfeilSvg(z.grad) + '</div>' : "") +
      '<div class="scheibe">' + (z ? z.wind : "–") + '</div></div>';
  }

  function stundeVon(spotId, punkt){
    var reihe = D.reihen[spotId] || [];
    for (var i = 0; i < reihe.length; i++){
      if (reihe[i].datum === punkt.datum && reihe[i].stunde === punkt.stunde) return reihe[i];
    }
    return null;
  }

  function karteAufbauen(){
    if (typeof L === "undefined" || !STUNDENLISTE.length) return false;

    document.getElementById("karte-box").hidden = false;
    lkarte = L.map("karte", { scrollWheelZoom: false, attributionControl: true });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 15, minZoom: 7,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(lkarte);

    // Scrollen auf der Seite soll nicht in der Karte hängenbleiben.
    lkarte.on("click", function(){ lkarte.scrollWheelZoom.enable(); });
    lkarte.on("mouseout", function(){ lkarte.scrollWheelZoom.disable(); });

    var punkte = [];
    D.spots.forEach(function(spot){
      if (spot.lat == null || spot.lon == null) return;
      punkte.push([spot.lat, spot.lon]);
      var m = L.marker([spot.lat, spot.lon], {
        icon: L.divIcon({ className: "", html: "", iconSize: [40, 40], iconAnchor: [20, 20] }),
        title: spot.name
      }).addTo(lkarte);
      nadeln[spot.id] = { marker: m, spot: spot };
    });
    if (punkte.length) lkarte.fitBounds(punkte, { padding: [34, 34] });
    // Der Abschnitt war bis eben ausgeblendet - Leaflet muss neu messen.
    setTimeout(function(){ lkarte.invalidateSize(); }, 0);
    return true;
  }

  function karteZeichnen(index, schwelle){
    if (!lkarte) return;
    var punkt = STUNDENLISTE[index];
    if (!punkt) return;

    var t = tag(punkt.datum);
    document.getElementById("karte-wann").textContent =
      t.kurz + " " + t.datum + " " + (punkt.stunde < 10 ? "0" : "") + punkt.stunde + ":00";

    // Welcher Spot gerade auf dem Podest steht, bekommt eine Krone.
    var raenge = {};
    alleTreffer(schwelle).slice(0, 3).forEach(function(f){ raenge[f.spot.id] = f.rang; });

    Object.keys(nadeln).forEach(function(id){
      var n = nadeln[id];
      var z = stundeVon(id, punkt);
      n.marker.setIcon(L.divIcon({
        className: "",
        html: nadelHtml(n.spot, z, schwelle, raenge[id]),
        iconSize: [40, 40], iconAnchor: [20, 20]
      }));
      n.marker.bindPopup(
        "<b>" + n.spot.name + "</b><br>" + n.spot.see + "<br>" +
        (z
          ? z.wind + " kn, Böen " + z.boe + " kn<br>Richtung " + oktant(z.grad) + " (" + z.grad + "°)" +
            "<br>fahrbar bei " + n.spot.dirs.join(" ")
          : "keine Prognose für diese Stunde")
      );
    });
  }

  var zeitRegler = document.getElementById("zeit");
  var abspielKnopf = document.getElementById("abspielen");

  if (karteAufbauen()){
    zeitRegler.max = String(STUNDENLISTE.length - 1);
    // Startpunkt: die Stunde des besten Fensters, nicht stumpf die erste.
    var beste = alleTreffer(parseInt(slider.value, 10))[0];
    var start = 0;
    if (beste){
      for (var i = 0; i < STUNDENLISTE.length; i++){
        if (STUNDENLISTE[i].datum === beste.datum && STUNDENLISTE[i].stunde === beste.von){ start = i; break; }
      }
    }
    zeitRegler.value = String(start);

    zeitRegler.addEventListener("input", function(){
      anhalten();
      karteZeichnen(parseInt(zeitRegler.value, 10), parseInt(slider.value, 10));
    });

    abspielKnopf.addEventListener("click", function(){
      if (spielt) { anhalten(); return; }
      abspielKnopf.classList.add("laeuft");
      abspielKnopf.textContent = "❚❚";
      spielt = setInterval(function(){
        var n = (parseInt(zeitRegler.value, 10) + 1) % STUNDENLISTE.length;
        zeitRegler.value = String(n);
        karteZeichnen(n, parseInt(slider.value, 10));
      }, 700);
    });
  }

  function anhalten(){
    if (!spielt) return;
    clearInterval(spielt); spielt = null;
    abspielKnopf.classList.remove("laeuft");
    abspielKnopf.textContent = "▶";
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
