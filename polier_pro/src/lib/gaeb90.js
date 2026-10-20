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
// Noch NICHT abgedeckt (v1): Vertragliche-Regelungen-Vorspann (Satzart
// T0/T1/T9, wird übersprungen), Ausfüll-Platzhalter in Katalogtexten
// (z.B. "41A"-Marker). D84/D86 mit Einheitspreisen: siehe parseGaeb90Preise()
// weiter unten — eigener Parser, da diese Dateien strukturell anders
// aufgebaut sind (reine Preisliste ohne Text/Titel).

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
      // OZ wird mitgeführt (sonst ungenutzt), damit ein später hochgeladenes
      // bepreistes D84/D86 (siehe gaeb90PreiseEinspielen()) den EP dieser
      // Position wiederfinden und nachtragen kann. stlk (nur bei GAEB-XML-
      // Quellen vorhanden, siehe gaebXml.js) analog für den Mutter-LV-
      // Preisabgleich über Ausschreibungen hinweg (siehe lib/mutterlv.js).
      ...(p.oz ? { oz: p.oz } : {}),
      ...(p.stlk ? { stlk: p.stlk } : {}),
    });
  }
  return ergebnis;
}

// ── Bepreister Import (D84/D86) ────────────────────────────────────────────
// D84/D86 sind reine Preislisten (Satzart 23 = Position mit EP+GP, Satzart
// 32 = Zwischensumme je Titel-/Untertitelebene) OHNE eigenen Text — anders
// als D81/D83 fehlen Satzart 25/26 (Kurz-/Langtext) und 11/12 (Titel-
// struktur) komplett. Sie sind als Preis-Overlay gedacht, das über die
// Ordnungszahl (OZ) auf eine bereits bekannte, unbepreiste LV-Struktur
// gelegt wird. Zwei Wege: gaeb90PreiseEinspielen() für den Merge auf
// vorhandene (importierte) Positionen, gaeb90PreiseZuPositionen() als
// eigenständiger Import, falls noch keine passende LV-Struktur vorliegt.
//
// Gegen eine echte, bepreiste D84-Beispieldatei verifiziert (54 Positionen
// über 3 Titel/10 Untertitel, Summen exakt gegen das dazugehörige
// Angebots-PDF desselben Projekts abgeglichen).

// 8-stellige OZ: 2 Titel + 2 Untertitel + 4 Positionsnummer, z.B.
// "01010010" -> "01.01.0010" — punktiert, konsistent mit der OZ-Notation
// in Angebots-/LV-Dokumenten dieses GAEB90-Dialekts (vierstellige statt
// wie bei D81/D83 zweistellige Positionsnummern je Untertitel).
function ozAusZiffern(acht) {
  return `${acht.slice(0, 2)}.${acht.slice(2, 4)}.${acht.slice(4, 8)}`;
}

export function parseGaeb90Preise(text) {
  const zeilen = text.split(/\r?\n/);
  const warnungen = [];
  const preise = [];

  for (const rohzeile of zeilen) {
    if (rohzeile.length < 2) continue;
    const satzart = rohzeile.slice(0, 2);
    let rest = rohzeile.slice(2);
    const moeglSatznr = rest.slice(-6);
    if (/^\d{6}$/.test(moeglSatznr) && rest.length > 6) rest = rest.slice(0, -6);
    rest = rest.replace(/\s+$/, "");

    if (satzart === "23") {
      // "01010010  00004482000 000000448200" bzw. mit Index-Suffix
      // "01010010a 00000889390 000000355756" (Bedarfs-/Zulage-Variante
      // derselben Position) — EP 11-stellig (8+3 Nachkommastellen wie das
      // Menge-Feld), GP 12-stellig (10+2 Nachkommastellen).
      const m = rest.match(/^(\d{8})([a-zA-Z]?)\s+(\d{11})\s(\d{12})/);
      if (!m) {
        warnungen.push(`Preisposition nicht erkannt: "${rest}"`);
        continue;
      }
      const [, acht, suffix, epZiffern, gpZiffern] = m;
      preise.push({
        oz: ozAusZiffern(acht) + suffix,
        ep: Number(epZiffern) / 1000,
        gp: Number(gpZiffern) / 100,
      });
      continue;
    }
    if (satzart === "32" || satzart === "99") continue; // Zwischensumme/Dateiende, keine Positionsdaten
    // 00/01/02/03/04/06/08 (Kopfdaten) und alles Unbekannte: v1 ignoriert.
  }

  return { preise, warnungen };
}

// Eigenständiger Import ohne vorhandene LV-Struktur: OZ als Bezeichnung,
// Menge aus GP/EP zurückgerechnet (D84 selbst enthält kein eigenes
// Mengenfeld — nur Einheitspreis und Gesamtbetrag).
export function gaeb90PreiseZuPositionen({ preise }) {
  let idBasis = Date.now();
  return preise.map(p => ({
    id: idBasis++,
    bez: `Position ${p.oz}`,
    einheit: "",
    menge: p.ep > 0 ? Math.round((p.gp / p.ep) * 1000) / 1000 : 1,
    ep: p.ep,
    rabatt: 0,
    oz: p.oz,
  }));
}

// Preis-Merge: aktualisiert den EP bereits vorhandener Positionen (z.B. aus
// einem vorherigen unbepreisten GAEB-Import, siehe oz-Feld oben) anhand der
// Ordnungszahl — nur Positionen mit passender OZ werden verändert, alles
// andere (Gruppen-Kopfzeilen, Positionen ohne OZ, manuell angelegte Zeilen)
// bleibt unangetastet.
export function gaeb90PreiseEinspielen(positionen, preise) {
  const preisNachOz = new Map(preise.map(p => [p.oz, p]));
  let treffer = 0;
  const aktualisiert = positionen.map(p => {
    if (!p.oz || !preisNachOz.has(p.oz)) return p;
    treffer++;
    return { ...p, ep: preisNachOz.get(p.oz).ep };
  });
  return { positionen: aktualisiert, treffer, fehlend: preise.length - treffer };
}

function gaeb90Zeile(satzart, inhalt, satznr) {
  const inhaltGepolstert = (inhalt ?? "").slice(0, 72).padEnd(72, " ");
  return satzart + inhaltGepolstert + String(satznr).padStart(6, "0");
}

// Dezimalzahl -> Ziffernfolge fester Breite (Kehrfunktion zum jeweiligen
// Ziffern-Divisor in parseGaeb90Preise: EP durch 1000, GP durch 100).
function ziffernAusBetrag(betrag, nachkommastellen, gesamtstellen) {
  const n = Math.max(0, Math.round((Number(betrag) || 0) * 10 ** nachkommastellen));
  return String(n).padStart(gesamtstellen, "0").slice(-gesamtstellen);
}

// "01.01.0010" bzw. "01.01.0010a" -> ["01010010", "a"] — Kehrfunktion zu
// ozAusZiffern() oben. Nur das 2+2+4-stellige Format dieses Dialekts (siehe
// ozAusZiffern()) wird unterstützt: eine Position, deren OZ aus dem älteren,
// unbepreisten D81/D83-Import stammt (dort "Untertitel.PosNr", z.B.
// "0101.30" statt "01.01.0010" — siehe parseGaeb90()/case "21") hat eine
// andere Zählweise und wird bewusst nicht geraten, sondern mit Warnung
// übersprungen (siehe gaeb90PreiseSchreiben()).
function ozZiffernAusOz(oz) {
  const m = String(oz).match(/^(\d{2})\.(\d{2})\.(\d{4})([a-zA-Z]?)$/);
  return m ? [m[1] + m[2] + m[3], m[4] || ""] : null;
}

// ── Bepreister Export (D84/D86) ────────────────────────────────────────────
// Schreibt eine bepreiste GAEB90-Preisdatei (Satzart 23 je Position) aus der
// aktuellen Positionenliste eines Angebots — Umkehrung von
// parseGaeb90Preise(). Reine Preisliste ohne Text/Titel (identisch zum
// echten D84-Format, siehe Datei-Kommentar oben bei "Bepreister Import"):
// jede Position braucht dafür bereits eine Ordnungszahl (oz) im 2+2+4-
// stelligen Format dieses Dialekts — die kommt aus einem vorherigen GAEB-XML-
// Import (Ausschreibung/LV, siehe gaebXml.js) oder dem Mutter-LV-Abgleich
// (lib/mutterlv.js). Eine manuell angelegte Position oder eine mit OZ aus
// dem älteren D81/D83-Import hat keine passende bzw. keine Ordnungszahl und
// wird mit Warnung übersprungen statt eine zu erfinden.
//
// Kopfsatzarten nur so weit geschrieben, wie aus den Angebotsdaten
// rekonstruierbar (01 Projekttitel, 08 Währung) — Vendor-spezifische
// Kennsatzfelder (Satzart 00/02/03/06x, siehe gaeb90Schreiben()-Kommentar)
// werden wie beim unbepreisten Export ausgelassen statt geraten. Satzart 32
// (Zwischensummen je Titel-/Untertitelebene) fehlt bewusst — informativ für
// einen Leser, aber ohne eigene Preisdaten, die ein Rückimport bräuchte.
export function gaeb90PreiseSchreiben(positionen, { projektTitel = "Angebot" } = {}) {
  let satznr = 1;
  const zeilen = [];
  const warnungen = [];
  const add = (satzart, inhalt) => {
    zeilen.push(gaeb90Zeile(satzart, inhalt, satznr));
    satznr++;
  };

  add("01", projektTitel);
  add("08", "EUR   EURO");

  for (const p of positionen) {
    if (!p.bez || p.bez.startsWith("──")) continue; // Gruppenkopfzeile, keine Preiszeile
    if (!p.oz) { warnungen.push(`Position "${p.bez}" ohne Ordnungszahl — übersprungen.`); continue; }
    const ozTeile = ozZiffernAusOz(p.oz);
    if (!ozTeile) { warnungen.push(`Ordnungszahl "${p.oz}" nicht im erwarteten Format (TT.UU.PPPP) — übersprungen.`); continue; }
    const [ziffern, suffix] = ozTeile;
    const epEffektiv = (p.ep || 0) * (1 - (p.rabatt || 0) / 100);
    const gp = epEffektiv * (p.menge || 0);
    const polster = suffix ? " " : "  "; // OZ+Suffix zusammen immer auf Spalte 10 auffüllen
    add("23", `${ziffern}${suffix}${polster}${ziffernAusBetrag(epEffektiv, 3, 11)} ${ziffernAusBetrag(gp, 2, 12)}`);
  }

  add("99", "");
  return { text: zeilen.join("\r\n") + "\r\n", warnungen };
}

// ── Export (unbepreist) ─────────────────────────────────────────────────────
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
// Export: siehe gaeb90PreiseSchreiben() oben (eigener Satzart-23-Writer,
// da D84/D86 strukturell anders aufgebaut sind — reine Preisliste ohne Text).

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
