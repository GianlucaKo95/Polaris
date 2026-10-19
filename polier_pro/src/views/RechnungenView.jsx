import { useState } from "react";
import { FileText, ChevronLeft, TrendingUp, Printer, Trash2, Receipt } from "lucide-react";
import { useBackButton } from "../hooks/useBackButton.js";
import { escapeHtml } from "../lib/utils.js";
import { druckePDF } from "../lib/pdf.jsx";
import {
  positionenMitLeistungsstand, gesamtFortschritt, snapshotErstellen,
  rechnungsbetragNetto, rechnungGesamt, naechsteRechnungsnummer, kumulierterWert,
} from "../lib/rechnung.js";

const EUR = n => (n || 0).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const STATUS_RECHNUNG = {
  entwurf:   { label: "📝 Entwurf",   farbe: "var(--muted)", bg: "var(--surface2)" },
  versendet: { label: "📤 Versendet", farbe: "var(--blue)",  bg: "var(--bbg)" },
  bezahlt:   { label: "✅ Bezahlt",   farbe: "var(--green)", bg: "var(--gbg)" },
};

// Baut dasselbe HTML-Dokument-Layout wie der Angebots-PDF-Export (siehe
// AngebotEditor.jsx exportPDF) — identische CSS-Klassen/Optik, nur mit den
// Rechnungs-eigenen Inhalten (Leistungszeitraum als Positionstabelle mit
// Leistungsstand-Spalte statt Mengen×EP, Abschlagsübersicht statt Rabatt).
function rechnungHtml({ r, auftrag, projekt, eigeneFirma }) {
  const firmaAdresszeile = [
    eigeneFirma?.strasse,
    [eigeneFirma?.plz, eigeneFirma?.ort].filter(Boolean).join(" "),
  ].filter(Boolean).join(" · ");
  const firmaKontaktzeile = [eigeneFirma?.telefon, eigeneFirma?.email].filter(Boolean).join(" · ");
  const titel = r.typ === "schluss" ? "Schlussrechnung" : "Abschlagsrechnung";
  const g = rechnungGesamt(r.netto_betrag, { sicherheitseinbehaltProzent: r.sicherheitseinbehalt_prozent, mwstProzent: r.mwst });

  return `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"/>
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family:Arial,sans-serif; font-size:10.5pt; color:#1a1a1a; }
.page { width:210mm; padding:14mm 18mm; }
.header { display:flex; justify-content:space-between; align-items:flex-start;
  border-bottom:3px solid #F5C400; padding-bottom:12px; margin-bottom:16px; }
.logo-img { width:56px; height:56px; object-fit:contain; flex-shrink:0; }
.logo-mark { width:56px; height:56px; background:#F5C400; border-radius:50%;
  display:flex; align-items:center; justify-content:center; font-size:24px;
  color:#1a1a1a; flex-shrink:0; }
.firma-name { font-size:16pt; font-weight:900; letter-spacing:-0.5px; }
.firma-info { font-size:9pt; color:#666; margin-top:3px; line-height:1.5; }
.titel-block { text-align:right; }
.titel-block h1 { font-size:16pt; font-weight:900; }
.titel-block .nr { font-size:11pt; font-weight:bold; margin-top:3px; }
.titel-block .meta { font-size:9pt; color:#666; margin-top:3px; }
.betrag-banner { background:#1a1a1a; border-radius:12px; padding:14px 18px;
  margin-bottom:16px; display:flex; justify-content:space-between; align-items:center; }
.betrag-label { color:#999; font-size:9pt; }
.betrag-val { color:#F5C400; font-weight:900; font-size:22pt; margin-top:2px; line-height:1; }
.empfaenger { background:#f8f8f8; border-radius:6px; padding:12px 14px; margin-bottom:16px; }
.empfaenger-label { font-size:8pt; color:#888; margin-bottom:4px; }
.table { width:100%; border-collapse:collapse; margin-bottom:16px; }
.table th { background:#1a1a1a; color:#F5C400; padding:8px 10px;
  text-align:left; font-size:9pt; }
.table th:last-child, .table td:last-child { text-align:right; }
.table td { padding:8px 10px; border-bottom:1px solid #eee; font-size:10pt; }
.table tr:nth-child(even) td { background:#f8f8f8; }
.summen { margin-left:auto; width:280px; }
.summen-row { display:flex; justify-content:space-between;
  padding:5px 0; font-size:10pt; }
.summen-row.gesamt { border-top:2px solid #1a1a1a; margin-top:4px;
  padding-top:8px; font-weight:900; font-size:12pt; }
.summen-row.gesamt span:last-child { color:#F5C400; }
.footer-text { background:#f8f8f8; border-radius:6px; padding:10px 14px;
  font-size:9pt; color:#666; margin-top:16px; line-height:1.6; }
.footer { border-top:1px solid #ddd; margin-top:14px; padding-top:6px;
  font-size:7pt; color:#aaa; display:flex; justify-content:space-between; }
</style></head><body><div class="page">

<div class="header">
  <div style="display:flex;gap:14px;align-items:center;">
    ${eigeneFirma?.logo
      ? `<img class="logo-img" src="${eigeneFirma.logo}" alt="Logo"/>`
      : `<div class="logo-mark">★</div>`}
    <div>
      <div class="firma-name">${escapeHtml(eigeneFirma?.name) || "Polaris"}</div>
      <div class="firma-info">
        ${firmaAdresszeile ? `${escapeHtml(firmaAdresszeile)}<br>` : ""}
        ${firmaKontaktzeile ? `Tel: ${escapeHtml(firmaKontaktzeile)}<br>` : ""}
        ${eigeneFirma?.steuernummer ? "St-Nr: " + escapeHtml(eigeneFirma.steuernummer) : ""}
      </div>
    </div>
  </div>
  <div class="titel-block">
    <h1>${titel}</h1>
    <div class="nr">Nr. ${escapeHtml(r.nummer)}</div>
    <div class="meta">Datum: ${new Date(r.datum).toLocaleDateString("de-DE")}</div>
    <div class="meta" style="font-weight:bold">Projekt: ${escapeHtml(projekt?.name)}</div>
    <div class="meta">${escapeHtml(projekt?.projektnummer)}</div>
  </div>
</div>

<div class="betrag-banner">
  <div>
    <div class="betrag-label">Zahlbetrag</div>
    <div class="betrag-val">${EUR(g.zahlbetrag)} €</div>
  </div>
</div>

<div class="empfaenger">
  <div class="empfaenger-label">RECHNUNG AN</div>
  <strong>${escapeHtml(auftrag.empfaenger) || "—"}</strong>
</div>

<table class="table">
  <thead>
    <tr>
      <th style="width:40%">Bezeichnung</th>
      <th style="width:10%">Menge</th>
      <th style="width:10%">Einheit</th>
      <th style="width:12%">EP (€)</th>
      <th style="width:13%">Leistungsstand</th>
      <th style="width:15%">Kumuliert (€)</th>
    </tr>
  </thead>
  <tbody>
    ${r.positionen_snapshot.map(p => `
    <tr>
      <td>${escapeHtml(p.bez)}</td>
      <td>${(p.menge||0).toLocaleString("de-DE")}</td>
      <td>${escapeHtml(p.einheit)}</td>
      <td>${EUR(p.ep)}</td>
      <td>${p.prozent}%</td>
      <td><strong>${EUR(p.kumuliert)}</strong></td>
    </tr>`).join("")}
  </tbody>
</table>

<div class="summen">
  <div class="summen-row"><span>Rechnungsbetrag (netto)</span><span>${EUR(g.nettoBetrag)} €</span></div>
  <div class="summen-row"><span>MwSt. ${r.mwst}%</span><span>${EUR(g.mwstBetrag)} €</span></div>
  <div class="summen-row"><span>Rechnungsbetrag (brutto)</span><span>${EUR(g.bruttoBetrag)} €</span></div>
  ${r.sicherheitseinbehalt_prozent > 0 ? `<div class="summen-row"><span>Sicherheitseinbehalt ${r.sicherheitseinbehalt_prozent}%</span><span>- ${EUR(g.einbehalt)} €</span></div>` : ""}
  <div class="summen-row gesamt"><span>Zahlbetrag</span><span>${EUR(g.zahlbetrag)} €</span></div>
</div>

<div class="footer-text">
  ${r.typ === "schluss"
    ? "Schlussrechnung über die gesamte erbrachte Leistung — alle bisherigen Abschlagszahlungen sind bereits berücksichtigt."
    : "Abschlagsrechnung nach Bautenstand gemäß § 632a BGB / § 16 Abs. 1 VOB/B."}
  ${r.sicherheitseinbehalt_prozent > 0 ? ` Der Sicherheitseinbehalt wird nach Ablauf der vereinbarten Gewährleistungsfrist ausgezahlt.` : ""}
</div>

<div class="footer">
  <span>Erstellt mit Polaris · ${new Date().toLocaleString("de-DE")}</span>
  <span>${escapeHtml(eigeneFirma?.name)}</span>
</div>

</div></body></html>`;
}

function AuftragDetail({ auftrag, projekt, eigeneFirma, baufortschritt, rechnungen, bestaetigungen, onBaufortschrittSpeichern, onRechnungSpeichern, onRechnungLoeschen, onClose }) {
  const [prozentEntwurf, setProzentEntwurf] = useState({}); // { [positionId]: string } — lokaler Eingabepuffer bis onBlur
  const [fehler, setFehler] = useState("");
  const [erstelltLaedt, setErstelltLaedt] = useState(false);

  const positionenMitProzent = positionenMitLeistungsstand(auftrag.positionen, baufortschritt);
  const fortschritt = gesamtFortschritt(positionenMitProzent);
  const gesamtwert = positionenMitProzent.reduce((s,p) => s + (p.menge||0)*(p.ep||0), 0);
  const letzteRechnung = rechnungen.length ? rechnungen[rechnungen.length - 1] : null;
  const hatSchlussrechnung = rechnungen.some(r => r.typ === "schluss");
  const summeGestellt = rechnungen.reduce((s,r) => s + (r.netto_betrag||0), 0);

  async function prozentSpeichern(positionId, wert) {
    const prozent = Math.max(0, Math.min(100, Number(wert) || 0));
    const f = await onBaufortschrittSpeichern(auftrag.id, positionId, prozent);
    if (f) setFehler(f);
  }

  async function rechnungErstellen(schluss) {
    setErstelltLaedt(true);
    setFehler("");
    try {
      const snapshot = snapshotErstellen(positionenMitProzent, { schluss });
      const netto = rechnungsbetragNetto(snapshot, letzteRechnung);
      if (netto <= 0 && !schluss) {
        setFehler("Kein neuer Leistungsfortschritt seit der letzten Rechnung — keine Abschlagsrechnung nötig.");
        return;
      }
      const r = {
        angebot_id: auftrag.id,
        typ: schluss ? "schluss" : "abschlag",
        nummer: naechsteRechnungsnummer(rechnungen, new Date().toISOString().slice(0,10)),
        datum: new Date().toISOString().slice(0,10),
        status: "entwurf",
        positionen_snapshot: snapshot,
        netto_betrag: netto,
        sicherheitseinbehalt_prozent: letzteRechnung?.sicherheitseinbehalt_prozent || 0,
        mwst: auftrag.mwst ?? 19,
      };
      const { fehler: f } = await onRechnungSpeichern(r, true);
      if (f) setFehler(f);
    } finally {
      setErstelltLaedt(false);
    }
  }

  async function statusAendern(r, neuerStatus) {
    const { fehler: f } = await onRechnungSpeichern({ ...r, status: neuerStatus }, false);
    if (f) setFehler(f);
  }

  function rechnungDrucken(r) {
    const html = rechnungHtml({ r, auftrag, projekt, eigeneFirma });
    druckePDF(html, `${r.typ === "schluss" ? "Schlussrechnung" : "Abschlagsrechnung"}_${r.nummer}.pdf`);
  }

  return (
    <div>
      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:14 }}>
        <button onClick={onClose}
          style={{ background:"var(--surface2)", border:"1px solid var(--border)", borderRadius:8,
            padding:"6px 8px", cursor:"pointer", display:"flex", color:"var(--text)" }}>
          <ChevronLeft size={16} />
        </button>
        <div style={{ color:"var(--text)", fontWeight:700, fontSize:15 }}>{auftrag.titel}</div>
      </div>

      {fehler && (
        <div style={{ background:"var(--rbg)", color:"var(--red)", borderRadius:10,
          padding:"9px 14px", marginBottom:10, fontSize:12, border:"1px solid var(--red)" }}>
          {fehler}
        </div>
      )}

      {/* Übersicht */}
      <div style={{ background:"var(--surface)", border:"1.5px solid var(--border)", borderRadius:14,
        padding:"14px 16px", marginBottom:14 }}>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10 }}>
          <div>
            <div style={{ color:"var(--muted)", fontSize:10.5 }}>Auftragssumme (netto)</div>
            <div style={{ color:"var(--text)", fontWeight:800, fontSize:16 }}>{EUR(gesamtwert)} €</div>
          </div>
          <div>
            <div style={{ color:"var(--muted)", fontSize:10.5 }}>Fortschritt gesamt</div>
            <div style={{ color:"var(--yellow)", fontWeight:800, fontSize:16 }}>{fortschritt.toFixed(1)}%</div>
          </div>
          <div>
            <div style={{ color:"var(--muted)", fontSize:10.5 }}>Bereits abgerechnet (netto)</div>
            <div style={{ color:"var(--text)", fontWeight:800, fontSize:16 }}>{EUR(summeGestellt)} €</div>
          </div>
        </div>
        <div style={{ background:"var(--surface2)", borderRadius:20, height:8, marginTop:12, overflow:"hidden" }}>
          <div style={{ background:"var(--yellow)", height:"100%", width:`${Math.min(100,fortschritt)}%`,
            borderRadius:20, transition:"width .2s" }} />
        </div>
      </div>

      {/* Leistungsstand je Position */}
      <div style={{ color:"var(--text)", fontWeight:700, fontSize:13, marginBottom:8,
        display:"flex", alignItems:"center", gap:6 }}>
        <TrendingUp size={14} /> Leistungsstand erfassen
      </div>
      <div style={{ background:"var(--surface)", border:"1.5px solid var(--border)", borderRadius:14,
        marginBottom:16, overflow:"hidden" }}>
        {positionenMitProzent.map((p, i) => (
          <div key={p.id} style={{ display:"grid", gridTemplateColumns:"1fr 90px 80px", gap:8,
            alignItems:"center", padding:"9px 14px",
            borderTop: i>0 ? "1px solid var(--border)" : "none" }}>
            <div>
              <div style={{ color:"var(--text)", fontSize:12.5 }}>{p.bez}</div>
              <div style={{ color:"var(--muted)", fontSize:11 }}>
                {(p.menge||0).toLocaleString("de-DE")} {p.einheit} × {EUR(p.ep)} € = {EUR(kumulierterWert(p, p.prozent))} € kumuliert
              </div>
            </div>
            <div style={{ position:"relative" }}>
              <input type="number" min="0" max="100"
                value={prozentEntwurf[p.id] ?? p.prozent}
                onChange={e => setProzentEntwurf(x => ({ ...x, [p.id]: e.target.value }))}
                onBlur={e => { prozentSpeichern(p.id, e.target.value); setProzentEntwurf(x => { const n={...x}; delete n[p.id]; return n; }); }}
                style={{ width:"100%", padding:"6px 8px", fontSize:12.5, borderRadius:8,
                  border:"1.5px solid var(--border)", background:"var(--surface2)", color:"var(--text)" }} />
            </div>
            <div style={{ color:"var(--muted)", fontSize:11, textAlign:"right" }}>%</div>
          </div>
        ))}
        {positionenMitProzent.length === 0 && (
          <div style={{ padding:"16px", textAlign:"center", color:"var(--muted)", fontSize:12.5 }}>
            Keine Positionen im Angebot.
          </div>
        )}
      </div>

      {/* Rechnung erstellen */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:16 }}>
        <button onClick={() => rechnungErstellen(false)} disabled={erstelltLaedt}
          style={{ background:"var(--yellow)", color:"#1a1200", border:"none", borderRadius:10,
            padding:"10px 0", fontWeight:700, cursor: erstelltLaedt ? "default" : "pointer",
            fontSize:12.5, fontFamily:"inherit", opacity: erstelltLaedt ? 0.6 : 1 }}>
          Abschlagsrechnung erstellen
        </button>
        <button onClick={() => rechnungErstellen(true)} disabled={erstelltLaedt || hatSchlussrechnung}
          style={{ background:"var(--surface2)", color:"var(--text)", border:"1.5px solid var(--border)",
            borderRadius:10, padding:"10px 0", fontWeight:700,
            cursor: (erstelltLaedt || hatSchlussrechnung) ? "default" : "pointer",
            fontSize:12.5, fontFamily:"inherit", opacity: (erstelltLaedt || hatSchlussrechnung) ? 0.5 : 1 }}>
          {hatSchlussrechnung ? "Schlussrechnung bereits gestellt" : "Schlussrechnung erstellen"}
        </button>
      </div>

      {/* Bisherige Rechnungen */}
      <div style={{ color:"var(--text)", fontWeight:700, fontSize:13, marginBottom:8,
        display:"flex", alignItems:"center", gap:6 }}>
        <Receipt size={14} /> Rechnungen
      </div>
      {rechnungen.length === 0 && (
        <div style={{ textAlign:"center", padding:"20px", color:"var(--muted)", fontSize:12.5 }}>
          Noch keine Rechnung gestellt.
        </div>
      )}
      {[...rechnungen].reverse().map(r => {
        const g = rechnungGesamt(r.netto_betrag, { sicherheitseinbehaltProzent: r.sicherheitseinbehalt_prozent, mwstProzent: r.mwst });
        const statusInfo = STATUS_RECHNUNG[r.status] || STATUS_RECHNUNG.entwurf;
        const bestaetigung = (bestaetigungen || []).find(b => b.rechnung_id === r.id);
        return (
          <div key={r.id} style={{ background:"var(--surface)", borderRadius:12, padding:"11px 14px",
            marginBottom:7, border:"1.5px solid var(--border)" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
              <div>
                <div style={{ color:"var(--text)", fontWeight:700, fontSize:13 }}>
                  {r.typ === "schluss" ? "Schlussrechnung" : "Abschlagsrechnung"} {r.nummer}
                </div>
                <div style={{ color:"var(--muted)", fontSize:11.5, marginTop:2 }}>
                  {new Date(r.datum).toLocaleDateString("de-DE")}
                </div>
              </div>
              <div style={{ textAlign:"right" }}>
                <div style={{ color:"var(--yellow)", fontWeight:800, fontSize:15 }}>{EUR(g.zahlbetrag)} €</div>
                <div style={{ display:"inline-block", background:statusInfo.bg, color:statusInfo.farbe,
                  fontWeight:700, fontSize:10.5, borderRadius:20, padding:"3px 9px", marginTop:4 }}>
                  {statusInfo.label}
                </div>
              </div>
            </div>
            {bestaetigung && (
              <div style={{ marginTop:8, fontSize:11.5, fontWeight:700,
                color: bestaetigung.entscheidung === "bestaetigt" ? "var(--green)" : "var(--red)" }}>
                {bestaetigung.entscheidung === "bestaetigt"
                  ? `✓ Vom Kunden bestätigt (${bestaetigung.entschieden_name}, ${new Date(bestaetigung.entschieden_am).toLocaleDateString("de-DE")})`
                  : `⚠ Vom Kunden beanstandet${bestaetigung.beanstandungsgrund ? ": " + bestaetigung.beanstandungsgrund : ""}`}
              </div>
            )}
            <div style={{ display:"flex", gap:6, marginTop:9, flexWrap:"wrap" }}>
              <button onClick={() => rechnungDrucken(r)}
                style={{ background:"var(--surface2)", border:"1px solid var(--border)", color:"var(--text)",
                  borderRadius:8, padding:"5px 10px", cursor:"pointer", fontSize:11.5, fontFamily:"inherit",
                  display:"flex", alignItems:"center", gap:4 }}>
                <Printer size={11} /> PDF
              </button>
              {r.status === "entwurf" && (
                <button onClick={() => statusAendern(r, "versendet")}
                  style={{ background:"var(--bbg)", border:"1px solid var(--blue)", color:"var(--blue)",
                    borderRadius:8, padding:"5px 10px", cursor:"pointer", fontSize:11.5, fontFamily:"inherit" }}>
                  Als versendet markieren
                </button>
              )}
              {r.status === "versendet" && (
                <button onClick={() => statusAendern(r, "bezahlt")}
                  style={{ background:"var(--gbg)", border:"1px solid var(--green)", color:"var(--green)",
                    borderRadius:8, padding:"5px 10px", cursor:"pointer", fontSize:11.5, fontFamily:"inherit" }}>
                  Als bezahlt markieren
                </button>
              )}
              {r.status === "entwurf" && (
                <button onClick={() => onRechnungLoeschen(r.id)}
                  style={{ background:"var(--rbg)", border:"1px solid var(--red)", color:"var(--red)",
                    borderRadius:8, padding:"5px 10px", cursor:"pointer", fontSize:11.5, fontFamily:"inherit",
                    display:"flex", alignItems:"center", gap:4 }}>
                  <Trash2 size={11} /> Löschen
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function RechnungenView({ projekt, angebote, baufortschritt, rechnungen, rechnungBestaetigungen, eigeneFirma, onBaufortschrittSpeichern, onRechnungSpeichern, onRechnungLoeschen }) {
  const [aktAuftragId, setAktAuftragId] = useState(null);
  useBackButton(aktAuftragId, () => setAktAuftragId(null));

  // Rechnungsstellung ist nur für angenommene Angebote (= erteilte
  // Aufträge) sinnvoll — ein Entwurf/versendetes/abgelehntes Angebot hat
  // keinen verbindlichen Vertragsinhalt, auf den sich ein Leistungsstand
  // beziehen könnte.
  const auftraege = (angebote || []).filter(a => a.status === "angenommen");

  if (aktAuftragId) {
    const auftrag = auftraege.find(a => a.id === aktAuftragId);
    if (!auftrag) return null;
    return (
      <AuftragDetail
        auftrag={auftrag}
        projekt={projekt}
        eigeneFirma={eigeneFirma}
        baufortschritt={(baufortschritt||[]).filter(b => b.angebot_id === auftrag.id)}
        rechnungen={(rechnungen||[]).filter(r => r.angebot_id === auftrag.id)}
        bestaetigungen={rechnungBestaetigungen}
        onBaufortschrittSpeichern={onBaufortschrittSpeichern}
        onRechnungSpeichern={onRechnungSpeichern}
        onRechnungLoeschen={onRechnungLoeschen}
        onClose={() => setAktAuftragId(null)}
      />
    );
  }

  return (
    <div>
      <div style={{ color:"var(--text)", fontWeight:700, fontSize:15,
        display:"flex", alignItems:"center", gap:7, marginBottom:14 }}>
        <FileText size={16} /> Rechnungen
      </div>

      {auftraege.length === 0 && (
        <div style={{ textAlign:"center", padding:"35px 20px", color:"var(--muted)" }}>
          <div style={{ display:"flex", justifyContent:"center", marginBottom:9, color:"var(--muted)" }}><FileText size={40} /></div>
          <div style={{ fontWeight:700, color:"var(--text)", marginBottom:6 }}>
            Noch keine Aufträge
          </div>
          <div style={{ fontSize:13 }}>
            Rechnungsstellung ist erst möglich, sobald ein Angebot angenommen wurde.
          </div>
        </div>
      )}

      {auftraege.map(a => {
        const bf = (baufortschritt||[]).filter(b => b.angebot_id === a.id);
        const mit = positionenMitLeistungsstand(a.positionen, bf);
        const fortschritt = gesamtFortschritt(mit);
        const re = (rechnungen||[]).filter(r => r.angebot_id === a.id);
        return (
          <div key={a.id} onClick={() => setAktAuftragId(a.id)}
            style={{ background:"var(--surface)", borderRadius:14,
              padding:"12px 18px", marginBottom:7, cursor:"pointer",
              border:"1.5px solid var(--border)",
              boxShadow:"0 2px 8px rgba(0,0,0,0.05)" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
              <div>
                <div style={{ color:"var(--text)", fontWeight:700, fontSize:14 }}>{a.titel}</div>
                <div style={{ color:"var(--muted)", fontSize:12, marginTop:2 }}>{a.empfaenger}</div>
              </div>
              <div style={{ textAlign:"right" }}>
                <div style={{ color:"var(--yellow)", fontWeight:800, fontSize:15 }}>{fortschritt.toFixed(1)}%</div>
                <div style={{ color:"var(--muted)", fontSize:11.5, marginTop:2 }}>
                  {re.length} Rechnung{re.length!==1?"en":""}
                </div>
              </div>
            </div>
            <div style={{ background:"var(--surface2)", borderRadius:20, height:6, marginTop:9, overflow:"hidden" }}>
              <div style={{ background:"var(--yellow)", height:"100%", width:`${Math.min(100,fortschritt)}%`, borderRadius:20 }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
