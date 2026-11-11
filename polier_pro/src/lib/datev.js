// DATEV-Export der Ausgangsrechnungen als Buchungsstapel im DATEV-Format
// (EXTF, Version 700, Formatkategorie 21 "Buchungsstapel", Formatversion
// 13) — so wie im DATEV Developer Portal beschrieben:
//   Zeile 1: Header mit Metadaten (Berater-/Mandantennummer, Zeitraum …)
//   Zeile 2: Spaltenüberschriften
//   ab Zeile 3: eine Buchung je Rechnung
// Dateiname muss mit "EXTF_" beginnen, Felder durch ";" getrennt, CRLF.
//
// Gebucht wird je Rechnung der Bruttobetrag im Soll auf das Debitorenkonto
// gegen das Erlöskonto (Automatikkonto, z.B. SKR03 8400 = Erlöse 19 % USt —
// die Steuer zieht DATEV über das Automatikkonto selbst). Bei Bauleistungen
// an andere Bauunternehmer (§ 13b UStG, Reverse Charge) ist ein anderes
// Erlöskonto nötig — deshalb sind alle Konten einstellbar.
//
// WICHTIG: Vor der ersten echten Übergabe mit dem Steuerberater oder dem
// DATEV-Prüfprogramm testen — DATEV validiert erst beim Import vollständig.

export const STANDARD_DATEV = {
  beraternummer: "", mandantennummer: "", sachkontenlaenge: 4, kontenrahmen: "03",
  debitorenkonto: "10000", erloeskonto: "8400", wjBeginn: "", diktatkuerzel: "PO",
  // Eingangsrechnungen/Zahlungen (SKR03-Vorschläge, mit dem Steuerberater abstimmen)
  kreditorenkonto: "70000", aufwandskonto: "3400", nuAufwandskonto: "3100", bankkonto: "1200",
};

const SPALTEN = [
  "Umsatz (ohne Soll/Haben-Kz)", "Soll/Haben-Kennzeichen", "WKZ Umsatz", "Kurs", "Basis-Umsatz", "WKZ Basis-Umsatz",
  "Konto", "Gegenkonto (ohne BU-Schlüssel)", "BU-Schlüssel", "Belegdatum", "Belegfeld 1", "Belegfeld 2", "Skonto", "Buchungstext",
];

const q = s => `"${String(s ?? "").replace(/"/g, '""')}"`;
const betrag = n => (Math.round((Number(n) || 0) * 100) / 100).toFixed(2).replace(".", ",");
const ymd = iso => String(iso || "").slice(0, 10).replace(/-/g, "");
const ddmm = iso => { const s = String(iso || ""); return s.slice(8, 10) + s.slice(5, 7); };

// Spalten 15–37 des Buchungsstapels — nur angehängt, wenn eine Buchung eine
// Kostenstelle (KOST1, Feld 37) trägt; die Felder dazwischen bleiben leer.
const SPALTEN_BIS_KOST1 = [
  "Postensperre", "Diverse Adressnummer", "Geschäftspartnerbank", "Sachverhalt", "Zinssperre", "Beleglink",
  ...[1, 2, 3, 4, 5, 6, 7, 8].flatMap(i => [`Beleginfo - Art ${i}`, `Beleginfo - Inhalt ${i}`]),
  "KOST1 - Kostenstelle",
];

// Allgemeiner Buchungsstapel. buchungen: [{ betrag, sh: "S"|"H", konto, gegenkonto,
// datum, beleg, text, kost1? }] — betrag immer positiv, sh bezieht sich auf "konto".
export function datevStapel(buchungen, einstellungen, { erstellt = new Date(), bezeichnung = "Polaris" } = {}) {
  const e = { ...STANDARD_DATEV, ...(einstellungen || {}) };
  const daten = (buchungen || []).map(r => r.datum).filter(Boolean).sort();
  const von = daten[0] || new Date().toISOString().slice(0, 10);
  const bis = daten.at(-1) || von;
  const wj = e.wjBeginn || `${von.slice(0, 4)}-01-01`;
  const zeitstempel = erstellt.toISOString().replace(/[-:TZ.]/g, "").slice(0, 17);
  const fehler = [];
  if (!/^\d{4,7}$/.test(String(e.beraternummer))) fehler.push("Beraternummer fehlt (4–7 Stellen, vom Steuerberater).");
  if (!/^\d{1,5}$/.test(String(e.mandantennummer))) fehler.push("Mandantennummer fehlt (1–5 Stellen, vom Steuerberater).");
  if (new Set(daten.map(d => d.slice(0, 4))).size > 1) fehler.push("Buchungen aus mehreren Jahren — bitte je Wirtschaftsjahr exportieren.");

  const header = [
    q("EXTF"), 700, 21, q("Buchungsstapel"), 13, zeitstempel, "", q("RE"), q(""), q(""),
    e.beraternummer, e.mandantennummer, ymd(wj), e.sachkontenlaenge, ymd(von), ymd(bis),
    q(bezeichnung), q(e.diktatkuerzel), 1, 0, 0, q("EUR"), "", q(""), "", "", q(e.kontenrahmen), "", "", q(""), q(""),
  ].join(";");
  const mitKost = (buchungen || []).some(b => b.kost1);
  const spalten = mitKost ? [...SPALTEN, ...SPALTEN_BIS_KOST1] : SPALTEN;
  const zeilen = (buchungen || []).map(b => {
    const f = [
      betrag(b.betrag), q(b.sh || "S"), q("EUR"), "", "", "",
      b.konto, b.gegenkonto, q(b.bu || ""), ddmm(b.datum),
      q(String(b.beleg || "").slice(0, 36)), q(""), "", q(String(b.text || "").slice(0, 60)),
    ];
    if (mitKost) f.push(...new Array(SPALTEN_BIS_KOST1.length - 1).fill(""), q(String(b.kost1 || "").slice(0, 36)));
    return f.join(";");
  });
  return {
    text: [header, spalten.join(";"), ...zeilen].join("\r\n") + "\r\n",
    dateiname: `EXTF_Buchungsstapel_${ymd(von)}_${ymd(bis)}.csv`,
    fehler,
  };
}

// rechnungen: [{ nummer, datum, bruttoBetrag, text }] — Ausgangsrechnungen
export function datevBuchungsstapel(rechnungen, einstellungen, optionen = {}) {
  const e = { ...STANDARD_DATEV, ...(einstellungen || {}) };
  const r = datevStapel((rechnungen || []).map(x => ({
    betrag: x.bruttoBetrag, sh: "S", konto: x.debitorenkonto || e.debitorenkonto, gegenkonto: x.erloeskonto || e.erloeskonto,
    datum: x.datum, beleg: x.nummer, text: x.text, kost1: x.kost1,
  })), e, { ...optionen, bezeichnung: "Ausgangsrechnungen Polaris" });
  if (r.fehler.includes("Buchungen aus mehreren Jahren — bitte je Wirtschaftsjahr exportieren."))
    r.fehler = r.fehler.map(f => f.startsWith("Buchungen aus") ? "Rechnungen aus mehreren Jahren — bitte je Wirtschaftsjahr exportieren." : f);
  return r;
}
