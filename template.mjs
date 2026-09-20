import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { alsBrowserQuelle } from "./browserbau.mjs";

const HIER = dirname(fileURLToPath(import.meta.url));

/**
 * Baut die statische Dashboard-Seite.
 *
 * Die Prognosedaten sind eingebettet — die Standardansicht lädt zur Laufzeit
 * nichts nach. Der Reisemodus dagegen rechnet im Browser: er holt sich
 * Kartenkacheln und Prognose selbst, und zwar mit denselben Modulen, die auch
 * der Lauf benutzt. Sie werden dafür hier hineinkopiert, nicht abgeschrieben.
 */
export async function baueSeite({ spots, kriterien, reihen, treffer, stand, reise }) {
  const nutzdaten = {
    kriterien,
    stand,
    reise: reise || null,
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
      reise: s.reise === true,
      strecken: s.strecken || null,
    })),
    reihen,
  };

  const module = await alsBrowserQuelle([
    { pfad: join(HIER, "lib.mjs"), name: "Kern" },
    { pfad: join(HIER, "spotsuche.mjs"), name: "Suche" },
  ]);


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

/* Reisemodus */
.modus{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:22px}
.modus button{
  font:600 12px Archivo,sans-serif;letter-spacing:.06em;text-transform:uppercase;
  padding:8px 15px;border:1px solid var(--line-strong);border-radius:2px;
  background:var(--surface);color:var(--ink-2);cursor:pointer;
}
.modus button:hover{border-color:var(--accent);color:var(--accent)}
.modus button.an{background:var(--accent);border-color:var(--accent);color:var(--surface)}
.modus button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.modus-hinweis{font-size:12.5px;color:var(--ink-3);margin-left:auto;text-align:right}

.reise{margin-top:14px;background:var(--surface);border:1px solid var(--line);border-radius:4px;padding:15px 16px 16px}
.reise-zeile{display:flex;gap:9px;align-items:center;flex-wrap:wrap}
.reise-zeile+.reise-zeile{margin-top:11px}
.reise input[type=search]{
  flex:1;min-width:220px;font:15px "Source Sans 3",system-ui,sans-serif;
  padding:9px 11px;border:1px solid var(--line-strong);border-radius:2px;
  background:var(--surface-2);color:var(--ink);
}
.reise input[type=search]:focus{outline:2px solid var(--accent);outline-offset:-1px}
.reise .umkreis label{font:600 10.5px Archivo,sans-serif;letter-spacing:.11em;text-transform:uppercase;color:var(--ink-3)}
.reise input[type=range]{flex:1;min-width:140px;max-width:300px;accent-color:var(--accent)}
.reise output{font-weight:600;min-width:54px}
.knopf{
  font:600 12px Archivo,sans-serif;letter-spacing:.05em;padding:9px 14px;
  border:1px solid var(--accent);border-radius:2px;background:var(--accent);
  color:var(--surface);cursor:pointer;white-space:nowrap;
}
.knopf:hover{filter:brightness(1.08)}
.knopf:disabled{opacity:.42;cursor:default;filter:none}
.knopf.still{background:var(--surface);color:var(--ink-2);border-color:var(--line-strong)}
.knopf.still:hover{border-color:var(--accent);color:var(--accent);filter:none}
.knopf:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.ort-treffer{margin-top:10px;border:1px solid var(--line);border-radius:2px;overflow:hidden}
.ort-treffer button{
  display:block;width:100%;text-align:left;padding:9px 12px;border:0;cursor:pointer;
  background:var(--surface);color:var(--ink);font:15px "Source Sans 3",system-ui,sans-serif;
  border-bottom:1px solid var(--line);
}
.ort-treffer button:last-child{border-bottom:0}
.ort-treffer button:hover{background:var(--accent-soft)}
.ort-treffer .wo{display:block;font-size:12.5px;color:var(--ink-3)}
.reise-fuss{margin:12px 0 0;font-size:12.5px;color:var(--ink-3);max-width:74ch}
.reise-status{margin-top:12px;padding:10px 12px;border-radius:2px;background:var(--surface-2);border:1px solid var(--line);font-size:13.5px;color:var(--ink-2)}
.reise-status.fehler{background:var(--lv3-bg);border-color:var(--lv3);color:var(--lv3)}
.reise-status.fertig{background:var(--lv2-bg);border-color:var(--lv2);color:var(--lv2)}
.uebernehmen{margin-top:14px;padding-top:14px;border-top:1px solid var(--line)}
.uebernehmen p{margin:6px 0 9px;font-size:13px;color:var(--ink-2);max-width:74ch}
.uebernehmen pre{
  margin:0 0 10px;padding:11px 12px;background:var(--surface-2);border:1px solid var(--line);
  border-radius:2px;font-size:12.5px;overflow:auto;white-space:pre;
}
.zeitzone{font-size:11.5px;color:var(--ink-3);font-family:"IBM Plex Mono",monospace}

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
  <div class="modus" id="modus">
    <button type="button" class="an" data-modus="standard">Standard</button>
    <button type="button" data-modus="reise">Reisemodus</button>
    <span class="modus-hinweis" id="modus-hinweis">Die gespeicherten Seen, zweimal täglich frisch gerechnet.</span>
  </div>

  <section class="reise" id="reise" hidden>
    <div class="reise-zeile">
      <input type="search" id="ort-eingabe" placeholder="Ort suchen — Tarifa, Torbole, Sylt …" autocomplete="off" spellcheck="false">
      <button type="button" class="knopf" id="ort-suchen">Suchen</button>
      <button type="button" class="knopf still" id="ort-hier">Mein Standort</button>
    </div>
    <div class="ort-treffer" id="ort-treffer" hidden></div>

    <div class="reise-zeile umkreis">
      <label for="umkreis">Umkreis</label>
      <input type="range" id="umkreis" min="5" max="60" step="5" value="25">
      <output id="umkreis-out" class="mono">25 km</output>
      <button type="button" class="knopf" id="reise-start" disabled>Spots suchen</button>
    </div>

    <p class="reise-fuss">
      Kein Spotverzeichnis, sondern Geometrie: aus der Uferform wird gemessen, wie
      weit das Wasser gegen den Wind reicht. Das schliesst ablandigen Wind aus und
      verwirft Pfützen — sagt aber nichts über Zugang, Einstieg oder örtliche
      Verbote. Auch auf die Karte tippen setzt den Mittelpunkt.
    </p>

    <div class="reise-status" id="reise-status" hidden></div>

    <div class="uebernehmen" id="uebernehmen" hidden>
      <div class="eyebrow">Für Meldungen übernehmen</div>
      <p>Diesen Block in <code>spots.json</code> anstelle des vorhandenen <code>"reise"</code>-Blocks einsetzen. Ab dem nächsten Lauf werden diese Spots gemeldet wie die Seen zu Hause.</p>
      <pre class="mono" id="reise-json"></pre>
      <button type="button" class="knopf" id="reise-kopieren">Block kopieren</button>
    </div>
  </section>

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
${module}
</script>
<script>
(function(){
  var D = JSON.parse(document.getElementById("daten").textContent);
  var WT = ["So","Mo","Di","Mi","Do","Fr","Sa"];
  var K = D.kriterien;
  // Reihenfolge der Seeabschnitte: so, wie die Spots in der Konfiguration stehen.
  function seenListe(){
    var out = [];
    D.spots.forEach(function(s){ if (out.indexOf(s.see) < 0) out.push(s.see); });
    return out;
  }
  var STUNDEN = [];
  for (var h = K.stundeVon; h <= K.stundeBis; h++) STUNDEN.push(h);

  function oktant(g){ return Kern.oktant(g); }
  function tag(datum){
    var p = datum.split("-").map(Number);
    var d = new Date(p[0], p[1]-1, p[2]);
    return { kurz: WT[d.getDay()], datum: p[2]+"."+p[1]+"." };
  }
  // Stufe, Fenster und Bewertung kommen aus lib.mjs — demselben Modul, mit dem
  // der Lauf die Meldung rechnet. Vorher stand die Formel hier ein zweites Mal,
  // von Hand abgeschrieben; als die beiden auseinanderliefen, zeigte das
  // Dashboard eine andere Rangfolge als die Meldung. Der Regler unten verstellt
  // nur die Schwelle, also wird sie dem Spot als minWindKn untergeschoben.
  function mitSchwelle(spot, schwelle){
    var kopie = {};
    for (var k in spot) if (Object.prototype.hasOwnProperty.call(spot, k)) kopie[k] = spot[k];
    kopie.minWindKn = schwelle;
    return kopie;
  }
  function stufe(z, spot, schwelle){ return Kern.stufe(z, mitSchwelle(spot, schwelle), K); }
  function fenster(zeilen, spot, schwelle){ return Kern.fenster(zeilen, mitSchwelle(spot, schwelle), K); }
  function bewerte(f, schwelle){ return Kern.bewerte(f, { minWindKn: schwelle }, K); }

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
    seenListe().forEach(function(see){
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
  function stundenListe(){
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
  }
  var STUNDENLISTE = stundenListe();

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

  /** "N 0.8 · NO 3.4 · O 1.3 …" — nur die Richtungen, wo überhaupt Wasser liegt. */
  function strecken(s){
    return Kern.OKTANTEN.filter(function(o){ return s[o] >= 0.5; })
      .map(function(o){ return o + " " + s[o]; }).join(" · ") || "überall unter 0.5";
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
      maxZoom: 15, minZoom: 3,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(lkarte);

    // Scrollen auf der Seite soll nicht in der Karte hängenbleiben.
    lkarte.on("click", function(){ lkarte.scrollWheelZoom.enable(); });
    lkarte.on("mouseout", function(){ lkarte.scrollWheelZoom.disable(); });

    nadelnSetzen();
    setTimeout(function(){ lkarte.invalidateSize(); }, 0);
    return true;
  }

  /** Marker zu den aktuell angezeigten Spots — auch nach einem Datenwechsel. */
  function nadelnSetzen(){
    if (!lkarte) return;
    Object.keys(nadeln).forEach(function(id){ lkarte.removeLayer(nadeln[id].marker); });
    nadeln = {};

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
    // Der Abschnitt war eben noch ausgeblendet - Leaflet muss neu messen.
    setTimeout(function(){ lkarte.invalidateSize(); }, 0);
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
          : "keine Prognose für diese Stunde") +
        (n.spot.strecken ? '<br><span class="zeitzone">Anlaufstrecke km: ' + strecken(n.spot.strecken) + '</span>' : "")
      );
    });
  }

  var zeitRegler = document.getElementById("zeit");
  var abspielKnopf = document.getElementById("abspielen");

  /** Zeitregler auf die Stunde des besten Fensters stellen, nicht stumpf auf die erste. */
  function reglerStellen(){
    zeitRegler.max = String(Math.max(0, STUNDENLISTE.length - 1));
    var beste = alleTreffer(parseInt(slider.value, 10))[0];
    var start = 0;
    if (beste){
      for (var i = 0; i < STUNDENLISTE.length; i++){
        if (STUNDENLISTE[i].datum === beste.datum && STUNDENLISTE[i].stunde === beste.von){ start = i; break; }
      }
    }
    zeitRegler.value = String(start);
  }

  zeitRegler.addEventListener("input", function(){
    anhalten();
    karteZeichnen(parseInt(zeitRegler.value, 10), parseInt(slider.value, 10));
  });

  abspielKnopf.addEventListener("click", function(){
    if (spielt) { anhalten(); return; }
    if (!STUNDENLISTE.length) return;
    abspielKnopf.classList.add("laeuft");
    abspielKnopf.textContent = "❚❚";
    spielt = setInterval(function(){
      var n = (parseInt(zeitRegler.value, 10) + 1) % STUNDENLISTE.length;
      zeitRegler.value = String(n);
      karteZeichnen(n, parseInt(slider.value, 10));
    }, 700);
  });

  if (karteAufbauen()) reglerStellen();

  function anhalten(){
    if (!spielt) return;
    clearInterval(spielt); spielt = null;
    abspielKnopf.classList.remove("laeuft");
    abspielKnopf.textContent = "▶";
  }

  /* ---------------- Reisemodus ---------------- */

  // Die Seen von zu Hause bleiben liegen, damit der Weg zurück nichts kostet.
  var ZUHAUSE = { spots: D.spots, reihen: D.reihen };

  /**
   * Der Reisemodus ersetzt schlicht die Daten und lässt dieselbe Darstellung
   * noch einmal laufen. Keine zweite Rangliste, keine zweite Karte, keine
   * zweite Bewertung — was hier steht, ist dieselbe Rechnung wie für zu Hause.
   */
  function setzeDaten(spots, reihen){
    anhalten();
    D.spots = spots;
    D.reihen = reihen;
    STUNDENLISTE = stundenListe();
    if (!lkarte) karteAufbauen(); else nadelnSetzen();
    reglerStellen();
    zeichne();
  }

  (function reisemodus(){
    var box = document.getElementById("reise");
    var leiste = document.getElementById("modus");
    var hinweis = document.getElementById("modus-hinweis");
    var eingabe = document.getElementById("ort-eingabe");
    var trefferHost = document.getElementById("ort-treffer");
    var umkreis = document.getElementById("umkreis");
    var umkreisAus = document.getElementById("umkreis-out");
    var startKnopf = document.getElementById("reise-start");
    var status = document.getElementById("reise-status");
    var uebernehmen = document.getElementById("uebernehmen");
    var jsonFeld = document.getElementById("reise-json");
    var kopieren = document.getElementById("reise-kopieren");
    if (!box || typeof Suche === "undefined") return;

    var ort = null;
    var laeuft = false;
    var offen = false;

    merkenLaden();
    umkreisAus.textContent = umkreis.value + " km";

    leiste.addEventListener("click", function(e){
      var knopf = e.target.closest ? e.target.closest("button[data-modus]") : null;
      if (!knopf) return;
      umschalten(knopf.getAttribute("data-modus"));
    });

    umkreis.addEventListener("input", function(){
      umkreisAus.textContent = umkreis.value + " km";
      try { localStorage.setItem("seewind-umkreis", umkreis.value); } catch (e) {}
    });

    document.getElementById("ort-suchen").addEventListener("click", suchen);
    eingabe.addEventListener("keydown", function(e){ if (e.key === "Enter") { e.preventDefault(); suchen(); } });
    document.getElementById("ort-hier").addEventListener("click", hierher);
    startKnopf.addEventListener("click", starten);
    kopieren.addEventListener("click", function(){ inZwischenablage(jsonFeld.textContent, kopieren, "Block kopieren"); });

    // Auf die Karte tippen setzt den Mittelpunkt — aber nur im Reisemodus,
    // sonst verschöbe ein Klick auf einen Spot zu Hause das halbe Dashboard.
    if (lkarte) {
      lkarte.on("click", function(e){
        if (!offen || laeuft) return;
        setzeOrt({
          name: e.latlng.lat.toFixed(3) + ", " + e.latlng.lng.toFixed(3),
          lat: e.latlng.lat, lon: e.latlng.lng
        });
        melde("Mittelpunkt gesetzt. Jetzt „Spots suchen“.");
      });
    }

    function umschalten(name){
      offen = name === "reise";
      Array.prototype.forEach.call(leiste.querySelectorAll("button[data-modus]"), function(b){
        b.classList.toggle("an", b.getAttribute("data-modus") === name);
      });
      box.hidden = !offen;
      hinweis.textContent = offen
        ? "Rechnet im Browser, hier und jetzt — gemeldet wird erst, wenn du den Ort unten übernimmst."
        : "Die gespeicherten Seen, zweimal täglich frisch gerechnet.";
      if (!offen) setzeDaten(ZUHAUSE.spots, ZUHAUSE.reihen);
      else if (D.spots === ZUHAUSE.spots && ort) melde("Ort gemerkt: " + ort.name + ". „Spots suchen“ rechnet neu.");
    }

    async function suchen(){
      var text = eingabe.value.trim();
      if (text.length < 2) return;
      trefferHost.hidden = true;
      melde("Ort suchen …");
      try {
        var url = "https://geocoding-api.open-meteo.com/v1/search?count=6&language=de&format=json&name=" +
          encodeURIComponent(text);
        var r = await fetch(url);
        if (!r.ok) throw new Error("Die Ortssuche antwortete mit " + r.status + ".");
        var daten = await r.json();
        var liste = daten.results || [];
        if (!liste.length) { melde("Nichts gefunden zu „" + text + "“.", "fehler"); return; }
        status.hidden = true;
        trefferHost.innerHTML = "";
        liste.forEach(function(o){
          var b = document.createElement("button");
          b.type = "button";
          b.innerHTML = escapeHtml(o.name) +
            '<span class="wo">' + escapeHtml([o.admin1, o.country].filter(Boolean).join(", ")) +
            " · " + o.latitude.toFixed(3) + ", " + o.longitude.toFixed(3) + "</span>";
          b.addEventListener("click", function(){
            trefferHost.hidden = true;
            setzeOrt({ name: o.name, lat: o.latitude, lon: o.longitude });
            starten();
          });
          trefferHost.appendChild(b);
        });
        trefferHost.hidden = false;
      } catch (e) {
        melde("Ortssuche fehlgeschlagen: " + (e.message || e), "fehler");
      }
    }

    function hierher(){
      if (!navigator.geolocation) { melde("Dieses Gerät gibt den Standort nicht her.", "fehler"); return; }
      melde("Standort abfragen …");
      navigator.geolocation.getCurrentPosition(
        function(p){
          setzeOrt({ name: "Mein Standort", lat: p.coords.latitude, lon: p.coords.longitude });
          starten();
        },
        function(){ melde("Standort nicht bekommen — der Zugriff wurde abgelehnt oder ist blockiert.", "fehler"); },
        { timeout: 10000, maximumAge: 300000 }
      );
    }

    function setzeOrt(neu){
      ort = neu;
      eingabe.value = neu.name;
      startKnopf.disabled = false;
      try { localStorage.setItem("seewind-ort", JSON.stringify(neu)); } catch (e) {}
    }

    function merkenLaden(){
      try {
        var g = JSON.parse(localStorage.getItem("seewind-ort") || "null");
        if (g && isFinite(g.lat) && isFinite(g.lon)) { ort = g; eingabe.value = g.name || ""; startKnopf.disabled = false; }
        var u = localStorage.getItem("seewind-umkreis");
        if (u) umkreis.value = u;
      } catch (e) {}
    }

    async function starten(){
      if (!ort || laeuft) return;
      laeuft = true;
      startKnopf.disabled = true;
      uebernehmen.hidden = true;
      try {
        var o = Suche.ortAusKonfig({
          ort: ort.name, lat: ort.lat, lon: ort.lon,
          umkreisKm: parseInt(umkreis.value, 10), maxSpots: 6
        });

        melde("Karte laden …");
        var wasserkarte = await Suche.ladeWasserkarte({
          lat: o.lat, lon: o.lon, umkreisKm: o.umkreisKm,
          fortschritt: function(fertig, alle){ melde("Karte laden … " + fertig + " von " + alle + " Kacheln"); }
        });
        if (wasserkarte.fehlendeKacheln.length > alle10Prozent(wasserkarte)) {
          throw new Error("Zu viele Kartenkacheln fehlen — der Kachelserver antwortet gerade nicht. Später nochmal.");
        }

        melde("Ufer vermessen …");
        var punkte = Suche.findeUferpunkte(wasserkarte, o);
        if (!punkte.length) {
          throw new Error(
            "Im Umkreis von " + o.umkreisKm + " km liegt kein Ufer, an dem genug Wasser " +
            "gegen den Wind steht. Grösserer Umkreis, oder hier ist wirklich nichts."
          );
        }
        var spots = Suche.baueSpots(punkte, o);

        melde("Prognose holen für " + spots.length + " Stellen …");
        var reihen = await Kern.holePrognose(spots, K);

        setzeDaten(spots, reihen);
        var zone = spots.map(function(s){ return s.zeitzone; }).filter(Boolean)[0];
        melde(
          spots.length + " Stellen um " + o.name + " gefunden" +
          (zone && zone !== K.zeitzone ? " — Zeiten in Ortszeit (" + zone + ")." : "."),
          "fertig"
        );
        jsonFeld.textContent = jsonBlock(o);
        uebernehmen.hidden = false;
      } catch (e) {
        melde(e.message || String(e), "fehler");
      } finally {
        laeuft = false;
        startKnopf.disabled = false;
      }
    }

    function alle10Prozent(k){
      var kacheln = (k.breite / 256) * (k.hoehe / 256);
      return Math.max(1, Math.round(kacheln * 0.1));
    }

    function jsonBlock(o){
      return '"reise": ' + JSON.stringify({
        aktiv: true,
        ort: o.name,
        lat: Math.round(o.lat * 10000) / 10000,
        lon: Math.round(o.lon * 10000) / 10000,
        umkreisKm: o.umkreisKm,
        minFetchKm: o.minFetchKm,
        maxSpots: o.maxSpots
      }, null, 2);
    }

    function melde(text, art){
      status.className = "reise-status" + (art ? " " + art : "");
      status.textContent = text;
      status.hidden = false;
    }
  })();

  function escapeHtml(s){
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function inZwischenablage(text, knopf, zurueck){
    var fertig = function(){
      knopf.classList.add("ok");
      knopf.textContent = "kopiert";
      setTimeout(function(){ knopf.classList.remove("ok"); knopf.textContent = zurueck; }, 1800);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(fertig, function(){});
      return;
    }
    var t = document.createElement("textarea");
    t.value = text; document.body.appendChild(t); t.select();
    try { document.execCommand("copy"); fertig(); } catch (e) {}
    document.body.removeChild(t);
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
