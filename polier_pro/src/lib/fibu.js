// Finanz-Nebenbuch: offene Posten (Forderungen aus Ausgangsrechnungen,
// Verbindlichkeiten aus Eingangsrechnungen), Zahlungen, Mahnstufen,
// Bauabzugsteuer-Hinweis und Buchungen für den DATEV-Buchungsstapel.
// Hauptbuch, Bilanz/GuV und UStVA bleiben beim Steuerberater.
import { rechnungGesamt } from "./rechnung.js";
import { STANDARD_DATEV } from "./datev.js";

const tag = 86400000;
const plusTage = (iso, n) => new Date(new Date(`${iso}T12:00:00Z`).getTime() + n * tag).toISOString().slice(0, 10);
const tageZwischen = (a, b) => Math.round((new Date(`${b}T12:00:00Z`) - new Date(`${a}T12:00:00Z`)) / tag);
const rund = n => Math.round((Number(n) || 0) * 100) / 100;

// VOB/B § 16: Abschlagszahlungen binnen 21 Tagen, Schlusszahlung binnen 30 Tagen.
export const ZAHLUNGSZIEL = { abschlag: 21, schluss: 30 };
export const MAHNSTUFEN = [
  { stufe: 1, ab: 7, titel: "Zahlungserinnerung" },
  { stufe: 2, ab: 21, titel: "1. Mahnung" },
  { stufe: 3, ab: 35, titel: "2. Mahnung" },
];
// § 48 EStG: 15 % Bauabzugsteuer, wenn der Subunternehmer keine gültige Freistellungsbescheinigung hat.
export const BAUABZUG_SATZ = 0.15;

export function bezahlt(zahlungen) { return rund((zahlungen || []).reduce((s, z) => s + (Number(z.betrag) || 0), 0)); }

export function ausgangsPosten(r, projekt) {
  const g = rechnungGesamt(Number(r.netto_betrag) || 0, { sicherheitseinbehaltProzent: r.sicherheitseinbehalt_prozent, mwstProzent: r.mwst ?? 19 });
  const faellig = r.faellig_am || plusTage(r.datum, ZAHLUNGSZIEL[r.typ] || 30);
  const gezahlt = r.status === "bezahlt" && !(r.zahlungen || []).length ? g.zahlbetrag : bezahlt(r.zahlungen);
  return { art: "forderung", id: r.id, quelle: r, nummer: r.nummer, partner: projekt?.auftraggeber || projekt?.name || "", projektId: r.projekt_id,
    kostenstelle: projekt?.projektnummer || String(r.projekt_id || ""), datum: r.datum, faellig, betrag: rund(g.zahlbetrag), brutto: rund(g.bruttoBetrag),
    netto: rund(g.nettoBetrag), gezahlt, offen: rund(g.zahlbetrag - gezahlt), mahnungen: r.mahnungen || [], entwurf: r.status === "entwurf" };
}

export function eingangsPosten(e, projekt) {
  const brutto = rund(e.brutto ?? (Number(e.netto) || 0) * (1 + (Number(e.ust_satz ?? 19)) / 100));
  const abzug = e.bauleistung && !e.freistellung ? rund(brutto * BAUABZUG_SATZ) : 0;
  const zahlbar = rund(brutto - abzug);
  const gezahlt = bezahlt(e.zahlungen);
  const skontoBis = e.skonto_prozent && e.skonto_tage ? plusTage(e.datum, Number(e.skonto_tage)) : null;
  return { art: "verbindlichkeit", id: e.id, quelle: e, nummer: e.rechnungsnr, partner: e.lieferant, projektId: e.projekt_id,
    kostenstelle: projekt?.projektnummer || String(e.projekt_id || ""), datum: e.datum, faellig: e.faellig_am || plusTage(e.datum, 30),
    betrag: zahlbar, brutto, netto: rund(e.netto), bauabzug: abzug, gezahlt, offen: rund(zahlbar - gezahlt),
    skontoBis, skontoBetrag: skontoBis ? rund(brutto * Number(e.skonto_prozent) / 100) : 0 };
}

export function altersklasse(posten, heute) {
  const ueber = tageZwischen(posten.faellig, heute);
  if (ueber <= 0) return "nicht fällig";
  if (ueber <= 30) return "1–30 Tage";
  if (ueber <= 60) return "31–60 Tage";
  if (ueber <= 90) return "61–90 Tage";
  return "über 90 Tage";
}
export const ALTERSKLASSEN = ["nicht fällig", "1–30 Tage", "31–60 Tage", "61–90 Tage", "über 90 Tage"];

// Nächste fällige Mahnstufe (oder null), gemessen an Fälligkeit und letzter Mahnung.
export function mahnVorschlag(posten, heute) {
  if (posten.art !== "forderung" || posten.offen <= 0.005 || posten.entwurf) return null;
  const ueber = tageZwischen(posten.faellig, heute);
  const letzte = Math.max(0, ...(posten.mahnungen || []).map(m => m.stufe || 0));
  const naechste = MAHNSTUFEN.find(s => s.stufe === letzte + 1);
  if (!naechste || ueber < naechste.ab) return null;
  const letztesDatum = (posten.mahnungen || []).map(m => m.datum).sort().at(-1);
  if (letztesDatum && tageZwischen(letztesDatum, heute) < 10) return null; // mind. 10 Tage Abstand
  return { ...naechste, tageUeber: ueber };
}

// Übersicht: Summen je Art und Altersklasse, Liquiditätsblick.
export function opUebersicht(posten, heute) {
  const offen = posten.filter(p => p.offen > 0.005 && !p.entwurf);
  const summe = art => rund(offen.filter(p => p.art === art).reduce((s, p) => s + p.offen, 0));
  const klassen = Object.fromEntries(ALTERSKLASSEN.map(k => [k, { forderung: 0, verbindlichkeit: 0 }]));
  for (const p of offen) klassen[altersklasse(p, heute)][p.art] = rund(klassen[altersklasse(p, heute)][p.art] + p.offen);
  const in14 = art => rund(offen.filter(p => p.art === art && tageZwischen(heute, p.faellig) <= 14).reduce((s, p) => s + p.offen, 0));
  return { forderungen: summe("forderung"), verbindlichkeiten: summe("verbindlichkeit"), klassen,
    faellig14: { forderung: in14("forderung"), verbindlichkeit: in14("verbindlichkeit") },
    skontoChancen: offen.filter(p => p.skontoBis && p.skontoBis >= heute).sort((a, b) => a.skontoBis.localeCompare(b.skontoBis)) };
}

// Ist-Kosten aus Eingangsrechnungen je Baustelle (netto).
export function kostenJeBaustelle(eingang) {
  const m = {};
  for (const e of eingang || []) { const k = e.projekt_id ?? "ohne"; m[k] = rund((m[k] || 0) + (Number(e.netto) || 0)); }
  return m;
}

// Buchungen für datevStapel(): Eingangsrechnungen (Aufwand an Kreditor) und
// Zahlungen (Bank an Debitor / Kreditor an Bank), je mit Kostenstelle.
export function datevBuchungenFinanzen({ ausgang = [], eingang = [], einstellungen, von, bis, mitZahlungen = true }) {
  const e = { ...STANDARD_DATEV, ...(einstellungen || {}) };
  const im = d => d && d >= von && d <= bis;
  const b = [];
  for (const p of eingang) {
    const q = p.quelle;
    if (im(p.datum)) b.push({ betrag: p.brutto, sh: "H", konto: q.kreditorenkonto || e.kreditorenkonto,
      gegenkonto: q.konto || (q.bauleistung ? e.nuAufwandskonto : e.aufwandskonto), datum: p.datum, beleg: p.nummer,
      text: `ER ${p.partner}`.slice(0, 60), kost1: p.kostenstelle });
    if (mitZahlungen) for (const z of q.zahlungen || []) if (im(z.datum))
      b.push({ betrag: z.betrag, sh: "S", konto: q.kreditorenkonto || e.kreditorenkonto, gegenkonto: e.bankkonto, datum: z.datum, beleg: p.nummer, text: `Zahlung ${p.partner}`.slice(0, 60) });
  }
  if (mitZahlungen) for (const p of ausgang) for (const z of p.quelle.zahlungen || []) if (im(z.datum))
    b.push({ betrag: z.betrag, sh: "H", konto: e.debitorenkonto, gegenkonto: e.bankkonto, datum: z.datum, beleg: p.nummer, text: `Zahlungseingang ${p.partner}`.slice(0, 60), kost1: p.kostenstelle });
  return b.sort((x, y) => x.datum.localeCompare(y.datum));
}

const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const eur = n => (n || 0).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
const de = iso => iso ? iso.split("-").reverse().join(".") : "";

export function mahnungHtml(posten, stufe, { eigeneFirma = {}, heute, frist = 10 } = {}) {
  const fristBis = plusTage(heute, frist);
  const text = stufe.stufe === 1
    ? `sicher ist es Ihrer Aufmerksamkeit entgangen: Unsere Rechnung Nr. ${esc(posten.nummer)} vom ${de(posten.datum)} war am ${de(posten.faellig)} fällig. Bitte überweisen Sie den offenen Betrag bis zum ${de(fristBis)}.`
    : `trotz unserer Erinnerung ist die Rechnung Nr. ${esc(posten.nummer)} vom ${de(posten.datum)} (fällig am ${de(posten.faellig)}) noch nicht ausgeglichen. Wir bitten um Zahlung bis spätestens ${de(fristBis)}.${stufe.stufe >= 3 ? " Nach Ablauf dieser Frist behalten wir uns weitere Schritte vor; Verzugszinsen nach § 288 BGB bleiben vorbehalten." : ""}`;
  return `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"/><style>
body{font-family:Arial,sans-serif;font-size:11pt;color:#1a1a1a}.page{width:210mm;padding:20mm}
h1{font-size:15pt;margin:18mm 0 6mm}table{width:100%;border-collapse:collapse;margin:6mm 0}td{padding:4px 0;border-bottom:1px solid #ddd}
td:last-child{text-align:right}.abs{font-size:8.5pt;color:#666}</style></head><body><div class="page">
<div class="abs">${esc([eigeneFirma.name, eigeneFirma.strasse, [eigeneFirma.plz, eigeneFirma.ort].filter(Boolean).join(" ")].filter(Boolean).join(" · "))}</div>
<p style="margin-top:6mm">${esc(posten.partner)}</p>
<p style="text-align:right">${de(heute)}</p>
<h1>${esc(stufe.titel)}</h1>
<p>Sehr geehrte Damen und Herren,</p><p style="margin-top:4mm">${text}</p>
<table><tr><td>Rechnung ${esc(posten.nummer)} vom ${de(posten.datum)}</td><td>${eur(posten.betrag)}</td></tr>
${posten.gezahlt ? `<tr><td>bereits gezahlt</td><td>− ${eur(posten.gezahlt)}</td></tr>` : ""}
<tr><td><b>offener Betrag</b></td><td><b>${eur(posten.offen)}</b></td></tr></table>
<p>Sollten Sie die Zahlung bereits veranlasst haben, betrachten Sie dieses Schreiben bitte als gegenstandslos.</p>
<p style="margin-top:8mm">Mit freundlichen Grüßen<br/>${esc(eigeneFirma.name || "")}</p>
${eigeneFirma.iban ? `<p class="abs" style="margin-top:12mm">Bankverbindung: ${esc(eigeneFirma.bank || "")} · IBAN ${esc(eigeneFirma.iban)}${eigeneFirma.bic ? ` · BIC ${esc(eigeneFirma.bic)}` : ""}</p>` : ""}
</div></body></html>`;
}

// Werkzeug für den KI-Scan einer Eingangsrechnung (Foto/PDF).
export const RECHNUNG_ERFASSEN_TOOL = {
  name: "rechnung_erfassen",
  description: "Erfasst die Kopfdaten einer Eingangsrechnung eines Lieferanten oder Subunternehmers.",
  input_schema: {
    type: "object",
    properties: {
      lieferant: { type: "string", description: "Firmenname des Rechnungsstellers" },
      rechnungsnr: { type: "string" },
      datum: { type: "string", description: "Rechnungsdatum YYYY-MM-DD" },
      faellig_am: { type: "string", description: "Fälligkeitsdatum YYYY-MM-DD, falls angegeben" },
      netto: { type: "number" }, ust_satz: { type: "number", description: "USt-Satz in %, 0 bei Reverse Charge § 13b" },
      brutto: { type: "number" },
      skonto_prozent: { type: "number" }, skonto_tage: { type: "number" },
      bauleistung: { type: "boolean", description: "true, wenn es eine Bauleistung eines Subunternehmers ist" },
      reverse_charge: { type: "boolean", description: "Hinweis auf Steuerschuldnerschaft des Leistungsempfängers (§ 13b UStG)" },
      bauvorhaben: { type: "string", description: "Bauvorhaben/Baustelle laut Rechnung" },
    },
    required: ["lieferant", "datum", "brutto"],
  },
};

export function scanPlausibel(d) {
  const w = [];
  if (d.netto && d.brutto && d.ust_satz != null) {
    const soll = d.netto * (1 + d.ust_satz / 100);
    if (Math.abs(soll - d.brutto) > 0.05) w.push(`Netto + USt (${soll.toFixed(2)}) passt nicht zum Brutto (${Number(d.brutto).toFixed(2)}) — bitte prüfen.`);
  }
  if (d.reverse_charge && d.ust_satz) w.push("Reverse Charge erkannt, aber USt ausgewiesen — bitte prüfen.");
  if (d.datum && !/^\d{4}-\d{2}-\d{2}$/.test(d.datum)) w.push("Rechnungsdatum nicht erkannt.");
  return w;
}
