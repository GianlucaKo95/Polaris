// Angebot als druckfertiges HTML (für druckePDF in lib/pdf.jsx) aus einem
// Kalkulationsstand: Kopf, LV mit Titelsummen, Summenblock. Bedarfs- und
// Alternativpositionen erscheinen mit EP, aber ohne Betrag in der Summe.

import { baumIndex, summen, gpCent, rundeCent } from "./lvBaum.js";

const esc = s => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const eur = x => (Number(x) || 0).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const mng = x => (Number(x) || 0).toLocaleString("de-DE", { maximumFractionDigits: 3 });
const ART_TEXT = { bedarf: "Bedarfsposition, nicht in der Summe", bedarf_mit: "Bedarfsposition", alternativ: "Alternativposition, nicht in der Summe", zulage: "Zulage", pauschal: "Pauschal" };

// Ist der Kurztext nur der gekürzte Anfang des Langtexts (GAEB-Import),
// wird nur der Langtext gedruckt.
export function druckTexte(k) {
  const kurz = String(k.kurztext || "");
  const lang = String(k.langtext || "");
  const stamm = kurz.replace(/\s*…$/, "").trim();
  if (lang && stamm && lang.replace(/\s+/g, " ").startsWith(stamm.replace(/\s+/g, " "))) return { kurz: "", lang };
  return { kurz, lang };
}

export function angebotSummen(knoten, stand) {
  const netto = summen(knoten).gesamtCent / 100;
  const nachlass = Number(stand?.nachlass) || 0;
  const nachlassBetrag = rundeCent(netto * nachlass / 100);
  const nettoNach = rundeCent(netto - nachlassBetrag);
  const mwst = Number(stand?.mwst ?? 19);
  const steuer = rundeCent(nettoNach * mwst / 100);
  return { netto, nachlass, nachlassBetrag, nettoNach, mwst, steuer, brutto: rundeCent(nettoNach + steuer) };
}

export function angebotHtml(knoten, { stand, projekt, firma = {}, datum = new Date().toISOString().slice(0, 10), gueltigBis = null, mitLangtext = true, einleitung = "" } = {}) {
  const index = baumIndex(knoten);
  const sm = summen(knoten, index);
  const s = angebotSummen(knoten, stand);
  const zeilen = [];
  const lauf = (parent, tiefe) => {
    for (const k of index.kinderVon(parent)) {
      if (k.typ === "titel") {
        zeilen.push(`<tr class="titel"><td>${esc(k.oz)}</td><td colspan="4" style="padding-left:${tiefe * 10}px">${esc(k.kurztext)}</td><td class="r"></td></tr>`);
        lauf(k.id, tiefe + 1);
        zeilen.push(`<tr class="tsumme"><td></td><td colspan="4" style="padding-left:${tiefe * 10}px">Summe ${esc(k.oz)} ${esc(k.kurztext)}</td><td class="r">${eur((sm.jeKnoten.get(k.id) || 0) / 100)}</td></tr>`);
      } else if (k.typ === "hinweis") {
        if (k.extra?.unterbeschreibung) continue;
        const t = druckTexte(k);
        zeilen.push(`<tr class="hinweis"><td></td><td colspan="5">${esc([t.kurz, mitLangtext || !t.kurz ? t.lang : ""].filter(Boolean).join("\n")).replace(/\n/g, "<br>")}</td></tr>`);
      } else {
        const ohneSumme = k.art === "bedarf" || k.art === "alternativ";
        const gp = gpCent(k) / 100;
        const art = ART_TEXT[k.art] ? `<div class="art">${ART_TEXT[k.art]}</div>` : "";
        const rabatt = Number(k.rabatt) ? `<div class="art">abzüglich ${mng(k.rabatt)} % Rabatt</div>` : "";
        const t = druckTexte(k);
        const kopfText = t.kurz ? `<div>${esc(t.kurz)}</div>` : "";
        const langText = (mitLangtext || !t.kurz) && t.lang ? `<div class="${t.kurz ? "lang" : ""}">${esc(t.lang).replace(/\n/g, "<br>")}</div>` : "";
        zeilen.push(`<tr><td>${esc(k.oz)}</td><td>${art}${kopfText}${langText}${rabatt}</td>`
          + `<td class="r">${mng(k.menge)}</td><td>${esc(k.einheit)}</td><td class="r">${eur(k.ep)}</td><td class="r">${ohneSumme ? `(${eur(gp)})` : eur(gp)}</td></tr>`);
      }
    }
  };
  lauf(null, 0);
  const titel = stand?.bezeichnung || "Angebot";
  const adresse = [firma.adresse, [firma.plz, firma.ort].filter(Boolean).join(" ")].filter(Boolean).join(" · ");
  return `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><title>${esc(titel)}</title><style>
body{font-family:Helvetica,Arial,sans-serif;font-size:9.5pt;color:#16181D;margin:0}
.page{width:794px;padding:48px 52px;box-sizing:border-box}
.kopf{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #16181D;padding-bottom:12px;margin-bottom:20px}
.firma{font-size:13pt;font-weight:bold}.klein{font-size:8.5pt;color:#555}
h1{font-size:16pt;margin:0 0 4px}.meta td{padding:1px 12px 1px 0;font-size:9pt}
table.lv{width:100%;border-collapse:collapse;margin-top:16px}
table.lv th{text-align:left;font-weight:normal;color:#555;border-bottom:1px solid #999;padding:4px;font-size:8.5pt}
table.lv td{padding:4px;vertical-align:top;border-bottom:1px solid #e5e5e5}
.r{text-align:right;white-space:nowrap}.titel td{font-weight:bold;background:#f2f2f0}.tsumme td{font-style:italic;color:#444;border-bottom:1px solid #bbb}
.hinweis td{color:#555;font-size:8.5pt}.lang{color:#555;font-size:8.5pt;margin-top:2px;white-space:normal}.art{font-size:8pt;color:#9A3412}
.summen{margin-top:16px;margin-left:auto;width:320px}.summen div{display:flex;justify-content:space-between;padding:3px 0}
.summen .gesamt{border-top:2px solid #16181D;font-weight:bold;font-size:11pt;padding-top:6px}
.fuss{margin-top:28px;font-size:8.5pt;color:#555}
</style></head><body><div class="page">
<div class="kopf"><div><div class="firma">${esc(firma.name || "")}</div><div class="klein">${esc(adresse)}</div></div>
<div class="klein" style="text-align:right">${esc(firma.telefon || "")}<br>${esc(firma.email || "")}</div></div>
<h1>${esc(titel)}</h1>
<table class="meta"><tr><td>Bauvorhaben</td><td><strong>${esc(projekt?.name || "")}</strong>${projekt?.ort ? ", " + esc(projekt.ort) : ""}</td></tr>
${projekt?.auftraggeber ? `<tr><td>Auftraggeber</td><td>${esc(projekt.auftraggeber)}</td></tr>` : ""}
${projekt?.nummer ? `<tr><td>Projektnummer</td><td>${esc(projekt.nummer)}</td></tr>` : ""}
<tr><td>Datum</td><td>${new Date(datum).toLocaleDateString("de-DE")}</td></tr>
${gueltigBis ? `<tr><td>Gültig bis</td><td>${new Date(gueltigBis).toLocaleDateString("de-DE")}</td></tr>` : ""}</table>
${einleitung ? `<p>${esc(einleitung).replace(/\n/g, "<br>")}</p>` : ""}
<table class="lv"><thead><tr><th style="width:11%">OZ</th><th>Leistung</th><th class="r" style="width:10%">Menge</th><th style="width:7%">ME</th><th class="r" style="width:12%">EP €</th><th class="r" style="width:14%">GP €</th></tr></thead>
<tbody>${zeilen.join("")}</tbody></table>
<div class="summen">
<div><span>Summe netto</span><span>${eur(s.netto)} €</span></div>
${s.nachlass ? `<div><span>Nachlass ${mng(s.nachlass)} %</span><span>− ${eur(s.nachlassBetrag)} €</span></div><div><span>Netto nach Nachlass</span><span>${eur(s.nettoNach)} €</span></div>` : ""}
<div><span>MwSt ${mng(s.mwst)} %</span><span>${eur(s.steuer)} €</span></div>
<div class="gesamt"><span>Angebotssumme brutto</span><span>${eur(s.brutto)} €</span></div></div>
<div class="fuss">Beträge in Klammern gehören zu Bedarfs- oder Alternativpositionen und sind nicht in der Angebotssumme enthalten.</div>
</div></body></html>`;
}
