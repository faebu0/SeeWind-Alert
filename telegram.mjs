#!/usr/bin/env node
/**
 * Die Knöpfe in Telegram.
 *
 *   node telegram.mjs           Befehle abholen und ausführen
 *   node telegram.mjs --dry     nur zeigen, was passieren würde
 *
 * Telegram-Bots können auf zwei Arten Nachrichten empfangen: über einen
 * Webhook, für den es einen erreichbaren Server bräuchte, oder indem man
 * nachfragt. Hier wird nachgefragt — ein Aufruf alle paar Minuten aus dem
 * Workflow, mehr braucht es nicht. Das kostet die Antwortzeit: ein Tastendruck
 * wirkt nicht in der Sekunde, sondern beim nächsten Nachsehen.
 *
 * Wer etwas ändern darf, steht in TELEGRAM_CHAT_ID. Nachrichten aus anderen
 * Chats werden gelesen und weggeworfen, ohne Antwort — ein Bot-Name ist
 * schnell erraten, und wer ihn findet, soll nicht in fremden Einstellungen
 * herumschalten. Steht dort eine Gruppen-Id, darf jeder in dieser Gruppe
 * schalten; das ist gewollt, aber man sollte es wissen.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync, appendFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { telegramApi, telegramEmpfaenger } from "./melder.mjs";
import {
  leseListe, ergaenze, schalte, entferne, entpackeOrt,
} from "./orte.mjs";

const WURZEL = dirname(fileURLToPath(import.meta.url));
const ORTE = join(WURZEL, "reiseorte.json");
const STAND = join(WURZEL, "state", "telegram.json");

const trocken = process.argv.includes("--dry");

// Nur ausführen, wenn die Datei direkt gestartet wurde — sonst würde ein Test,
// der etwas aus ihr holt, unbeabsichtigt einen ganzen Lauf auslösen.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error("Telegram-Lauf fehlgeschlagen:", err.message);
    process.exit(1);
  });
}

export async function main() {
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    console.log("Kein TELEGRAM_BOT_TOKEN — nichts zu tun.");
    return ausgabe(false);
  }

  const erlaubt = new Set(telegramEmpfaenger());
  if (!erlaubt.size) {
    console.log("Keine TELEGRAM_CHAT_ID hinterlegt — niemand darf etwas ändern.");
    return ausgabe(false);
  }

  const stand = await ladeJson(STAND) || {};
  const updates = await telegramApi("getUpdates", {
    offset: stand.offset || 0,
    timeout: 0,
    limit: 50,
    allowed_updates: ["message", "callback_query"],
  });

  if (!updates.length) {
    console.log("Keine neuen Nachrichten.");
    return ausgabe(false);
  }
  console.log(`${updates.length} Nachricht${updates.length === 1 ? "" : "en"} abgeholt.`);

  let liste = leseListe(await ladeJson(ORTE));
  const vorher = JSON.stringify(liste.orte);
  let letzte = stand.offset || 0;

  for (const update of updates) {
    letzte = Math.max(letzte, update.update_id + 1);
    try {
      liste = await einUpdate(update, liste, erlaubt);
    } catch (err) {
      // Eine einzelne Nachricht darf den Rest nicht blockieren — sonst bliebe
      // sie liegen und käme beim nächsten Lauf wieder, endlos.
      console.warn(`Update ${update.update_id} übersprungen: ${err.message}`);
    }
  }

  const geaendert = JSON.stringify(liste.orte) !== vorher;
  if (geaendert && !trocken) await speichereJson(ORTE, liste);
  if (!trocken) await speichereJson(STAND, { offset: letzte, stand: new Date().toISOString() });

  console.log(geaendert ? "Orteliste geändert." : "Orteliste unverändert.");
  return ausgabe(geaendert);
}

/* ------------------------------------------------------------------ *
 * Ein einzelnes Update
 * ------------------------------------------------------------------ */

async function einUpdate(update, liste, erlaubt) {
  if (update.callback_query) return await einKnopf(update.callback_query, liste, erlaubt);
  if (update.message?.text) return await einBefehl(update.message, liste, erlaubt);
  return liste;
}

async function einBefehl(nachricht, liste, erlaubt) {
  const chatId = String(nachricht.chat?.id ?? "");
  if (!erlaubt.has(chatId)) {
    console.log(`Nachricht aus unbekanntem Chat ${chatId} verworfen.`);
    return liste;
  }

  // "/orte@meinbot" ist dasselbe wie "/orte" — in Gruppen hängt Telegram den
  // Botnamen an.
  const text = nachricht.text.trim();
  const [rohBefehl, ...rest] = text.split(/\s+/);
  const befehl = rohBefehl.toLowerCase().split("@")[0];
  const nutzlast = rest.join(" ");

  if (befehl === "/start" && nutzlast) {
    const ort = entpackeOrt(nutzlast);
    if (!ort) {
      await sende(chatId, "Den Ort konnte ich aus dem Link nicht lesen. Im Dashboard nochmal auf „An Telegram senden“ tippen.");
      return liste;
    }
    let neueListe;
    try {
      neueListe = ergaenze(liste, ort).liste;
    } catch (err) {
      await sende(chatId, escape(err.message));
      return liste;
    }
    await sendeListe(chatId, neueListe, `<b>${escape(ort.ort)}</b> ist übernommen.`);
    return neueListe;
  }

  if (befehl === "/orte" || befehl === "/start") {
    await sendeListe(chatId, liste);
    return liste;
  }

  if (befehl === "/hilfe" || befehl === "/help") {
    await sende(chatId, hilfetext());
    return liste;
  }

  if (befehl.startsWith("/")) {
    await sende(chatId, "Kenne ich nicht. /orte zeigt die Reiseorte, /hilfe erklärt den Rest.");
  }
  return liste;
}

async function einKnopf(anfrage, liste, erlaubt) {
  const chatId = String(anfrage.message?.chat?.id ?? "");
  const daten = String(anfrage.data || "");

  if (!erlaubt.has(chatId)) {
    await quittiere(anfrage.id, "Nicht berechtigt.");
    return liste;
  }

  const trenner = daten.indexOf(":");
  const was = trenner < 0 ? daten : daten.slice(0, trenner);
  const id = trenner < 0 ? "" : daten.slice(trenner + 1);

  let neueListe = liste;
  let ton = "";
  let frage = null;

  if (was === "an" || was === "aus") {
    const r = schalte(liste, id, was === "an");
    if (!r.ort) {
      await quittiere(anfrage.id, "Den Ort gibt es nicht mehr.");
      return liste;
    }
    neueListe = r.liste;
    ton = `${r.ort.ort} ist ${was === "an" ? "wieder scharf" : "aus"}.`;
  } else if (was === "weg") {
    // Löschen mit einem Fingertipp wäre zu leicht daneben getroffen.
    const ort = liste.orte.find((o) => o.id === id);
    if (!ort) {
      await quittiere(anfrage.id, "Den Ort gibt es nicht mehr.");
      return liste;
    }
    frage = ort;
    ton = "Wirklich?";
  } else if (was === "weg2") {
    const r = entferne(liste, id);
    if (!r.ort) {
      await quittiere(anfrage.id, "Den Ort gibt es nicht mehr.");
      return liste;
    }
    neueListe = r.liste;
    ton = `${r.ort.ort} ist aus der Liste.`;
  } else if (was === "liste" || was === "zurueck") {
    ton = "";
  } else {
    await quittiere(anfrage.id, "Unbekannter Knopf.");
    return liste;
  }

  await quittiere(anfrage.id, ton);
  await zeichneNeu(anfrage, neueListe, frage);
  return neueListe;
}

/* ------------------------------------------------------------------ *
 * Darstellung
 * ------------------------------------------------------------------ */

function listenText(liste, kopf = "") {
  const zeilen = [kopf || "<b>Reiseorte</b>"];
  if (!liste.orte.length) {
    zeilen.push(
      "",
      "Noch keiner scharf. Im Dashboard unter <i>Reisemodus</i> einen Ort suchen " +
        "und auf <i>Übernehmen</i> tippen — dann steht er hier."
    );
  } else {
    zeilen.push("");
    for (const o of liste.orte) {
      zeilen.push(
        `${o.aktiv ? "▶" : "▫"} <b>${escape(o.ort)}</b> · ${o.umkreisKm} km` +
          (o.aktiv ? "" : " · aus")
      );
    }
    zeilen.push("", "<i>Scharfe Orte werden bei jedem Lauf mitgemeldet.</i>");
  }
  return zeilen.join("\n");
}

function tastatur(liste) {
  const reihen = liste.orte.map((o) => [
    {
      text: `${o.ort} ${o.aktiv ? "ausschalten" : "einschalten"}`,
      callback_data: `${o.aktiv ? "aus" : "an"}:${o.id}`,
    },
    { text: "entfernen", callback_data: `weg:${o.id}` },
  ]);
  reihen.push([{ text: "aktualisieren", callback_data: "liste" }]);
  return { inline_keyboard: reihen };
}

/** Sicherheitsfrage vor dem Entfernen. */
function frageTastatur(ort) {
  return {
    inline_keyboard: [
      [{ text: `Ja, ${ort.ort} entfernen`, callback_data: `weg2:${ort.id}` }],
      [{ text: "Nein, zurück", callback_data: "zurueck" }],
    ],
  };
}

async function sendeListe(chatId, liste, kopf = "") {
  await telegramApi("sendMessage", {
    chat_id: chatId,
    text: listenText(liste, kopf),
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: tastatur(liste),
  });
}

/**
 * Die bestehende Nachricht umschreiben statt eine neue zu schicken: so bleibt
 * es eine Liste im Chat, die sich ändert, statt eines Stapels alter Listen.
 */
async function zeichneNeu(anfrage, liste, frage) {
  const nutzlast = {
    chat_id: anfrage.message.chat.id,
    message_id: anfrage.message.message_id,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    text: frage
      ? `<b>${escape(frage.ort)}</b> ganz aus der Liste nehmen?\n\n` +
        `<i>Ausschalten genügt, wenn du später wieder hinwillst.</i>`
      : listenText(liste),
    reply_markup: frage ? frageTastatur(frage) : tastatur(liste),
  };
  try {
    await telegramApi("editMessageText", nutzlast);
  } catch (err) {
    // "message is not modified" ist keine Störung, nur ein doppelter Tipp.
    if (!/not modified/i.test(err.message)) throw err;
  }
}

async function quittiere(id, text) {
  try {
    await telegramApi("answerCallbackQuery", { callback_query_id: id, text: text || "" });
  } catch (err) {
    // Eine abgelaufene Anfrage lässt sich nicht mehr quittieren — egal.
    console.warn(`Quittung nicht zugestellt: ${err.message}`);
  }
}

async function sende(chatId, text) {
  await telegramApi("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
  });
}

function hilfetext() {
  return [
    "<b>Seewind</b>",
    "",
    "/orte — die Reiseorte mit Knöpfen zum Ein- und Ausschalten",
    "/hilfe — dieser Text",
    "",
    "Einen neuen Ort übernimmst du im Dashboard: <i>Reisemodus</i>, Ort suchen, " +
      "dann <i>An Telegram senden</i> — der Link bringt ihn hierher.",
    "",
    "<i>Knöpfe wirken nicht sofort: der Bot sieht alle paar Minuten nach.</i>",
  ].join("\n");
}

function escape(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/* ------------------------------------------------------------------ *
 * Dateien und Ausgabe an den Workflow
 * ------------------------------------------------------------------ */

async function ladeJson(pfad) {
  if (!existsSync(pfad)) return null;
  try {
    return JSON.parse(await readFile(pfad, "utf8"));
  } catch (err) {
    console.warn(`${pfad} ist nicht lesbar (${err.message}) — wird übergangen.`);
    return null;
  }
}

async function speichereJson(pfad, daten) {
  await mkdir(dirname(pfad), { recursive: true });
  await writeFile(pfad, JSON.stringify(daten, null, 1) + "\n");
}

/** Sagt dem Workflow, ob danach neu gerechnet werden muss. */
function ausgabe(geaendert) {
  console.log(`geaendert=${geaendert}`);
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `geaendert=${geaendert}\n`);
  }
}

export { listenText, tastatur };
