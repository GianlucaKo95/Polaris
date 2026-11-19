// Schnittstellen zu ERP und Buchhaltung:
//   - DATEV Buchungsstapel für Ausgangsrechnungen (kalk_rechnungen) und
//     freigegebene NU-Rechnungen (Kreditoren), Kostenstelle = Projektnummer
//   - CSV/JSON für SAP und andere ERP (Projekt-Controlling je Periode und
//     Kostenart, Rechnungen), UTF-8 mit BOM und Semikolon wie in Excel/SAP üblich
// Vor dem ersten echten Import mit Steuerberater bzw. ERP-Team abstimmen.

import { datevStapel, STANDARD_DATEV } from "../datev.js";
import { RECHNUNG_ART_LABEL } from "./abrechnung.js";
import { KOSTENART_CO_LABEL } from "./controlling.js";


export function datevAusgang(rechnungen, projekte, einstellungen = {}, { von = null, bis = null } = {}) {
  const e = { ...STANDARD_DATEV, ...einstellungen };
  const nachId = new Map((projekte || []).map(p => [p.id, p]));
  const liste = (rechnungen || []).filter(r => ["gestellt", "bezahlt"].includes(r.status) && (!von || r.datum >= von) && (!bis || r.datum <= bis));
  return datevStapel(liste.map(r => {
    const p = nachId.get(r.kalk_projekt_id) || {};
    return { betrag: Number(r.brutto) || 0, sh: Number(r.brutto) < 0 ? "H" : "S", konto: e.debitorenkonto, gegenkonto: r.steuerschuld_umkehr ? e.erloeskonto13b || e.erloeskonto : e.erloeskonto,
      datum: r.datum, beleg: r.nummer, text: `${RECHNUNG_ART_LABEL[r.art] || "Rechnung"} ${p.name || ""}`.slice(0, 60), kost1: p.nummer || "" };
  }).map(b => ({ ...b, betrag: Math.abs(b.betrag) })), e, { bezeichnung: "Ausgangsrechnungen Kalkulation" });
}

// NU-Rechnungen: Aufwand an Kreditor, netto (Bauleistungen unter Bauunternehmern: § 13b,
// die Steuer bucht DATEV über den BU-Schlüssel des Aufwandskontos — mit dem Steuerberater festlegen)
export function datevEingangNu(nuRechnungen, vergaben, projekte, einstellungen = {}, { von = null, bis = null } = {}) {
  const e = { ...STANDARD_DATEV, ...einstellungen };
  const vNachId = new Map((vergaben || []).map(v => [v.id, v]));
  const pNachId = new Map((projekte || []).map(p => [p.id, p]));
  const liste = (nuRechnungen || []).filter(r => ["freigegeben", "bezahlt"].includes(r.status) && (!von || (r.datum || r.eingang) >= von) && (!bis || (r.datum || r.eingang) <= bis));
  return datevStapel(liste.map(r => {
    const v = vNachId.get(r.vergabe_id) || {};
    const b = (v.bieter || []).find(x => x.id === v.vergeben_an) || {};
    const p = pNachId.get(r.kalk_projekt_id) || {};
    return { betrag: Number(r.geprueft) || 0, sh: "S", konto: e.nuAufwandskonto, gegenkonto: e.kreditorenkonto, datum: r.datum || r.eingang, beleg: r.nummer || "",
      text: `NU ${b.name || ""} ${v.titel || ""}`.trim().slice(0, 60), kost1: p.nummer || "" };
  }), e, { bezeichnung: "NU-Rechnungen Kalkulation" });
}

const csvWert = v => {
  if (v == null) return "";
  if (typeof v === "number") return String(Math.round(v * 100) / 100).replace(".", ",");
  const s = String(v);
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export const csv = (kopf, zeilen) => "﻿" + [kopf.join(";"), ...zeilen.map(z => z.map(csvWert).join(";"))].join("\r\n") + "\r\n";

// Projekt-Controlling je Periode und Kostenart (z. B. SAP CO/PS: PSP-Element = Projektnummer)
export function controllingCsv(projekte, meldungen) {
  const nachId = new Map((projekte || []).map(p => [p.id, p]));
  const zeilen = [];
  for (const m of (meldungen || []).filter(x => x.status === "gemeldet").sort((a, b) => String(a.monat).localeCompare(String(b.monat)))) {
    const p = nachId.get(m.kalk_projekt_id) || {};
    const periode = String(m.monat).slice(0, 7);
    for (const k of m.werte?.kostenarten || []) zeilen.push([p.nummer || "", p.name || "", periode, k.kostenart, KOSTENART_CO_LABEL[k.kostenart] || k.kostenart, k.sollKum, k.istKum, k.prognose]);
    const w = m.werte || {};
    zeilen.push([p.nummer || "", p.name || "", periode, "erloes", "Leistung (Erlös)", w.erloes?.kum, w.erloes?.kum, w.erloes?.prognose]);
    zeilen.push([p.nummer || "", p.name || "", periode, "ergebnis", "Ergebnis", w.ergebnis?.kalkuliert, null, w.ergebnis?.prognose]);
  }
  return csv(["Projektnummer", "Projekt", "Periode", "Kostenart", "Bezeichnung", "Soll kumuliert", "Ist kumuliert", "Prognose"], zeilen);
}

export function rechnungenCsv(projekte, rechnungen) {
  const nachId = new Map((projekte || []).map(p => [p.id, p]));
  return csv(["Projektnummer", "Projekt", "Rechnungsnummer", "Art", "Datum", "Leistung bis", "Status", "Netto", "Brutto", "§ 13b", "Bezahlt am", "Bezahlt"],
    (rechnungen || []).filter(r => r.status !== "entwurf").map(r => {
      const p = nachId.get(r.kalk_projekt_id) || {};
      return [p.nummer || "", p.name || "", r.nummer, RECHNUNG_ART_LABEL[r.art] || r.art, r.datum, r.leistung_bis, r.status, Number(r.netto) || 0, Number(r.brutto) || 0, r.steuerschuld_umkehr ? "ja" : "nein", r.bezahlt_am, r.bezahlt_betrag != null ? Number(r.bezahlt_betrag) : null];
    }));
}

// Ein JSON für ERP-Integrationen (stabile Feldnamen, Version im Kopf)
export function erpJson({ projekte, meldungen, rechnungen, nuRechnungen, erstellt = new Date().toISOString() }) {
  return JSON.stringify({ format: "polaris-kalkulation-export", version: 1, erstellt,
    projekte: (projekte || []).map(p => ({ id: p.id, nummer: p.nummer, name: p.name, status: p.status, auftraggeber: p.auftraggeber, gesellschaft_id: p.gesellschaft_id, arge: p.arge?.aktiv ? p.arge.partner : null })),
    leistungsmeldungen: (meldungen || []).filter(m => m.status === "gemeldet").map(m => ({ projekt_id: m.kalk_projekt_id, periode: String(m.monat).slice(0, 7), werte: m.werte })),
    rechnungen: (rechnungen || []).filter(r => r.status !== "entwurf").map(({ positionen, ...r }) => ({ ...r, positionen: positionen?.length || 0 })),
    nu_rechnungen: (nuRechnungen || []).filter(r => r.status !== "eingegangen").map(({ positionen, ...r }) => r),
  }, null, 2);
}
