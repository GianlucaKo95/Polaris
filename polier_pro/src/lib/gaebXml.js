// GAEB-DA-XML-Import (X83, DP=83 — unbepreiste LV-Phase, das XML-basierte
// Nachfolgeformat von GAEB90). Liefert dieselbe Zwischenstruktur wie
// parseGaeb90() ({ projektTitel, positionen, warnungen }), damit
// gaeb90ZuPositionen() (siehe gaeb90.js) unverändert weiterverwendet werden
// kann — ein X83-Import landet also in derselben Positionenliste wie ein
// GAEB90-Import.
//
// Struktur (gegen eine echte, mit AVANTI pro 2024 / GXML Toolbox erzeugte
// Datei verifiziert): <BoQBody> verschachtelt zwei Ebenen <BoQCtgy
// RNoPart="NN"> (laut <BoQBkdn> dieser Datei: Gewerk, Titel) ineinander,
// darunter <Itemlist><Item RNoPart="NNNN"> je Position. Die Ordnungszahl
// wird aus den RNoPart-Werten aller Ebenen zusammengesetzt ("01.01.0010"),
// kompatibel zum D84-OZ-Format (siehe gaeb90PreiseEinspielen() in gaeb90.js)
// — ein unbepreister X83-Import und ein nachträglich eingespieltes D84
// greifen damit auf dieselbe OZ.
//
// Freitext (<Remark>) kommt auf jeder Ebene vor (Vorbemerkungen,
// abschnittsweise Zwischentexte) und wird wie bei parseGaeb90() als eigener
// "hinweis"-Eintrag ohne Menge/Preis übernommen.
//
// Der eigentliche Positions-/Vorbemerkungstext liegt nicht als Plaintext,
// sondern als einfaches HTML-artiges Markup vor (<CompleteText><DetailTxt>
// mit einem <p><span>Text</span></p> je zeilenumbrochener Zeile, dazu
// gelegentlich <TextComplement>-Ausfüll-Platzhalter mit vorausgefülltem
// Wert) — plainTextAusXml() zieht daraus den reinen Text, Absätze mit einem
// Leerzeichen verbunden (dieselbe Konvention wie beim Langtext-Zusammenbau
// aus den GAEB90-Satzarten 25/26).
//
// Es wird bewusst kein XML-DOM-Parser verwendet: Node (Testlauf via
// `npm test`) hat keinen eingebauten DOMParser, und eine zusätzliche
// Abhängigkeit nur für diesen Import lohnt sich nicht. Statt eines naiven,
// nicht-gierigen Regex (der bei gleichnamigen verschachtelten Tags wie
// <BoQCtgy> in <BoQCtgy> das jeweils erste, zu früh liegende End-Tag
// träfe) zählt findeSchliessendesTag() die Verschachtelungstiefe mit.

function xmlEntityDekodieren(s) {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&amp;/g, "&");
}

// Findet zu einem bereits konsumierten öffnenden Tag (start = Index direkt
// nach dessen ">") das korrekt zugehörige schließende Tag — verschachtelte
// Vorkommen desselben Tag-Namens erhöhen/senken dabei eine Tiefe, statt
// naiv das nächstbeste "</tag>" zu nehmen. Gibt den Index des "<" des
// schließenden Tags zurück, oder -1 bei unausgeglichenem Markup.
function findeSchliessendesTag(text, start, tag) {
  const openRe = new RegExp(`<${tag}\\b[^>]*?(/?)>`, "g");
  const closeRe = new RegExp(`</${tag}>`, "g");
  let tiefe = 1;
  let pos = start;
  while (tiefe > 0) {
    openRe.lastIndex = pos;
    closeRe.lastIndex = pos;
    const om = openRe.exec(text);
    const cm = closeRe.exec(text);
    if (!cm) return -1;
    if (om && om.index < cm.index) {
      if (!om[1]) tiefe++; // selbstschließendes <tag/> öffnet keine neue Ebene
      pos = om.index + om[0].length;
    } else {
      tiefe--;
      pos = cm.index + cm[0].length;
    }
  }
  return pos - `</${tag}>`.length;
}

// Liefert alle direkten Kindelemente von 'fragment', deren Tag-Name in
// 'tagNamen' enthalten ist, verschachtelungssicher (siehe oben) — andere,
// nicht gesuchte Tags dazwischen werden einfach überlesen.
function direkteKinder(fragment, tagNamen) {
  const ergebnis = [];
  const tagMuster = tagNamen.join("|");
  const openRe = new RegExp(`<(${tagMuster})\\b([^>]*?)(/?)>`, "g");
  let suchAb = 0;
  while (suchAb <= fragment.length) {
    openRe.lastIndex = suchAb;
    const m = openRe.exec(fragment);
    if (!m) break;
    const [ganz, tag, attrs, selbstschliessend] = m;
    const inhaltStart = m.index + ganz.length;
    if (selbstschliessend) {
      ergebnis.push({ tag, attrs, inhalt: "" });
      suchAb = inhaltStart;
      continue;
    }
    const closeIdx = findeSchliessendesTag(fragment, inhaltStart, tag);
    if (closeIdx === -1) {
      ergebnis.push({ tag, attrs, inhalt: fragment.slice(inhaltStart) });
      break;
    }
    ergebnis.push({ tag, attrs, inhalt: fragment.slice(inhaltStart, closeIdx) });
    suchAb = closeIdx + `</${tag}>`.length;
  }
  return ergebnis;
}

// Reiner Text aus einem CompleteText/DetailTxt- (oder LblTx-)Fragment: je
// <p>...</p>-Absatz werden alle enthaltenen <span>-Texte direkt
// aneinandergehängt (auch die von <TextComplement>-Platzhaltern, deren
// Caption/Body/Tail je ein eigenes <span> führen — "Fuge "+"zwischen
// Betonfahrbahnplatten"+" " ergibt so den vorausgefüllten Satz), die
// Absätze selbst werden mit einem Leerzeichen verbunden.
function plainTextAusXml(fragment) {
  const absaetze = fragment.match(/<p\b[^>]*?(?:\/>|>[\s\S]*?<\/p>)/g) || [];
  const zeilen = absaetze.map(p => {
    const spans = p.match(/<span\b[^>]*>[\s\S]*?<\/span>/g) || [];
    return spans
      .map(s => xmlEntityDekodieren(s.replace(/^<span\b[^>]*>/, "").replace(/<\/span>$/, "")))
      .join("");
  });
  return zeilen.join(" ").replace(/\s+/g, " ").trim();
}

// Volltext (DetailTxt) aus einem <Description>- oder <Remark>-Fragment.
function beschreibungsTextAus(fragment) {
  const m = fragment.match(/<DetailTxt>([\s\S]*?)<\/DetailTxt>/);
  return m ? plainTextAusXml(m[1]) : "";
}

// <Provis>-Feld: markiert Eventual-/Bedarfspositionen, "WithTotal" = in der
// Angebotssumme enthalten, "WithoutTotal" = separat (z.B. Stundenlohn-
// arbeiten) — Pendant zum "E" in der GAEB90-Positionsart (siehe gaeb90.js).
function provisLabel(wert) {
  if (wert === "WithTotal") return "Bedarfsposition";
  if (wert === "WithoutTotal") return "Bedarfsposition (nicht in Angebotssumme enthalten)";
  return null;
}

function itemVerarbeiten(itemKind, titelPfad, ozPfad, positionen, warnungen) {
  const rnopart = (itemKind.attrs.match(/RNoPart="([^"]*)"/) || [])[1] || "";
  const oz = [...ozPfad, rnopart].join(".");
  const inhalt = itemKind.inhalt;
  const qtyM = inhalt.match(/<Qty>([^<]*)<\/Qty>/);
  const quM = inhalt.match(/<QU>([^<]*)<\/QU>/);
  const provisM = inhalt.match(/<Provis>([^<]*)<\/Provis>/);
  const descKind = direkteKinder(inhalt, ["Description"])[0];
  const bez = descKind ? beschreibungsTextAus(descKind.inhalt) : "";
  if (!bez) warnungen.push(`Position ${oz}: kein Text gefunden`);
  const art = provisM ? provisLabel(provisM[1]) : null;
  positionen.push({
    typ: "position",
    titelPfad: titelPfad.join(" / "),
    oz,
    art,
    bez: art ? `[${art}] ${bez}` : bez,
    menge: qtyM ? Number(qtyM[1]) || 0 : 0,
    einheit: (quM ? quM[1] : "").trim(),
    ep: 0,
  });
}

function boQBodyVerarbeiten(fragment, titelPfad, ozPfad, positionen, warnungen) {
  for (const kind of direkteKinder(fragment, ["Remark", "BoQCtgy", "Itemlist"])) {
    if (kind.tag === "Remark") {
      const bez = beschreibungsTextAus(kind.inhalt);
      if (bez) positionen.push({ typ: "hinweis", titelPfad: titelPfad.join(" / "), bez, menge: 0, einheit: "", ep: 0 });
      continue;
    }
    if (kind.tag === "BoQCtgy") {
      const rnopart = (kind.attrs.match(/RNoPart="([^"]*)"/) || [])[1] || "";
      const lblKind = direkteKinder(kind.inhalt, ["LblTx"])[0];
      const label = lblKind ? plainTextAusXml(lblKind.inhalt) : "";
      const neuerOzPfad = [...ozPfad, rnopart];
      const neuerTitelPfad = [...titelPfad, `T${neuerOzPfad.join("")}: ${label}`];
      const bodyKind = direkteKinder(kind.inhalt, ["BoQBody"])[0];
      if (bodyKind) boQBodyVerarbeiten(bodyKind.inhalt, neuerTitelPfad, neuerOzPfad, positionen, warnungen);
      continue;
    }
    // Itemlist: enthält Items und gelegentlich eigene Hinweis-Remarks.
    for (const itemKind of direkteKinder(kind.inhalt, ["Remark", "Item"])) {
      if (itemKind.tag === "Remark") {
        const bez = beschreibungsTextAus(itemKind.inhalt);
        if (bez) positionen.push({ typ: "hinweis", titelPfad: titelPfad.join(" / "), bez, menge: 0, einheit: "", ep: 0 });
      } else {
        itemVerarbeiten(itemKind, titelPfad, ozPfad, positionen, warnungen);
      }
    }
  }
}

export function parseGaebXml(text) {
  const warnungen = [];
  const positionen = [];

  const projektMatch = text.match(/<LblPrj>([\s\S]*?)<\/LblPrj>/);
  const projektTitel = projektMatch ? xmlEntityDekodieren(projektMatch[1]).trim() : "";

  const startTag = "<BoQBody>";
  const startIdx = text.indexOf(startTag);
  if (startIdx === -1) {
    warnungen.push("Kein <BoQBody> gefunden — ist das eine GAEB-DA-XML-Datei (DP=83)?");
    return { projektTitel, positionen, warnungen };
  }
  const inhaltStart = startIdx + startTag.length;
  const closeIdx = findeSchliessendesTag(text, inhaltStart, "BoQBody");
  const boQBodyInhalt = closeIdx === -1 ? text.slice(inhaltStart) : text.slice(inhaltStart, closeIdx);

  boQBodyVerarbeiten(boQBodyInhalt, [], [], positionen, warnungen);
  return { projektTitel, positionen, warnungen };
}

// GAEB-DA-XML-Dateien sind UTF-8 (anders als die ANSI/Windows-1252-codierten
// GAEB90-Dateien, siehe gaeb90DateiLesen()) — ein einfacher file.text()-Read
// reicht.
export async function gaebXmlDateiLesen(file) {
  return file.text();
}
