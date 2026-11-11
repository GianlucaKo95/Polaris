// GAEB DA XML 3.3 Mengenermittlung (X31) — das Aufmaß zur Abrechnung.
// Je Position die bisher erbrachte Menge (Vertragsmenge × Leistungsstand
// aus dem Baufortschritt), in derselben OZ-Struktur wie Angebot/X84.
//
// Aufbau wie in der GAEB-Spezifikation für Phase 31 (Wurzel QtyDeterm statt
// Award, Menge je Item in <QtyDeterm><Qty>). Detaillierte Aufmaßzeilen
// nach REB 23.003 (<QDetermItem><QTakeoff Row="…">) werden nicht erzeugt —
// Polaris erfasst Leistungsstände in Prozent, keine Einzelmaße. Für die
// meisten Abrechnungen reicht die Menge je Position; wer Aufmaßblätter mit
// Rechenansätzen braucht, erstellt sie weiterhin im Aufmaßprogramm.

import { baumBauen, ebenenLaengen } from "./gaebX84.js";

function xmlEscape(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
const zahl = (n, st = 3) => (Math.round((Number(n) || 0) * 10 ** st) / 10 ** st).toFixed(st);

function bodyXml(knoten, ids) {
  let xml = "<BoQBody>";
  for (const [teil, kind] of knoten.kinder) {
    xml += `<BoQCtgy ID="C${ids.n++}" RNoPart="${xmlEscape(teil)}">${bodyXml(kind, ids)}</BoQCtgy>`;
  }
  if (knoten.items.length) {
    xml += "<Itemlist>";
    for (const { rnopart, p } of knoten.items) {
      xml += `<Item ID="I${ids.n++}" RNoPart="${xmlEscape(rnopart)}"><QtyDeterm><Qty>${zahl(p.menge)}</Qty></QtyDeterm></Item>`;
      ids.items++;
    }
    xml += "</Itemlist>";
  }
  return xml + "</BoQBody>";
}

// auftrag: angenommenes Angebot; fortschritt: [{position_id, prozent}]
export function gaebX31Schreiben({ auftrag, fortschritt, projekt, bieter, datum = new Date().toISOString().slice(0, 10) }) {
  const prozent = new Map((fortschritt || []).map(f => [String(f.position_id), Number(f.prozent) || 0]));
  const positionen = (auftrag?.positionen || []).map(p => {
    if (!p?.bez || p.bez.startsWith("──")) return p;
    const pr = prozent.get(String(p.id)) || 0;
    return { ...p, menge: (Number(p.menge) || 0) * pr / 100, ep: 0 };
  });
  const warnungen = [];
  const { wurzel } = baumBauen(positionen, warnungen);
  const laengen = ebenenLaengen(wurzel);
  const bkdn = [];
  for (let i = 0; i < laengen.length; i++) bkdn.push(`<BoQBkdn><Type>BoQLevel</Type><Length>${laengen[i] || 2}</Length></BoQBkdn>`);
  bkdn.push(`<BoQBkdn><Type>Item</Type><Length>${laengen.item || 4}</Length></BoQBkdn>`);
  const ids = { n: 1, items: 0 };
  const body = bodyXml(wurzel, ids);
  const ctr = bieter?.name ? `<CTR><Address><Name1>${xmlEscape(bieter.name)}</Name1></Address></CTR>` : "";
  const text = `<?xml version="1.0" encoding="UTF-8"?>
<GAEB xmlns="http://www.gaeb.de/GAEB_DA_XML/DA31/3.3">
<GAEBInfo><Version>3.3</Version><VersDate>2021-05</VersDate><Date>${datum}</Date><ProgSystem>Polaris</ProgSystem><ProgName>Polaris</ProgName></GAEBInfo>
<QtyDeterm><PrjInfo><RefPrjName>${xmlEscape(projekt?.name || auftrag?.titel || "")}</RefPrjName></PrjInfo>
<QtyDetermInfo><MethodDescription>Leistungsstand je Position</MethodDescription><OrdDescr>${xmlEscape(auftrag?.titel || "")}</OrdDescr><ServiceProvisionEndDate>${datum}</ServiceProvisionEndDate></QtyDetermInfo>
<DP>31</DP>${ctr}
<BoQ ID="B1"><RefBoQName>${xmlEscape(auftrag?.titel || "")}</RefBoQName>${bkdn.join("")}
${body}
</BoQ></QtyDeterm>
</GAEB>
`;
  return { text, warnungen, anzahl: ids.items };
}
