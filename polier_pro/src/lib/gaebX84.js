// GAEB-DA-XML-Export Angebotsabgabe (X84, DP=84, GAEB DA XML 3.3) — die
// XML-Variante des bepreisten D84-Exports (gaeb90PreiseSchreiben() in
// gaeb90.js). Öffentliche Auftraggeber und die meisten AVA-Programme
// erwarten heute X84 statt D84.
//
// Struktur wie die importierte X83 (siehe gaebXml.js): BoQBody mit
// verschachtelten <BoQCtgy RNoPart> je OZ-Ebene, darunter <Itemlist><Item>.
// Die Ordnungszahl wird aus pos.oz zerlegt ("01.01.0010" → Gewerk 01,
// Titel 01, Position 0010), damit ein aus einer X83 erzeugtes Angebot mit
// denselben OZ zurückgeht, die die ausschreibende Stelle vergeben hat.
//
// Positionen ohne OZ:
// - Hat KEINE Position eine OZ (eigenes Angebot, nicht aus Ausschreibung),
//   wird automatisch nummeriert: ein Titel "01", Positionen 0010, 0020, …
// - Fehlt sie nur einzelnen Positionen, werden diese mit Warnung
//   übersprungen (Vorbemerkungen ohne Menge und Preis still, sie gehören
//   nicht in die Angebotsabgabe) — eine erfundene OZ würde in der fremden LV-Struktur nicht
//   existieren.
//
// Der Einheitspreis enthält einen Positionsrabatt bereits (UP = EP × (1 −
// Rabatt)), weil X84 je Position nur einen Preis kennt. Gruppen-
// Kopfzeilen ("── … ──") liefern die Titelbezeichnungen (LblTx).

import { positionsart, inSumme } from "./lv.js";

function xmlEscape(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function zahl(n, stellen) {
  return (Math.round((Number(n) || 0) * 10 ** stellen) / 10 ** stellen).toFixed(stellen);
}

function istKopfzeile(p) { return !p?.bez || p.bez.startsWith("──"); }

function kopfLabels(bez) {
  return bez.replace(/^──\s*/, "").replace(/\s*──$/, "").split(" / ").map(s => s.trim());
}

function textXml(text) {
  return `<p><span>${xmlEscape(text)}</span></p>`;
}

// Baum aus Positionen: { kinder: Map<rnopart, knoten>, label, items: [] }
export function baumBauen(positionen, warnungen) {
  const mitOz = positionen.filter(p => !istKopfzeile(p) && p.oz);
  const autoNummer = mitOz.length === 0;
  const wurzel = { kinder: new Map(), items: [] };
  let labels = [];
  let lfd = 0;

  for (const p of positionen) {
    if (p?.bez?.startsWith("──")) { labels = kopfLabels(p.bez); continue; }
    if (istKopfzeile(p)) continue;
    let teile;
    if (autoNummer) {
      lfd += 10;
      teile = ["01", String(lfd).padStart(4, "0")];
    } else if (!p.oz && !(Number(p.menge) > 0) && !(Number(p.ep) > 0)) {
      continue; // Vorbemerkung/Hinweistext aus dem X83-Import, keine Preisposition
    } else if (!p.oz) {
      warnungen.push(`Position "${p.bez}" ohne Ordnungszahl — übersprungen.`);
      continue;
    } else {
      teile = String(p.oz).split(".").filter(Boolean);
      if (teile.length < 2) { warnungen.push(`Position "${p.bez}": Ordnungszahl ${p.oz} ohne Titelebene — übersprungen.`); continue; }
    }
    let knoten = wurzel;
    teile.slice(0, -1).forEach((teil, ebene) => {
      if (!knoten.kinder.has(teil)) {
        knoten.kinder.set(teil, { kinder: new Map(), items: [], label: autoNummer ? "Angebot" : (labels[ebene] || `Titel ${teil}`) });
      }
      knoten = knoten.kinder.get(teil);
    });
    knoten.items.push({ rnopart: teile.at(-1), p });
  }
  return { wurzel, autoNummer };
}

export function ebenenLaengen(knoten, tiefe = 0, laengen = []) {
  for (const [teil, kind] of knoten.kinder) {
    laengen[tiefe] = Math.max(laengen[tiefe] || 0, teil.length);
    ebenenLaengen(kind, tiefe + 1, laengen);
  }
  for (const { rnopart } of knoten.items) laengen.item = Math.max(laengen.item || 0, rnopart.length);
  return laengen;
}

// Bedarfs- und Alternativpositionen ohne Gesamtbetrag als Provis
// "WithoutTotal" (Alternativen ohne Gruppenbezug, da Polaris keine
// Grundposition-Zuordnung führt), Bedarf mit GB als "WithTotal".
const PROVIS = { bedarf: "WithoutTotal", alternativ: "WithoutTotal", bedarf_mit: "WithTotal" };

function itemXml({ rnopart, p }, id) {
  const up = (Number(p.ep) || 0) * (1 - (Number(p.rabatt) || 0) / 100);
  const it = up * (Number(p.menge) || 0);
  const langtext = p.langtext ? textXml(p.langtext) : "";
  const provis = PROVIS[positionsart(p)];
  const bez = String(p.bez).replace(/^\[[^\]]+\]\s*/, "");
  return `<Item ID="I${id}" RNoPart="${xmlEscape(rnopart)}">`
    + `<Qty>${zahl(p.menge, 3)}</Qty><QU>${xmlEscape(p.einheit || "")}</QU>`
    + (provis ? `<Provis>${provis}</Provis>` : "")
    + `<UP>${zahl(up, 2)}</UP><IT>${zahl(it, 2)}</IT>`
    + `<Description>${p.stlk ? `<StLNo Type="StLK">${xmlEscape(p.stlk)}</StLNo>` : ""}`
    + `<CompleteText><DetailTxt><Text>${textXml(bez)}${langtext}</Text></DetailTxt>`
    + `<OutlineText><OutlTxt><TextOutlTxt>${textXml(bez.slice(0, 70))}</TextOutlTxt></OutlTxt></OutlineText>`
    + `</CompleteText></Description></Item>`;
}

function bodyXml(knoten, zaehler) {
  let summe = 0;
  let xml = "<BoQBody>";
  for (const [teil, kind] of knoten.kinder) {
    const inner = bodyXml(kind, zaehler);
    summe += inner.summe;
    xml += `<BoQCtgy ID="C${zaehler.n++}" RNoPart="${xmlEscape(teil)}"><LblTx>${textXml(kind.label)}</LblTx>`
      + inner.xml + `<Totals><Total>${zahl(inner.summe, 2)}</Total></Totals></BoQCtgy>`;
  }
  if (knoten.items.length) {
    xml += "<Itemlist>";
    for (const item of knoten.items) {
      const up = (Number(item.p.ep) || 0) * (1 - (Number(item.p.rabatt) || 0) / 100);
      if (inSumme(item.p)) summe += Math.round(up * (Number(item.p.menge) || 0) * 100) / 100;
      zaehler.items++;
      xml += itemXml(item, zaehler.n++);
    }
    xml += "</Itemlist>";
  }
  return { xml: xml + "</BoQBody>", summe };
}

export function gaebX84Schreiben(positionen, { projektTitel = "Angebot", datum = new Date().toISOString().slice(0, 10), bieter = null } = {}) {
  const warnungen = [];
  const { wurzel } = baumBauen(positionen || [], warnungen);
  const laengen = ebenenLaengen(wurzel);
  const bkdn = [];
  for (let i = 0; i < laengen.length; i++) {
    bkdn.push(`<BoQBkdn><Type>BoQLevel</Type><Length>${laengen[i] || 2}</Length><Num>Yes</Num></BoQBkdn>`);
  }
  bkdn.push(`<BoQBkdn><Type>Item</Type><Length>${laengen.item || 4}</Length><Num>Yes</Num></BoQBkdn>`);
  const zaehler = { n: 1, items: 0 };
  const { xml: body, summe } = bodyXml(wurzel, zaehler);
  const anzahl = zaehler.items;

  const ctr = bieter?.name
    ? `<CTR><Address><Name1>${xmlEscape(bieter.name)}</Name1>${bieter.strasse ? `<Street>${xmlEscape(bieter.strasse)}</Street>` : ""}`
      + `${bieter.plz ? `<PCode>${xmlEscape(bieter.plz)}</PCode>` : ""}${bieter.ort ? `<City>${xmlEscape(bieter.ort)}</City>` : ""}</Address></CTR>`
    : "";

  const text = `<?xml version="1.0" encoding="UTF-8"?>
<GAEB xmlns="http://www.gaeb.de/GAEB_DA_XML/DA84/3.3">
<GAEBInfo><Version>3.3</Version><VersDate>2021-05</VersDate><Date>${datum}</Date><ProgSystem>Polaris</ProgSystem><ProgName>Polaris</ProgName></GAEBInfo>
<PrjInfo><LblPrj>${xmlEscape(projektTitel)}</LblPrj><Cur>EUR</Cur><CurLbl>Euro</CurLbl></PrjInfo>
<Award><DP>84</DP><AwardInfo><Cur>EUR</Cur><CurLbl>Euro</CurLbl></AwardInfo>${ctr}
<BoQ ID="BoQ1"><BoQInfo><LblBoQ>${xmlEscape(projektTitel)}</LblBoQ><Date>${datum}</Date>${bkdn.join("")}<Totals><Total>${zahl(summe, 2)}</Total></Totals></BoQInfo>
${body}
</BoQ></Award>
</GAEB>
`;
  return { text, warnungen, anzahl, summe: Math.round(summe * 100) / 100 };
}
