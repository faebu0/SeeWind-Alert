/**
 * Minimaler SMTP-Client — genug für "eine kurze Textmail verschicken".
 *
 * Bewusst selbst geschrieben statt nodemailer: das Projekt bleibt ohne
 * Abhängigkeiten, der Workflow braucht keinen Installationsschritt, und
 * es gibt nichts, was still veraltet.
 *
 * Kann: STARTTLS auf Port 587, direktes TLS auf Port 465, AUTH LOGIN und
 * AUTH PLAIN, UTF-8 in Betreff und Text, Anhänge. Kann nicht: HTML,
 * OAuth, mehrere Mails pro Verbindung.
 */

import net from "node:net";
import tls from "node:tls";

/**
 * @param {object} o
 * @param {string} o.host      Mailserver
 * @param {number} [o.port]    587 (STARTTLS) oder 465 (TLS), Standard 587
 * @param {string} o.benutzer  Anmeldename
 * @param {string} o.passwort
 * @param {string} o.von       Absender, "Name <adresse>" erlaubt
 * @param {string[]} o.an      Empfängeradressen
 * @param {string} o.betreff
 * @param {string} o.text
 * @param {Array<{name:string,typ:string,inhalt:string}>} [o.anhaenge]
 * @param {number} [o.timeoutMs] Standard 20000
 */
export async function sendeMail(o) {
  const port = o.port || 587;
  const timeoutMs = o.timeoutMs || 20000;
  const direktTls = port === 465;

  let sitzung = await verbinde({ host: o.host, port, tls: direktTls, timeoutMs });

  try {
    await sitzung.erwarte(220);
    let faehig = await ehlo(sitzung, o.host);

    if (!direktTls) {
      if (!faehig.has("STARTTLS")) {
        throw new Error(
          `${o.host} bietet auf Port ${port} kein STARTTLS an. Unverschlüsselt wird nicht angemeldet.`
        );
      }
      await sitzung.befehl("STARTTLS", 220);
      sitzung = await hochstufen(sitzung, o.host, timeoutMs);
      faehig = await ehlo(sitzung, o.host);
    }

    await anmelden(sitzung, faehig, o.benutzer, o.passwort, o.host);

    await sitzung.befehl(`MAIL FROM:<${adresse(o.von)}>`, 250);
    for (const empf of o.an) {
      await sitzung.befehl(`RCPT TO:<${adresse(empf)}>`, 250);
    }
    await sitzung.befehl("DATA", 354);
    await sitzung.befehl(baueNachricht(o) + "\r\n.", 250);
    await sitzung.befehl("QUIT", 221).catch(() => {});
  } finally {
    sitzung.schliessen();
  }
}

/* ------------------------------------------------------------------ *
 * Verbindung
 * ------------------------------------------------------------------ */

function verbinde({ host, port, tls: mitTls, timeoutMs }) {
  return new Promise((erfuellen, ablehnen) => {
    const socket = mitTls
      ? tls.connect({ host, port, servername: host })
      : net.connect({ host, port });

    socket.setTimeout(timeoutMs);
    socket.once("timeout", () => {
      socket.destroy();
      ablehnen(new Error(`Zeitüberschreitung bei ${host}:${port}`));
    });
    socket.once("error", ablehnen);
    socket.once(mitTls ? "secureConnect" : "connect", () => {
      socket.removeListener("error", ablehnen);
      erfuellen(sitzungAus(socket, timeoutMs));
    });
  });
}

/** Klartext-Socket nach STARTTLS auf TLS umstellen. */
function hochstufen(alt, host, timeoutMs) {
  return new Promise((erfuellen, ablehnen) => {
    const socket = tls.connect({ socket: alt.socket, servername: host });
    socket.setTimeout(timeoutMs);
    socket.once("error", ablehnen);
    socket.once("secureConnect", () => {
      socket.removeListener("error", ablehnen);
      erfuellen(sitzungAus(socket, timeoutMs));
    });
  });
}

/**
 * Bündelt Lesen und Schreiben. Antworten kommen zeilenweise; eine
 * mehrzeilige Antwort erkennt man am Bindestrich nach dem Code
 * ("250-STARTTLS" gegenüber "250 OK" als letzter Zeile).
 */
function sitzungAus(socket, timeoutMs) {
  let puffer = "";
  let warteAuf = null;

  socket.setEncoding("utf8");
  socket.on("data", (stueck) => {
    puffer += stueck;
    pruefe();
  });
  socket.on("error", (e) => warteAuf && warteAuf.ablehnen(e));
  socket.on("close", () => {
    if (warteAuf) warteAuf.ablehnen(new Error("Verbindung vom Server geschlossen"));
  });

  function pruefe() {
    if (!warteAuf) return;
    const zeilen = puffer.split("\r\n");
    for (let i = 0; i < zeilen.length; i++) {
      const z = zeilen[i];
      if (/^\d{3} /.test(z)) {
        const antwort = zeilen.slice(0, i + 1);
        puffer = zeilen.slice(i + 1).join("\r\n");
        const w = warteAuf;
        warteAuf = null;
        w.erfuellen({ code: Number(z.slice(0, 3)), zeilen: antwort });
        return;
      }
    }
  }

  function lies() {
    return new Promise((erfuellen, ablehnen) => {
      warteAuf = { erfuellen, ablehnen };
      const uhr = setTimeout(() => {
        if (warteAuf) {
          warteAuf = null;
          ablehnen(new Error("Zeitüberschreitung beim Warten auf die Serverantwort"));
        }
      }, timeoutMs);
      const fertig = () => clearTimeout(uhr);
      const w = warteAuf;
      w.erfuellen = (v) => { fertig(); erfuellen(v); };
      w.ablehnen = (e) => { fertig(); ablehnen(e); };
      pruefe();
    });
  }

  return {
    socket,
    async erwarte(code) {
      const a = await lies();
      if (a.code !== code) throw new Error(`Erwartet ${code}, erhalten: ${a.zeilen.join(" | ")}`);
      return a;
    },
    /**
     * `geheim` markiert Befehle, deren Inhalt Anmeldedaten trägt (die
     * base64-Zeilen von AUTH). Deren Text darf niemals in einer
     * Fehlermeldung landen - die wandert ins Log.
     */
    async befehl(text, erwarteterCode, { geheim = false, name = "" } = {}) {
      socket.write(text + "\r\n");
      const a = await lies();
      if (erwarteterCode && a.code !== erwarteterCode) {
        const bezeichnung = geheim
          ? name || "Anmeldung"
          : `"${(text.length > 60 ? text.slice(0, 60) + "…" : text).split("\r\n")[0]}"`;
        const fehler = new Error(`${bezeichnung} scheiterte: ${a.zeilen.join(" | ")}`);
        fehler.smtpCode = a.code;
        throw fehler;
      }
      return a;
    },
    schliessen() {
      try { socket.destroy(); } catch {}
    },
  };
}

async function ehlo(sitzung, host) {
  const a = await sitzung.befehl(`EHLO ${host}`, 250);
  const faehig = new Set();
  for (const z of a.zeilen.slice(1)) {
    const wert = z.slice(4).trim().toUpperCase();
    faehig.add(wert.split(" ")[0]);
    if (wert.startsWith("AUTH")) {
      wert.split(/[ =]/).slice(1).forEach((m) => m && faehig.add("AUTH " + m));
    }
  }
  return faehig;
}

async function anmelden(sitzung, faehig, benutzer, passwort, host) {
  const b64 = (s) => Buffer.from(s, "utf8").toString("base64");
  const geheim = { geheim: true, name: "Die Anmeldung" };

  try {
    if (faehig.has("AUTH LOGIN")) {
      await sitzung.befehl("AUTH LOGIN", 334);
      await sitzung.befehl(b64(benutzer), 334, geheim);
      await sitzung.befehl(b64(passwort), 235, geheim);
      return;
    }
    if (faehig.has("AUTH PLAIN")) {
      await sitzung.befehl(`AUTH PLAIN ${b64("\0" + benutzer + "\0" + passwort)}`, 235, geheim);
      return;
    }
  } catch (e) {
    throw new Error(e.message + hinweisZu(e.smtpCode, host));
  }
  throw new Error(
    "Der Server bietet weder AUTH LOGIN noch AUTH PLAIN an." + hinweisZu(535, host)
  );
}

/** Aus dem Fehlercode und dem Server einen brauchbaren nächsten Schritt ableiten. */
function hinweisZu(code, host = "") {
  if (code !== 535 && code !== 530) return "";
  const microsoft = /outlook\.com|office365\.com|protection\.outlook|prod\.outlook/i.test(host);

  if (microsoft) {
    return (
      "\n\nDas ist Microsoft 365. Dort ist die SMTP-Anmeldung pro Postfach ab Werk " +
      "gesperrt — das Passwort ist mit hoher Wahrscheinlichkeit richtig. Die IT muss sie " +
      "für dieses eine Postfach freigeben:\n" +
      "  Set-CASMailbox -Identity <postfach> -SmtpClientAuthenticationDisabled $false\n" +
      "und, falls mandantenweit gesperrt:\n" +
      "  Set-TransportConfig -SmtpClientAuthenticationDisabled $false\n" +
      "Hinweis: Microsoft schaltet diesen Anmeldeweg voraussichtlich 2027 endgültig ab. " +
      "Für etwas, das jahrelang laufen soll, ist ein anderer Meldekanal die haltbarere Wahl " +
      "(MELDER=brevo, telegram oder aspsms)."
    );
  }
  return (
    "\n\nPrüfe Benutzername und Passwort. Bei Gmail braucht es " +
    "Zwei-Faktor-Anmeldung und ein App-Passwort, nicht das Kontopasswort. " +
    "Viele Server verlangen ausserdem die vollständige Mailadresse als Benutzernamen."
  );
}

/* ------------------------------------------------------------------ *
 * Nachricht
 * ------------------------------------------------------------------ */

function baueNachricht({ von, an, betreff, text, anhaenge = [] }) {
  const gemeinsam = [
    `From: ${von}`,
    `To: ${an.join(", ")}`,
    `Subject: ${betreffKodieren(betreff)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${Date.now()}.${Math.random().toString(36).slice(2)}@seewind>`,
    "MIME-Version: 1.0",
    "Auto-Submitted: auto-generated",
  ];

  if (!anhaenge.length) {
    const kopf = gemeinsam
      .concat(['Content-Type: text/plain; charset="utf-8"', "Content-Transfer-Encoding: base64"])
      .join("\r\n");
    return `${kopf}\r\n\r\n${base64Block(text)}`;
  }

  // Mit Anhang: multipart/mixed aus Textteil und Datei.
  const grenze = `seewind_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
  const kopf = gemeinsam
    .concat([`Content-Type: multipart/mixed; boundary="${grenze}"`])
    .join("\r\n");

  const teile = [
    `--${grenze}`,
    'Content-Type: text/plain; charset="utf-8"',
    "Content-Transfer-Encoding: base64",
    "",
    base64Block(text),
  ];
  for (const a of anhaenge) {
    teile.push(
      `--${grenze}`,
      `Content-Type: ${a.typ}; name="${a.name}"`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${a.name}"`,
      "",
      base64Block(a.inhalt)
    );
  }
  teile.push(`--${grenze}--`);

  return `${kopf}\r\n\r\n${teile.join("\r\n")}`;
}

/** Base64 mit den von der Norm verlangten 76 Zeichen je Zeile. */
function base64Block(s) {
  const roh = Buffer.from(String(s).replace(/\r?\n/g, "\r\n"), "utf8").toString("base64");
  return roh.match(/.{1,76}/g)?.join("\r\n") ?? "";
}

/** Umlaute im Betreff nach RFC 2047, sonst kommt Buchstabensalat an. */
function betreffKodieren(s) {
  // eslint-disable-next-line no-control-regex
  if (!/[^\x00-\x7F]/.test(s)) return s;
  return `=?UTF-8?B?${Buffer.from(s, "utf8").toString("base64")}?=`;
}

/** "Name <adresse@example.ch>" auf die blanke Adresse reduzieren. */
function adresse(wert) {
  const treffer = String(wert).match(/<([^>]+)>/);
  return (treffer ? treffer[1] : String(wert)).trim();
}
