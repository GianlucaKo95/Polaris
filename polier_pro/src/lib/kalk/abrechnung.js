// Abrechnung (Phase 5): Aufmaß, Mengenvergleich, Nachträge, Abschlags- und
// Schlussrechnung, Prüfbarkeit, GAEB X31, NU-Rechnungsprüfung.
//
// Grundlage ist der Auftragsstand (art "auftrag") plus die Stände der
// beauftragten Nachträge (art "nachtrag"). Abgerechnet wird nach Aufmaß:
// Je Position Summe der Aufmaßzeilen (Abzüge negativ). Pauschalen werden
// als Anteil aufgemessen (0,5 psch = halb erbracht).
//
// Rechnungen in kumulierter Darstellung (üblich am Bau):
//   Leistung kumuliert  − Nachlass  − Einbehalt  − bisherige Rechnungen
//   = Rechnungsbetrag netto, + USt (oder § 13b: Steuerschuld beim Empfänger)
// Jede Rechnung friert ihre Positionen und Summen ein; gestellte Rechnungen
// ändert die Datenbank nicht mehr.
// Geld wie überall: GP = Menge × UP auf Cent (lvBaum.gpCent).

import { baumIndex, gpCent, upCent, rundeCent, rundeMenge, ozNorm, neueId } from "./lvBaum.js";
import { formelAuswerten } from "../aufmass.js";
import { druckTexte } from "./angebotDruck.js";

export const SCHWELLE_VOB = 0.1; // § 2 Abs. 3 VOB/B

export const NACHTRAG_GRUENDE = [
  ["geaendert", "Geänderte Leistung", "§ 2 Abs. 5 VOB/B"],
  ["zusaetzlich", "Zusätzliche Leistung", "§ 2 Abs. 6 VOB/B"],
  ["menge", "Mengenänderung über 10 %", "§ 2 Abs. 3 VOB/B"],
  ["behinderung", "Behinderung, Mehrkosten", "§ 6 Abs. 6 VOB/B"],
  ["stundenlohn", "Stundenlohnarbeiten", "§ 2 Abs. 10 VOB/B"],
  ["sonstig", "Sonstiges", ""],
];
export const GRUND_LABEL = Object.fromEntries(NACHTRAG_GRUENDE.map(([k, l]) => [k, l]));
export const GRUND_VOB = Object.fromEntries(NACHTRAG_GRUENDE.map(([k, , v]) => [k, v]));
export const NACHTRAG_STATUS = [
  ["entwurf", "Entwurf"], ["angemeldet", "Angemeldet"], ["angeboten", "Angeboten"], ["beauftragt", "Beauftragt"],
  ["teilweise", "Teilweise beauftragt"], ["abgelehnt", "Abgelehnt"], ["zurueckgezogen", "Zurückgezogen"],
];
export const NACHTRAG_STATUS_LABEL = Object.fromEntries(NACHTRAG_STATUS);
export const istBeauftragt = n => n?.status === "beauftragt" || n?.status === "teilweise";
export const RECHNUNG_ART_LABEL = { abschlag: "Abschlagsrechnung", teilschluss: "Teilschlussrechnung", schluss: "Schlussrechnung" };
export const RECHNUNG_STATUS_LABEL = { entwurf: "Entwurf", gestellt: "Gestellt", bezahlt: "Bezahlt", storniert: "Storniert" };

const eur = c => c / 100;
const anz = (n, eins, mehr) => `${n} ${n === 1 ? eins : mehr}`;
const centVon = x => Math.round(rundeCent(x) * 100);

// ── Aufmaß ────────────────────────────────────────────────────────────────

export function neueAufmassZeile(felder = {}) {
  const formel = felder.formel ?? "";
  return { id: neueId(), blatt: "", ort: "", bezeichnung: "", abzug: false, quelle: "hand", toleranz: null,
    datum: new Date().toISOString().slice(0, 10), sort: Date.now(), extra: {}, ...felder, formel, menge: rundeMenge(felder.menge ?? formelAuswerten(formel) ?? 0) };
}

export function aufmassZeileAendern(z, felder) {
  const n = { ...z, ...felder };
  if ("formel" in felder && !("menge" in felder)) n.menge = rundeMenge(formelAuswerten(felder.formel) ?? 0);
  return n;
}

// Zeilen aus dem Plan-/Foto-Werkzeug (lib/aufmass.js) übernehmen
export function zeilenAusWerkzeug(werkzeugZeilen, { standId, knotenId, blatt = "" } = {}) {
  return (werkzeugZeilen || []).map((z, i) => neueAufmassZeile({ stand_id: standId, knoten_id: knotenId, blatt, bezeichnung: z.bez || "",
    formel: z.formel || String(z.menge ?? ""), menge: rundeMenge(z.menge), abzug: !!z.abzug,
    quelle: ["messung", "plantext", "foto", "ki"].includes(z.quelle) ? z.quelle : "hand", toleranz: z.toleranz ?? null, sort: Date.now() + i }));
}

export const formelFehler = z => (String(z.formel || "").trim() && formelAuswerten(z.formel) == null ? "Rechenansatz nicht lesbar" : null);

// Menge je Position: Map "standId|knotenId" → { menge, zeilen, toleranz }
export const schluessel = (standId, knotenId) => `${standId}|${knotenId}`;
export function aufmassJePosition(aufmass) {
  const m = new Map();
  for (const z of aufmass || []) {
    const k = schluessel(z.stand_id, z.knoten_id);
    const e = m.get(k) || { menge: 0, zeilen: 0, unsicher: 0, quellen: new Set() };
    const w = Number(z.menge) || 0;
    e.menge += z.abzug ? -w : w;
    e.zeilen++;
    if (z.toleranz) e.unsicher += w * Number(z.toleranz);
    e.quellen.add(z.quelle || "hand");
    m.set(k, e);
  }
  for (const e of m.values()) e.menge = rundeMenge(e.menge);
  return m;
}

// ── Abrechnungszeilen und Mengenvergleich ─────────────────────────────────

// teile: [{ stand, knoten, nachtrag? }] — erst der Auftrag, dann beauftragte Nachträge
export function abrechnungsZeilen(teile, aufmass) {
  const jePos = aufmassJePosition(aufmass);
  const aus = [];
  for (const { stand, knoten, nachtrag = null } of teile || []) {
    const index = baumIndex(knoten);
    const lauf = parent => {
      for (const k of index.kinderVon(parent)) {
        if (k.typ === "titel") { lauf(k.id); continue; }
        if (k.typ !== "position") continue;
        const a = jePos.get(schluessel(stand.id, k.id));
        const mengeLv = rundeMenge(k.menge);
        const mengeKum = a ? a.menge : 0;
        const up = Number(upCent(k)) / 100;
        const zaehlt = k.art !== "bedarf" && k.art !== "alternativ";
        const abw = mengeLv > 0 ? (mengeKum - mengeLv) / mengeLv : null;
        aus.push({
          standId: stand.id, knotenId: k.id, oz: k.oz || "", kurztext: k.kurztext || "", langtext: k.langtext || "", einheit: k.einheit || "", art: k.art || "normal",
          mengeLv, mengeKum, up, gpLv: zaehlt ? gpCent({ ...k, menge: mengeLv }) / 100 : 0,
          betragKum: gpCent({ ...k, menge: mengeKum }) / 100,
          aufmassZeilen: a?.zeilen || 0, unsicher: a && a.menge ? Math.round(a.unsicher / Math.abs(a.menge) * 100) / 100 : 0,
          abweichung: abw, vob: abw == null ? null : abw > SCHWELLE_VOB ? "mehr" : abw < -SCHWELLE_VOB && mengeKum > 0 ? "minder" : null,
          nachtrag: nachtrag ? { id: nachtrag.id, nummer: nachtrag.nummer, titel: nachtrag.titel } : null,
        });
      }
    };
    lauf(null);
  }
  return aus;
}

export function mengenvergleich(zeilen) {
  const lv = rundeCent(zeilen.filter(z => !z.nachtrag).reduce((s, z) => s + z.gpLv, 0));
  const nachtraege = rundeCent(zeilen.filter(z => z.nachtrag).reduce((s, z) => s + z.gpLv, 0));
  const abgerechnet = rundeCent(zeilen.reduce((s, z) => s + z.betragKum, 0));
  const mehr = zeilen.filter(z => z.vob === "mehr");
  const minder = zeilen.filter(z => z.vob === "minder");
  return { lv, nachtraege, auftrag: rundeCent(lv + nachtraege), abgerechnet, anteil: lv + nachtraege > 0 ? abgerechnet / (lv + nachtraege) : 0,
    mehr: mehr.length, minder: minder.length, ohneAufmass: zeilen.filter(z => !z.aufmassZeilen && z.mengeLv > 0 && z.art !== "bedarf" && z.art !== "alternativ").length,
    mehrBetrag: rundeCent(mehr.reduce((s, z) => s + z.betragKum - z.gpLv, 0)) };
}

// ── Rechnungen ─────────────────────────────────────────────────────────────

export const zaehltAlsVorherig = r => r.status === "gestellt" || r.status === "bezahlt";

export function rechnungsNummer(projekt, rechnungen, art) {
  const lfd = (rechnungen || []).filter(r => r.status !== "storniert").length + 1;
  const basis = String(projekt?.nummer || "").trim() || new Date().getFullYear();
  return { lfd, nummer: `${art === "schluss" ? "SR" : "AR"}-${basis}-${String(lfd).padStart(2, "0")}` };
}

export function rechnungTitel(r, alle = []) {
  if (r.art !== "abschlag") return RECHNUNG_ART_LABEL[r.art];
  const n = alle.filter(x => x.art === "abschlag" && x.status !== "storniert" && (x.lfd_nr < r.lfd_nr || x.id === r.id)).length || r.lfd_nr;
  return `${n}. Abschlagsrechnung`;
}

// Rechnung berechnen (Entwurf). vorherige: bereits gestellte Rechnungen desselben Projekts.
export function rechnungBerechnen(zeilen, { nachlassProzent = 0, einbehaltProzent = 0, mwst = 19, umkehr = false, vorherige = [] } = {}) {
  const bisher = (vorherige || []).filter(zaehltAlsVorherig);
  const letzte = [...bisher].sort((a, b) => (a.lfd_nr - b.lfd_nr) || String(a.datum).localeCompare(String(b.datum))).at(-1);
  const vorher = new Map((letzte?.positionen || []).map(p => [schluessel(p.standId, p.knotenId), p]));
  const positionen = zeilen.filter(z => z.mengeKum !== 0 || vorher.has(schluessel(z.standId, z.knotenId))).map(z => {
    const v = vorher.get(schluessel(z.standId, z.knotenId));
    return { standId: z.standId, knotenId: z.knotenId, oz: z.oz, kurztext: z.kurztext, einheit: z.einheit, up: z.up, mengeLv: z.mengeLv,
      mengeKum: z.mengeKum, betragKum: z.betragKum, mengeVorher: v?.mengeKum || 0, betragVorher: v?.betragKum || 0, nachtrag: z.nachtrag };
  });
  const leistungC = positionen.reduce((s, p) => s + centVon(p.betragKum), 0);
  const nachlassC = Math.round(leistungC * (Number(nachlassProzent) || 0) / 100);
  const nachNachlassC = leistungC - nachlassC;
  const einbehaltC = Math.round(nachNachlassC * (Number(einbehaltProzent) || 0) / 100);
  const anrechenbarC = nachNachlassC - einbehaltC;
  const bisherC = bisher.reduce((s, r) => s + centVon(r.netto), 0);
  const nettoC = anrechenbarC - bisherC;
  const steuerC = umkehr ? 0 : Math.round(nettoC * (Number(mwst) || 0) / 100);
  return {
    positionen,
    summen: {
      leistung: eur(leistungC), nachlassProzent: Number(nachlassProzent) || 0, nachlass: eur(nachlassC), nachNachlass: eur(nachNachlassC),
      einbehaltProzent: Number(einbehaltProzent) || 0, einbehalt: eur(einbehaltC), anrechenbar: eur(anrechenbarC),
      bisher: eur(bisherC), bisherListe: bisher.map(r => ({ nummer: r.nummer, datum: r.datum, netto: Number(r.netto) || 0 })),
      netto: eur(nettoC), mwst: umkehr ? 0 : Number(mwst) || 0, steuer: eur(steuerC), brutto: eur(nettoC + steuerC), umkehr: !!umkehr,
    },
    netto: eur(nettoC), brutto: eur(nettoC + steuerC),
  };
}

// § 14 VOB/B und § 14 UStG: Was fehlt, damit die Rechnung prüfbar ist?
export function pruefbarkeit(r, { zeilen = [], aufmass = [], firma = {}, projekt = {}, nachtraege = [] } = {}) {
  const fehler = [], hinweise = [];
  if (!firma.name) fehler.push("Name des Rechnungsstellers fehlt (Firmendaten).");
  if (!(firma.strasse || firma.adresse) || !(firma.ort || firma.adresse)) fehler.push("Anschrift des Rechnungsstellers fehlt (Firmendaten).");
  if (!(firma.steuernummer || firma.ust_id || firma.ustid)) fehler.push("Steuernummer oder USt-IdNr. fehlt (Firmendaten, § 14 Abs. 4 UStG).");
  if (!projekt.auftraggeber) fehler.push("Auftraggeber (Rechnungsempfänger) fehlt im Projekt.");
  if (!r.nummer) fehler.push("Rechnungsnummer fehlt.");
  if (!r.datum) fehler.push("Rechnungsdatum fehlt.");
  if (!r.leistung_bis) fehler.push("Leistungszeitraum fehlt (Leistung bis).");
  const ohne = (r.positionen || []).filter(p => p.mengeKum !== 0 && !aufmass.some(a => a.stand_id === p.standId && a.knoten_id === p.knotenId));
  if (ohne.length) fehler.push(`${anz(ohne.length, "Position", "Positionen")} ohne Aufmaß: ${ohne.slice(0, 5).map(p => p.oz || p.kurztext).join(", ")}${ohne.length > 5 ? " …" : ""}`);
  const kaputt = aufmass.filter(a => formelFehler(a));
  if (kaputt.length) fehler.push(`${anz(kaputt.length, "Aufmaßzeile", "Aufmaßzeilen")} mit unlesbarem Rechenansatz.`);
  const abweichend = aufmass.filter(a => !formelFehler(a) && String(a.formel || "").trim() && Math.abs((formelAuswerten(a.formel) ?? 0) - Number(a.menge)) > 0.0005);
  if (abweichend.length) fehler.push(`${anz(abweichend.length, "Aufmaßzeile", "Aufmaßzeilen")}, deren Menge nicht zum Rechenansatz passt.`);
  if ((r.positionen || []).some(p => p.mengeKum < 0)) fehler.push("Negative Mengen kumuliert.");
  if (r.netto < 0) hinweise.push("Der Rechnungsbetrag ist negativ (Überzahlung). Das ist eine Gutschrift.");
  const mehr = zeilen.filter(z => z.vob === "mehr");
  if (mehr.length) hinweise.push(`${anz(mehr.length, "Position", "Positionen")} mehr als 10 % über der Vertragsmenge. Für die Übermenge kann ein neuer Preis verlangt werden (§ 2 Abs. 3 VOB/B).`);
  const unsicher = zeilen.filter(z => z.unsicher > 0.1 && z.mengeKum);
  if (unsicher.length) hinweise.push(`${anz(unsicher.length, "Position beruht", "Positionen beruhen")} auf geschätzten Fotomaßen mit mehr als 10 % Toleranz. Vor der Schlussrechnung nachmessen.`);
  const offen = (nachtraege || []).filter(n => !istBeauftragt(n) && n.status !== "abgelehnt" && n.status !== "zurueckgezogen");
  if (offen.length) hinweise.push(`${anz(offen.length, "Nachtrag ist", "Nachträge sind")} noch nicht beauftragt und nicht in der Rechnung.`);
  if (r.art === "schluss") {
    const nie = zeilen.filter(z => !z.aufmassZeilen && z.mengeLv > 0 && z.art !== "bedarf" && z.art !== "alternativ");
    if (nie.length) hinweise.push(`${anz(nie.length, "Vertragsposition", "Vertragspositionen")} ohne Aufmaß. Nicht ausgeführt? Dann ggf. Vergütung nach § 8 Abs. 1 VOB/B prüfen.`);
  }
  return { ok: fehler.length === 0, fehler, hinweise };
}

// ── Druck ─────────────────────────────────────────────────────────────────

const esc = s => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const eurD = x => (Number(x) || 0).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const mng = x => (Number(x) || 0).toLocaleString("de-DE", { maximumFractionDigits: 3 });
const datumDe = s => (s ? new Date(String(s).length <= 10 ? `${s}T12:00:00` : s).toLocaleDateString("de-DE") : "");

export function rechnungHtml(r, { projekt = {}, firma = {}, aufmass = [], alle = [], zahlungszielTage = 21 } = {}) {
  const titel = rechnungTitel(r, alle);
  const s = r.summen || {};
  const gruppen = [];
  for (const p of r.positionen || []) {
    const key = p.nachtrag ? `N${p.nachtrag.nummer}` : "H";
    let g = gruppen.find(x => x.key === key);
    if (!g) gruppen.push(g = { key, titel: p.nachtrag ? `Nachtrag ${p.nachtrag.nummer}: ${p.nachtrag.titel}` : "Hauptauftrag", positionen: [] });
    g.positionen.push(p);
  }
  const zeile = p => `<tr><td>${esc(p.oz)}</td><td>${esc(p.kurztext)}</td><td class="r">${mng(p.mengeLv)}</td><td class="r">${mng(p.mengeKum)}</td><td>${esc(p.einheit)}</td><td class="r">${eurD(p.up)}</td><td class="r">${eurD(p.betragKum)}</td><td class="r grau">${eurD(p.betragKum - p.betragVorher)}</td></tr>`;
  const tabellen = gruppen.map(g => `<tr class="gruppe"><td colspan="8">${esc(g.titel)}</td></tr>${g.positionen.map(zeile).join("")}
    <tr class="zw"><td colspan="6">Summe ${esc(g.titel)}</td><td class="r">${eurD(g.positionen.reduce((a, p) => a + p.betragKum, 0))}</td><td></td></tr>`).join("");
  const summe = (label, wert, klasse = "") => `<tr class="${klasse}"><td>${label}</td><td class="r">${wert}</td></tr>`;
  const bisher = (s.bisherListe || []).map(b => summe(`− ${esc(b.nummer)} vom ${datumDe(b.datum)}`, `−${eurD(b.netto)} €`)).join("");
  const aufmassAnlage = (r.positionen || []).map(p => {
    const z = aufmass.filter(a => a.stand_id === p.standId && a.knoten_id === p.knotenId).sort((a, b) => (a.sort - b.sort));
    if (!z.length) return "";
    return `<tr class="gruppe"><td colspan="6">${esc(p.oz)} ${esc(p.kurztext)}</td></tr>${z.map(a => `<tr><td>${esc(a.blatt)}</td><td>${esc(a.ort)}</td><td>${esc(a.bezeichnung)}</td><td>${esc(a.formel)}</td><td class="r">${a.abzug ? "−" : ""}${mng(a.menge)}</td><td>${esc(p.einheit)}</td></tr>`).join("")}
      <tr class="zw"><td colspan="4">Summe</td><td class="r">${mng(p.mengeKum)}</td><td>${esc(p.einheit)}</td></tr>`;
  }).join("");
  const anschrift = [firma.strasse, [firma.plz, firma.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ") || firma.adresse || "";
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>${esc(titel)} ${esc(r.nummer)}</title><style>
body{font:9.5pt/1.4 system-ui,sans-serif;color:#1c1c1c;margin:16mm}h1{font-size:15pt;font-weight:600;margin:8mm 0 3mm}h2{font-size:11pt;font-weight:600;margin:8mm 0 2mm;page-break-before:always}
table{width:100%;border-collapse:collapse}td,th{padding:2.5px 4px;border-bottom:.5px solid #d6d6d6;vertical-align:top;text-align:left}th{font-weight:500;color:#555}
.r{text-align:right;white-space:nowrap}.grau{color:#666}.gruppe td{font-weight:600;background:#f3f3f1}.zw td{font-style:italic;color:#444}
.kopf{display:flex;justify-content:space-between;gap:10mm}.summen{width:auto;margin:5mm 0 0 auto;min-width:95mm}.summen td{border:0;padding:1.5px 4px}.summen .s td{border-top:.8px solid #333;font-weight:600}
.klein{font-size:8.5pt;color:#555}
</style></head><body>
<div class="kopf"><div><b>${esc(firma.name)}</b><br>${esc(anschrift)}</div><div class="klein" style="text-align:right">${firma.steuernummer ? `Steuernummer ${esc(firma.steuernummer)}<br>` : ""}${firma.ust_id ? `USt-IdNr. ${esc(firma.ust_id)}<br>` : ""}${firma.telefon ? esc(firma.telefon) + "<br>" : ""}${esc(firma.email || "")}</div></div>
<p style="margin-top:8mm">${esc(projekt.auftraggeber || "")}</p>
<h1>${esc(titel)} Nr. ${esc(r.nummer)}</h1>
<p>Bauvorhaben: <b>${esc(projekt.name || "")}</b>${projekt.ort ? `, ${esc(projekt.ort)}` : ""}<br>
Rechnungsdatum: ${datumDe(r.datum)} · Leistungszeitraum: ${r.leistung_von ? `${datumDe(r.leistung_von)} bis ` : "bis "}${datumDe(r.leistung_bis)}</p>
<table><thead><tr><th>OZ</th><th>Leistung</th><th class="r">Menge LV</th><th class="r">Menge kum.</th><th>ME</th><th class="r">EP €</th><th class="r">Betrag kum. €</th><th class="r">davon neu €</th></tr></thead><tbody>${tabellen}</tbody></table>
<table class="summen">
${summe("Leistung kumuliert netto", `${eurD(s.leistung)} €`)}
${s.nachlass ? summe(`− Nachlass ${mng(s.nachlassProzent)} %`, `−${eurD(s.nachlass)} €`) : ""}
${s.einbehalt ? summe(`− Einbehalt ${mng(s.einbehaltProzent)} %`, `−${eurD(s.einbehalt)} €`) : ""}
${s.nachlass || s.einbehalt ? summe("Anrechenbar kumuliert", `${eurD(s.anrechenbar)} €`) : ""}
${bisher}
${summe("Rechnungsbetrag netto", `${eurD(s.netto)} €`, "s")}
${s.umkehr ? "" : summe(`zzgl. ${mng(s.mwst)} % USt`, `${eurD(s.steuer)} €`)}
${summe(s.umkehr ? "Rechnungsbetrag" : "Rechnungsbetrag brutto", `${eurD(s.brutto)} €`, "s")}
</table>
${s.umkehr ? `<p>Steuerschuldnerschaft des Leistungsempfängers (§ 13b UStG). Die Umsatzsteuer schuldet der Leistungsempfänger.</p>` : ""}
<p>Zahlbar ${r.art === "schluss" ? "gemäß § 16 Abs. 3 VOB/B" : `innerhalb von ${zahlungszielTage} Tagen`} ohne Abzug${firma.iban ? ` auf das Konto IBAN ${esc(firma.iban)}` : ""}. Das Aufmaß liegt als Anlage bei.</p>
${aufmassAnlage ? `<h2>Anlage: Aufmaß</h2><table><thead><tr><th>Blatt</th><th>Ort</th><th>Bezeichnung</th><th>Rechenansatz</th><th class="r">Menge</th><th>ME</th></tr></thead><tbody>${aufmassAnlage}</tbody></table>` : ""}
</body></html>`;
}

// ── GAEB X31 ─────────────────────────────────────────────────────────────

const xmlEsc = s => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Mengen je Position im Baum des Stands, OZ-Teile als RNoPart
export function aufmassX31(stand, knoten, aufmass, { projekt = {}, datum = new Date().toISOString().slice(0, 10), bis = datum } = {}) {
  const jePos = aufmassJePosition(aufmass.filter(a => a.stand_id === stand.id));
  const index = baumIndex(knoten);
  let n = 1, items = 0;
  const teil = (k, eltern) => {
    const oz = String(k.oz || "");
    const e = String(eltern?.oz || "");
    return (e && oz.startsWith(e) ? oz.slice(e.length) : oz).replace(/^\./, "") || String(n);
  };
  const body = (parent, eltern) => {
    const kinder = index.kinderVon(parent);
    let xml = "<BoQBody>";
    for (const k of kinder.filter(k => k.typ === "titel")) xml += `<BoQCtgy ID="C${n++}" RNoPart="${xmlEsc(teil(k, eltern))}">${body(k.id, k)}</BoQCtgy>`;
    const pos = kinder.filter(k => k.typ === "position" && jePos.has(schluessel(stand.id, k.id)));
    if (pos.length) {
      xml += "<Itemlist>";
      for (const k of pos) {
        xml += `<Item ID="I${n++}" RNoPart="${xmlEsc(teil(k, eltern))}"><QtyDeterm><Qty>${jePos.get(schluessel(stand.id, k.id)).menge.toFixed(3)}</Qty></QtyDeterm></Item>`;
        items++;
      }
      xml += "</Itemlist>";
    }
    return xml + "</BoQBody>";
  };
  const b = body(null, null);
  const text = `<?xml version="1.0" encoding="UTF-8"?>
<GAEB xmlns="http://www.gaeb.de/GAEB_DA_XML/DA31/3.3">
<GAEBInfo><Version>3.3</Version><VersDate>2021-05</VersDate><Date>${datum}</Date><ProgSystem>Polaris</ProgSystem><ProgName>Polaris</ProgName></GAEBInfo>
<QtyDeterm><PrjInfo><RefPrjName>${xmlEsc(projekt.name || "")}</RefPrjName></PrjInfo>
<QtyDetermInfo><MethodDescription>Aufmaß nach REB, Mengen je Position</MethodDescription><OrdDescr>${xmlEsc(stand.bezeichnung || "")}</OrdDescr><ServiceProvisionEndDate>${bis}</ServiceProvisionEndDate></QtyDetermInfo>
<DP>31</DP>
<BoQ ID="B1"><RefBoQName>${xmlEsc(stand.bezeichnung || projekt.name || "")}</RefBoQName>
${b}
</BoQ></QtyDeterm>
</GAEB>
`;
  return { text, anzahl: items };
}

// X31 lesen (eigene oder fremde Aufmaßprogramme): [{ oz, menge }]
export function x31Lesen(text) {
  const aus = [];
  const pfad = [];
  const re = /<BoQCtgy\b[^>]*RNoPart="([^"]*)"[^>]*>|<\/BoQCtgy>|<Item\b[^>]*RNoPart="([^"]*)"[^>]*>([\s\S]*?)<\/Item>/g;
  let m;
  while ((m = re.exec(String(text || "")))) {
    if (m[0].startsWith("</BoQCtgy")) { pfad.pop(); continue; }
    if (m[1] != null && m[0].startsWith("<BoQCtgy")) { pfad.push(m[1]); continue; }
    const q = m[3].match(/<Qty>\s*([-\d.,]+)\s*<\/Qty>/);
    if (!q) continue;
    aus.push({ oz: [...pfad, m[2]].join("."), menge: Number(q[1].replace(",", ".")) });
  }
  return aus;
}

// Gelesene X31-Mengen → Aufmaßzeilen (je Position eine Zeile "Import X31")
export function x31ZuAufmass(eintraege, stand, knoten, { datei = "X31" } = {}) {
  const nachOz = new Map(knoten.filter(k => k.typ === "position" && k.oz).map(k => [ozNorm(k.oz), k]));
  const zeilen = [], fehlend = [];
  for (const e of eintraege) {
    const k = nachOz.get(ozNorm(e.oz));
    if (!k) { fehlend.push(e.oz); continue; }
    zeilen.push(neueAufmassZeile({ stand_id: stand.id, knoten_id: k.id, bezeichnung: `Import ${datei}`, formel: String(e.menge).replace(".", ","), menge: rundeMenge(e.menge), quelle: "import" }));
  }
  return { zeilen, fehlend };
}

// ── Nachträge ────────────────────────────────────────────────────────────

export function nachtragUebersicht(nachtraege, summeJeStand = new Map()) {
  const betrag = n => Number(n.betrag_beauftragt ?? n.betrag_angeboten ?? summeJeStand.get(n.stand_id) ?? 0) || 0;
  const aktiv = (nachtraege || []).filter(n => n.status !== "zurueckgezogen");
  const summe = l => rundeCent(l.reduce((s, n) => s + betrag(n), 0));
  const beauftragt = aktiv.filter(istBeauftragt);
  const offen = aktiv.filter(n => ["entwurf", "angemeldet", "angeboten"].includes(n.status));
  const abgelehnt = aktiv.filter(n => n.status === "abgelehnt");
  return { anzahl: aktiv.length, beauftragt: summe(beauftragt), offen: summe(offen), abgelehnt: summe(abgelehnt),
    beauftragtAnzahl: beauftragt.length, offenAnzahl: offen.length, quote: summe(beauftragt) + summe(abgelehnt) > 0 ? summe(beauftragt) / (summe(beauftragt) + summe(abgelehnt)) : null };
}

export const BEGRUENDUNG_WERKZEUG = {
  name: "begruendung_abgeben",
  description: "Gibt die Begründung des Nachtrags ab.",
  input_schema: { type: "object", properties: {
    begruendung: { type: "string", description: "Sachliche Begründung für den Auftraggeber, 4 bis 10 Sätze" },
    fehlende_angaben: { type: "array", items: { type: "string" }, description: "Was der Bauleiter noch belegen sollte (Anordnung, Datum, Fotos …)" },
  }, required: ["begruendung"] },
};

export function begruendungPrompt() {
  return `Du schreibst für einen Bauunternehmer die Begründung eines Nachtragsangebots an den Auftraggeber.
- Sachlich, ohne Vorwürfe, in der Sprache eines erfahrenen Bauleiters. Keine Floskeln.
- Nenne die vertragliche Grundlage (VOB/B), was im Vertrag vereinbart war, was sich geändert hat oder hinzukam, wer es veranlasst hat und wann, und warum die Leistung zur Ausführung nötig ist.
- Erfinde keine Tatsachen: Nutze nur, was in den Angaben steht. Fehlt etwas Wichtiges (Datum der Anordnung, Anordnender, Behinderungsanzeige), nenne es unter fehlende_angaben und schreibe die Begründung so, dass es ergänzt werden kann.
- Bei zusätzlichen Leistungen (§ 2 Abs. 6 VOB/B) erwähnen, dass der Anspruch vor Ausführung angekündigt wurde, nur wenn das in den Angaben steht.
Rufe genau einmal ${BEGRUENDUNG_WERKZEUG.name} auf.`;
}

export async function begruendungKi({ nachtrag, knoten = [], projekt = {}, notizen = "", rufeKi }) {
  const pos = knoten.filter(k => k.typ === "position").slice(0, 60).map(k => `${k.oz || ""} ${k.kurztext} – ${mng(k.menge)} ${k.einheit || ""}`).join("\n");
  const text = `Projekt: ${projekt.name || ""}${projekt.auftraggeber ? `, Auftraggeber ${projekt.auftraggeber}` : ""}
Nachtrag ${nachtrag.nummer}: ${nachtrag.titel}
Grund: ${GRUND_LABEL[nachtrag.grund] || nachtrag.grund} (${GRUND_VOB[nachtrag.grund] || "ohne Bezug"})
Angaben des Bauleiters: ${notizen || nachtrag.begruendung || "keine"}
${nachtrag.angemeldet_am ? `Angemeldet am: ${nachtrag.angemeldet_am}` : "Anmeldedatum: nicht angegeben"}
Positionen des Nachtrags:
${pos || "noch keine"}`;
  const a = await rufeKi(begruendungPrompt(), [{ role: "user", content: text }], [BEGRUENDUNG_WERKZEUG], { type: "tool", name: BEGRUENDUNG_WERKZEUG.name });
  const input = (a?.content || []).find(b => b.type === "tool_use" && b.name === BEGRUENDUNG_WERKZEUG.name)?.input;
  if (!input?.begruendung) throw new Error("Die KI hat keine Begründung geliefert");
  return { begruendung: String(input.begruendung).trim(), fehlend: (input.fehlende_angaben || []).map(String) };
}

// ── NU-Rechnungsprüfung ───────────────────────────────────────────────────

// v: vergebenes Paket (vergabe.js), r: NU-Rechnung { positionen: [{ key, menge, ep }], art, gefordert },
// eigeneMengen: Map knotenId → eigenes Aufmaß (nur NU-Pakete), vorherige: frühere geprüfte NU-Rechnungen
export function nuRechnungPruefen(v, r, { eigeneMengen = new Map(), vorherige = [], einbehaltProzent = 0 } = {}) {
  const b = (v?.bieter || []).find(x => x.id === v.vergeben_an);
  if (!b) throw new Error("Paket ist nicht vergeben");
  const nachZeile = new Map((v.zeilen || []).map(z => [z.key, z]));
  const befunde = [];
  const zeilen = [];
  let gefordertC = 0, geprueftC = 0;
  for (const p of r.positionen || []) {
    const z = nachZeile.get(p.key);
    const mengeNu = rundeMenge(p.menge);
    const epNu = Number(p.ep) || 0;
    const betragNuC = gpCent({ typ: "position", menge: mengeNu, ep: epNu, rabatt: 0 });
    gefordertC += betragNuC;
    const eigene = z?.knotenId != null && eigeneMengen.has(z.knotenId) ? rundeMenge(eigeneMengen.get(z.knotenId)) : null;
    const epVertrag = z && b.preise?.[p.key] != null ? Number(b.preise[p.key]) : null;
    const f = [];
    let mengeG = mengeNu, epG = epNu;
    if (!z) { f.push("Position nicht im Auftrag: als Nachtrag prüfen"); mengeG = 0; }
    else {
      if (epVertrag == null) { f.push("Kein Vertragspreis"); epG = 0; }
      else if (epNu > epVertrag + 0.005) { f.push(`EP über Vertragspreis (${eurD(epVertrag)})`); epG = epVertrag; }
      if (eigene != null && mengeNu > eigene + 0.0005) { f.push(`Menge über eigenem Aufmaß (${mng(eigene)})`); mengeG = eigene; }
      if (eigene == null && v.art === "nu") f.push("Kein eigenes Aufmaß zum Vergleich");
      if (z.menge > 0 && mengeG > z.menge * (1 + SCHWELLE_VOB)) f.push(`mehr als 10 % über Auftragsmenge (${mng(z.menge)})`);
    }
    const betragGC = gpCent({ typ: "position", menge: mengeG, ep: epG, rabatt: 0 });
    geprueftC += betragGC;
    zeilen.push({ key: p.key, oz: z?.oz || p.oz || "", kurztext: z?.kurztext || p.text || "", einheit: z?.einheit || "", mengeNu, mengeEigen: eigene, mengeGeprueft: mengeG,
      epNu, epVertrag, epGeprueft: epG, betragNu: eur(betragNuC), betragGeprueft: eur(betragGC), befunde: f });
  }
  const nachlass = Number(b.nachlass) || 0;
  const nachNachlassC = geprueftC - Math.round(geprueftC * nachlass / 100);
  const einbehaltC = Math.round(nachNachlassC * (Number(einbehaltProzent) || 0) / 100);
  const anrechenbarC = nachNachlassC - einbehaltC;
  const bisherC = (vorherige || []).filter(x => ["geprueft", "freigegeben", "bezahlt"].includes(x.status) && x.id !== r.id).reduce((s, x) => s + centVon(x.geprueft), 0);
  const diesmalC = anrechenbarC - bisherC;
  const gefordert = r.gefordert != null && r.gefordert !== "" ? Number(r.gefordert) : null;
  if (gefordert != null) {
    const nuNachNachlassC = gefordertC - Math.round(gefordertC * nachlass / 100);
    const nuErwartetC = nuNachNachlassC - Math.round(nuNachNachlassC * (Number(einbehaltProzent) || 0) / 100) - bisherC;
    if (Math.abs(centVon(gefordert) - nuErwartetC) > 100) befunde.push(`Geforderter Betrag (${eurD(gefordert)} €) passt nicht zu den Positionen (${eurD(eur(nuErwartetC))} € nach Nachlass, Einbehalt und bisherigen Zahlungen).`);
  }
  const vergabe = Number(v.vergabe_summe) || 0;
  if (vergabe > 0 && eur(nachNachlassC) > vergabe * 1.0001) befunde.push(`Geprüfte Leistung (${eurD(eur(nachNachlassC))} €) liegt über der Auftragssumme (${eurD(vergabe)} €). Nachträge prüfen.`);
  if (r.art === "schluss" && !einbehaltProzent) befunde.push("Schlussrechnung ohne Sicherheitseinbehalt: Vertrag prüfen.");
  return {
    zeilen, befunde,
    summen: { gefordertKum: eur(gefordertC), geprueftKum: eur(geprueftC), kuerzung: eur(gefordertC - geprueftC), nachlassProzent: nachlass,
      nachNachlass: eur(nachNachlassC), einbehaltProzent: Number(einbehaltProzent) || 0, einbehalt: eur(einbehaltC), anrechenbar: eur(anrechenbarC),
      bisher: eur(bisherC), geprueft: eur(diesmalC), gefordert, differenz: gefordert != null ? rundeCent(gefordert - eur(diesmalC)) : null,
      abgerechnetAnteil: vergabe > 0 ? eur(nachNachlassC) / vergabe : null },
  };
}

export const NU_RECHNUNG_WERKZEUG = {
  name: "nu_rechnung_abgeben",
  description: "Gibt die gelesene Rechnung des Nachunternehmers ab, zugeordnet zu unseren Positionen.",
  input_schema: { type: "object", properties: {
    rechnungsnummer: { type: "string" }, datum: { type: "string", description: "JJJJ-MM-TT" },
    art: { type: "string", enum: ["abschlag", "teilschluss", "schluss"] },
    positionen: { type: "array", items: { type: "object", properties: {
      nr: { type: "integer", description: "Unsere Positionsnummer (#)" },
      menge: { type: "number", description: "Kumulierte Menge laut Rechnung" },
      ep: { type: "number", description: "Einheitspreis netto laut Rechnung" },
    }, required: ["nr", "menge", "ep"] } },
    betrag_netto: { type: "number", description: "Zahlbetrag dieser Rechnung netto, wenn genannt" },
  }, required: ["positionen"] },
};

export function nuRechnungPrompt() {
  return `Du liest die Rechnung eines Nachunternehmers und ordnest jede abgerechnete Position unseren Auftragspositionen zu.
- Zuordnung über Ordnungszahl, sonst über Leistung und Einheit.
- Menge ist die kumulierte (bisher insgesamt erbrachte) Menge, wie in der Rechnung angegeben. Stehen nur Mengen dieser Rechnung da, nimm sie und sage es nicht.
- Nur Zahlen, die im Dokument stehen. Nichts schätzen oder umrechnen.
Rufe genau einmal ${NU_RECHNUNG_WERKZEUG.name} auf.`;
}

export async function nuRechnungEinlesen({ anhang, text, v, rufeKi, dokumentInhalt }) {
  const map = new Map();
  const lv = (v.zeilen || []).map((z, i) => { map.set(i + 1, z); return `#${i + 1}${z.oz ? ` | OZ ${z.oz}` : ""} | ${mng(z.menge)} ${z.einheit} | ${z.kurztext}`; }).join("\n");
  const a = await rufeKi(nuRechnungPrompt(), [{ role: "user", content: [...dokumentInhalt(anhang, text), { type: "text", text: `Unsere Auftragspositionen:\n${lv}` }] }],
    [NU_RECHNUNG_WERKZEUG], { type: "tool", name: NU_RECHNUNG_WERKZEUG.name });
  const input = (a?.content || []).find(b => b.type === "tool_use" && b.name === NU_RECHNUNG_WERKZEUG.name)?.input;
  if (!input) throw new Error("Die KI konnte die Rechnung nicht lesen");
  return nuRechnungAuswerten(input, map);
}

export function nuRechnungAuswerten(input, map) {
  const positionen = [];
  for (const p of input?.positionen || []) {
    const z = map.get(Number(p.nr));
    if (!z || !Number.isFinite(Number(p.menge)) || !Number.isFinite(Number(p.ep))) continue;
    positionen.push({ key: z.key, menge: rundeMenge(p.menge), ep: rundeCent(p.ep) });
  }
  return { nummer: String(input?.rechnungsnummer || ""), datum: /^\d{4}-\d{2}-\d{2}$/.test(input?.datum || "") ? input.datum : null,
    art: ["abschlag", "teilschluss", "schluss"].includes(input?.art) ? input.art : "abschlag", positionen,
    gefordert: Number(input?.betrag_netto) > 0 ? rundeCent(input.betrag_netto) : null };
}

export function pruefvermerkHtml(v, r, ergebnis, { projekt = {}, firma = {}, pruefer = "" } = {}) {
  const b = (v.bieter || []).find(x => x.id === v.vergeben_an) || {};
  const s = ergebnis.summen;
  const zeilen = ergebnis.zeilen.map(z => `<tr><td>${esc(z.oz)}</td><td>${esc(z.kurztext)}</td><td class="r">${mng(z.mengeNu)}</td><td class="r">${z.mengeEigen == null ? "—" : mng(z.mengeEigen)}</td><td class="r">${mng(z.mengeGeprueft)}</td>
    <td class="r">${eurD(z.epNu)}</td><td class="r">${eurD(z.epGeprueft)}</td><td class="r">${eurD(z.betragNu)}</td><td class="r"><b>${eurD(z.betragGeprueft)}</b></td></tr>${z.befunde.length ? `<tr class="bef"><td></td><td colspan="8">${esc(z.befunde.join("; "))}</td></tr>` : ""}`).join("");
  const sz = (l, w, k = "") => `<tr class="${k}"><td>${l}</td><td class="r">${w}</td></tr>`;
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Prüfvermerk ${esc(r.nummer)}</title><style>
body{font:9pt/1.35 system-ui,sans-serif;margin:14mm;color:#1c1c1c}h1{font-size:14pt;font-weight:600}table{width:100%;border-collapse:collapse}
td,th{padding:2px 4px;border-bottom:.5px solid #d6d6d6;text-align:left;vertical-align:top}th{font-weight:500;color:#555}.r{text-align:right;white-space:nowrap}
.bef td{color:#a33;font-size:8.5pt;border-bottom:.5px solid #d6d6d6}.summen{width:auto;margin:5mm 0 0 auto;min-width:90mm}.summen td{border:0}.summen .s td{border-top:.8px solid #333;font-weight:600}
</style></head><body><h1>Prüfvermerk zur ${esc(RECHNUNG_ART_LABEL[r.art] || "Rechnung")} ${esc(r.nummer)}</h1>
<p>${esc(b.name || "")} · Paket ${esc(v.titel)} (${esc(v.auftrag?.nummer || "")}) · Bauvorhaben ${esc(projekt.name || "")}<br>Rechnung vom ${datumDe(r.datum)}, eingegangen ${datumDe(r.eingang)}</p>
<table><thead><tr><th>OZ</th><th>Leistung</th><th class="r">Menge NU</th><th class="r">Eigenes Aufmaß</th><th class="r">Menge geprüft</th><th class="r">EP NU</th><th class="r">EP geprüft</th><th class="r">Betrag NU</th><th class="r">Betrag geprüft</th></tr></thead><tbody>${zeilen}</tbody></table>
<table class="summen">${sz("Leistung kumuliert geprüft", `${eurD(s.geprueftKum)} €`)}${s.nachlassProzent ? sz(`− Nachlass ${mng(s.nachlassProzent)} %`, `−${eurD(s.geprueftKum - s.nachNachlass)} €`) : ""}
${s.einbehalt ? sz(`− Einbehalt ${mng(s.einbehaltProzent)} %`, `−${eurD(s.einbehalt)} €`) : ""}${s.bisher ? sz("− bisher geprüft", `−${eurD(s.bisher)} €`) : ""}
${sz("Geprüft zur Zahlung netto", `${eurD(s.geprueft)} €`, "s")}${s.gefordert != null ? sz("Gefordert netto", `${eurD(s.gefordert)} €`) : ""}${s.differenz ? sz("Kürzung", `${eurD(s.differenz)} €`) : ""}</table>
${ergebnis.befunde.length ? `<p><b>Befunde</b></p><ul>${ergebnis.befunde.map(x => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
<p style="margin-top:14mm">Geprüft: ${esc(pruefer || firma.name || "")}, ${datumDe(new Date().toISOString().slice(0, 10))}</p></body></html>`;
}
