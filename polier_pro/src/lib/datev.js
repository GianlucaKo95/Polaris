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
};

const SPALTEN = [
  "Umsatz (ohne Soll/Haben-Kz)", "Soll/Haben-Kennzeichen", "WKZ Umsatz", "Kurs", "Basis-Umsatz", "WKZ Basis-Umsatz",
  "Konto", "Gegenkonto (ohne BU-Schlüssel)", "BU-Schlüssel", "Belegdatum", "Belegfeld 1", "Belegfeld 2", "Skonto", "Buchungstext",
];

const q = s => `"${String(s ?? "").replace(/"/g, '""')}"`;
const betrag = n => (Math.round((Number(n) || 0) * 100) / 100).toFixed(2).replace(".", ",");
const ymd = iso => String(iso || "").slice(0, 10).replace(/-/g, "");
const ddmm = iso => { const s = String(iso || ""); return s.slice(8, 10) + s.slice(5, 7); };

// rechnungen: [{ nummer, datum, bruttoBetrag, text }]
export function datevBuchungsstapel(rechnungen, einstellungen, { erstellt = new Date() } = {}) {
  const e = { ...STANDARD_DATEV, ...(einstellungen || {}) };
  const daten = (rechnungen || []).map(r => r.datum).filter(Boolean).sort();
  const von = daten[0] || new Date().toISOString().slice(0, 10);
  const bis = daten.at(-1) || von;
  const wj = e.wjBeginn || `${von.slice(0, 4)}-01-01`;
  const zeitstempel = erstellt.toISOString().replace(/[-:TZ.]/g, "").slice(0, 17);
  const fehler = [];
  if (!/^\d{4,7}$/.test(String(e.beraternummer))) fehler.push("Beraternummer fehlt (4–7 Stellen, vom Steuerberater).");
  if (!/^\d{1,5}$/.test(String(e.mandantennummer))) fehler.push("Mandantennummer fehlt (1–5 Stellen, vom Steuerberater).");
  if (new Set(daten.map(d => d.slice(0, 4))).size > 1) fehler.push("Rechnungen aus mehreren Jahren — bitte je Wirtschaftsjahr exportieren.");

  const header = [
    q("EXTF"), 700, 21, q("Buchungsstapel"), 13, zeitstempel, "", q("RE"), q(""), q(""),
    e.beraternummer, e.mandantennummer, ymd(wj), e.sachkontenlaenge, ymd(von), ymd(bis),
    q("Ausgangsrechnungen Polaris"), q(e.diktatkuerzel), 1, 0, 0, q("EUR"), "", q(""), "", "", q(e.kontenrahmen), "", "", q(""), q(""),
  ].join(";");
  const zeilen = (rechnungen || []).map(r => [
    betrag(r.bruttoBetrag), q("S"), q("EUR"), "", "", "",
    r.debitorenkonto || e.debitorenkonto, r.erloeskonto || e.erloeskonto, q(""), ddmm(r.datum),
    q(String(r.nummer || "").slice(0, 36)), q(""), "", q(String(r.text || "").slice(0, 60)),
  ].join(";"));
  return {
    text: [header, SPALTEN.join(";"), ...zeilen].join("\r\n") + "\r\n",
    dateiname: `EXTF_Buchungsstapel_${ymd(von)}_${ymd(bis)}.csv`,
    fehler,
  };
}
