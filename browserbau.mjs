/**
 * Macht aus den Node-Modulen dieses Projekts ein Skript für die Seite.
 *
 * Warum überhaupt: Dashboard und Meldung müssen dieselbe Rechnung anstellen.
 * Vorher stand die Bewertung zweimal da — einmal in `lib.mjs`, einmal von Hand
 * abgeschrieben in der Seite. Beim ersten Mal, als sich die beiden
 * auseinanderentwickelt haben, zeigte das Dashboard eine andere Rangfolge als
 * die Meldung. Genau einmal darf so etwas passieren.
 *
 * Deshalb wird hier dieselbe Quelle, die Node ausführt, in die Seite gelegt:
 * die `export`-Schlüsselwörter fallen weg, alles landet in einem abgeschlossenen
 * Namensraum. Kein Bündelwerkzeug, keine Abhängigkeit — nur Textarbeit an
 * Dateien, die dieses Projekt ohnehin selbst schreibt.
 */

import { readFile } from "node:fs/promises";

const EXPORT_FUNKTION = /^export\s+(?:async\s+)?function\s+(\w+)/gm;
const EXPORT_WERT = /^export\s+(?:const|let|var|class)\s+(\w+)/gm;
const EXPORT_LISTE = /^export\s*\{([^}]*)\}\s*;?\s*$/gm;
const STATISCHER_IMPORT = /^\s*import\s+[^(]/m;

/**
 * Jedes Modul bekommt seinen eigenen abgeschlossenen Namensraum. Ein
 * gemeinsamer ginge nicht: `lib.mjs` und `spotsuche.mjs` kennen beide eine
 * Konstante `OKTANTEN`, und zusammengeschüttet wäre das ein Namenskonflikt.
 *
 * @param {Array<{pfad: string, name: string}>} module
 * @returns {Promise<string>}   fertiges Skript für die Seite
 */
export async function alsBrowserQuelle(module) {
  const skripte = [];
  for (const { pfad, name } of module) {
    skripte.push(await einModul(pfad, name));
  }
  return skripte.join("\n");
}

async function einModul(pfad, namensraum) {
  const teile = [];
  const namen = new Set();

  {
    const quelle = await readFile(pfad, "utf8");

    // Ein statischer Import würde im Browser ins Leere greifen, und zwar still.
    // Lieber hier laut scheitern als später eine Seite ausliefern, die nichts tut.
    if (STATISCHER_IMPORT.test(quelle)) {
      throw new Error(
        `${pfad} hat einen import. Für die Seite müssen diese Module ohne ` +
          `Importe auskommen — sonst läuft die Suche im Browser nicht.`
      );
    }
    if (/^export\s+default/m.test(quelle)) {
      throw new Error(`${pfad} hat einen Default-Export; der lässt sich hier nicht abbilden.`);
    }

    for (const treffer of quelle.matchAll(EXPORT_FUNKTION)) namen.add(treffer[1]);
    for (const treffer of quelle.matchAll(EXPORT_WERT)) namen.add(treffer[1]);
    for (const treffer of quelle.matchAll(EXPORT_LISTE)) {
      for (const eintrag of treffer[1].split(",")) {
        const name = eintrag.trim().split(/\s+as\s+/).pop().trim();
        if (name) namen.add(name);
      }
    }

    teile.push(
      quelle
        .replace(EXPORT_LISTE, "")
        .replace(/^export\s+/gm, "")
    );
  }

  const sortiert = [...namen].sort();
  const körper = teile
    .join("\n")
    // Ein "</script" im Quelltext würde das umgebende script-Element beenden
    // und den Rest der Seite als Text ausgeben. Steht heute nirgends — und
    // soll auch dann nicht schaden, wenn es jemand einmal hineinschreibt.
    .replace(/<\/script/gi, "<\\/script");

  return (
    `var ${namensraum} = (function(){\n"use strict";\n` +
    körper +
    `\nreturn { ${sortiert.join(", ")} };\n})();\n`
  );
}
