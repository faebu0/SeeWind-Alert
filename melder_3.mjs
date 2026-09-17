/**
 * Meldekanäle. Ein Kanal baut aus den Fenstern einen Text und verschickt ihn.
 *
 * Verfügbar:
 *   "smtp"     E-Mail über ein bestehendes Postfach - gratis, nichts neu anzulegen
 *   "brevo"    E-Mail über HTTP-API - gratis bis 300 am Tag, braucht eine Domain
 *   "aspsms"   SMS über einen Schweizer Anbieter - kostet pro Nachricht
 *   "twilio"   SMS global - kostet pro Nachricht
 *   "telegram" gratis, braucht die App
 *
 * Der Kanal kommt aus MELDER; ohne diese Variable wird er aus den
 * vorhandenen Zugangsdaten erraten.
 */

import { tagLabel, uhr } from "./lib.mjs";
import { sendeMail } from "./smtp.mjs";

/* ------------------------------------------------------------------ *
 * Kanalwahl
 * ------------------------------------------------------------------ */

export function waehleKanal(env = process.env) {
  const gewuenscht = (env.MELDER || "").trim().toLowerCase();
  if (gewuenscht) return gewuenscht;
  if (env.SMTP_HOST && env.SMTP_BENUTZER) return "smtp";
  if (env.BREVO_API_KEY) return "brevo";
  if (env.ASPSMS_USERKEY && env.ASPSMS_PASSWORT) return "aspsms";
  if (env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN) return "twilio";
  if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) return "telegram";
  return "keiner";
}

/** Kanäle, die eine E-Mail statt einer Kurznachricht verschicken. */
const MAIL_KANAELE = new Set(["smtp", "brevo"]);

/** Fehlt etwas, kommt hier der Grund zurück - sonst null. */
export function pruefeZugang(kanal, env = process.env) {
  const fehlt = (...namen) => namen.filter((n) => !env[n]);
  switch (kanal) {
    case "smtp": {
      const f = fehlt("SMTP_HOST", "SMTP_BENUTZER", "SMTP_PASSWORT", "MAIL_EMPFAENGER");
      return f.length ? `Für SMTP fehlt: ${f.join(", ")}` : null;
    }
    case "brevo": {
      const f = fehlt("BREVO_API_KEY", "MAIL_ABSENDER", "MAIL_EMPFAENGER");
      return f.length ? `Für Brevo fehlt: ${f.join(", ")}` : null;
    }
    case "aspsms": {
      const f = fehlt("ASPSMS_USERKEY", "ASPSMS_PASSWORT", "SMS_EMPFAENGER");
      return f.length ? `Für ASPSMS fehlt: ${f.join(", ")}` : null;
    }
    case "twilio": {
      const f = fehlt("TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "SMS_EMPFAENGER");
      return f.length ? `Für Twilio fehlt: ${f.join(", ")}` : null;
    }
    case "telegram": {
      const f = fehlt("TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID");
      return f.length ? `Für Telegram fehlt: ${f.join(", ")}` : null;
    }
    case "keiner":
      return "Kein Meldekanal konfiguriert";
    default:
      return `Unbekannter Meldekanal "${kanal}"`;
  }
}

/* ------------------------------------------------------------------ *
 * Texte
 * ------------------------------------------------------------------ */

/**
 * SMS: so kurz wie möglich. Eine SMS fasst 160 Zeichen; was darüber
 * hinausginge, wird zu "+N weitere" zusammengefasst statt zu einer
 * zweiten kostenpflichtigen Nachricht.
 */
export function smsText(fenster, maxZeichen = 160) {
  if (!fenster.length) return null;

  const einTag = fenster.every((f) => f.datum === fenster[0].datum);
  const kopf = einTag ? `Wind ${labelVon(fenster[0].datum)}` : "Wind";
  const zeile = (f) =>
    `${einTag ? "" : labelVon(f.datum) + " "}${kurz(f)} ${uhr(f.von)}-${uhr(f.bis)}h ` +
    `${f.wind}kn ${f.richtung}`;

  // Platz ist knapp: nicht die frühesten Fenster nehmen, sondern die besten -
  // ausgegeben wird aber chronologisch, das liest sich leichter.
  const nachRang = [...fenster].sort((a, b) => (a.rang ?? 99) - (b.rang ?? 99));

  for (let n = nachRang.length; n >= 1; n--) {
    const auswahl = nachRang.slice(0, n).sort((a, b) =>
      a.datum === b.datum ? a.von - b.von : a.datum < b.datum ? -1 : 1
    );
    const rest = fenster.length - n;
    const text =
      kopf + "\n" + auswahl.map(zeile).join("\n") + (rest > 0 ? `\n+${rest} weitere` : "");
    if (text.length <= maxZeichen) return text;
  }

  // Selbst eine Zeile passt nicht - dann nur die Zusammenfassung.
  return `${kopf}: ${fenster.length} Fenster, bis ${Math.max(...fenster.map((f) => f.wind))}kn`;
}

/** Telegram darf ausführlicher sein und kennt Formatierung. */
export function telegramText(fenster, dashboardUrl, kalenderUrl = "") {
  if (!fenster.length) return null;

  const bloecke = fenster.map((f) => {
    const t = tagLabel(f.datum);
    return (
      `${medaille(f)}<b>${esc(f.spotName)}</b> · ${esc(f.see)}\n` +
      `${t.kurz} ${t.datum} ${uhr(f.von)}–${uhr(f.bis)} Uhr · ` +
      `${f.wind} kn, Böen ${f.boe} kn, ${f.richtung}` +
      (f.punkte != null ? ` · <b>${f.punkte}</b>/100` : "")
    );
  });

  const kopf = fenster.length === 1 ? "🪁 <b>Windfenster</b>" : `🪁 <b>${fenster.length} Windfenster</b>`;
  const links = [
    dashboardUrl ? `<a href="${esc(dashboardUrl)}">Dashboard</a>` : "",
    kalenderUrl ? `<a href="${esc(kalenderUrl)}">Kalender abonnieren</a>` : "",
  ].filter(Boolean);
  const fuss = links.length ? `\n\n${links.join(" · ")}` : "";
  return `${kopf}\n\n${bloecke.join("\n\n")}${fuss}`;
}

/** E-Mail: Betreff sagt schon alles Wichtige, der Text bringt die Details. */
export function mailInhalt(fenster, dashboardUrl, kalenderUrl = "") {
  if (!fenster.length) return null;

  const erstes = fenster[0];
  const betreff =
    fenster.length === 1
      ? `Wind: ${erstes.spotName}, ${labelVon(erstes.datum)} ${uhr(erstes.von)}–${uhr(erstes.bis)} Uhr, ${erstes.wind} kn`
      : `Wind: ${fenster.length} Fenster ab ${labelVon(erstes.datum)}, bis ${Math.max(...fenster.map((f) => f.wind))} kn`;

  const bloecke = fenster.map((f) => {
    const t = tagLabel(f.datum);
    const rang = f.rang != null && f.rang <= 3 ? `[Platz ${f.rang}] ` : "";
    return (
      `${rang}${f.spotName} · ${f.see}\n` +
      `  ${t.kurz} ${t.datum}, ${uhr(f.von)}–${uhr(f.bis)} Uhr (${f.stunden} h)\n` +
      `  ${f.wind} kn Mittelwind, Böen ${f.boe} kn, Richtung ${f.richtung}\n` +
      `  Modell ${f.modell}` +
      (f.punkte != null
        ? `\n  Bewertung ${f.punkte}/100 (Wind ${f.teile.wind}, Dauer ${f.teile.dauer}, ` +
          `Böen ${f.teile.boeen}, Nähe ${f.teile.naehe})`
        : "")
    );
  });

  const fuss =
    (dashboardUrl ? `\n\nDashboard: ${dashboardUrl}` : "") +
    (kalenderUrl
      ? `\n\nJe Fenster liegt eine Kalenderdatei bei — öffnen, und der Termin steht.\n` +
        `Dauerhaft abonnieren (Outlook holt neue Fenster dann selbst): ${kalenderUrl}`
      : "");
  const text =
    `${fenster.length === 1 ? "Ein Windfenster" : fenster.length + " Windfenster"} in der Prognose:\n\n` +
    bloecke.join("\n\n") +
    fuss +
    `\n\n—\nSeewind, automatisch erzeugt. Kriterien in spots.json.`;

  return { betreff, text };
}

/** Die drei besten bekommen ein Zeichen vorangestellt. */
function medaille(f) {
  if (f.rang === 1) return "🥇 ";
  if (f.rang === 2) return "🥈 ";
  if (f.rang === 3) return "🥉 ";
  return "";
}

function kurz(f) {
  return f.spotKurz || f.spotName.split(" / ")[0].split("-")[0].trim();
}
function labelVon(datum) {
  const t = tagLabel(datum);
  return `${t.kurz} ${t.datum}`;
}
function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/* ------------------------------------------------------------------ *
 * Versand
 * ------------------------------------------------------------------ */

/**
 * Baut den passenden Text und verschickt ihn. Gibt den Text zurück,
 * damit der Aufrufer ihn protokollieren kann.
 */
export async function melde(fenster, optionen = {}) {
  const env = optionen.env || process.env;
  const fetchImpl = optionen.fetchImpl || fetch;
  const kanal = optionen.kanal || waehleKanal(env);
  const trocken = optionen.trocken === true;

  const mail = MAIL_KANAELE.has(kanal)
    ? mailInhalt(fenster, env.DASHBOARD_URL || "", optionen.kalenderUrl || "")
    : null;
  const text = mail
    ? `Betreff: ${mail.betreff}\n\n${mail.text}`
    : kanal === "telegram"
      ? telegramText(fenster, env.DASHBOARD_URL || "", optionen.kalenderUrl || "")
      : smsText(fenster, Number(env.SMS_MAX_ZEICHEN) || 160);

  if (!text) return { kanal, text: null, gesendet: false };
  if (trocken) return { kanal, text, gesendet: false };

  const grund = pruefeZugang(kanal, env);
  if (grund) return { kanal, text, gesendet: false, grund };

  await versende(kanal, text, mail, env, fetchImpl, optionen.dateien || []);
  return { kanal, text, gesendet: true };
}

/**
 * Schickt eine Testmeldung über den eingestellten Kanal. Damit lässt sich
 * die Einrichtung prüfen, ohne auf passenden Wind zu warten.
 */
export async function testMeldung(optionen = {}) {
  const env = optionen.env || process.env;
  const fetchImpl = optionen.fetchImpl || fetch;
  const kanal = optionen.kanal || waehleKanal(env);

  const zeit = new Date().toLocaleString("de-CH", { timeZone: "Europe/Zurich" });
  const mail = MAIL_KANAELE.has(kanal)
    ? {
        betreff: "Seewind: Testmeldung",
        text:
          `Die Einrichtung steht — dieser Kanal funktioniert.\n\n` +
          `Kanal: ${kanal}\nZeitpunkt: ${zeit}\n\n` +
          `Ab jetzt kommt eine Meldung, sobald an einem deiner Spots ein ` +
          `Windfenster in der Prognose auftaucht.\n\n—\nSeewind`,
      }
    : null;

  const text = mail
    ? `Betreff: ${mail.betreff}\n\n${mail.text}`
    : kanal === "telegram"
      ? `🪁 <b>Seewind — Testmeldung</b>\n\nDie Einrichtung steht, dieser Kanal funktioniert.\n${zeit}`
      : `Seewind Test: Kanal steht. ${zeit}`;

  const grund = pruefeZugang(kanal, env);
  if (grund) return { kanal, text, gesendet: false, grund };

  await versende(kanal, text, mail, env, fetchImpl);
  return { kanal, text, gesendet: true };
}

async function versende(kanal, text, mail, env, fetchImpl, dateien = []) {
  // SMS trägt keinen Anhang - dort steht der Link zum Kalender im Dashboard.
  switch (kanal) {
    case "smtp":
      return sendeSmtp(mail, env, dateien);
    case "brevo":
      return sendeBrevo(mail, env, fetchImpl, dateien);
    case "aspsms":
      return sendeAspsms(text, env, fetchImpl);
    case "twilio":
      return sendeTwilio(text, env, fetchImpl);
    case "telegram":
      return sendeTelegram(text, env, fetchImpl, dateien);
    default:
      throw new Error(`Unbekannter Meldekanal "${kanal}"`);
  }
}

/**
 * E-Mail über ein bestehendes Postfach. Kostet nichts extra, weil der
 * Mailserver schon da ist.
 */
async function sendeSmtp(mail, env, dateien = []) {
  await sendeMail({
    host: env.SMTP_HOST,
    port: Number(env.SMTP_PORT) || 587,
    benutzer: env.SMTP_BENUTZER,
    passwort: env.SMTP_PASSWORT,
    von: env.MAIL_ABSENDER || env.SMTP_BENUTZER,
    an: mailEmpfaenger(env),
    betreff: mail.betreff,
    text: mail.text,
    anhaenge: dateien.map((d) => ({
      name: d.dateiname,
      typ: "text/calendar; charset=utf-8",
      inhalt: d.inhalt,
    })),
  });
}

/** E-Mail über die Brevo-HTTP-API. Gratis bis 300 Nachrichten am Tag. */
async function sendeBrevo(mail, env, fetchImpl, dateien = []) {
  const res = await fetchImpl("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": env.BREVO_API_KEY,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      sender: { email: env.MAIL_ABSENDER, name: env.MAIL_ABSENDERNAME || "Seewind" },
      to: mailEmpfaenger(env).map((email) => ({ email })),
      subject: mail.betreff,
      textContent: mail.text,
      ...(dateien.length
        ? {
            attachment: dateien.map((d) => ({
              content: Buffer.from(d.inhalt, "utf8").toString("base64"),
              name: d.dateiname,
            })),
          }
        : {}),
    }),
  });
  if (!res.ok) {
    const fehler = await res.json().catch(() => ({}));
    throw new Error(`Brevo lehnte die E-Mail ab: ${fehler.message || res.status}`);
  }
}

/** ASPSMS, Schweizer Anbieter. Keine Grundgebühr, Credits verfallen nicht. */
async function sendeAspsms(text, env, fetchImpl) {
  const res = await fetchImpl("https://json.aspsms.com/SendSimpleTextSMS", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      UserName: env.ASPSMS_USERKEY,
      Password: env.ASPSMS_PASSWORT,
      Originator: env.SMS_ABSENDER || "Seewind",
      Recipients: empfaenger(env),
      MessageText: text,
    }),
  });
  const antwort = await res.json().catch(() => ({}));
  // ASPSMS meldet Erfolg mit StatusCode "1".
  if (String(antwort.StatusCode) !== "1") {
    throw new Error(
      `ASPSMS lehnte die SMS ab: ${antwort.StatusInfo || antwort.StatusCode || res.status}`
    );
  }
}

/** Twilio, global. Braucht eine Absendernummer oder eine Alphanumeric Sender ID. */
async function sendeTwilio(text, env, fetchImpl) {
  const sid = env.TWILIO_ACCOUNT_SID;
  const auth = Buffer.from(`${sid}:${env.TWILIO_AUTH_TOKEN}`).toString("base64");

  for (const nummer of empfaenger(env)) {
    const res = await fetchImpl(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          To: nummer,
          From: env.SMS_ABSENDER || "Seewind",
          Body: text,
        }).toString(),
      }
    );
    if (!res.ok) {
      const fehler = await res.json().catch(() => ({}));
      throw new Error(`Twilio lehnte die SMS ab: ${fehler.message || res.status}`);
    }
  }
}

/**
 * Telegram. TELEGRAM_CHAT_ID darf mehrere Ziele enthalten, durch Komma
 * getrennt — einzelne Personen, eine Gruppe, oder beides gemischt.
 *
 * Scheitert ein Ziel, laufen die übrigen trotzdem durch: sonst würde ein
 * einziger kaputter Empfänger den ganzen Lauf abbrechen, und beim nächsten
 * Mal bekämen alle anderen dieselbe Meldung ein zweites Mal.
 */
async function sendeTelegram(text, env, fetchImpl, dateien = []) {
  const ziele = liste(env.TELEGRAM_CHAT_ID);
  if (!ziele.length) throw new Error("TELEGRAM_CHAT_ID ist leer.");

  const fehler = [];
  let zugestellt = 0;

  for (const chatId of ziele) {
    try {
      await sendeTelegramAn(chatId, text, env, fetchImpl);
      zugestellt++;
      // Der Kalender kommt als eigene Datei hinterher. Scheitert das, ist die
      // eigentliche Meldung trotzdem draussen - also nur warnen.
      if (dateien.length) {
        try {
          await sendeTelegramDateien(chatId, dateien, env, fetchImpl);
        } catch (e) {
          console.warn(`Kalenderdateien an ${chatId} nicht zugestellt: ${e.message}`);
        }
      }
    } catch (e) {
      fehler.push(`  ${chatId} — ${e.message}`);
    }
  }

  if (!zugestellt) {
    throw new Error(
      `Telegram: kein Empfänger erreicht.\n${fehler.join("\n")}` +
        telegramHinweis(fehler.join(" "))
    );
  }
  if (fehler.length) {
    console.warn(
      `Achtung: ${zugestellt} von ${ziele.length} Empfängern erreicht. Nicht zugestellt:\n` +
        fehler.join("\n")
    );
  }
}

/**
 * Je Fenster eine Kalenderdatei. Bis zu zehn gehen als eine Gruppe raus, damit
 * nicht jede Datei eine eigene Benachrichtigung auslöst; darüber hinaus und
 * falls die Gruppe abgelehnt wird, einzeln.
 */
async function sendeTelegramDateien(chatId, dateien, env, fetchImpl) {
  const bloecke = [];
  for (let i = 0; i < dateien.length; i += 10) bloecke.push(dateien.slice(i, i + 10));

  for (const block of bloecke) {
    if (block.length === 1) {
      await sendeTelegramDatei(chatId, block[0], env, fetchImpl);
      continue;
    }
    try {
      await sendeTelegramGruppe(chatId, block, env, fetchImpl);
    } catch {
      for (const d of block) await sendeTelegramDatei(chatId, d, env, fetchImpl);
    }
  }
}

async function sendeTelegramDatei(chatId, datei, env, fetchImpl) {
  const formular = new FormData();
  formular.append("chat_id", chatId);
  formular.append("caption", "Als Termin eintragen");
  formular.append("document", blobVon(datei), datei.dateiname);
  await telegramFormular("sendDocument", formular, env, fetchImpl);
}

async function sendeTelegramGruppe(chatId, dateien, env, fetchImpl) {
  const formular = new FormData();
  formular.append("chat_id", chatId);
  formular.append(
    "media",
    JSON.stringify(
      dateien.map((d, i) => ({
        type: "document",
        media: `attach://datei${i}`,
        ...(i === 0 ? { caption: "Termine zum Eintragen — je Fenster eine Datei" } : {}),
      }))
    )
  );
  dateien.forEach((d, i) => formular.append(`datei${i}`, blobVon(d), d.dateiname));
  await telegramFormular("sendMediaGroup", formular, env, fetchImpl);
}

function blobVon(datei) {
  return new Blob([datei.inhalt], { type: "text/calendar" });
}

async function telegramFormular(methode, formular, env, fetchImpl) {
  const res = await fetchImpl(
    `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${methode}`,
    { method: "POST", body: formular }
  );
  const antwort = await res.json().catch(() => ({}));
  if (!res.ok || antwort.ok === false) {
    throw new Error(antwort.description || String(res.status));
  }
}

async function sendeTelegramAn(chatId, text, env, fetchImpl) {
  const res = await fetchImpl(
    `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    }
  );
  const antwort = await res.json().catch(() => ({}));
  if (!res.ok || antwort.ok === false) {
    throw new Error(antwort.description || String(res.status));
  }
}

/** Die drei Telegram-Fehler, die bei der Einrichtung praktisch immer auftreten. */
function telegramHinweis(grund) {
  const g = grund.toLowerCase();

  if (g.includes("chat not found")) {
    return (
      "\n\nDer Bot darf diesem Chat nicht schreiben. Ein Bot kann ein Gespräch nie von " +
      "sich aus beginnen.\n" +
      "  Einzelperson: sie muss dem Bot in Telegram selbst schreiben (START antippen).\n" +
      "  Gruppe: der Bot muss Mitglied der Gruppe sein, und die Gruppen-ID ist negativ " +
      "(z.B. -1001234567890).\n" +
      "  Danach im Browser öffnen: https://api.telegram.org/bot<DEIN_TOKEN>/getUpdates\n" +
      '  Dort steht "chat":{"id":…} — genau diese Zahl gehört in TELEGRAM_CHAT_ID.\n' +
      "Bleibt getUpdates leer, wurde dem falschen Bot geschrieben."
    );
  }
  if (g.includes("not enough rights") || g.includes("bot was kicked") || g.includes("bot is not a member")) {
    return (
      "\n\nDer Bot ist nicht (mehr) in der Gruppe oder darf dort nicht schreiben. " +
      "Gruppe öffnen, Bot als Mitglied hinzufügen und sicherstellen, dass Senden erlaubt ist."
    );
  }
  if (g.includes("unauthorized")) {
    return (
      "\n\nDer Token stimmt nicht. Er sieht aus wie 1234567890:AA… und steht in der " +
      "Nachricht von BotFather; bei Bedarf dort mit /token einen neuen holen."
    );
  }
  if (g.includes("can't parse entities") || g.includes("cant parse entities")) {
    return "\n\nEin Spotname enthält ein Zeichen, das Telegram als Formatierung liest.";
  }
  return "";
}

/** Mehrere Nummern durch Komma getrennt möglich. */
function empfaenger(env) {
  return liste(env.SMS_EMPFAENGER);
}

/** Mehrere Adressen durch Komma getrennt möglich. */
function mailEmpfaenger(env) {
  return liste(env.MAIL_EMPFAENGER);
}

function liste(wert) {
  return String(wert || "")
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean);
}
