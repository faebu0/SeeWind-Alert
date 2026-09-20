# Seewind — Windalarm fürs Wingfoilen

Prüft zweimal täglich die Windprognose für neun Spots an Thuner-, Brienzer-, Bieler-,
Neuenburger- und Murtensee, meldet neue fahrbare Zeitfenster per **E-Mail, SMS oder
Telegram**, aktualisiert ein Dashboard und führt einen **Kalender, den Outlook
abonnieren kann**.

Läuft vollständig auf GitHub Actions. Kein Server, keine Kosten, keine laufende
Software auf deinem Rechner.

Auf Reisen sucht es sich die Spots selbst: Ort eingeben, Umkreis wählen, und ein
Knopf schaltet sie für die Meldung scharf — über den Bot, ohne weitere Zugänge.

**Datenquelle:** MeteoSchweiz ICON-CH1 (1 km Gitter, rund 33 Stunden voraus) und
ICON-CH2 (2 km, bis vier Tage) über [Open-Meteo](https://open-meteo.com/) — ohne
Schlüssel, ohne Registrierung. Ausserhalb der Schweiz das jeweils beste
verfügbare Modell.

---

## Einrichtung

Rund fünfzehn Minuten, einmalig.

### 1. Dateien hochladen

Neues Repository auf GitHub erstellen. Das Repository muss **öffentlich** sein,
wenn du GitHub Pages im Gratis-Tarif nutzen willst — im Code stehen keine
Zugangsdaten, die kommen aus Secrets.

Dann das ZIP entpacken und den Inhalt hochladen. **Achtung, hier geht am
häufigsten etwas schief:** GitHubs Browser-Upload behält Ordner nur, wenn du die
**Ordner selbst** hineinziehst. Ziehst du stattdessen einzelne Dateien, landet
alles flach im Wurzelverzeichnis und nichts funktioniert.

Deshalb liegt der Code bewusst flach — bis auf eine Ausnahme.

**Über den Browser:** **Add file → Upload files**, dann alle Dateien und
den Ordner `docs` zusammen ins Fenster ziehen. Der Ordner `.github` ist auf Mac
und Windows unsichtbar und lässt sich nicht mitziehen; den legst du danach von
Hand an:

1. **Add file → Create new file**
2. Als Dateinamen exakt `.github/workflows/windcheck.yml` eintippen — die
   Schrägstriche erzeugen die Ordner automatisch
3. Den Inhalt von `windcheck.yml` aus dem entpackten ZIP hineinkopieren
4. **Commit changes**

**Mit git** ist es einfacher, weil nichts verlorengehen kann:

```bash
cd <entpackter-ordner>
git init && git add . && git commit -m "Seewind"
git branch -M main
git remote add origin https://github.com/<konto>/<repo>.git
git push -u origin main
```

Danach sollte das Repository so aussehen — vier Ordner und ein paar Dateien:

```
.github/workflows/windcheck.yml
.github/workflows/telegram.yml
docs/index.html
docs/prognose.json
docs/.nojekyll
state/gemeldet.json
browserbau.mjs  ics.mjs  lib.mjs  melder.mjs  orte.mjs
reise.mjs  run.mjs  smtp.mjs  spotsuche.mjs  telegram.mjs  template.mjs
test-orte.mjs  test-reise.mjs  test-seite.mjs  test-telegram.mjs
spots.json  reiseorte.json  package.json  prognose-test.json  README.md
```

Liegen `run.mjs` und `windcheck.yml` nebeneinander im Wurzelverzeichnis, ist der
Upload schiefgegangen — dann alle Dateien löschen und neu hochladen.

### 2. Meldekanal wählen

Fünf Wege stehen zur Auswahl. Der Kanal wird aus den hinterlegten Zugangsdaten
erraten; mit der Variablen `MELDER` lässt er sich fest vorgeben.

| `MELDER` | Kanal | Kosten | Braucht |
|---|---|---|---|
| `smtp` | **E-Mail über dein Postfach** | gratis | ein bestehendes Postfach mit SMTP-Zugang |
| `brevo` | E-Mail über HTTP-API | gratis bis 300 am Tag | Brevo-Konto und eine verifizierte Domain |
| `aspsms` | SMS, Schweizer Anbieter | ab 500 Credits zu rund 6 Rappen, keine Grundgebühr | ASPSMS-Konto |
| `twilio` | SMS, global | rund 7 Rappen pro SMS | Twilio-Konto |
| `telegram` | Telegram | gratis | Telegram-App |

**Empfehlung: `smtp`.** Wenn du ohnehin ein Geschäfts- oder privates Postfach
hast, ist das der einzige Weg, der nichts kostet und bei dem nichts Neues
angelegt werden muss — kein Konto, keine Domain-Verifikation, keine Credits. Auf
dem Handy landet die Mail als Push-Meldung, das kommt einer SMS sehr nahe.

<details>
<summary><b>E-Mail über dein Postfach (smtp)</b></summary>

Du brauchst Server, Port, Benutzername und Passwort deines Postfachs — dieselben
Angaben, die auch in Outlook oder Apple Mail stehen. Port 587 mit STARTTLS ist
der Normalfall, 465 spricht von Anfang an TLS. Beides wird unterstützt,
unverschlüsselt wird bewusst nie angemeldet.

Zwei Stolpersteine:

- **Microsoft 365** hat SMTP AUTH pro Postfach standardmässig abgeschaltet. Die
  IT muss es für dieses eine Postfach freischalten.
- **Gmail** verlangt Zwei-Faktor-Anmeldung und ein *App-Passwort*; das normale
  Kontopasswort wird abgelehnt.

Falls dein Mailserver nur Verbindungen aus dem Firmennetz annimmt, funktioniert
dieser Weg von GitHub aus nicht — dann ist `brevo` oder `telegram` die
Alternative.
</details>

<details>
<summary><b>E-Mail über Brevo (brevo)</b></summary>

Konto auf [brevo.com](https://www.brevo.com/) anlegen, unter *SMTP & API* einen
API-Schlüssel erzeugen und die Absenderdomain verifizieren (ein paar
DNS-Einträge). Gratis bis 300 Nachrichten am Tag.
</details>

<details>
<summary><b>SMS über ASPSMS (aspsms)</b></summary>

Schweizer Anbieter, keine Grundgebühr, Credits verfallen nicht. Konto auf
[aspsms.ch](https://www.aspsms.ch/) anlegen, Credits kaufen, Userkey und Passwort
notieren. Als Absender lässt sich ein Name statt einer Nummer setzen; der muss
dort einmalig freigeschaltet werden.
</details>

<details>
<summary><b>SMS über Twilio (twilio)</b></summary>

Konto anlegen, Account SID und Auth Token notieren. Für die Schweiz genügt eine
alphanumerische Sender-ID, eine eigene Nummer ist nicht nötig.
</details>

<details>
<summary><b>Telegram (telegram)</b></summary>

1. [@BotFather](https://t.me/BotFather) anschreiben, `/newbot` senden. Du bekommst
   einen Token der Form `1234567890:AA…`
2. **Deinen neuen Bot in Telegram suchen und ihm schreiben** (START antippen).
   Ein Bot kann ein Gespräch nie von sich aus beginnen — ohne diesen Schritt
   scheitert jeder Versand mit `chat not found`.
3. Im Browser `https://api.telegram.org/bot<DEIN_TOKEN>/getUpdates` öffnen. Dort
   steht `"chat":{"id":123456789,…}` — **diese Zahl** ist deine Chat-ID.

   Bleibt die Antwort leer (`"result":[]`), hast du Schritt 2 noch nicht gemacht
   oder einem anderen Bot geschrieben. Diese Methode ist verlässlicher als
   @userinfobot, weil sie genau den Chat zeigt, den *dein* Bot sieht.

**Mehrere Personen erreichen** — zwei Wege, beide funktionieren:

*Gruppe (empfohlen).* In Telegram eine Gruppe erstellen, die Leute und **den Bot**
hineinnehmen, dann in der Gruppe einmal `/start` senden. In `getUpdates` steht nun
eine **negative** Chat-ID wie `-1001234567890` — die kommt als einziger Wert in
`TELEGRAM_CHAT_ID`. Vorteil: wer dazukommt oder geht, ändert nichts an der
Konfiguration; alle sehen dieselbe Meldung.

*Einzelne Chats.* Mehrere IDs durch Komma getrennt in `TELEGRAM_CHAT_ID`, z.B.
`111111111,222222222`. Jede Person muss dem Bot vorher selbst geschrieben haben.
Jede bekommt die Meldung privat. Mischen ist erlaubt — eine Gruppe plus einzelne
Personen.

Scheitert ein Empfänger, bekommen die übrigen die Meldung trotzdem; der Ausfall
steht als Warnung im Actions-Log. Nur wenn niemand erreichbar ist, bricht der Lauf ab.
</details>

### 3. Zugangsdaten hinterlegen

Unter **Settings → Secrets and variables → Actions → New repository secret**,
nur die Zeilen des gewählten Kanals:

| Secret | Kanal | Wert |
|---|---|---|
| `MAIL_EMPFAENGER` | smtp, brevo | deine Adresse (mehrere durch Komma getrennt) |
| `SMTP_HOST` | smtp | z.B. `mail.deinanbieter.ch` |
| `SMTP_BENUTZER` | smtp | Anmeldename, meist die Mailadresse |
| `SMTP_PASSWORT` | smtp | Passwort oder App-Passwort |
| `BREVO_API_KEY` | brevo | API-Schlüssel aus dem Brevo-Konto |
| `SMS_EMPFAENGER` | aspsms, twilio | Nummer als `+41791234567` |
| `ASPSMS_USERKEY` | aspsms | Userkey |
| `ASPSMS_PASSWORT` | aspsms | Passwort |
| `TWILIO_ACCOUNT_SID` | twilio | Account SID |
| `TWILIO_AUTH_TOKEN` | twilio | Auth Token |
| `TELEGRAM_BOT_TOKEN` | telegram | Token vom BotFather |
| `TELEGRAM_CHAT_ID` | telegram | numerische Chat-ID; mehrere durch Komma getrennt, Gruppen-IDs sind negativ |

Dazu unter **Variables** (das sind keine Geheimnisse):

| Variable | Bedeutung |
|---|---|
| `MELDER` | `smtp`, `brevo`, `aspsms`, `twilio` oder `telegram` |
| `SMTP_PORT` | `587` (Standard) oder `465` |
| `MAIL_ABSENDER` | Absenderadresse, z.B. `Seewind <wind@example.ch>`; ohne Angabe wird `SMTP_BENUTZER` genommen |
| `SMS_ABSENDER` | Absendername oder -nummer, Standard `Seewind` |
| `SMS_MAX_ZEICHEN` | Standard `160`, also genau eine SMS. `320` erlaubt zwei |
| `TELEGRAM_BOT_NAME` | Botname ohne `@` — nur nötig für den Knopf „An Telegram senden" |
| `DASHBOARD_URL` | Adresse des Dashboards, erscheint in Mail und Telegram |
| `KALENDER_STATUS` | `BUSY` (Standard), `TENTATIVE` oder `FREE` — wie die Termine in Outlook zählen |

### 4. Schreibrechte für den Workflow freigeben

**Settings → Actions → General → Workflow permissions** auf
**Read and write permissions** stellen. Ohne das kann der Job das aktualisierte
Dashboard nicht zurückschreiben.

### 5. Meldekanal testen

**Actions → Windcheck → Run workflow**, dort den Haken bei
*„Nur eine Testmeldung schicken"* setzen. Der Lauf verschickt eine kurze
Testnachricht über den eingestellten Kanal, ohne Prognose und ohne Dashboard.

Kommt sie an, ist der Kanal fertig. Kommt sie nicht an, steht im Actions-Log,
woran es liegt — bei den häufigen Fehlern samt Anleitung, was zu tun ist.

### 6. Ersten richtigen Lauf starten

**Actions → Windcheck → Run workflow**, diesmal ohne den Haken. Der Lauf dauert
etwa eine halbe Minute. Danach steht das Dashboard, und wenn ein Fenster in Sicht ist, kommt die
erste Meldung.

Falls der Reiter „Actions" leer aussieht: GitHub fragt bei neuen Repositories
einmal nach, ob Workflows laufen dürfen — die Nachfrage bestätigen. Taucht
„Windcheck" gar nicht auf, liegt `windcheck.yml` nicht unter
`.github/workflows/` — siehe Schritt 1.

### 7. Dashboard veröffentlichen

**Erst nachdem der Lauf durchgelaufen ist**, sonst findet der Pages-Build den
Ordner `docs` nicht und bricht ab.

**Settings → Pages → Source: Deploy from a branch**, Branch `main`,
Ordner `/docs`.

Die Seite liegt dann unter `https://<konto>.github.io/<repo>/`. Trag diese
Adresse unter **Settings → Secrets and variables → Actions → Variables**
als `DASHBOARD_URL` ein, dann steht der Link auch in der Meldung.

---

## Karte

Über der Rangliste liegt eine Karte der Region. Jeder Spot ist eine Scheibe mit
dem Mittelwind dieser Stunde, eingefärbt nach Stufe, mit einem Pfeil in
Windrichtung. Die drei bestbewerteten Spots tragen eine Markierung.

Der Regler unter der Karte läuft über alle Prognosestunden; der Knopf daneben
spielt sie ab. Damit sieht man, **wann** der Wind wo durchkommt — eine Bise, die
morgens am Bielersee steht und erst nachmittags den Neuenburgersee erreicht, ist
auf dem Standbild nicht zu erkennen.

Wichtig beim Lesen: ein Spot färbt sich nur ein, wenn die Richtung zu *seinen*
Sektoren passt. Derselbe Wind kann am einen See fahrbar sein und am anderen
nutzlos — genau dafür ist die Karte da.

Die Karte nutzt [Leaflet](https://leafletjs.com/) und Kacheln von
OpenStreetMap — beides ohne Schlüssel und ohne Konto. Lädt die Bibliothek nicht
(kein Netz, geblockte CDN), bleibt der Kartenabschnitt einfach ausgeblendet; der
Rest der Seite funktioniert unverändert.

---

## Rangliste

Nicht jedes Fenster ist gleich viel wert. Jedes bekommt deshalb 0 bis 100 Punkte
aus vier Teilen; das Dashboard zeigt die **drei besten** oben, mit der Aufschlüsselung
daneben.

| Teil | Punkte | Wofür |
|---|---|---|
| **Wind** | 0–50 | Stärke über deiner Schwelle. Das Optimum liegt 8 kn darüber; wer deutlich mehr bringt, verliert wieder bis zu 20 Punkte — viel Wind ist unbequem, nicht wertlos. |
| **Dauer** | 0–25 | Volle Punkte ab 6 zusammenhängenden Stunden. |
| **Böen** | 0–15 | Verhältnis Böe zu Mittelwind. Bis 1,4 gleichmässig, ab 2,2 ruppig. |
| **Nähe** | 0–10 | Heute 10, morgen 8, übermorgen 5, danach 3 — je näher, desto verlässlicher die Prognose. |

Die Gewichte stehen unter `bewertung` in `spots.json` und lassen sich verschieben.
Wer etwa lieber lange Sessions als starken Wind hätte, senkt `idealUeberSchwelle`.

Die Rangfolge taucht überall auf: im Dashboard als Podest, in Telegram als
🥇🥈🥉 mit Punktzahl, in der E-Mail als *[Platz 1]* samt Aufschlüsselung, im
Kalendertitel als `#1`. Bei **SMS** entscheidet sie mit, welche Fenster in die
160 Zeichen kommen — es werden die besten ausgewählt, ausgegeben aber
chronologisch.

Die Liste unter dem Podest bleibt nach Zeit sortiert. Eine reine Bestenliste
ohne Zeitachse wäre schlechter zu lesen, wenn man wissen will, wann man frei
nehmen muss.

---

## Termine in Outlook

Jeder Lauf schreibt `docs/fenster.ics` — eine Kalenderdatei mit allen aktuellen
Fenstern. Zwei Wege, sie zu nutzen:

**Abonnieren (empfohlen).** Am schnellsten über das Dashboard: dort stehen neben
dem Download die Knöpfe **In Outlook abonnieren** und **Adresse kopieren**. Der
erste öffnet den Abo-Dialog direkt (`webcal://`), der zweite legt die
`https://`-Adresse in die Zwischenablage, falls Outlook den Link nicht annimmt.
Beide Adressen leitet die Seite aus ihrem eigenen Ort ab — sie stimmen also auch,
wenn das Repository anders heisst oder unter einer eigenen Domain liegt. Öffnest
du die Seite lokal als Datei, sind beide Knöpfe ausgeblendet: ohne Server gibt es
nichts zu abonnieren.

Von Hand geht es so:

- *Outlook im Web / Microsoft 365:* Kalender → **Kalender hinzufügen → Aus dem
  Internet abonnieren** → `https://<konto>.github.io/<repo>/fenster.ics`
- *Outlook für Windows:* Start → **Kalender öffnen → Aus dem Internet**

Danach holt Outlook die Datei selbstständig; neue Fenster erscheinen, weggefallene
verschwinden. Wie oft aktualisiert wird, bestimmt Outlook — üblicherweise ein paar
Mal am Tag, nicht sofort. Die Datei bittet mit `REFRESH-INTERVAL` um alle vier
Stunden, aber das ist eine Bitte, keine Garantie. Für eine Vorlaufzeit von ein
bis drei Tagen reicht das; wer es sofort haben will, nimmt die Meldung.

**Einmalig eintragen.** Der Meldung liegt **je Fenster eine eigene Datei** bei,
benannt nach Datum, Spot und Uhrzeit (`2026-09-16_Estavayer_12-20Uhr.ics`). Bei
Telegram kommen sie als Dateigruppe, bei E-Mail als Anhänge. Öffnen genügt, der
Termin steht.

Getrennte Dateien statt einer gemeinsamen, weil Outlook beim Öffnen einer Datei
mit mehreren Terminen nicht alle zur Auswahl anbietet — und weil du so einzeln
entscheiden kannst, welches Fenster überhaupt in den Kalender soll.

Auf dem Dashboard liegt zusätzlich der gesammelte Download aller Fenster.

Die Termine blockieren die Zeit standardmässig als **gebucht**. Wer sie lieber
unverbindlich hätte, setzt die Variable `KALENDER_STATUS` auf `TENTATIVE` — dann
stehen sie als *Mit Vorbehalt* im Kalender, was einer Prognose ehrlicher entspricht.

Ein Fenster behält über alle Läufe dieselbe Kennung. Ein erneuter Import
aktualisiert deshalb den bestehenden Termin, statt einen zweiten daneben zu legen.

---

## Reisemodus

Neben den gespeicherten Seen kann das Dashboard auch **irgendwo auf der Welt**
suchen: Ort eingeben, Umkreis wählen, und es zeigt die besten Windfenster im
Umkreis — mit derselben Rangliste, derselben Karte, derselben Bewertung.

Der Umschalter steht oben auf der Seite. Den Ort findest du auf drei Wegen: über
die Suche, über **Mein Standort**, oder indem du auf die Karte tippst.

### Woher die Spots kommen

Es gibt kein Spotverzeichnis dahinter. Statt Namen nachzuschlagen, misst das Tool
**Geometrie**: Aus den Karten von OpenStreetMap wird eine Wassermaske gebaut, und
von jeder Uferstelle aus wird in acht Richtungen gemessen, wie weit das Wasser
gegen den Wind reicht — die *Anlaufstrecke*.

Diese eine Zahl leistet zweierlei auf einmal:

- sie schliesst **ablandigen Wind** aus, denn gegen den Wind läge dann Land
- sie verwirft **Pfützen**, auf denen sich ohnehin keine Welle aufbaut

Übrig bleiben Uferstellen mit den Richtungen, aus denen dort überhaupt etwas
gehen kann. Dass Torbole bei Südwind läuft und Riva bei Nordwind, fällt so von
selbst heraus, ohne dass es jemand eingetragen hätte.

Für die Prognose ausserhalb der Schweiz wählt Open-Meteo das beste verfügbare
Modell — in Europa, Nordamerika, Skandinavien und Japan sind das 1 bis 3 km
Gitterweite, anderswo 9 bis 25 km. Zeiten stehen dann in **Ortszeit** am Spot,
auch im Kalender.

### Was der Reisemodus nicht weiss

Er kennt Wasser und Ufer, sonst nichts. Ob man dort hinkommt, ob es einen
Einstieg gibt, ob Baden oder Starten erlaubt ist, ob eine Strömung steht, ob ein
Hafen im Weg liegt — davon weiss er nichts. Er liefert Kandidaten, keine
Freigabe. Ein Blick auf die Karte und eine kurze Suche vor Ort gehören dazu.

Ausserdem erkennt die Wassermaske die Farbe des OpenStreetMap-Standardstils.
Ändert sich dieser Stil grundlegend, muss die Erkennung nachgezogen werden; das
Tool merkt es und meldet sich, wenn im Umkreis auffällig wenig erkannt wurde.

### Meldungen für einen Ort einschalten — ein Knopf

Das Dashboard rechnet den Reisemodus **im Browser** und meldet von sich aus
nichts. Damit ein Ort auch per Telegram, Mail oder SMS gemeldet wird, muss er in
die Liste `reiseorte.json`. Dafür gibt es genau einen Knopf.

Nach der Suche steht unten **An Telegram senden**. Der Link öffnet deinen
Bot-Chat; ein Tipp auf START, und der Ort ist übernommen. Der Bot antwortet mit
der Liste, in der jeder Ort seine Knöpfe hat:

```
Tarifa ist übernommen.

▶ Tarifa · 25 km
▫ Torbole · 20 km · aus

[Tarifa ausschalten]  [entfernen]
[Torbole einschalten] [entfernen]
[aktualisieren]
```

`/orte` holt diese Liste jederzeit wieder. Die Nachricht schreibt sich bei jedem
Druck um, statt sich zu stapeln. *Entfernen* fragt einmal nach.

Damit der Link gebaut werden kann, muss der Botname als Variable
`TELEGRAM_BOT_NAME` hinterlegt sein — ohne `@`, also z.B. `seewind_alarm_bot`.
Fehlt sie, steht das an der Stelle des Knopfes; unsichtbar bleibt er nicht.

Im Dashboard steht unter dem Knopf, welche Orte gerade scharf sind — als
Anzeige, nicht zum Schalten. Eine Seite auf GitHub Pages ist eine Datei ohne
Rechte; geschaltet wird dort, wo jemand schreiben darf, und das ist der Chat.

Wer lieber von Hand arbeitet, bearbeitet `reiseorte.json` direkt im
GitHub-Browser — `"aktiv": false` schaltet einen Ort aus, ohne ihn zu verlieren.

### Wie schnell ein Knopfdruck wirkt

Ein Telegram-Bot bekommt seine Nachrichten nur über einen erreichbaren Server
oder indem jemand nachfragt. Hier fragt ein eigener Workflow alle fünfzehn
Minuten nach — typisch wirkt ein Druck also nach 15 bis 30 Minuten, denn GitHub
hält geplante Läufe bei Andrang auch mal auf. Wer nicht warten mag, startet ihn
unter **Actions → Telegram → Run workflow** von Hand.

Hat sich etwas geändert, rechnet derselbe Job gleich neu durch — die Meldung für
einen neu übernommenen Ort kommt also mit, ohne auf den nächsten regulären Lauf
zu warten.

### Die Liste

```jsonc
{
  "orte": [
    {
      "id": "tarifa-3601-m561",
      "ort": "Tarifa",
      "lat": 36.0139,
      "lon": -5.6069,
      "umkreisKm": 25,
      "minFetchKm": 1.2,   // so viel Wasser muss gegen den Wind liegen
      "maxSpots": 6,
      "aktiv": true        // false lässt den Ort stehen, meldet ihn aber nicht
    }
  ]
}
```

Bis zu zwölf Orte, jeder einzeln schaltbar. Die Kennung entsteht aus Name und
Koordinaten: derselbe Ort zweimal übernommen gibt keinen zweiten Eintrag.

Gefundene Stellen werden in `state/reise.json` gemerkt und erst neu gesucht,
wenn sich Ort, Umkreis oder Einstellungen ändern. Das spart Zeit und schont die
Kachelserver von OpenStreetMap, die ein Gemeingut sind.

Wer früher den `reise`-Block in `spots.json` benutzt hat: der gilt weiterhin und
kommt als zusätzlicher Ort dazu. Ändern lässt er sich aber nur dort, nicht über
die Knöpfe.

---

## Anpassen

Alles Fachliche steht in **`spots.json`**. Die Datei lässt sich direkt im
GitHub-Browser bearbeiten; der nächste Lauf übernimmt die Änderung.

```jsonc
"kriterien": {
  "minWindKn": 11,     // Mindest-Mittelwind in Knoten
  "minGustKn": 16,     // ab hier gilt eine Stunde als "knapp", auch wenn der Mittelwind fehlt
  "stundeVon": 8,      // frühestes berücksichtigtes Zeitfenster
  "stundeBis": 21,     // spätestes
  "minStunden": 2,     // so viele zusammenhängende Stunden braucht es für eine Meldung
  "prognoseTage": 4
}
```

Pro Spot:

```jsonc
{
  "id": "estavayer",
  "name": "Estavayer-le-Lac",
  "see": "Neuenburgersee",
  "lat": 46.848, "lon": 6.848,
  "dirs": ["NO", "O", "W", "NW"],   // fahrbare Richtungen als Oktanten
  "aktiv": true,
  "minWindKn": 13                    // optional, überschreibt den globalen Wert
}
```

Oktanten sind `N NO O SO S SW W NW`, jeweils ein 45°-Sektor
(`N` = 337.5°–22.5°, `NO` = 22.5°–67.5° und so weiter).

**Die voreingestellten Richtungssektoren sind Startwerte.** Sie stammen aus
Spotguides und der Seegeometrie, nicht aus eigener Erfahrung. Sobald du siehst,
dass ein Spot bei einer Richtung läuft oder eben nicht, gehört die Liste
korrigiert — das ist die Stellschraube, die über Fehlalarme entscheidet.

### Spot hinzufügen

Neuen Eintrag in `spots` ergänzen. Koordinaten am besten vom Wasser direkt vor
dem Einstieg nehmen, nicht vom Parkplatz — bei 1 km Gitterweite macht das einen
Unterschied.

### Prüfzeiten ändern

In `.github/workflows/windcheck.yml`. Die Zeiten stehen in **UTC**:

| Wunschzeit (Sommer) | Cron |
|---|---|
| 06:00 | `0 4 * * *` |
| 07:00 | `0 5 * * *` |
| 17:00 | `0 15 * * *` |
| 19:00 | `0 17 * * *` |

Im Winter verschiebt sich das um eine Stunde nach vorn — GitHub kennt keine
Zeitzonen. Die Lauf-Zeitpunkte können sich unter Last um einige Minuten
verzögern, das ist bei GitHub Actions normal.

---

## Wie eine Meldung zustande kommt

Eine Stunde zählt als **fahrbar**, wenn der Mittelwind die Schwelle des Spots
erreicht *und* die Windrichtung in einem seiner freigegebenen Oktanten liegt.
Ein **Fenster** ist ein Block von mindestens `minStunden` aufeinanderfolgenden
fahrbaren Stunden am selben Tag.

Gemeldet wird jedes Fenster **einmal**. Welche schon draussen waren, steht in
`state/gemeldet.json`; Einträge für vergangene Tage verfallen von selbst. Ändert
sich die Prognose so, dass ein Fenster früher beginnt, gilt es als neues Fenster
und wird noch einmal gemeldet.

Der Text richtet sich nach dem Kanal. **E-Mail** bekommt die ausführliche
Fassung: alles Wichtige schon im Betreff, im Text je Fenster Zeitraum, Dauer,
Mittelwind, Böen, Richtung und verwendetes Modell. **Telegram** bekommt dieselben
Angaben kompakter. **SMS** wird auf eine Nachricht eingedampft — eine Zeile je
Fenster, was nicht mehr hineinpasst, wird zu „+N weitere" zusammengefasst; über
`SMS_MAX_ZEICHEN` lässt sich das auf zwei Nachrichten anheben.

Im Dashboard sind zusätzlich zwei Zwischenstufen sichtbar: *knapp* (nah an der
Schwelle oder nur in den Böen) und *kräftig* (sechs Knoten über der Schwelle).
Gemeldet werden nur die fahrbaren.

---

## Lokal testen

Node 20 oder neuer, keine Abhängigkeiten, kein Netz nötig.

```bash
npm test        # alle Prüfungen nacheinander
```

Dahinter stecken vier Läufe:

| Datei | prüft |
|---|---|
| `test-orte.mjs` | Orteliste: ergänzen, schalten, entfernen, kaputte Dateien überstehen |
| `test-reise.mjs` | mehrere Orte suchen, merken, und was bei Ausfällen passiert |
| `test-telegram.mjs` | den ganzen Telegram-Ablauf gegen einen nachgebauten Bot-Server |
| `test-seite.mjs` | die fertige Seite in Node, mit nachgebautem DOM und Knopfdrücken |
| `run.mjs --dry --fixture` | den ganzen Lauf gegen einen gespeicherten Prognosestand |

Keiner davon verschickt etwas oder braucht einen echten Bot-Token.

Einzeln:

```bash
node run.mjs --dry                             # echte Prognose, Nachricht nur auf der Konsole
node run.mjs --dry --fixture prognose-test.json # ganz ohne Netz
node telegram.mjs --dry                        # Telegram lesen, nichts schreiben
```

## Wenn etwas nicht läuft

**Keine Nachricht, obwohl Wind gemeldet ist.** Im Actions-Log nachsehen: der Lauf
gibt jedes gefundene Fenster aus. Steht dort „Keine neuen Fenster", war das
Fenster schon einmal draussen. Steht dort gar kein Fenster, greifen die Kriterien
nicht — meist ist der Richtungssektor zu eng.

**`Bad Request: chat not found` bei Telegram.** Der Bot darf dir nicht schreiben.
Schreib ihm in Telegram einmal selbst, dann hol dir die Chat-ID über
`https://api.telegram.org/bot<TOKEN>/getUpdates` — siehe Schritt 2.

**`Unauthorized` bei Telegram.** Der Token stimmt nicht.

**Der Job scheitert beim Pushen.** Schreibrechte fehlen, siehe Schritt 4.

**`Cannot find module '…/telegram.mjs'` alle fünfzehn Minuten.** Der Workflow
`telegram.yml` ist schon da, die Dateien daneben noch nicht — auf GitHub muss man
den Workflow von Hand anlegen, der Rest kommt per Upload, und die Reihenfolge
gerät leicht durcheinander. Lade die `.mjs`-Dateien aus dem Paket ins
Wurzelverzeichnis (neben `run.mjs`, nicht in einen Unterordner). Der Job prüft
das inzwischen selbst und wartet still, statt zu scheitern.

**Der Telegram-Knopf tut nichts.** Der Workflow *Telegram* sieht alle fünfzehn
Minuten nach, und GitHub hält geplante Läufe bei Andrang auch mal auf. Unter
**Actions → Telegram** steht, wann er zuletzt lief; *Run workflow* startet ihn
sofort. Kommt gar nichts: stimmt `TELEGRAM_CHAT_ID`? Nachrichten aus anderen
Chats werden bewusst ohne Antwort verworfen.

**Der Knopf „An Telegram senden" fehlt.** Die Variable `TELEGRAM_BOT_NAME` ist
nicht gesetzt oder der Lauf danach nicht durchgelaufen. Eintragen unter
**Settings → Secrets and variables → Actions → Variables**, dann
**Actions → Windcheck → Run workflow**. An der Stelle des Knopfes steht dann
auch im Dashboard, was fehlt.

**Zwei Läufe gleichzeitig.** Windcheck und Telegram teilen sich eine
Concurrency-Gruppe und warten aufeinander. Kommt es trotzdem einmal zum
Zusammenstoss, zieht der zweite mit `git pull --rebase` nach und pusht erneut.

**Du benutzt Telegram gar nicht.** Dann läuft der Telegram-Workflow zwar alle
fünfzehn Minuten an, merkt aber in ein paar Sekunden, dass kein Bot-Token
hinterlegt ist, und hört auf. Stört es trotzdem: unter **Actions → Telegram →
⋯ → Disable workflow** abschalten, oder `.github/workflows/telegram.yml`
löschen. Alles andere läuft weiter.

**Pages-Build bricht ab mit `No such file or directory ... /docs`.** Der Ordner
`docs` fehlt im Repository. Entweder ist der Upload flach geraten (siehe
Schritt 1), oder Pages wurde vor dem ersten Windcheck-Lauf eingeschaltet. Lauf
starten, dann lädt der Pages-Build von selbst neu.

**Der Workflow bricht ab mit `Cannot find module`.** Die Dateien liegen nicht
dort, wo `run.mjs` sie sucht — der Upload ist flach geraten. Siehe Schritt 1.

**Nach zwei Monaten kommt nichts mehr.** GitHub schaltet geplante Workflows in
Repositories ohne Aktivität ab. Dieser Job committet bei jedem Lauf das
aktualisierte Dashboard und hält das Repository damit aktiv — sofern Schritt 4
erledigt ist.

**Die Mail kommt nicht an.** Erst im Actions-Log nachsehen, ob der Versand
überhaupt gemeldet wurde. Wurde er es, liegt es am Empfang: Spam-Ordner prüfen,
und ob der Absender zur angemeldeten Adresse passt — viele Server lehnen eine
`From`-Adresse ab, die nicht zum SMTP-Benutzer gehört.

**`535 5.7.3 Authentication unsuccessful` bei Microsoft 365.** Nicht das Passwort
ist falsch — dort ist die SMTP-Anmeldung pro Postfach ab Werk gesperrt. Die IT
gibt sie frei mit:

```powershell
Set-CASMailbox -Identity <postfach> -SmtpClientAuthenticationDisabled $false
# falls zusätzlich mandantenweit gesperrt:
Set-TransportConfig -SmtpClientAuthenticationDisabled $false
```

Bedenke dabei: Microsoft baut diesen Anmeldeweg ab. Neue Mandanten verlieren ihn
ab Januar 2027, ein endgültiges Abschaltdatum folgt. Für etwas, das jahrelang
unbeaufsichtigt laufen soll, ist `brevo`, `telegram` oder `aspsms` die haltbarere
Wahl.

**„Der Server bietet weder AUTH LOGIN noch AUTH PLAIN an."** Ebenfalls meist eine
gesperrte SMTP-Anmeldung, siehe oben.

**Open-Meteo antwortet mit 429.** Der Gratis-Tarif erlaubt reichlich Abfragen für
zwei Läufe am Tag; falls du die Frequenz stark erhöhst, kann das Limit greifen.

---

## Aufbau

```
windcheck.yml                  liegt unter .github/workflows/ — startet den Job
spots.json                     Spots und Kriterien — die einzige Datei zum Anpassen
lib.mjs                        Prognose holen, Stunden bewerten, Fenster erkennen
melder.mjs                     Nachricht formatieren und über den gewählten Kanal senden
smtp.mjs                       Kleiner SMTP-Client (STARTTLS, TLS, AUTH LOGIN/PLAIN)
template.mjs                   Dashboard-Seite bauen
run.mjs                        Ein Lauf, von Abruf bis Meldung
prognose-test.json             Echter Prognosestand zum Testen ohne Netz
docs/index.html                Erzeugtes Dashboard (GitHub Pages)
docs/fenster.ics               Kalender zum Abonnieren
ics.mjs                        Kalenderdatei bauen (RFC 5545)
spotsuche.mjs                  Reisemodus: Wassermaske aus Kacheln, Anlaufstrecke, Uferpunkte
reise.mjs                      Reisemodus im Lauf: suchen, merken, in Spots übersetzen
orte.mjs                       Die Orteliste: ergänzen, schalten, entfernen, prüfen
reiseorte.json                 Die scharf gestellten Reiseorte — von Knöpfen gepflegt
telegram.mjs                   Befehle und Knöpfe aus Telegram abarbeiten
telegram.yml                   liegt unter .github/workflows/ — sieht alle 15 Minuten nach
browserbau.mjs                 Legt lib.mjs, spotsuche.mjs und orte.mjs in die Seite
test-orte.mjs                  Prüft die Orteliste
test-reise.mjs                 Prüft die Spotsuche über mehrere Orte
test-telegram.mjs              Prüft den Telegram-Ablauf gegen einen nachgebauten Bot
test-seite.mjs                 Lässt die fertige Seite in Node laufen und drückt die Knöpfe
docs/.nojekyll                 Sagt Pages, die Seite unverändert auszuliefern
state/gemeldet.json            Welche Fenster schon gemeldet wurden
state/reise.json               Gefundene Stellen je Reiseort
state/telegram.json            Bis wohin die Telegram-Nachrichten abgearbeitet sind
```

Dashboard und Meldung rechnen **denselben Code**: `browserbau.mjs` kopiert
`lib.mjs` und `spotsuche.mjs` beim Bauen in die Seite, statt die Formeln dort ein
zweites Mal zu führen. Das ist keine Kosmetik — als beide Fassungen einmal
auseinanderliefen, zeigte das Dashboard eine andere Rangfolge als die Meldung.

---

## Grenzen

Die Modelle rechnen auf einem Gitter von 1 bzw. 2 Kilometern. Düseneffekte
zwischen Felswänden, die Thermik einer einzelnen Bucht und der genaue Zeitpunkt,
zu dem der Joran einfällt, liegen unterhalb dieser Auflösung. Die Prognose sagt
verlässlich, *ob* eine Lage Wind bringt — den letzten Kilometer entscheiden
Messstationen und der Blick aus dem Fenster.
