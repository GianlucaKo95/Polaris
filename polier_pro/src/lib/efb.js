// aufteilung (optional, standardZuschlaege.aufteilung): Anteile des
// Gesamtzuschlags in % für BGK, AGK und Wagnis & Gewinn (Summe 100). Ist
// sie gepflegt, schlüsselt Formblatt 221 jeden Zuschlag danach auf.
export function aufteilungGueltig(aufteilung) {
  if (!aufteilung) return false;
  const s = (Number(aufteilung.bgk) || 0) + (Number(aufteilung.agk) || 0) + (Number(aufteilung.wg) || 0);
  return Math.abs(s - 100) < 0.01;
}

// EFB-Preisblätter (Ergänzende Formblätter Preise nach VHB-Bund) aus der
// Kalkulation eines Angebots:
//   221  Angaben zur Kalkulation mit vorbestimmten Zuschlägen
//   223  Aufgliederung der Einheitspreise
// Öffentliche Auftraggeber verlangen sie bei Angeboten über ca. 50.000 €.
//
// Grundlage sind die Kalkulationen je Position (kalkulation.js): Lohn,
// Material (= "Stoffe"), Gerät, Fremdleistung (= "Nachunternehmer-
// leistungen"), jeweils mit eigenem Zuschlagssatz. Da Polaris je Kostenart
// EINEN Gesamtzuschlag führt (nicht getrennt nach BGK, AGK, Wagnis und
// Gewinn), weist das Formblatt 221 den Gesamtzuschlag je Kostenart aus und
// sagt das ausdrücklich dazu.
//
// Positionen ohne Kalkulation (direkter EP) haben keine Aufschlüsselung —
// sie erscheinen in 223 vollständig unter "Sonstiges" und werden als
// Warnung gemeldet, damit niemand ein unvollständiges Formblatt abgibt,
// ohne es zu merken. Ein Positionsrabatt wirkt anteilig auf alle Kosten-
// anteile der Position.

import { kalkulationAufschluesselung, kalkulationZuschlagProzentJeKostenart } from "./kalkulation.js";
import { escapeHtmlText as esc } from "./efbHtml.js";

const KOSTENARTEN = ["lohn", "material", "geraet", "fremdleistung"];

function lohnstunden(kalk, kalkulationspreise) {
  return (kalk?.lohnposten || []).reduce((s, p) => {
    const stamm = (kalkulationspreise || []).find(k => k.id === p.stammId);
    return stamm?.einheit === "h" ? s + (Number(p.menge) || 0) : s;
  }, 0);
}

export function efbAuswerten(positionen, kalkulationspreise) {
  const warnungen = [];
  const summe = {
    ek: { lohn: 0, material: 0, geraet: 0, fremdleistung: 0 },
    gesamt: { lohn: 0, material: 0, geraet: 0, fremdleistung: 0, sonstiges: 0 },
    stunden: 0,
  };
  const zeilen = [];

  for (const p of positionen || []) {
    if (!p?.bez || p.bez.startsWith("──")) continue;
    const menge = Number(p.menge) || 0;
    const faktor = 1 - (Number(p.rabatt) || 0) / 100;
    if (!menge) continue;

    if (!p.kalk) {
      const ep = (Number(p.ep) || 0) * faktor;
      summe.gesamt.sonstiges += ep * menge;
      warnungen.push(`${p.oz ? p.oz + " " : ""}„${p.bez}“ ist nicht kalkuliert — EP steht vollständig unter Sonstiges.`);
      zeilen.push({ oz: p.oz || "", bez: p.bez, menge, einheit: p.einheit, zeitansatz: null,
        lohn: 0, material: 0, geraet: 0, fremdleistung: 0, sonstiges: ep, ep, kalkuliert: false });
      continue;
    }

    const a = kalkulationAufschluesselung(p.kalk, kalkulationspreise);
    const je = {};
    for (const k of KOSTENARTEN) {
      const satz = kalkulationZuschlagProzentJeKostenart(p.kalk, k);
      const gesamt = a[k] * (1 + satz / 100) * faktor;
      summe.ek[k] += a[k] * faktor;
      summe.gesamt[k] += gesamt;
      je[k] = gesamt / menge;
    }
    const std = lohnstunden(p.kalk, kalkulationspreise);
    summe.stunden += std * faktor;
    zeilen.push({ oz: p.oz || "", bez: p.bez, menge, einheit: p.einheit, zeitansatz: std / menge,
      ...je, sonstiges: 0, ep: KOSTENARTEN.reduce((s, k) => s + je[k], 0), kalkuliert: true });
  }

  const zuschlagProzent = {};
  for (const k of KOSTENARTEN) {
    zuschlagProzent[k] = summe.ek[k] ? (summe.gesamt[k] / summe.ek[k] - 1) * 100 : 0;
  }
  const mittellohn = summe.stunden ? summe.ek.lohn / summe.stunden : 0;
  const verrechnungslohn = summe.stunden ? summe.gesamt.lohn / summe.stunden : 0;
  const angebotssumme = KOSTENARTEN.reduce((s, k) => s + summe.gesamt[k], 0) + summe.gesamt.sonstiges;
  if (summe.ek.lohn > 0 && !summe.stunden) warnungen.push("Lohnkosten ohne Stundenangabe (Einheit h) — Mittellohn nicht ermittelbar.");

  return { zeilen, summe, zuschlagProzent, mittellohn, verrechnungslohn, angebotssumme, warnungen };
}

const eur = n => (n || 0).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = n => (n || 0).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// HTML für druckePDF() (lib/pdf.jsx): 221 und 223 untereinander in einer
// .page (A4-Breite), druckePDF teilt auf Seiten auf.
export function efbHtml(auswertung, { angebot, eigeneFirma, projekt, aufteilung = null } = {}) {
  const auf = aufteilungGueltig(aufteilung) ? aufteilung : null;
  const teil = (z, k) => (z * (Number(auf[k]) || 0)) / 100;
  const { zeilen, summe, zuschlagProzent, mittellohn, verrechnungslohn, angebotssumme, warnungen } = auswertung;
  const kopf = (nr, titel) => `
    <div class="kopf"><div><div class="nr">${nr}</div><div class="titel">${titel}</div></div>
    <div class="meta">Bieter: ${esc(eigeneFirma?.name || "")}<br>Baumaßnahme: ${esc(projekt?.name || "")}<br>Angebot: ${esc(angebot?.titel || "")}${angebot?.datum ? ` vom ${esc(angebot.datum)}` : ""}</div></div>`;
  const zeile221 = (label, wert, fett = false) => `<tr${fett ? ' class="fett"' : ""}><td>${label}</td><td class="r">${wert}</td></tr>`;

  return `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"/><style>
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family:Arial,sans-serif; font-size:9pt; color:#1a1a1a; }
.page { width:210mm; padding:12mm 14mm; }
.kopf { display:flex; justify-content:space-between; border-bottom:2px solid #1a1a1a; padding-bottom:6px; margin-bottom:10px; }
.nr { font-size:16pt; font-weight:900; } .titel { font-size:10.5pt; font-weight:bold; margin-top:2px; }
.meta { text-align:right; font-size:8.5pt; color:#444; line-height:1.4; }
h3 { font-size:9.5pt; margin:10px 0 4px; }
table { width:100%; border-collapse:collapse; margin-bottom:6px; }
td, th { border:1px solid #999; padding:3px 5px; vertical-align:top; }
th { background:#eee; font-size:8pt; text-align:left; }
.r { text-align:right; white-space:nowrap; } .fett td { font-weight:bold; }
.hinweis { font-size:8pt; color:#555; margin-top:4px; line-height:1.4; }
.warn { font-size:8pt; color:#a33; margin-top:6px; }
.trenner { height:16mm; }
</style></head><body><div class="page">
${kopf("221", "Preisermittlung bei Zuschlagskalkulation")}
<h3>1. Angaben über den Verrechnungslohn</h3>
<table>
${zeile221("1.1 Mittellohn ML (Lohnkosten / Lohnstunden)", `${eur(mittellohn)} €/h`)}
${zeile221("1.2 Lohnstunden gesamt", `${summe.stunden.toLocaleString("de-DE", { maximumFractionDigits: 2 })} h`)}
${zeile221("1.3 Zuschlag auf Lohn (BGK, AGK, Wagnis und Gewinn)", `${pct(zuschlagProzent.lohn)} %`)}
${zeile221("1.4 Verrechnungslohn VL", `${eur(verrechnungslohn)} €/h`, true)}
</table>
<h3>2. Zuschläge auf die Einzelkosten der Teilleistungen</h3>
<table><tr><th>Kostenart</th><th class="r">Einzelkosten €</th>${auf ? '<th class="r">BGK %</th><th class="r">AGK %</th><th class="r">W&amp;G %</th>' : ""}<th class="r">Zuschlag %</th><th class="r">Zuschlag €</th><th class="r">Gesamt €</th></tr>
${[["Lohn", "lohn"], ["Stoffkosten", "material"], ["Gerätekosten", "geraet"], ["Nachunternehmerleistungen", "fremdleistung"]].map(([l, k]) =>
  `<tr><td>${l}</td><td class="r">${eur(summe.ek[k])}</td>${auf ? `<td class="r">${pct(teil(zuschlagProzent[k], "bgk"))}</td><td class="r">${pct(teil(zuschlagProzent[k], "agk"))}</td><td class="r">${pct(teil(zuschlagProzent[k], "wg"))}</td>` : ""}<td class="r">${pct(zuschlagProzent[k])}</td><td class="r">${eur(summe.gesamt[k] - summe.ek[k])}</td><td class="r">${eur(summe.gesamt[k])}</td></tr>`).join("")}
${summe.gesamt.sonstiges ? `<tr><td>Sonstiges (nicht aufgegliedert)</td><td class="r">–</td>${auf ? "<td></td><td></td><td></td>" : ""}<td class="r">–</td><td class="r">–</td><td class="r">${eur(summe.gesamt.sonstiges)}</td></tr>` : ""}
<tr class="fett"><td>3. Angebotssumme ohne Umsatzsteuer</td><td></td>${auf ? "<td></td><td></td><td></td>" : ""}<td></td><td></td><td class="r">${eur(angebotssumme)}</td></tr>
</table>
<div class="hinweis">${auf ? `Zuschläge aufgeteilt nach Baustellengemeinkosten (${pct(auf.bgk)} %), Allgemeinen Geschäftskosten (${pct(auf.agk)} %) sowie Wagnis und Gewinn (${pct(auf.wg)} %) des jeweiligen Gesamtzuschlags.` : "Die Zuschläge sind je Kostenart als Gesamtzuschlag für Baustellengemeinkosten, Allgemeine Geschäftskosten sowie Wagnis und Gewinn kalkuliert."} Positionsrabatte sind in den Beträgen berücksichtigt${angebot?.rabatt ? `, ein Gesamtnachlass von ${pct(angebot.rabatt)} % auf die Angebotssumme nicht` : ""}.</div>
<div class="trenner"></div>
${kopf("223", "Aufgliederung der Einheitspreise")}
<table><tr><th>OZ</th><th>Kurztext</th><th class="r">Menge</th><th>ME</th><th class="r">Zeitansatz h/ME</th><th class="r">Lohn €</th><th class="r">Stoffe €</th><th class="r">Geräte €</th><th class="r">Sonstiges / NU €</th><th class="r">EP €</th></tr>
${zeilen.map(z => `<tr><td>${esc(z.oz)}</td><td>${esc(z.bez)}</td><td class="r">${z.menge.toLocaleString("de-DE")}</td><td>${esc(z.einheit || "")}</td>`
  + `<td class="r">${z.zeitansatz == null ? "–" : z.zeitansatz.toLocaleString("de-DE", { minimumFractionDigits: 3, maximumFractionDigits: 3 })}</td>`
  + `<td class="r">${eur(z.lohn)}</td><td class="r">${eur(z.material)}</td><td class="r">${eur(z.geraet)}</td><td class="r">${eur(z.fremdleistung + z.sonstiges)}</td><td class="r"><b>${eur(z.ep)}</b></td></tr>`).join("")}
</table>
<div class="hinweis">Alle Teilkosten einschließlich der Zuschläge aus Formblatt 221, in € ohne Umsatzsteuer je Mengeneinheit.</div>
${warnungen.length ? `<div class="warn">${warnungen.map(esc).join("<br>")}</div>` : ""}
</div></body></html>`;
}
