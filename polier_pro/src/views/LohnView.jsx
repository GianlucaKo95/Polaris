import { useMemo, useState } from "react";
import { Wallet, Download, TriangleAlert, Settings, Loader2 } from "lucide-react";
import { sbFetch, sbClientMitToken } from "../lib/supabase.js";
import { inputStyle } from "../components/Label.jsx";
import { LOHNARTEN, BUNDESLAENDER, lohnEinstellungen, monatAuswerten, bewegungsdaten, lodasDatei, lohnPruefen } from "../lib/lohnvorerfassung.js";

const z = n => (n || 0).toLocaleString("de-DE", { maximumFractionDigits: 1 });
const WOCHENTAGE = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

function herunterladen(inhalt, dateiname, latin1 = false) {
  let daten;
  if (latin1) { // LODAS liest ANSI (Windows-1252); Zeichen außerhalb Latin-1 → "?"
    daten = new Uint8Array([...inhalt].map(c => (c.charCodeAt(0) < 256 ? c.charCodeAt(0) : 63)));
  } else daten = "﻿" + inhalt;
  const url = URL.createObjectURL(new Blob([daten], { type: "text/plain" }));
  const a = document.createElement("a"); a.href = url; a.download = dateiname; a.click(); URL.revokeObjectURL(url);
}

// Lohnvorerfassung je Monat (lib/lohnvorerfassung.js): Stunden aus der
// Stempeluhr, Abwesenheiten, Hand-Eingaben → Export an das Lohnbüro.
export function LohnView({ session, firmaId, projekte = [], einstellungen: gespeichert, setEinstellungen, status, darfEinstellen }) {
  const [monat, setMonat] = useState(() => { const d = new Date(); d.setMonth(d.getMonth() - (d.getDate() < 10 ? 1 : 0)); return d.toISOString().slice(0, 7); });
  const [daten, setDaten] = useState(null);
  const [laedt, setLaedt] = useState(false);
  const [eingaben, setEingaben] = useState({});
  const [eingabenStatus, setEingabenStatus] = useState(null);
  const [zeigeEinst, setZeigeEinst] = useState(false);
  const e = lohnEinstellungen(gespeichert);
  const setE = patch => setEinstellungen?.({ ...e, ...patch });
  const auth = { headers: { Authorization: `Bearer ${session?.access_token}` } };

  async function laden() {
    setLaedt(true);
    const [j, m] = monat.split("-").map(Number);
    const bis = new Date(j, m, 0).getDate();
    const [buchungen, abwesenheiten] = await Promise.all([
      sbFetch(`zeitbuchungen?select=*,profile(vorname,nachname)&status=eq.abgeschlossen&eingestempelt_at=gte.${monat}-01T00:00:00&eingestempelt_at=lte.${monat}-${bis}T23:59:59&order=eingestempelt_at.asc`, auth),
      sbFetch(`abwesenheiten?select=*,mitarbeiter:profile!abwesenheiten_profile_id_fkey(vorname,nachname)&von_datum=lte.${monat}-${bis}&bis_datum=gte.${monat}-01`, auth),
    ]);
    const { data, error } = await sbClientMitToken(session).from("lohn_monat").select("*").eq("monat", `${monat}-01`);
    setEingabenStatus(error ? "fehlt" : "ok");
    setEingaben(Object.fromEntries((data || []).map(r => [r.profil_id, r.eingaben || {}])));
    setDaten({ buchungen: buchungen || [], abwesenheiten: abwesenheiten || [] });
    setLaedt(false);
  }

  async function eingabeSpeichern(profilId, feld, wert) {
    const neu = { ...(eingaben[profilId] || {}), [feld]: Number(String(wert).replace(",", ".")) || 0 };
    setEingaben(x => ({ ...x, [profilId]: neu }));
    if (eingabenStatus !== "ok") return;
    await sbClientMitToken(session).from("lohn_monat")
      .upsert({ firma_id: firmaId, monat: `${monat}-01`, profil_id: profilId, eingaben: neu }, { onConflict: "firma_id,monat,profil_id" });
  }

  const auswertung = useMemo(() => daten ? monatAuswerten({ monat, ...daten, eingaben, einstellungen: e, projekte }) : [],
    [daten, eingaben, gespeichert, monat, projekte]);
  const hinweise = daten ? lohnPruefen(auswertung, e) : [];

  function csvExport() {
    const zeilen = bewegungsdaten(auswertung, e);
    const kopf = "Personalnummer;Name;Lohnart;Bezeichnung;Wert;Einheit;Kostenstelle";
    const csv = [kopf, ...zeilen.map(r => {
      const l = LOHNARTEN.find(x => x.key === r.key);
      return [r.pnr, r.name, r.la, l.bez, String(r.wert).replace(".", ","), l.einheit, r.kostenstelle].join(";");
    })].join("\r\n");
    herunterladen(csv, `Lohnvorerfassung_${monat}.csv`);
  }

  const zelle = { padding:"5px 4px", borderTop:"1px solid var(--border)", textAlign:"right", whiteSpace:"nowrap" };
  const feld = { ...inputStyle(), padding:"4px 6px", fontSize:12, width:52, textAlign:"right" };
  const knopf = (aktiv = true) => ({ background: aktiv ? "var(--yellow)" : "var(--surface2)", color: aktiv ? "#1a1200" : "var(--text)", border: aktiv ? "none" : "1px solid var(--border)",
    borderRadius:10, padding:"9px 12px", fontWeight:800, cursor:"pointer", fontFamily:"inherit", display:"inline-flex", alignItems:"center", gap:6, fontSize:13 });

  return (
    <div style={{ padding:"0 2px" }}>
      <div className="seiten-kopf" style={{ color:"var(--text)", fontWeight:700, fontSize:15, marginBottom:4, display:"flex", alignItems:"center", gap:7 }}>
        <Wallet size={16} /> Lohnvorerfassung
      </div>
      <div style={{ color:"var(--muted)", fontSize:12, marginBottom:10, lineHeight:1.45 }}>
        Stunden, Zuschläge und Fehlzeiten je Mitarbeiter für das Lohnbüro. Die Abrechnung selbst (Steuer, SV, SOKA-BAU) bleibt im Lohnprogramm.
      </div>
      {status === "fehlt" || eingabenStatus === "fehlt" ? (
        <div style={{ background:"var(--ybg)", color:"var(--ydark)", borderRadius:10, padding:"9px 12px", fontSize:12, marginBottom:10, display:"flex", gap:7 }}>
          <TriangleAlert size={14} style={{ flexShrink:0, marginTop:1 }} /> Bitte supabase-kalkulation.sql ausführen — bis dahin werden Einstellungen und Eingaben nicht gespeichert.
        </div>
      ) : null}

      <div style={{ display:"flex", gap:8, marginBottom:12, flexWrap:"wrap" }}>
        <input type="month" value={monat} onChange={ev => { setMonat(ev.target.value); setDaten(null); }} style={{ ...inputStyle(), width:"auto" }} />
        <button onClick={laden} disabled={laedt} style={knopf()}>{laedt ? <Loader2 size={14} style={{ animation:"polaris-spin 0.8s linear infinite" }} /> : null} Monat auswerten</button>
        {darfEinstellen && <button onClick={() => setZeigeEinst(x => !x)} style={knopf(false)}><Settings size={14} /> Einstellungen</button>}
      </div>

      {zeigeEinst && darfEinstellen && (
        <div style={{ background:"var(--surface)", border:"1.5px solid var(--border)", borderRadius:12, padding:12, marginBottom:12, fontSize:12 }}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:8 }}>
            <label>Bundesland (Feiertage)<select value={e.bundesland} onChange={ev => setE({ bundesland: ev.target.value })} style={{ ...inputStyle(), marginTop:3 }}>
              {BUNDESLAENDER.map(b => <option key={b}>{b}</option>)}</select></label>
            <label>Überstunden<select value={e.ueberstunden} onChange={ev => setE({ ueberstunden: ev.target.value })} style={{ ...inputStyle(), marginTop:3 }}>
              <option value="woche">über Wochen-Soll</option><option value="tag">über Tages-Soll</option><option value="keine">keine (Arbeitszeitkonto im Lohnprogramm)</option></select></label>
            <label>Wochen-Soll (h)<input type="number" value={e.wochenSoll} onChange={ev => setE({ wochenSoll: Number(ev.target.value) || 0 })} style={{ ...inputStyle(), marginTop:3 }} /></label>
            <label>Nachtzeit<div style={{ display:"flex", gap:4, marginTop:3 }}>
              <input type="time" value={e.nachtVon} onChange={ev => setE({ nachtVon: ev.target.value })} style={inputStyle()} />
              <input type="time" value={e.nachtBis} onChange={ev => setE({ nachtBis: ev.target.value })} style={inputStyle()} /></div></label>
            <label>DATEV-Beraternummer<input value={e.beraterNr} onChange={ev => setE({ beraterNr: ev.target.value.replace(/\D/g, "") })} style={{ ...inputStyle(), marginTop:3 }} /></label>
            <label>Mandantennummer<input value={e.mandantenNr} onChange={ev => setE({ mandantenNr: ev.target.value.replace(/\D/g, "") })} style={{ ...inputStyle(), marginTop:3 }} /></label>
          </div>
          <div style={{ marginBottom:8 }}>Soll-Stunden je Wochentag
            <div style={{ display:"grid", gridTemplateColumns:"repeat(7, 1fr)", gap:4, marginTop:3 }}>
              {[1, 2, 3, 4, 5, 6, 0].map(i => (
                <label key={i} style={{ textAlign:"center" }}>{WOCHENTAGE[i]}
                  <input type="number" min="0" step="0.5" value={e.sollJeWochentag[i]} onChange={ev => {
                    const s = [...e.sollJeWochentag]; s[i] = Number(ev.target.value) || 0; setE({ sollJeWochentag: s });
                  }} style={{ ...inputStyle(), padding:"5px", textAlign:"center" }} /></label>
              ))}
            </div>
          </div>
          <div style={{ fontWeight:700, margin:"6px 0 3px" }}>Lohnarten (mit dem Lohnbüro abstimmen!)</div>
          {LOHNARTEN.map(l => (
            <div key={l.key} style={{ display:"grid", gridTemplateColumns:"1fr 70px 50px", gap:4, alignItems:"center", marginBottom:3 }}>
              <span>{l.bez} ({l.einheit})</span>
              <input value={e.lohnarten[l.key]?.la || ""} placeholder="Lohnart" onChange={ev => setE({ lohnarten: { ...e.lohnarten, [l.key]: { ...e.lohnarten[l.key], la: ev.target.value } } })} style={{ ...inputStyle(), padding:"4px 6px" }} />
              <input value={e.lohnarten[l.key]?.bs || ""} placeholder="BS" title="BS-Nr in LODAS" onChange={ev => setE({ lohnarten: { ...e.lohnarten, [l.key]: { ...e.lohnarten[l.key], bs: ev.target.value } } })} style={{ ...inputStyle(), padding:"4px 6px" }} />
            </div>
          ))}
        </div>
      )}

      {daten && (
        <>
          {hinweise.concat(auswertung.flatMap(m => m.hinweise.map(h => `${m.name}: ${h}`))).map(h => (
            <div key={h} style={{ color:"var(--ydark)", fontSize:12, marginBottom:3 }}>⚠ {h}</div>
          ))}
          {!auswertung.length && <div style={{ color:"var(--muted)", fontSize:13, padding:20, textAlign:"center" }}>Keine Buchungen in diesem Monat.</div>}
          {auswertung.length > 0 && (
            <div style={{ overflowX:"auto", background:"var(--surface)", border:"1.5px solid var(--border)", borderRadius:12, marginTop:8 }}>
              <table style={{ borderCollapse:"collapse", fontSize:12, width:"100%" }}>
                <thead><tr style={{ color:"var(--muted)" }}>
                  {["Mitarbeiter", "PNr", "Std.", "Soll", "Überst.", "Nacht", "So", "FT-Arb.", "FT-bez.", "Urlaub", "Krank", "Schlechtw. h", "Erschw. h", "Auslöse T"].map(h =>
                    <th key={h} style={{ padding:"6px 4px", textAlign: h === "Mitarbeiter" ? "left" : "right", fontWeight:700 }}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {auswertung.map(m => (
                    <tr key={`${monat}-${m.profilId}`}>
                      <td style={{ ...zelle, textAlign:"left" }}>{m.name || "—"}
                        <div style={{ color:"var(--muted)", fontSize:10.5 }}>{m.baustellen.map(b => `${b.kostenstelle}: ${z(b.stunden)} h`).join(" · ")}</div></td>
                      <td style={zelle}>{darfEinstellen
                        ? <input value={e.personalnummern[m.profilId] || ""} onChange={ev => setE({ personalnummern: { ...e.personalnummern, [m.profilId]: ev.target.value.replace(/\D/g, "") } })} style={feld} />
                        : e.personalnummern[m.profilId] || "—"}</td>
                      <td style={{ ...zelle, fontWeight:700 }}>{z(m.stunden)}</td>
                      <td style={{ ...zelle, color:"var(--muted)" }}>{z(m.sollStunden)}</td>
                      {["ueberstunden", "nacht", "sonntag", "feiertagArbeit", "feiertagBezahlt", "urlaub", "krank"].map(k => <td key={k} style={zelle}>{m.werte[k] ? z(m.werte[k]) : "—"}</td>)}
                      {["schlechtwetter", "erschwernis", "ausloese"].map(k => (
                        <td key={k} style={zelle}><input inputMode="decimal" defaultValue={m.werte[k] || ""} onBlur={ev => eingabeSpeichern(m.profilId, k, ev.target.value)} style={feld} /></td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {auswertung.length > 0 && (
            <div style={{ display:"flex", gap:8, marginTop:12, flexWrap:"wrap" }}>
              <button onClick={() => herunterladen(lodasDatei(bewegungsdaten(auswertung, e), { monat, einstellungen: e }), `LODAS_Bewegungsdaten_${monat}.txt`, true)} style={knopf()}>
                <Download size={14} /> DATEV LODAS
              </button>
              <button onClick={csvExport} style={knopf(false)}><Download size={14} /> Tabelle (CSV)</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
