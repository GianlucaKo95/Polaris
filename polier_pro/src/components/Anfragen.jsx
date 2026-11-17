import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Copy, Download, Mail, Sparkles, X } from "lucide-react";
import { Spinner } from "./Spinner.jsx";
import { kiToolAufruf } from "../lib/ai.js";
import { bedarfJePreis } from "../lib/preisstand.js";
import { gaeb90Schreiben, gaeb90AlsWindows1252 } from "../lib/gaeb90.js";
import { paketeVorschlagen, paketZeilen, anfrageText } from "../lib/anfragen.js";

// NU- und Lieferanten-Anfragen: Pakete per KI, Text aus Vorlage, D83 für NU.
// Stand (Pakete, Angaben, „angefragt“) liegt im Editor.

const z3 = n => (Number(n) || 0).toLocaleString("de-DE", { maximumFractionDigits: 3 });
const knopf = (haupt = false) => ({ height: 32, padding: "0 12px", borderRadius: 8, fontFamily: "inherit", fontSize: 13, cursor: "pointer",
  display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap", fontWeight: haupt ? 500 : 400, textDecoration: "none",
  border: haupt ? "none" : "1px solid var(--border2)", background: haupt ? "var(--text)" : "var(--surface)", color: haupt ? "var(--surface)" : "var(--text)" });
const feld = { boxSizing: "border-box", height: 34, padding: "0 10px", border: "1px solid var(--border2)", borderRadius: 8, background: "var(--surface)", color: "var(--text)", fontFamily: "inherit", fontSize: 14 };

export function Anfragen({ positionen, kalkulationspreise, projekt, eigeneFirma, profil, session, stand, setStand, onClose }) {
  const s = stand || {};
  const setze = teil => setStand(alt => ({ ...(alt || {}), ...teil }));
  const angaben = { abgabe: "", ausfuehrung: "", absender: profil?.name || profil?.vorname ? [profil.vorname, profil.name].filter(Boolean).join(" ") : "", ...(s.angaben || {}) };
  const [lauf, setLauf] = useState(false);
  const [fehler, setFehler] = useState(null);
  const [kopiert, setKopiert] = useState(null);
  const bedarf = useMemo(() => bedarfJePreis(positionen, "material"), [positionen]);
  const pakete = s.pakete || [];

  async function vorschlagen() {
    setFehler(null); setLauf(true);
    try {
      const rufeKi = (system, messages, tools, toolChoice) => kiToolAufruf({ system, messages, tools, toolChoice, maxTokens: 4000 }, session);
      setze({ pakete: await paketeVorschlagen({ positionen, materialBedarf: bedarf, kalkulationspreise, gewerkeFirma: eigeneFirma?.gewerke || [], rufeKi }), angefragt: {} });
    } catch (e) { setFehler(e.message); }
    setLauf(false);
  }
  const paketAendern = (id, teil) => setze({ pakete: pakete.map(p => p.id === id ? { ...p, ...teil } : p) });
  const angefragt = id => setze({ angefragt: { ...(s.angefragt || {}), [id]: new Date().toLocaleDateString("de-DE") } });

  function d83(paket) {
    const pos = positionen.filter(p => paket.positionIds.includes(p.id));
    const text = gaeb90Schreiben(pos, { projektTitel: `${projekt?.name || "Anfrage"} – ${paket.name}` });
    const url = URL.createObjectURL(new Blob([gaeb90AlsWindows1252(text)], { type: "application/octet-stream" }));
    const l = document.createElement("a");
    l.href = url; l.download = `Anfrage_${paket.name.replace(/\W+/g, "_")}.d83`; l.click(); URL.revokeObjectURL(url);
  }

  return createPortal(
    <div className="voll-overlay" role="dialog" aria-label="Anfragen" style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "var(--bg)", zIndex: 700, display: "flex", flexDirection: "column" }}>
      <div style={{ position: "sticky", top: 0, display: "flex", alignItems: "center", gap: 12, padding: "16px 24px", background: "var(--surface)", borderBottom: "1px solid var(--border)" }}>
        <div style={{ flex: 1, fontSize: 18, fontWeight: 500 }}>NU- und Lieferanten-Anfragen</div>
        <button onClick={onClose} aria-label="Schließen" style={{ ...knopf(), width: 32, padding: 0, justifyContent: "center" }}><X size={16} strokeWidth={1.5} /></button>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: 24 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
          <label style={{ fontSize: 13, color: "var(--text2)" }}>Angebot erbeten bis
            <input type="date" value={angaben.abgabe} onChange={e => setze({ angaben: { ...angaben, abgabe: e.target.value } })} style={{ ...feld, width: "100%", marginTop: 4 }} /></label>
          <label style={{ fontSize: 13, color: "var(--text2)" }}>Geplante Ausführung
            <input value={angaben.ausfuehrung} placeholder="z.B. KW 10–12/2027" onChange={e => setze({ angaben: { ...angaben, ausfuehrung: e.target.value } })} style={{ ...feld, width: "100%", marginTop: 4 }} /></label>
          <label style={{ fontSize: 13, color: "var(--text2)", gridColumn: "1 / -1" }}>Absender
            <input value={angaben.absender} onChange={e => setze({ angaben: { ...angaben, absender: e.target.value } })} style={{ ...feld, width: "100%", marginTop: 4 }} /></label>
        </div>
        <button onClick={vorschlagen} disabled={lauf || !session?.access_token} style={{ ...knopf(!pakete.length), height: 36, opacity: session?.access_token ? 1 : 0.5 }}>
          {lauf ? <Spinner size={13} /> : <Sparkles size={14} strokeWidth={1.5} />} {lauf ? "KI schnürt Pakete" : pakete.length ? "Pakete neu vorschlagen" : "Pakete vorschlagen"}
        </button>
        {!session?.access_token && <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 8 }}>Die KI braucht eine Anmeldung</div>}
        {fehler && <div role="alert" style={{ color: "var(--red)", fontSize: 13, marginTop: 8 }}>{fehler}</div>}

        {pakete.map(p => {
          const zeilen = paketZeilen(p, positionen, kalkulationspreise, bedarf);
          const { betreff, text } = anfrageText(p, zeilen, { projekt, firma: eigeneFirma, ...angaben });
          const am = s.angefragt?.[p.id];
          return (
            <div key={p.id} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 16, marginTop: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                <input value={p.name} onChange={e => paketAendern(p.id, { name: e.target.value })} aria-label="Paketname" style={{ ...feld, fontWeight: 500, flex: "0 1 280px" }} />
                <span style={{ fontSize: 13, color: "var(--text2)" }}>{p.art === "nu" ? "Nachunternehmer" : "Lieferant"}</span>
                {am && <span style={{ fontSize: 13, color: "var(--green)" }}>angefragt am {am}</span>}
                <button onClick={() => setze({ pakete: pakete.filter(x => x.id !== p.id) })} aria-label="Paket entfernen" style={{ ...knopf(), width: 32, padding: 0, justifyContent: "center", marginLeft: "auto" }}><X size={14} strokeWidth={1.5} /></button>
              </div>
              {p.begruendung && <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 8 }}>{p.begruendung}</div>}
              {zeilen.map((zl, i) => (
                <div key={i} style={{ display: "flex", gap: 8, padding: "4px 0", borderTop: "1px solid var(--border)", fontSize: 14 }}>
                  <span style={{ fontFamily: "var(--font-zahl)", color: "var(--text2)", width: 72, flexShrink: 0 }}>{zl.oz}</span>
                  <span style={{ flex: 1 }}>{zl.text}</span>
                  <span style={{ fontFamily: "var(--font-zahl)", whiteSpace: "nowrap" }}>{z3(zl.menge)} {zl.einheit}</span>
                  <button aria-label={`${zl.text} aus dem Paket nehmen`} onClick={() => paketAendern(p.id, p.art === "nu" ? { positionIds: p.positionIds.filter((_, j) => j !== i) } : { bausteinIds: p.bausteinIds.filter((_, j) => j !== i) })}
                    style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", display: "flex" }}><X size={13} /></button>
                </div>
              ))}
              <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                <button onClick={async () => { try { await navigator.clipboard.writeText(`${betreff}\n\n${text}`); setKopiert(p.id); setTimeout(() => setKopiert(null), 2000); } catch { setFehler("Kopieren nicht möglich"); } }} style={knopf()}>
                  <Copy size={14} strokeWidth={1.5} /> {kopiert === p.id ? "Kopiert" : "Text kopieren"}</button>
                {p.art === "nu" && <button onClick={() => d83(p)} style={knopf()}><Download size={14} strokeWidth={1.5} /> LV als D83</button>}
                <a href={`mailto:?subject=${encodeURIComponent(betreff)}&body=${encodeURIComponent(text)}`} onClick={() => angefragt(p.id)} style={knopf(true)}><Mail size={14} strokeWidth={1.5} /> Per E-Mail</a>
              </div>
            </div>
          );
        })}
        {pakete.length > 0 && <div style={{ fontSize: 13, color: "var(--text2)", marginTop: 16, lineHeight: 1.5 }}>Rückläufe: NU-Angebote im NU-Preisspiegel einlesen (GAEB, PDF oder Mailtext), Materialangebote im Preisstand unter „Lieferantenangebot einlesen“</div>}
      </div>
    </div>,
    document.body,
  );
}
