/**
 * Prüft den Telegram-Ablauf gegen einen nachgebauten Bot-Server.
 * Keine echte Nachricht verlässt den Rechner.
 */
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { readFile, writeFile, mkdir, rm, cp } from "node:fs/promises";

import { dirname, join as pfad } from "node:path";
import { fileURLToPath } from "node:url";
const QUELLE = dirname(fileURLToPath(import.meta.url));
const ARBEIT = pfad(QUELLE, "state", "test-telegram");
const CHAT = "111111111";
const FREMD = "999999999";

const pruef = [];
const sag = (n, b, z = "") => {
  pruef.push((b ? "ok  " : "FEHL") + "  " + n + (z ? " — " + z : ""));
  return b;
};

/* ---------- Nachgebauter Bot-Server ---------- */

let warteschlange = [];
let gesendet = [];
let naechsteId = 1;

const server = createServer((req, res) => {
  let roh = "";
  req.on("data", (c) => (roh += c));
  req.on("end", () => {
    const methode = req.url.split("/").pop();
    const koerper = roh ? JSON.parse(roh) : {};
    let ergebnis = true;

    if (methode === "getUpdates") {
      const ab = koerper.offset || 0;
      ergebnis = warteschlange.filter((u) => u.update_id >= ab);
    } else {
      gesendet.push({ methode, ...koerper });
      if (methode === "sendMessage" || methode === "editMessageText") {
        ergebnis = { message_id: naechsteId++, chat: { id: koerper.chat_id } };
      }
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, result: ergebnis }));
  });
});

await new Promise((r) => server.listen(0, "127.0.0.1", r));
const BASIS = `http://127.0.0.1:${server.address().port}`;

/* ---------- Testlauf ---------- */

async function lauf() {
  gesendet = [];
  return await new Promise((fertig) => {
    const kind = spawn("node", ["telegram.mjs"], {
      cwd: ARBEIT,
      env: {
        ...process.env,
        TELEGRAM_API_BASE: BASIS,
        TELEGRAM_BOT_TOKEN: "test:token",
        TELEGRAM_CHAT_ID: CHAT,
      },
    });
    let aus = "";
    kind.stdout.on("data", (d) => (aus += d));
    kind.stderr.on("data", (d) => (aus += d));
    kind.on("close", (code) => fertig({ code, aus }));
  });
}

async function orte() {
  return JSON.parse(await readFile(pfad(ARBEIT, "reiseorte.json"), "utf8")).orte;
}

function nachricht(id, chat, text) {
  return { update_id: id, message: { message_id: id, chat: { id: Number(chat) }, text } };
}
function knopf(id, chat, daten) {
  return {
    update_id: id,
    callback_query: {
      id: "cb" + id,
      data: daten,
      message: { message_id: 500, chat: { id: Number(chat) } },
    },
  };
}

await rm(ARBEIT, { recursive: true, force: true });
await mkdir(ARBEIT, { recursive: true });
for (const f of ["telegram.mjs", "melder.mjs", "orte.mjs", "lib.mjs", "smtp.mjs", "reiseorte.json"]) {
  await cp(pfad(QUELLE, f), pfad(ARBEIT, f));
}
await mkdir(pfad(ARBEIT, "state"), { recursive: true });

// 1 — Ort über den Link übernehmen
const { packeOrt } = await import(pfad(QUELLE, "orte.mjs"));
const nutzlast = packeOrt({ ort: "Tarifa", lat: 36.0139, lon: -5.6069, umkreisKm: 25 });
warteschlange = [nachricht(1, CHAT, `/start ${nutzlast}`)];
let r = await lauf();
let o = await orte();
sag("Link übernimmt den Ort", o.length === 1 && o[0].ort === "Tarifa" && o[0].aktiv, o.map((x) => x.ort).join(","));
sag("Bestätigung mit Tastatur geschickt",
  gesendet.some((g) => g.methode === "sendMessage" && /übernommen/.test(g.text) && g.reply_markup?.inline_keyboard?.length >= 2));
sag("Lauf meldet Änderung", /geaendert=true/.test(r.aus));

// 2 — /orte zeigt die Liste
warteschlange = [nachricht(2, CHAT, "/orte")];
await lauf();
const liste = gesendet.find((g) => g.methode === "sendMessage");
sag("Liste zeigt den Ort", liste && /Tarifa/.test(liste.text));
sag("Liste hat einen Ausschalt-Knopf",
  liste?.reply_markup.inline_keyboard[0][0].text === "Tarifa ausschalten");
sag("Liste hat einen Entfernen-Knopf", liste?.reply_markup.inline_keyboard[0][1].text === "entfernen");

// 3 — Ausschalten
const id = (await orte())[0].id;
warteschlange = [knopf(3, CHAT, `aus:${id}`)];
r = await lauf();
o = await orte();
sag("Ausgeschaltet", o[0].aktiv === false);
sag("Bestehende Nachricht umgeschrieben statt neue geschickt",
  gesendet.some((g) => g.methode === "editMessageText") && !gesendet.some((g) => g.methode === "sendMessage"));
sag("Quittung mit Text", gesendet.some((g) => g.methode === "answerCallbackQuery" && /aus\./.test(g.text)));
const nachAus = gesendet.find((g) => g.methode === "editMessageText");
sag("Knopf heisst jetzt einschalten", nachAus?.reply_markup.inline_keyboard[0][0].text === "Tarifa einschalten");

// 4 — Wieder an
warteschlange = [knopf(4, CHAT, `an:${id}`)];
await lauf();
sag("Wieder scharf", (await orte())[0].aktiv === true);

// 5 — Entfernen fragt nach
warteschlange = [knopf(5, CHAT, `weg:${id}`)];
await lauf();
o = await orte();
const frage = gesendet.find((g) => g.methode === "editMessageText");
sag("Entfernen fragt erst nach", o.length === 1 && /ganz aus der Liste/.test(frage?.text || ""));
sag("Sicherheitsfrage hat Ja und Nein", frage?.reply_markup.inline_keyboard.length === 2);

// 6 — Bestätigt entfernen
warteschlange = [knopf(6, CHAT, `weg2:${id}`)];
r = await lauf();
sag("Nach Bestätigung entfernt", (await orte()).length === 0);
sag("Lauf meldet Änderung", /geaendert=true/.test(r.aus));

// 7 — Fremder Chat darf nichts
warteschlange = [nachricht(7, FREMD, "/orte"), nachricht(8, FREMD, `/start ${nutzlast}`)];
r = await lauf();
sag("Fremder Chat bekommt keine Antwort", gesendet.every((g) => g.methode === "getUpdates"),
  gesendet.map((g) => g.methode).join(","));
sag("Fremder Chat ändert nichts", (await orte()).length === 0);

// 8 — Fremder Knopfdruck
await writeFile(pfad(ARBEIT, "reiseorte.json"),
  JSON.stringify({ orte: [{ id: "x-1-1", ort: "Test", lat: 47, lon: 7, umkreisKm: 20, aktiv: true }] }));
warteschlange = [knopf(9, FREMD, "aus:x-1-1")];
await lauf();
o = await orte();
sag("Fremder Knopfdruck ändert nichts", o[0].aktiv === true);
sag("Fremder Knopfdruck bekommt eine Absage",
  gesendet.some((g) => g.methode === "answerCallbackQuery" && /Nicht berechtigt/.test(g.text)));

// 9 — Nichts Neues
warteschlange = [];
r = await lauf();
sag("Leerer Durchgang meldet keine Änderung", /geaendert=false/.test(r.aus) && /Keine neuen/.test(r.aus));

// 10 — Merker verhindert Doppelverarbeitung
warteschlange = [nachricht(20, CHAT, `/start ${nutzlast}`)];
await lauf();
const nachher = (await orte()).length;
await lauf();   // dieselbe Warteschlange, aber der Merker steht weiter
sag("Verarbeitete Nachricht kommt nicht zweimal", (await orte()).length === nachher,
  `${nachher} Orte`);

// 11 — Unsinniger Knopf
warteschlange = [knopf(30, CHAT, "quatsch:xyz")];
await lauf();
sag("Unbekannter Knopf wird abgewiesen",
  gesendet.some((g) => g.methode === "answerCallbackQuery" && /Unbekannter/.test(g.text)));

// 12 — Kaputte Nutzlast
warteschlange = [nachricht(40, CHAT, "/start !!!kaputt!!!")];
await lauf();
sag("Kaputter Link wird erklärt",
  gesendet.some((g) => g.methode === "sendMessage" && /nicht lesen/.test(g.text)));

console.log(pruef.join("\n"));
console.log(pruef.some((z) => z.startsWith("FEHL")) ? "\nEs gibt Fehler." : "\nAlles grün.");
server.close();
await rm(ARBEIT, { recursive: true, force: true });
process.exit(pruef.some((z) => z.startsWith("FEHL")) ? 1 : 0);
