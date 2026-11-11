// Nachtragsmanagement: Nachträge sind Angebote mit Bezug auf einen Auftrag
// (angebote.nachtrag_zu). Zusätzlich führt angebote.nachtrag_info den
// Rechtsgrund nach VOB/B, den Verfahrensstand und die Begründung.
//
// Ablauf in der Praxis: Mehrkosten ANKÜNDIGEN (bei zusätzlichen Leistungen
// nach § 2 Abs. 6 VOB/B Voraussetzung für den Vergütungsanspruch, vor
// Ausführung!) → Nachtragsangebot einreichen → beauftragt / abgelehnt.

import { nettoSumme } from "./lv.js";

export const NACHTRAG_GRUENDE = [
  ["mengen", "Mengenänderung > 10 % (§ 2 Abs. 3 VOB/B)"],
  ["geaendert", "Geänderte Leistung (§ 2 Abs. 5 VOB/B)"],
  ["zusaetzlich", "Zusätzliche Leistung (§ 2 Abs. 6 VOB/B)"],
  ["ohne_auftrag", "Leistung ohne Auftrag (§ 2 Abs. 8 VOB/B)"],
  ["behinderung", "Behinderung / Bauzeitverlängerung (§ 6 Abs. 6 VOB/B)"],
  ["sonstig", "Sonstiger Grund"],
];

export const NACHTRAG_STATUS = [
  ["entwurf", "Entwurf"],
  ["angekuendigt", "Mehrkosten angekündigt"],
  ["angeboten", "Nachtrag eingereicht"],
  ["verhandlung", "In Verhandlung"],
  ["beauftragt", "Beauftragt"],
  ["abgelehnt", "Abgelehnt"],
];

export const GRUND_LABEL = Object.fromEntries(NACHTRAG_GRUENDE);
export const STATUS_LABEL = Object.fromEntries(NACHTRAG_STATUS);

export function nachtragStatus(n) {
  return n?.nachtrag_info?.status || (n?.status === "angenommen" ? "beauftragt" : n?.status === "abgelehnt" ? "abgelehnt" : n?.status === "versendet" ? "angeboten" : "entwurf");
}

// Übersicht je Auftrag: Summen nach Stand, Nachtragsquote.
export function nachtragUebersicht(auftrag, angebote) {
  const nachtraege = (angebote || []).filter(a => a.nachtrag_zu === auftrag.id);
  const summe = { beauftragt: 0, offen: 0, abgelehnt: 0 };
  for (const n of nachtraege) {
    const betrag = nettoSumme(n.positionen) * (1 - (Number(n.rabatt) || 0) / 100);
    const st = nachtragStatus(n);
    if (st === "beauftragt") summe.beauftragt += betrag;
    else if (st === "abgelehnt") summe.abgelehnt += betrag;
    else summe.offen += betrag;
  }
  const auftragssumme = nettoSumme(auftrag.positionen) * (1 - (Number(auftrag.rabatt) || 0) / 100);
  return {
    anzahl: nachtraege.length, nachtraege, ...summe, auftragssumme,
    quote: auftragssumme > 0 ? summe.beauftragt / auftragssumme * 100 : 0,
    ohneAnkuendigung: nachtraege.filter(n => n.nachtrag_info?.grund === "zusaetzlich" && !n.nachtrag_info?.angekuendigt_am).length,
  };
}

export function begruendungPrompt({ nachtrag, auftrag, projekt, info }) {
  const pos = (nachtrag.positionen || []).filter(p => p.bez && !p.bez.startsWith("──"))
    .map(p => `- ${p.bez}: ${p.menge} ${p.einheit}`).join("\n");
  return `Formuliere für ein deutsches Bauunternehmen die schriftliche Begründung eines Nachtrags an den Auftraggeber. Sachlich, präzise, ohne Floskeln, max. 200 Wörter. Nenne die Rechtsgrundlage, beschreibe was sich gegenüber dem Vertrag (Bausoll) ändert, warum die Leistung erforderlich ist und dass die Preise auf Grundlage der Urkalkulation ermittelt wurden. Keine Beträge erfinden, keine Platzhalter in eckigen Klammern.

Bauvorhaben: ${projekt?.name || ""}
Hauptauftrag: ${auftrag?.titel || ""}
Grund: ${GRUND_LABEL[info?.grund] || "nicht angegeben"}
Sachverhalt laut Bauleitung: ${info?.beschreibung || "(keine Angabe)"}
Nachtragspositionen:
${pos || "(noch keine)"}`;
}

export function mehrkostenanzeigeHtml({ nachtrag, auftrag, projekt, eigeneFirma, info, esc }) {
  const heute = new Date().toLocaleDateString("de-DE");
  return `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"/><style>
body{font-family:Arial,sans-serif;font-size:10.5pt;color:#1a1a1a}.page{width:210mm;padding:20mm 18mm}
h1{font-size:14pt;margin:18px 0 10px}p{line-height:1.5;margin:0 0 9px}.meta{color:#555;font-size:9.5pt}
</style></head><body><div class="page">
<div class="meta">${esc(eigeneFirma?.name || "")}${eigeneFirma?.ort ? ", " + esc(eigeneFirma.ort) : ""} · ${heute}</div>
<p style="margin-top:18px">An: ${esc(nachtrag.empfaenger || auftrag?.empfaenger || "")}</p>
<h1>${info?.grund === "behinderung" ? "Behinderungsanzeige" : "Ankündigung von Mehrkosten"} — ${esc(nachtrag.titel || "")}</h1>
<p><b>Bauvorhaben:</b> ${esc(projekt?.name || "")}<br><b>Vertrag:</b> ${esc(auftrag?.titel || "")}<br><b>Grundlage:</b> ${esc(GRUND_LABEL[info?.grund] || "")}</p>
${String(info?.begruendung || info?.beschreibung || "").split(/\n+/).filter(Boolean).map(t => `<p>${esc(t)}</p>`).join("")}
<p>Wir bitten um Bestätigung und schriftliche Beauftragung. Ein prüffähiges Nachtragsangebot ${nachtrag.positionen?.length ? "liegt bei" : "reichen wir kurzfristig nach"}.</p>
<p style="margin-top:28px">Mit freundlichen Grüßen<br>${esc(eigeneFirma?.name || "")}</p>
</div></body></html>`;
}
