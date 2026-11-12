import { useEffect, useMemo, useState } from "react";
import { Gauge, TriangleAlert, Save } from "lucide-react";
import { sbClientMitToken } from "../lib/supabase.js";
import { sollIstJePosition, faktorenJeStammposition } from "../lib/arbeitskalkulation.js";
import { zeitansaetzeAnpassen } from "../lib/nachkalkulation.js";
import { istTitel } from "../lib/lv.js";
import { inputStyle } from "../components/Label.jsx";
import { AbschnittMengen } from "../components/AbschnittMengen.jsx";

const h = n => (n || 0).toLocaleString("de-DE", { maximumFractionDigits: 1 });
const euro = n => `${Math.round(n || 0).toLocaleString("de-DE")} €`;
const FARBE = { rot: "var(--red)", gelb: "var(--ydark)", gruen: "var(--green)", keine: "var(--muted)" };

// Leistungserfassung für Polier/Bauleitung: Stunden des Tages auf die
// LV-Positionen der beauftragten Angebote verteilen, Leistungsstand je
// Position pflegen und Soll-Ist mit Prognose sehen (lib/arbeitskalkulation.js).
export function LeistungView({ projekt, angebote = [], baufortschritt = [], zeitbuchungen = [], kalkulationspreise = [],
  onBaufortschrittSpeichern, stammpositionen = [], setStammpositionen = null, istAdmin = false, session }) {
  const [rueckfuehrung, setRueckfuehrung] = useState("");
  const auftraege = useMemo(() => angebote.filter(a => a.status === "angenommen" && a.positionen?.length), [angebote]);
  const [verteilung, setVerteilung] = useState([]);
  const [status, setStatus] = useState(null); // null | ok | fehlt
  const [datum, setDatum] = useState(new Date().toISOString().slice(0, 10));
  const [eingabe, setEingabe] = useState({}); // key → Stunden (Text)
  const [speichert, setSpeichert] = useState(false);
  const [meldung, setMeldung] = useState("");

  useEffect(() => {
    if (!projekt?.id || !session?.access_token) return;
    sbClientMitToken(session).from("stunden_positionen").select("*").eq("projekt_id", projekt.id)
      .then(({ data, error }) => {
        if (error) { setStatus("fehlt"); return; }
        setVerteilung(data || []); setStatus("ok");
      });
  }, [projekt?.id, session?.access_token]);

  // Eingabefelder mit den schon gespeicherten Stunden des gewählten Tages füllen.
  useEffect(() => {
    const e = {};
    for (const v of verteilung) if (v.datum === datum) e[`${v.angebot_id}:${v.position_id}`] = String(v.stunden).replace(".", ",");
    setEingabe(e);
  }, [datum, verteilung]);

  const gestempelt = zeitbuchungen
    .filter(z => z.status === "abgeschlossen" && String(z.eingestempelt_at || "").slice(0, 10) === datum)
    .reduce((s, z) => s + (Number(z.netto_minuten) || 0) / 60, 0);
  const verteilt = Object.values(eingabe).reduce((s, v) => s + (Number(String(v).replace(",", ".")) || 0), 0);

  const auswertung = useMemo(() => sollIstJePosition({ angebote: auftraege, fortschritt: baufortschritt, verteilung, kalkulationspreise }),
    [auftraege, baufortschritt, verteilung, kalkulationspreise]);

  async function speichern() {
    setSpeichert(true); setMeldung("");
    const client = sbClientMitToken(session);
    const zeilen = Object.entries(eingabe)
      .map(([k, v]) => { const [angebot_id, position_id] = k.split(":"); return { angebot_id, position_id, stunden: Number(String(v).replace(",", ".")) || 0 }; });
    // Tag komplett ersetzen: alte Zeilen des Tages löschen, neue einfügen.
    const { error: delErr } = await client.from("stunden_positionen").delete().eq("projekt_id", projekt.id).eq("datum", datum);
    const neu = zeilen.filter(z => z.stunden > 0).map(z => ({ ...z, projekt_id: projekt.id, datum }));
    const { data, error } = neu.length ? await client.from("stunden_positionen").insert(neu).select() : { data: [], error: null };
    setSpeichert(false);
    if (delErr || error) { setMeldung(`Speichern fehlgeschlagen: ${(delErr || error).message}`); return; }
    setVerteilung(prev => [...prev.filter(v => v.datum !== datum), ...(data || [])]);
    setMeldung("✓ Gespeichert");
  }

  if (auftraege.length === 0) {
    return <div className="desk-leer" style={{ color:"var(--muted)", textAlign:"center", padding:30, fontSize:13 }}>
      Noch kein angenommenes Angebot auf dieser Baustelle — Soll-Ist braucht einen Auftrag.
    </div>;
  }

  return (
    <div>
      <div style={{ color:"var(--text)", fontWeight:700, fontSize:15, marginBottom:10, display:"flex", alignItems:"center", gap:7 }}>
        <Gauge size={16} /> Leistung & Soll-Ist
      </div>
      {status === "fehlt" && (
        <div style={{ background:"var(--ybg)", color:"var(--ydark)", borderRadius:10, padding:"9px 12px", fontSize:12, marginBottom:10, display:"flex", gap:7 }}>
          <TriangleAlert size={14} style={{ flexShrink:0, marginTop:1 }} /> Tabelle stunden_positionen fehlt — bitte supabase-kalkulation.sql ausführen.
        </div>
      )}

      <AbschnittMengen projekt={projekt} auftraege={auftraege} baufortschritt={baufortschritt}
        onBaufortschrittSpeichern={onBaufortschrittSpeichern} session={session} />

      {/* Soll-Ist-Übersicht */}
      <div style={{ background:"var(--surface)", border:"1.5px solid var(--border)", borderRadius:14, padding:12, marginBottom:12 }}>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap:6, fontSize:12, marginBottom:10 }}>
          <div><div style={{ color:"var(--muted)" }}>Soll gesamt</div><b>{h(auswertung.summe.soll)} h</b></div>
          <div><div style={{ color:"var(--muted)" }}>Soll erbracht</div><b>{h(auswertung.summe.sollErbracht)} h</b></div>
          <div><div style={{ color:"var(--muted)" }}>Ist</div><b>{h(auswertung.summe.ist)} h</b></div>
          <div><div style={{ color:"var(--muted)" }}>Prognose</div>
            <b style={{ color: auswertung.summe.mehrkosten > 0 ? "var(--red)" : "var(--green)" }}>
              {auswertung.summe.mehrkosten > 0 ? "+" : ""}{euro(auswertung.summe.mehrkosten)}
            </b></div>
        </div>
        {auswertung.zeilen.map(z => (
          <div key={`${z.angebotId}:${z.positionId}`} style={{ borderTop:"1px solid var(--border)", padding:"7px 0", fontSize:12 }}>
            <div style={{ display:"flex", justifyContent:"space-between", gap:8 }}>
              <div style={{ color:"var(--text)", fontWeight:700 }}>
                <span style={{ display:"inline-block", width:8, height:8, borderRadius:"50%", background:FARBE[z.ampel], marginRight:6 }} />
                {z.oz && <span style={{ color:"var(--muted)" }}>{z.oz} </span>}{z.bez}
              </div>
              <div style={{ color:FARBE[z.ampel], fontWeight:800, whiteSpace:"nowrap" }}>
                {z.faktor == null ? "—" : `Faktor ${z.faktor.toLocaleString("de-DE", { maximumFractionDigits: 2 })}`}
              </div>
            </div>
            <div style={{ color:"var(--muted)", marginTop:2 }}>
              {z.prozent} % fertig · Soll {h(z.sollErbracht)} von {h(z.soll)} h · Ist {h(z.ist)} h
              {z.prognose != null && <> · Prognose {h(z.prognose)} h{z.mehrkosten != null && <> ({z.mehrkosten > 0 ? "+" : ""}{euro(z.mehrkosten)})</>}</>}
            </div>
          </div>
        ))}
      </div>

      {istAdmin && setStammpositionen && (() => {
        const faktoren = faktorenJeStammposition(auswertung.zeilen).filter(f => stammpositionen.some(s => s.id === f.stammpositionId));
        if (!faktoren.length) return null;
        return (
          <div style={{ background:"var(--surface2)", border:"1px solid var(--border)", borderRadius:12, padding:"10px 12px", marginBottom:12, fontSize:12 }}>
            <div style={{ fontWeight:700, marginBottom:4 }}>Nachkalkulation je Stammposition</div>
            {faktoren.map(f => (
              <div key={f.stammpositionId} style={{ color:"var(--muted)" }}>
                {stammpositionen.find(s => s.id === f.stammpositionId)?.bez}: Faktor {f.faktor.toLocaleString("de-DE", { maximumFractionDigits: 2 })} ({h(f.ist)} h Ist / {h(f.sollErbracht)} h Soll)
              </div>
            ))}
            <button disabled={!!rueckfuehrung} onClick={() => {
              if (!window.confirm(`Zeitansätze von ${faktoren.length} Stammposition(en) mit ihrem eigenen Faktor anpassen?`)) return;
              setStammpositionen(prev => faktoren.reduce((liste, f) =>
                zeitansaetzeAnpassen(liste, [f.stammpositionId], f.faktor, kalkulationspreise, { projekt: projekt?.name || "" }), prev));
              setRueckfuehrung("✓ Zeitansätze angepasst");
            }} style={{ width:"100%", marginTop:8, background:"var(--surface)", border:"1.5px solid var(--border)", color:"var(--text)",
              borderRadius:10, padding:9, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>
              {rueckfuehrung || "Zeitansätze in die Stammpositionen übernehmen"}
            </button>
          </div>
        );
      })()}

      {/* Stundenverteilung des Tages */}
      <div style={{ background:"var(--surface)", border:"1.5px solid var(--border)", borderRadius:14, padding:12 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
          <div style={{ color:"var(--text)", fontWeight:700, fontSize:13.5 }}>Stunden verteilen</div>
          <input type="date" value={datum} onChange={e => setDatum(e.target.value)} style={{ ...inputStyle(), width:"auto", padding:"6px 8px", fontSize:12 }} />
        </div>
        <div style={{ fontSize:12, color: Math.abs(verteilt - gestempelt) > 0.25 && gestempelt > 0 ? "var(--ydark)" : "var(--muted)", marginBottom:8 }}>
          Gestempelt an diesem Tag: {h(gestempelt)} h · verteilt: {h(verteilt)} h
        </div>
        {auftraege.map(a => (
          <div key={a.id} style={{ marginBottom:8 }}>
            {auftraege.length > 1 && <div style={{ color:"var(--muted)", fontSize:11, fontWeight:700, textTransform:"uppercase", margin:"6px 0" }}>{a.titel}</div>}
            {a.positionen.filter(p => !istTitel(p) && p.bez).map(p => {
              const key = `${a.id}:${p.id}`;
              const bf = baufortschritt.find(b => String(b.angebot_id) === String(a.id) && String(b.position_id) === String(p.id));
              return (
                <div key={key} style={{ display:"grid", gridTemplateColumns:"1fr 64px 64px", gap:6, alignItems:"center", marginBottom:5 }}>
                  <div style={{ fontSize:12, color:"var(--text)" }}>{p.oz && <span style={{ color:"var(--muted)" }}>{p.oz} </span>}{p.bez}</div>
                  <input inputMode="decimal" value={eingabe[key] || ""} placeholder="h"
                    onChange={e => setEingabe(x => ({ ...x, [key]: e.target.value }))}
                    style={{ ...inputStyle(), padding:"6px 8px", fontSize:12 }} />
                  <input type="number" min="0" max="100" defaultValue={bf?.prozent ?? ""} placeholder="%"
                    onBlur={e => e.target.value !== "" && Number(e.target.value) !== Number(bf?.prozent) && onBaufortschrittSpeichern?.(a.id, p.id, Math.min(100, Math.max(0, Number(e.target.value))))}
                    style={{ ...inputStyle(), padding:"6px 8px", fontSize:12 }} />
                </div>
              );
            })}
          </div>
        ))}
        <div style={{ color:"var(--muted)", fontSize:11, marginBottom:8 }}>Spalten: Stunden an diesem Tag · Leistungsstand % (gesamt)</div>
        <button onClick={speichern} disabled={speichert || status !== "ok"}
          style={{ width:"100%", background:"var(--yellow)", color:"#1a1200", border:"none", borderRadius:10, padding:12,
            fontWeight:800, cursor:"pointer", fontFamily:"inherit", display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>
          <Save size={14} /> Stunden speichern
        </button>
        {meldung && <div style={{ fontSize:12, marginTop:6, color: meldung.startsWith("✓") ? "var(--green)" : "var(--red)" }}>{meldung}</div>}
      </div>
    </div>
  );
}
