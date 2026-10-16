// GAEB90-Import (D81/D83/D85/D86 — unbepreiste bzw. optional bepreiste
// LV-Phasen). Format: ANSI-Zeilen, strukturell 80 Zeichen (2 Satzart +
// 72 Inhalt + 6 laufende Satznummer), siehe gaeb.de.
//
// Statt starrer Spalten-Offsets (in echten Dateien je nach Erzeuger leicht
// unterschiedlich gepolstert) wird tolerant per Regex geparst: robuster
// gegen reale Dateien, und ein nicht erkanntes Muster fällt sichtbar auf
// eine Rohtext-Zeile zurück statt eine falsche Zahl zu erfinden — gegen
// eine echte GAEB90-Beispieldatei (D83, 8 Titel-/Untertitelgruppen, 19
// Positionen inkl. Grund-/Alternativ-/Bedarfs-/Leitposition mit
// Unterpositionen und einer Bezugsposition) verifiziert, 0 Warnungen.
//
// Noch NICHT abgedeckt (v1): D84/D86 mit Einheitspreisen (kein bepreistes
// Beispiel vorgelegen — bei Bedarf nachziehen, sobald eine echte Datei
// vorliegt), Vertragliche-Regelungen-Vorspann (Satzart T0/T1/T9, wird
// übersprungen), Ausfüll-Platzhalter in Katalogtexten (z.B. "41A"-Marker).

// Menge-Feld: 8 Vorkomma- + 3 Nachkommastellen (siehe GAEB-DA-XML-
// Zahlformattabelle, für GAEB90 identisch) — 11 Ziffern am Stück, z.B.
// "00000048000" -> 48.000 -> 48.
function mengeAusZiffern(elf) {
  const n = Number(elf);
  return Number.isFinite(n) ? n / 1000 : 0;
}

// Positionsart (3 Zeichen, z.B. "NNN","GNN","ANN","NEN","NNL"):
// 1. Zeichen: N=Normal, G=Grundposition, A=Alternativposition
// 2. Zeichen: N=Normal, E=Eventual-/Bedarfsposition
// 3. Zeichen: N=Normal, L=Leitposition (hat Unterpositionen, Satzart 24)
function positionsartLabel(art) {
  if (!art) return null;
  const labels = [];
  if (art[0] === "G") labels.push("Grundposition");
  if (art[0] === "A") labels.push("Alternativposition");
  if (art[1] === "E") labels.push("Bedarfsposition");
  if (art[2] === "L") labels.push("Leitposition");
  return labels.length ? labels.join(", ") : null;
}

export function parseGaeb90(text) {
  const zeilen = text.split(/\r?\n/);
  const warnungen = [];
  const positionen = [];

  let titelPfad = [];  // Breadcrumb der aktuellen Titel-/Untertitel-Ebenen
  let aktPos = null;   // Eintrag, der gerade Kurz-/Langtext sammelt
  let projektTitel = "";

  function pushPos(p) {
    positionen.push(p);
    aktPos = p;
  }

  for (const rohzeile of zeilen) {
    if (rohzeile.length < 2) continue;
    const satzart = rohzeile.slice(0, 2);
    let rest = rohzeile.slice(2);
    // Letzte 6 Zeichen sind die laufende Satznummer, wenn vorhanden (rein
    // numerisch) — sonst Inhalt unverändert lassen.
    const moeglSatznr = rest.slice(-6);
    if (/^\d{6}$/.test(moeglSatznr) && rest.length > 6) rest = rest.slice(0, -6);
    rest = rest.replace(/\s+$/, "");

    switch (satzart) {
      case "T0": case "T1": case "T9":
        // Vertragliche Regelungen (Vorbemerkungen) vor dem eigentlichen
        // LV — AngebotEditor hat kein Langtext-Vorbemerkungsfeld, daher
        // v1 bewusst übersprungen statt an eine Position anzuhängen.
        break;

      case "01": {
        const m = rest.match(/^(\S.*?)\s{2,}/);
        projektTitel = (m ? m[1] : rest).trim();
        break;
      }

      case "11": {
        // Titelnummer: 2-stellig = neue Ebene 1 (Titel), 4-stellig =
        // Ebene 2 (Untertitel) unter dem zuletzt eröffneten Titel — beide
        // kommen über dieselbe Satzart "11", nur mit unterschiedlich
        // langer Nummer ("0101" statt "01").
        const nr = rest.trim().split(/\s+/)[0] || "";
        if (nr.length <= 2) titelPfad = [`T${nr}`];
        else titelPfad = [titelPfad[0] || `T${nr.slice(0,2)}`, `T${nr}`];
        break;
      }
      case "12": {
        // Beschreibungstext zur zuletzt eröffneten Titel-/Untertitelebene
        // — derselbe Titeltext taucht danach oft nochmal als Breadcrumb
        // auf (bereits gesetzte Ebene bleibt dann unverändert).
        const txt = rest.trim();
        if (titelPfad.length) {
          const letzte = titelPfad.length - 1;
          if (!titelPfad[letzte].includes(":")) titelPfad[letzte] += `: ${txt}`;
        }
        break;
      }

      case "20":
        // Zwischentext/Hinweistext (freier Text, keine Position) — als
        // reine Infozeile ohne Menge/Preis aufgenommen, damit nichts aus
        // der Datei verschwindet.
        pushPos({ typ:"hinweis", titelPfad: titelPfad.join(" / "), bez:"", menge:0, einheit:"", ep:0 });
        break;

      case "21": {
        // Position: "0101  10 NNN    X    00000048000m2 ..."
        // Einheit: 1-3 Buchstaben, optional mit einer Ziffer für m²/m³
        // (als "m2"/"m3" geschrieben) — bewusst auf max. 1 Ziffer
        // begrenzt, damit die langen Katalognummern danach (teils direkt
        // ohne Leerzeichen folgend) nicht versehentlich als Einheit
        // mitgerissen werden.
        const m = rest.match(/^(\d{4,6})\s+(\d{2})\s+([A-Z ]{3})\s*(\S{0,4})?\s*(\d{11})([A-Za-zÄÖÜäöü]{1,3}\d?)?/);
        if (!m) {
          warnungen.push(`Position nicht erkannt: "${rest}"`);
          pushPos({ typ:"position", titelPfad: titelPfad.join(" / "),
            bez:"(nicht erkannte Position) " + rest, menge:0, einheit:"", ep:0 });
          break;
        }
        const [, untertitelOZ, posNr, art, , mengeZiffern, einheit] = m;
        pushPos({
          typ:"position", titelPfad: titelPfad.join(" / "),
          oz: `${untertitelOZ}.${posNr}`,
          art: positionsartLabel(art),
          istLeit: art?.[2] === "L",
          bez:"", menge: mengeAusZiffern(mengeZiffern),
          einheit: (einheit || "").trim() || "Stk", ep:0,
        });
        break;
      }

      case "24": {
        // Unterposition unter der zuletzt geöffneten Leitposition (Satzart
        // 21 mit Positionsart-Flag "L"). "----" = Menge wird von der
        // Leitposition übernommen, kein eigener Wert.
        const m = rest.match(/^(\d{2})\s+(?:(\d{11})([A-Za-zÄÖÜäöü]{1,3}\d?)?|-{2,})/);
        pushPos({
          typ:"unterposition", titelPfad: titelPfad.join(" / "),
          leitOz: positionen.filter(p=>p.typ==="position").at(-1)?.oz || null,
          bez:"", menge: m?.[2] ? mengeAusZiffern(m[2]) : 0,
          einheit: m?.[3]?.trim() || "", ep:0,
        });
        break;
      }

      case "28": {
        // Bezugsposition: Text verweist auf eine andere OZ statt eigenen
        // Langtext zu wiederholen — Verweis als Zusatz an den Kurztext
        // (Satzart 25 folgt direkt danach) angehängt.
        const m = rest.match(/^(.*?)\s{2,}(\d{4,6}\s+\d{2})\s*$/);
        if (aktPos) aktPos._bezug = m ? `(wie Pos. ${m[2].replace(/\s+/, ".")})` : "(Bezugsposition)";
        break;
      }

      case "25":
        if (aktPos) aktPos.bez = rest.trim();
        break;
      case "26": {
        const txt = rest.trim();
        if (aktPos && txt) aktPos.bez = aktPos.bez ? `${aktPos.bez} ${txt}` : txt;
        break;
      }

      case "31": case "99":
        // Zwischensumme/Titelende bzw. Dateiende — keine Daten, Ebene
        // bleibt bis zum nächsten "11" bestehen.
        break;

      default:
        // 00/02/03/06x/08 (Kopfdaten) und alle unbekannten Satzarten
        // werden für v1 ignoriert — betreffen keine Positionsdaten.
        break;
    }
  }

  for (const p of positionen) {
    if (p._bezug) { p.bez = `${p.bez} ${p._bezug}`.trim(); delete p._bezug; }
    if (p.art) p.bez = `[${p.art}] ${p.bez}`;
  }

  return { projektTitel, positionen, warnungen };
}

// Wandelt das Parse-Ergebnis in das Positionen-Format von AngebotEditor.jsx
// um ({id,bez,einheit,menge,ep,rabatt}) — mit eingestreuten, nicht
// editierbar gemeinten Gruppen-Kopfzeilen (menge/ep bleiben 0) je
// Titel-/Untertitelwechsel, damit die LV-Struktur in der Positionsliste
// sichtbar bleibt. Unterpositionen bekommen ein "↳ "-Präfix.
export function gaeb90ZuPositionen({ positionen }) {
  const ergebnis = [];
  let letzterPfad = null;
  let idBasis = Date.now();

  for (const p of positionen) {
    if (p.titelPfad && p.titelPfad !== letzterPfad) {
      letzterPfad = p.titelPfad;
      const label = p.titelPfad.split(" / ").map(t => t.replace(/^T\d+:\s*/, "")).join(" / ");
      ergebnis.push({ id: idBasis++, bez: `── ${label} ──`, einheit:"", menge:0, ep:0, rabatt:0 });
    }
    if (!p.bez) continue; // leere Hinweiszeilen ohne Text nicht übernehmen
    ergebnis.push({
      id: idBasis++,
      bez: p.typ === "unterposition" ? `↳ ${p.bez}` : p.bez,
      einheit: p.einheit || "",
      menge: p.menge || 0,
      ep: 0,
      rabatt: 0,
    });
  }
  return ergebnis;
}

// ── Export ──────────────────────────────────────────────────────────────────
// Schreibt die aktuelle Positionenliste eines Angebots (Format wie
// gaeb90ZuPositionen() es liefert: {bez,einheit,menge,ep,rabatt}, inkl. der
// "── <Titel> ──"-Gruppenkopfzeilen und "↳ "-Unterpositionen-Präfixe) als
// GAEB90-Datei zurück — die Umkehrung von parseGaeb90()/gaeb90ZuPositionen().
//
// Die Satzart-Konventionen (Spaltenlayout 01/11/12/21/24/25/26) sind gegen
// die echte D83-Beispieldatei abgeglichen; ein Rückimport über parseGaeb90()
// liefert dieselbe Struktur (Titel, OZ, Menge, Einheit, Text) zurück — das
// ist geprüft. NICHT geprüft ist Kompatibilität mit echter GAEB-Fremdsoftware
// (Kopfsatzarten 00/02/03/063/08 wie Kennsatz-Flags oder die Unterpositions-
// Verweisblöcke in Satzart 21/24 sind aus der Beispieldatei nicht vollständig
// rekonstruierbar und werden daher ausgelassen statt geraten). Bepreister
// Export (D84/D86 mit Einheitspreisen) bleibt wie der Import blockiert.

function gaeb90Zeile(satzart, inhalt, satznr) {
  const inhaltGepolstert = (inhalt ?? "").slice(0, 72).padEnd(72, " ");
  return satzart + inhaltGepolstert + String(satznr).padStart(6, "0");
}

// Kehrfunktion zu mengeAusZiffern: Dezimalzahl -> 11-stellige Ziffernfolge
// (8 Vorkomma- + 3 Nachkommastellen).
function ziffernAusMenge(menge) {
  const n = Math.max(0, Math.round((Number(menge) || 0) * 1000));
  return String(n).padStart(11, "0").slice(-11);
}

// Zeilenumbruch an Wortgrenzen statt harter 72-Zeichen-Schnitte: der
// Reimport über parseGaeb90() fügt zwischen Kurztext (25) und jeder
// Langtext-Zeile (26) ein Leerzeichen wieder ein — ein harter Schnitt
// mitten im Wort würde dabei ein falsches Leerzeichen einfügen (oder das
// echte Leerzeichen am Zeilenende verschlucken) und den Text verfälschen.
function inZeilenUmbrechen(text, breite) {
  const woerter = text.split(" ");
  const zeilen = [];
  let aktuell = "";
  for (const wort of woerter) {
    const kandidat = aktuell ? `${aktuell} ${wort}` : wort;
    if (kandidat.length > breite) {
      if (aktuell) zeilen.push(aktuell);
      // Einzelnes Wort länger als die Zeilenbreite: hart schneiden (seltener Rand­fall).
      let rest = wort;
      while (rest.length > breite) { zeilen.push(rest.slice(0, breite)); rest = rest.slice(breite); }
      aktuell = rest;
    } else {
      aktuell = kandidat;
    }
  }
  if (aktuell) zeilen.push(aktuell);
  return zeilen.length ? zeilen : [""];
}

export function gaeb90Schreiben(positionen, { projektTitel = "Angebot" } = {}) {
  let satznr = 1;
  const zeilen = [];
  const add = (satzart, inhalt) => {
    zeilen.push(gaeb90Zeile(satzart, inhalt, satznr));
    satznr++;
  };

  add("01", projektTitel);

  let titelNr = 0;
  let posNr = 0;

  for (const roh of positionen) {
    const bez = roh.bez || "";
    const titelMatch = bez.match(/^──\s*(.+?)\s*──$/);
    if (titelMatch) {
      titelNr++;
      posNr = 0;
      add("11", String(titelNr).padStart(2, "0"));
      add("12", titelMatch[1]);
      continue;
    }

    if (titelNr === 0) { titelNr = 1; add("11", "01"); } // Positionen ohne Gruppenkopf -> impliziter erster Titel

    const istUnterposition = bez.startsWith("↳ ");
    const text = istUnterposition ? bez.slice(2) : bez;
    const einheit = (roh.einheit || "").trim().slice(0, 3);
    const mengeZiffern = ziffernAusMenge(roh.menge);

    if (istUnterposition) {
      add("24", `${String(posNr).padStart(2, "0")}    ${mengeZiffern}${einheit}`);
    } else {
      posNr++;
      const oz = `${String(titelNr).padStart(2, "0")}01`;
      add("21", `${oz}  ${String(posNr).padStart(2, "0")} NNN    ${mengeZiffern}${einheit}`);
    }

    const stuecke = inZeilenUmbrechen(text, 72);
    add("25", stuecke[0]);
    for (const teil of stuecke.slice(1)) add("26", teil);
  }

  add("99", "");
  return zeilen.join("\r\n") + "\r\n";
}

// Liest eine hochgeladene GAEB90-Datei korrekt ein — die Dateien sind
// nicht UTF-8, sondern ANSI/Windows-1252 (deutsche Sonderzeichen würden
// sonst zu Mojibake wie "MÃ¶rtel" statt "Mörtel"). Bewusst ohne
// CP850-Fallback in v1: Windows-1252 ist bei Software aus den letzten
// ~25 Jahren der weit häufigere Fall; eine Erkennung/Umschaltung lohnt
// sich erst, wenn eine echte Datei falsch dekodiert zurückkommt.
export async function gaeb90DateiLesen(file) {
  const buffer = await file.arrayBuffer();
  return new TextDecoder("windows-1252").decode(buffer);
}

// Gegenstück zu gaeb90DateiLesen() für den Export: kodiert Text zurück nach
// Windows-1252 (TextEncoder kann nur UTF-8). Deutsche Umlaute/ß liegen alle
// in 0xA0–0xFF, wo Windows-1252 mit dem Unicode-Codepoint übereinstimmt —
// für diesen Bereich reicht die direkte Byte-Abbildung. Zeichen oberhalb von
// 0xFF (nicht abbildbar) werden durch "?" ersetzt statt falsch kodiert.
export function gaeb90AlsWindows1252(text) {
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    bytes[i] = code <= 0xff ? code : 0x3f;
  }
  return bytes;
}
