import { useState, useEffect, useRef } from "react";
import { Send, Trash2 } from "lucide-react";
import { supabase, sbKommentareLaden, sbKommentarSpeichern, sbKommentarLoeschen, sbProfileNamenLaden } from "../lib/supabase.js";

// Rollen, die auch fremde Kommentare löschen dürfen (Moderation) — muss mit
// der "aufgaben_kommentare_loeschen"-RLS-Policy übereinstimmen, sonst wirkt
// der Button für diese Rollen, scheitert aber lautlos am Server.
const LOESCH_ROLLEN = ["administrator", "polier", "geschaeftsfuehrer", "bauleiter"];

function zeitLabel(iso) {
  const d = new Date(iso);
  const heute = new Date();
  const istHeute = d.toDateString() === heute.toDateString();
  const zeit = d.toLocaleTimeString("de-DE", { hour:"2-digit", minute:"2-digit" });
  return istHeute ? zeit : `${d.toLocaleDateString("de-DE", { day:"2-digit", month:"2-digit" })} ${zeit}`;
}

export function AufgabenKommentare({ aufgabeId, firmaId, session, profil }) {
  const [kommentare, setKommentare] = useState([]);
  const [namen,      setNamen]      = useState({});
  const [text,       setText]       = useState("");
  const [laden,      setLaden]      = useState(true);
  const [senden,     setSenden]     = useState(false);
  const [fehler,     setFehler]     = useState("");
  const listRef = useRef(null);

  useEffect(() => {
    let aktiv = true;
    setLaden(true);
    sbKommentareLaden(aufgabeId, session).then(data => {
      if (aktiv) { setKommentare(data); setLaden(false); }
    });

    // Live-Updates: neue Kommentare von anderen Nutzern (z.B. Bauleiter im
    // Büro) erscheinen hier ohne manuelles Neuladen — der eigentliche
    // "Chat"-Charakter dieser Liste.
    const channel = supabase
      .channel(`aufgaben-kommentare-${aufgabeId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public",
        table: "aufgaben_kommentare", filter: `aufgabe_id=eq.${aufgabeId}` },
        payload => setKommentare(prev => prev.some(k => k.id === payload.new.id)
          ? prev : [...prev, payload.new]))
      .on("postgres_changes", { event: "DELETE", schema: "public",
        table: "aufgaben_kommentare", filter: `aufgabe_id=eq.${aufgabeId}` },
        payload => setKommentare(prev => prev.filter(k => k.id !== payload.old.id)))
      .subscribe();

    return () => { aktiv = false; supabase.removeChannel(channel); };
  }, [aufgabeId]);

  // Namen der Autoren nachladen, sobald in der Liste unbekannte
  // erstellt_von-IDs auftauchen (initial oder durch Realtime-Updates).
  useEffect(() => {
    const unbekannt = [...new Set(kommentare.map(k => k.erstellt_von).filter(id => id && !namen[id]))];
    if (unbekannt.length === 0) return;
    sbProfileNamenLaden(unbekannt, session).then(neu => {
      if (Object.keys(neu).length) setNamen(prev => ({ ...prev, ...neu }));
    });
  }, [kommentare]);

  useEffect(() => {
    listRef.current?.scrollTo(0, listRef.current.scrollHeight);
  }, [kommentare.length]);

  async function senden_() {
    const wert = text.trim();
    if (!wert || senden) return;
    setSenden(true);
    setFehler("");
    const { daten, fehler: err } = await sbKommentarSpeichern(wert, aufgabeId, firmaId, profil?.id, session);
    setSenden(false);
    if (err) { setFehler(err); return; }
    setText("");
    // Eigener Kommentar sofort anzeigen statt auf das Realtime-Echo zu
    // warten — Insert-Dedupe oben über die id verhindert ein Duplikat,
    // falls das Echo trotzdem (verzögert) eintrifft.
    if (daten) setKommentare(prev => prev.some(k => k.id === daten.id) ? prev : [...prev, daten]);
  }

  async function loeschen(id) {
    setKommentare(prev => prev.filter(k => k.id !== id));
    const { ok, fehler: err } = await sbKommentarLoeschen(id, session);
    if (!ok) setFehler(err || "Löschen fehlgeschlagen.");
  }

  const darfAlleLoeschen = LOESCH_ROLLEN.includes(profil?.rolle);

  return (
    <div style={{ marginBottom:12 }}>
      <div style={{ color:"var(--muted)", fontWeight:700, fontSize:11, textTransform:"uppercase",
        letterSpacing:0.4, marginBottom:7 }}>
        Kommentare {kommentare.length > 0 && `(${kommentare.length})`}
      </div>

      <div ref={listRef} style={{ maxHeight:260, overflowY:"auto", background:"var(--surface2)",
        borderRadius:10, padding: kommentare.length ? 10 : 0 }}>
        {laden && (
          <div style={{ color:"var(--muted)", fontSize:12, padding:12, textAlign:"center" }}>Lädt…</div>
        )}
        {!laden && kommentare.length === 0 && (
          <div style={{ color:"var(--muted)", fontSize:12, padding:12, textAlign:"center" }}>
            Noch keine Kommentare.
          </div>
        )}
        {kommentare.map(k => {
          const eigen = k.erstellt_von === profil?.id;
          return (
            <div key={k.id} style={{ marginBottom:8, display:"flex", gap:8,
              alignItems:"flex-start", justifyContent:"space-between" }}>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:"flex", gap:6, alignItems:"baseline" }}>
                  <span style={{ fontWeight:700, fontSize:12, color:"var(--text)" }}>
                    {namen[k.erstellt_von] || (eigen ? "Ich" : "…")}
                  </span>
                  <span style={{ fontSize:10.5, color:"var(--muted)" }}>{zeitLabel(k.created_at)}</span>
                </div>
                <div style={{ fontSize:13, color:"var(--text)", marginTop:2, wordBreak:"break-word",
                  whiteSpace:"pre-wrap" }}>{k.text}</div>
              </div>
              {(eigen || darfAlleLoeschen) && (
                <button onClick={() => loeschen(k.id)} title="Löschen"
                  style={{ background:"none", border:"none", color:"var(--muted)",
                    cursor:"pointer", padding:2, flexShrink:0 }}>
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {fehler && (
        <div style={{ color:"var(--red)", fontSize:11, marginTop:6 }}>{fehler}</div>
      )}

      <div style={{ display:"flex", gap:8, marginTop:8 }}>
        <input value={text} onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); senden_(); } }}
          placeholder="Kommentar schreiben…"
          style={{ flex:1, background:"var(--surface)", color:"var(--text)",
            border:"1.5px solid var(--border)", borderRadius:10, padding:"9px 12px",
            fontSize:13, fontFamily:"inherit" }} />
        <button onClick={senden_} disabled={!text.trim() || senden}
          style={{ background: text.trim() ? "var(--yellow)" : "var(--surface2)",
            color: text.trim() ? "#1a1200" : "var(--muted)",
            border:"none", borderRadius:10, width:40, flexShrink:0,
            cursor: text.trim() ? "pointer" : "default",
            display:"flex", alignItems:"center", justifyContent:"center" }}>
          <Send size={15} />
        </button>
      </div>
    </div>
  );
}
