import { Fragment, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Paperclip, Plus, Ruler, Trash2, X } from "lucide-react";
import { Spinner } from "./Spinner.jsx";
import { DiktierFeld } from "./DiktierFeld.jsx";
import { AufmassWerkzeug } from "./AufmassWerkzeug.jsx";
import { kiToolAufruf } from "../lib/ai.js";
import { anhangAusDatei } from "../lib/anhaenge.js";
import { katalogBauen } from "../lib/katalog.js";
import { zahlDe, neueZeile, zeileAendern, QUELLE } from "../lib/aufmass.js";
import {
  SCHRITTE, verstehen, mengenErmitteln, positionenBilden, positionMenge, mengenHerkunft, bauteilSummen, alsAngebotspositionen, annahmenListe,
} from "../lib/kiCopilot.js";
import { bloecke, blockVorkalkulieren, vorschlagVorschau, vorschlagAnwenden, rezepturText } from "../lib/kiVorkalkulation.js";
import { regelPruefung, kiPruefen, sortieren, zaehlen } from "../lib/kalkulationsPruefung.js";

// Kalkulations-Copilot: Anfrage → Verstehen → Mengen → Positionen →
// Kalkulation → Prüfung → Angebot. Logik in lib/kiCopilot.js. Der Stand liegt
// im Editor (stand/setStand), damit Schließen nichts verwirft.

const eur = n => (Number(n) || 0).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
const zahl = { fontFamily: "var(--font-zahl)", fontVariantNumeric: "tabular-nums" };
const knopf = (haupt = false) => ({ height: 36, padding: "0 14px", borderRadius: 8, fontFamily: "inherit", fontSize: 14, cursor: "pointer",
  display: "inline-flex", alignItems: "center", gap: 8, whiteSpace: "nowrap", fontWeight: haupt ? 500 : 400,
  border: haupt ? "none" : "1px solid var(--border2)", background: haupt ? "var(--text)" : "var(--surface)", color: haupt ? "var(--surface)" : "var(--text)" });
const klein = { ...knopf(), height: 30, padding: "0 10px", fontSize: 13 };
const feld = { boxSizing: "border-box", height: 34, padding: "0 10px", border: "1px solid var(--border2)", borderRadius: 8,
  background: "var(--surface)", color: "var(--text)", fontFamily: "inherit", fontSize: 14, width: "100%" };
const karte = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 16, marginBottom: 16 };
const h2 = { fontSize: 15, fontWeight: 500, margin: "0 0 8px" };
const FARBE = { hoch: "var(--green)", mittel: "var(--akzent)", niedrig: "var(--red)" };
const BEFUND_FARBE = { hoch: "var(--red)", mittel: "var(--akzent)", hinweis: "var(--muted)" };
const LAUF_TEXT = {
  verstehen: "Die KI liest die Anfrage und die Anhänge",
  mengen: "Die KI ermittelt die Mengen je Bauteil",
  positionen: "Die KI stellt die LV-Positionen auf",
  kalkulation: "Die KI kalkuliert die Positionen",
  pruefung: "Die KI prüft die Kalkulation",
};

export function KalkulationsCopilot({ projekt, eigeneFirma, stammpositionen = [], einheitspreise = [], lvVorlagen = [], kalkulationspreise = [],
  standardZuschlaege = null, nachtragZu = null, session, stand, setStand, onUebernehmen, onClose }) {
  const s = stand || {};
  const setze = teil => setStand(alt => ({ ...(alt || {}), ...(typeof teil === "function" ? teil(alt || {}) : teil) }));
  const schritt = s.schritt || "eingabe";
  const idx = SCHRITTE.findIndex(x => x.key === schritt);
  const [lauf, setLauf] = useState(null);
  const [fehler, setFehler] = useState(null);
  const [aufmassBauteil, setAufmassBauteil] = useState(null);
  const [offenLang, setOffenLang] = useState(null);
  const dateiRef = useRef(null);
  const rufeKi = (system, messages, tools, toolChoice) => kiToolAufruf({ system, messages, tools, toolChoice, maxTokens: 8000 }, session);
  const katalog = useMemo(() => katalogBauen({ stammpositionen, einheitspreise, lvVorlagen, kalkulationspreise, standardZuschlaege, urkalkulation: nachtragZu }),
    [stammpositionen, einheitspreise, lvVorlagen, kalkulationspreise, standardZuschlaege, nachtragZu]);
  const ctx = { stammpositionen, kalkulationspreise, standardZuschlaege };
  const veraltet = s.veraltet || {};

  // Änderung in Schritt k: alle späteren Schritte gelten als veraltet
  const geaendert = (key, teil) => setze(alt => {
    const k = SCHRITTE.findIndex(x => x.key === key);
    const v = { ...(alt.veraltet || {}) };
    SCHRITTE.slice(k + 1).forEach(x => { if (alt[x.key] || (x.key === "kalkulation" && alt.vorschlaege)) v[x.key] = true; });
    return { ...teil, veraltet: v };
  });

  const angebotspositionen = useMemo(() => s.positionen && s.mengen && s.verstehen ? alsAngebotspositionen(s.positionen, s.mengen, s.verstehen) : [],
    [s.positionen, s.mengen, s.verstehen]);
  const endPositionen = useMemo(() => angebotspositionen.map(p => {
    const v = s.vorschlaege?.[p.id];
    return v && (s.auswahl || []).includes(p.id) ? vorschlagAnwenden(p, v, ctx) : p;
  }), [angebotspositionen, s.vorschlaege, s.auswahl, stammpositionen, kalkulationspreise, standardZuschlaege]);
  const netto = endPositionen.reduce((x, p) => x + (Number(p.menge) || 0) * (Number(p.ep) || 0), 0);

  async function ausfuehren(ziel) {
    setFehler(null); setLauf(ziel);
    try {
      if (ziel === "verstehen") {
        const r = await verstehen({ eingabe: s.eingabe || {}, anhaenge: s.anhaenge || [], projekt, rufeKi });
        geaendert("eingabe", { verstehen: r });
      } else if (ziel === "mengen") {
        const r = await mengenErmitteln({ eingabe: s.eingabe || {}, anhaenge: s.anhaenge || [], verstaendnis: s.verstehen, rufeKi });
        geaendert("verstehen", { mengen: r });
      } else if (ziel === "positionen") {
        const r = await positionenBilden({ verstaendnis: s.verstehen, mengen: s.mengen, rufeKi });
        geaendert("mengen", { positionen: r });
      } else if (ziel === "kalkulation") {
        const ziele = angebotspositionen.filter(p => !String(p.bez).startsWith("──"));
        const vorschlaege = {};
        for (const block of bloecke(ziele)) {
          const erg = await blockVorkalkulieren({ block, katalog, kalkulationspreise, kontext: { projekt, gewerke: eigeneFirma?.gewerke || [] }, rufeKi });
          for (const [pid, v] of erg) vorschlaege[pid] = v;
        }
        const auswahl = Object.entries(vorschlaege).filter(([, v]) => v.art !== "offen").map(([pid]) => pid);
        geaendert("positionen", { vorschlaege, auswahl, kalkulation: true, pruefungKi: null });
      } else if (ziel === "pruefung") {
        const r = await kiPruefen({ positionen: endPositionen, kalkulationspreise, kontext: { projekt }, rufeKi });
        setze({ pruefungKi: r });
      }
      setze(alt => ({ veraltet: { ...(alt.veraltet || {}), [ziel]: false } }));
      if (ziel !== "pruefung") setze({ schritt: ziel });
    } catch (e) { setFehler(e.message); }
    setLauf(null);
  }

  // Weiter: vorhandenes Ergebnis anzeigen, sonst (oder wenn veraltet) erzeugen
  function weiter() {
    const naechster = SCHRITTE[idx + 1]?.key;
    if (!naechster) return;
    const vorhanden = naechster === "kalkulation" ? s.kalkulation : naechster === "pruefung" ? true : s[naechster];
    if (vorhanden && !veraltet[naechster]) setze({ schritt: naechster });
    else if (naechster === "pruefung") setze({ schritt: "pruefung" });
    else ausfuehren(naechster);
  }

  async function dateienDazu(liste) {
    setFehler(null);
    const neu = [];
    for (const d of liste) {
      try { neu.push({ ...(await anhangAusDatei(d)), datei: d }); } catch (e) { setFehler(e.message); }
    }
    geaendert("eingabe", { anhaenge: [...(s.anhaenge || []), ...neu] });
  }

  // ── Schritt-Inhalte ──
  const eingabe = (
    <>
      <div style={karte}>
        <DiktierFeld label="Was soll kalkuliert werden?" rows={6} value={s.eingabe?.text || ""} onChange={text => geaendert("eingabe", { eingabe: { ...(s.eingabe || {}), text } })} />
        <div style={{ fontSize: 13, color: "var(--text2)", marginTop: 8, lineHeight: 1.5 }}>
          Wie einem Kollegen erklären: Was, wo, wie groß, welche Qualität, was bekannt ist und was nicht. Pläne und Fotos liefern die Maße
        </div>
      </div>
      <div style={karte}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <h2 style={{ ...h2, flex: 1, margin: 0 }}>Anhänge</h2>
          <input ref={dateiRef} type="file" multiple hidden accept="application/pdf,image/*,.ifc" onChange={e => { dateienDazu([...e.target.files]); e.target.value = ""; }} />
          <button onClick={() => dateiRef.current?.click()} style={klein}><Paperclip size={14} strokeWidth={1.5} /> Pläne, Fotos, IFC</button>
        </div>
        {(s.anhaenge || []).map((a, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderTop: "1px solid var(--border)", marginTop: i ? 0 : 12 }}>
            {a.vorschau ? <img src={a.vorschau} alt="" style={{ width: 48, height: 36, objectFit: "cover", borderRadius: 4 }} /> : <div style={{ width: 48, fontSize: 12, color: "var(--muted)" }}>{a.name.split(".").pop().toUpperCase()}</div>}
            <span style={{ flex: 1, fontSize: 14 }}>{a.name}</span>
            <button aria-label={`${a.name} entfernen`} onClick={() => geaendert("eingabe", { anhaenge: s.anhaenge.filter((_, j) => j !== i) })} style={{ ...klein, width: 30, padding: 0, justifyContent: "center" }}><Trash2 size={14} strokeWidth={1.5} /></button>
          </div>
        ))}
      </div>
    </>
  );

  const v = s.verstehen;
  const setV = teil => geaendert("verstehen", { verstehen: { ...v, ...teil } });
  const listeAendern = (feldname, i, wert) => setV({ [feldname]: v[feldname].map((x, j) => j === i ? wert : x) });
  const verstehenAnsicht = v && (
    <>
      <div style={karte}>
        <h2 style={h2}>Verstanden</h2>
        <textarea value={v.zusammenfassung} onChange={e => setV({ zusammenfassung: e.target.value })} rows={3}
          style={{ ...feld, height: "auto", padding: "8px 10px", lineHeight: 1.5, resize: "vertical" }} />
      </div>
      {v.rueckfragen.length > 0 && (
        <div style={karte}>
          <h2 style={h2}>Rückfragen</h2>
          <div style={{ fontSize: 13, color: "var(--text2)", marginBottom: 8 }}>Vorgeschlagene Antworten sind eingetragen. Ändern, was du besser weißt</div>
          {v.rueckfragen.map((f, i) => (
            <div key={f.id} style={{ padding: "8px 0", borderTop: "1px solid var(--border)" }}>
              <div style={{ marginBottom: 6 }}>{f.frage}</div>
              <input value={f.antwort} onChange={e => listeAendern("rueckfragen", i, { ...f, antwort: e.target.value })} aria-label={f.frage} style={feld} />
            </div>
          ))}
        </div>
      )}
      <div style={karte}>
        <h2 style={h2}>Bauteile</h2>
        {v.bauteile.map((b, i) => (
          <div key={b.id} style={{ display: "flex", gap: 8, padding: "6px 0" }}>
            <input value={b.bez} onChange={e => listeAendern("bauteile", i, { ...b, bez: e.target.value })} aria-label="Bauteil" style={{ ...feld, flex: "0 0 30%" }} />
            <input value={b.beschreibung} onChange={e => listeAendern("bauteile", i, { ...b, beschreibung: e.target.value })} aria-label="Beschreibung" placeholder="Aufbau, Material" style={{ ...feld, flex: 1 }} />
            <button aria-label="Bauteil entfernen" onClick={() => setV({ bauteile: v.bauteile.filter((_, j) => j !== i) })} style={{ ...klein, width: 34, height: 34, padding: 0, justifyContent: "center" }}><Trash2 size={14} strokeWidth={1.5} /></button>
          </div>
        ))}
        <button onClick={() => setV({ bauteile: [...v.bauteile, { id: `b${Date.now()}`, bez: "", beschreibung: "" }] })} style={{ ...klein, marginTop: 6 }}><Plus size={14} strokeWidth={1.5} /> Bauteil</button>
      </div>
      <div style={karte}>
        <h2 style={h2}>Annahmen</h2>
        {v.annahmen.map((a, i) => (
          <div key={i} style={{ display: "flex", gap: 8, padding: "4px 0" }}>
            <input value={a} onChange={e => listeAendern("annahmen", i, e.target.value)} aria-label="Annahme" style={{ ...feld, flex: 1 }} />
            <button aria-label="Annahme entfernen" onClick={() => setV({ annahmen: v.annahmen.filter((_, j) => j !== i) })} style={{ ...klein, width: 34, height: 34, padding: 0, justifyContent: "center" }}><Trash2 size={14} strokeWidth={1.5} /></button>
          </div>
        ))}
        <button onClick={() => setV({ annahmen: [...v.annahmen, ""] })} style={{ ...klein, marginTop: 6 }}><Plus size={14} strokeWidth={1.5} /> Annahme</button>
      </div>
    </>
  );

  const m = s.mengen;
  const zeilenSetzen = (bid, zeilen) => geaendert("mengen", { mengen: { ...m, jeBauteil: { ...m.jeBauteil, [bid]: zeilen } } });
  const mengenAnsicht = m && v && (
    <>
      {m.hinweise?.length > 0 && <div style={{ ...karte, fontSize: 14, color: "var(--text2)", lineHeight: 1.5 }}>{m.hinweise.join(" · ")}</div>}
      {v.bauteile.map(b => {
        const zeilen = m.jeBauteil[b.id] || [];
        return (
          <div key={b.id} style={karte}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 8, flexWrap: "wrap" }}>
              <h2 style={{ ...h2, margin: 0, flex: 1 }}>{b.bez}</h2>
              <span style={{ ...zahl, fontSize: 14 }}>{bauteilSummen(b, zeilen).map(x => `${zahlDe(x.summe, 3)} ${x.einheit}${x.toleranz ? ` ± ${Math.round(x.toleranz * 100)} %` : ""}`).join(" · ") || "–"}</span>
              <button onClick={() => setAufmassBauteil(b.id)} style={klein}><Ruler size={14} strokeWidth={1.5} /> Im Plan oder Foto messen</button>
            </div>
            {zeilen.map(z => (
              <div key={z.id} style={{ display: "grid", gridTemplateColumns: "minmax(140px, 1.3fr) minmax(140px, 1.2fr) 84px 64px 72px 30px", gap: 6, alignItems: "center", padding: "4px 0" }}>
                <input value={z.bez} onChange={e => zeilenSetzen(b.id, zeilen.map(x => x.id === z.id ? zeileAendern(x, { bez: e.target.value }) : x))} aria-label="Bezeichnung" style={{ ...feld, height: 30, fontSize: 13 }} />
                <input value={z.formel} onChange={e => zeilenSetzen(b.id, zeilen.map(x => x.id === z.id ? zeileAendern(x, { formel: e.target.value }) : x))} aria-label="Formel" style={{ ...feld, ...zahl, height: 30, fontSize: 13 }} />
                <span style={{ ...zahl, textAlign: "right", fontSize: 13 }}>{z.abzug ? "−" : ""}{zahlDe(z.menge, 3)}</span>
                <span style={{ fontSize: 13, color: "var(--text2)" }}>{z.einheit}</span>
                <label style={{ fontSize: 12, color: "var(--text2)", display: "inline-flex", gap: 4, alignItems: "center" }}>
                  <input type="checkbox" checked={!!z.abzug} onChange={e => zeilenSetzen(b.id, zeilen.map(x => x.id === z.id ? { ...x, abzug: e.target.checked } : x))} /> Abzug
                </label>
                <button aria-label="Zeile löschen" onClick={() => zeilenSetzen(b.id, zeilen.filter(x => x.id !== z.id))} style={{ ...klein, width: 30, padding: 0, justifyContent: "center" }}><Trash2 size={13} strokeWidth={1.5} /></button>
                {(z.grundlage || z.toleranz) && <div style={{ gridColumn: "1 / -1", fontSize: 12, color: "var(--muted)", marginTop: -2 }}>
                  {QUELLE[z.quelle] || ""}{z.toleranz ? ` ± ${Math.round(z.toleranz * 100)} %` : ""}{z.grundlage && z.grundlage !== QUELLE[z.quelle] ? ` · ${z.grundlage}` : ""}
                </div>}
              </div>
            ))}
            <button onClick={() => zeilenSetzen(b.id, [...zeilen, neueZeile({ einheit: zeilen[0]?.einheit || "m²" })])} style={{ ...klein, marginTop: 6 }}><Plus size={14} strokeWidth={1.5} /> Zeile</button>
          </div>
        );
      })}
    </>
  );

  const pos = s.positionen;
  const posAendern = (pid, teil) => geaendert("positionen", { positionen: pos.map(p => p.id === pid ? { ...p, ...teil } : p) });
  const positionenAnsicht = pos && v && (
    <div style={{ ...karte, padding: 0, overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, minWidth: 760 }}>
        <thead><tr>{["Position", "Einheit", "Menge", "Herkunft der Menge", ""].map((t, i) => <th key={i} style={{ textAlign: i === 2 ? "right" : "left", fontWeight: 400, fontSize: 13, color: "var(--text2)", padding: "10px 12px", borderBottom: "1px solid var(--border2)" }}>{t}</th>)}</tr></thead>
        <tbody>
          {pos.map((p, i) => (<Fragment key={p.id}>
            {p.titel && p.titel !== pos[i - 1]?.titel && <tr><td colSpan={5} style={{ padding: "12px 12px 4px", fontWeight: 500 }}>{p.titel}</td></tr>}
            <tr>
              <td style={{ padding: "6px 12px", borderTop: "1px solid var(--border)", verticalAlign: "top" }}>
                <input value={p.bez} onChange={e => posAendern(p.id, { bez: e.target.value })} aria-label="Kurztext" style={{ ...feld, height: 30 }} />
                <button onClick={() => setOffenLang(offenLang === p.id ? null : p.id)} style={{ background: "none", border: "none", padding: "4px 0 0", color: "var(--text2)", fontFamily: "inherit", fontSize: 12, cursor: "pointer" }}>
                  {offenLang === p.id ? "Langtext schließen" : p.langtext ? "Langtext" : "Langtext ergänzen"}
                </button>
                {offenLang === p.id && <textarea value={p.langtext} onChange={e => posAendern(p.id, { langtext: e.target.value })} rows={4}
                  style={{ ...feld, height: "auto", padding: "8px 10px", lineHeight: 1.45, marginTop: 4, fontSize: 13 }} />}
              </td>
              <td style={{ padding: "6px 12px", borderTop: "1px solid var(--border)", verticalAlign: "top" }}><input value={p.einheit} onChange={e => posAendern(p.id, { einheit: e.target.value })} aria-label="Einheit" style={{ ...feld, height: 30, width: 64 }} /></td>
              <td style={{ padding: "12px 12px", borderTop: "1px solid var(--border)", verticalAlign: "top", textAlign: "right", ...zahl, whiteSpace: "nowrap" }}>
                {p.mengeAus ? zahlDe(positionMenge(p, m), 3)
                  : <input value={String(p.mengeDirekt ?? "").replace(".", ",")} inputMode="decimal" onChange={e => posAendern(p.id, { mengeDirekt: Number(e.target.value.replace(",", ".")) || 0 })} aria-label="Menge" style={{ ...feld, ...zahl, height: 30, width: 84, textAlign: "right" }} />}
              </td>
              <td style={{ padding: "12px 12px", borderTop: "1px solid var(--border)", verticalAlign: "top", fontSize: 13, color: "var(--text2)" }}>{mengenHerkunft(p, v)}</td>
              <td style={{ padding: "6px 12px", borderTop: "1px solid var(--border)", verticalAlign: "top" }}>
                <button aria-label="Position entfernen" onClick={() => geaendert("positionen", { positionen: pos.filter(x => x.id !== p.id) })} style={{ ...klein, width: 30, padding: 0, justifyContent: "center" }}><Trash2 size={13} strokeWidth={1.5} /></button>
              </td>
            </tr>
          </Fragment>))}
        </tbody>
      </table>
    </div>
  );

  const auswahl = new Set(s.auswahl || []);
  const kalkulationAnsicht = s.kalkulation && (
    <div style={{ ...karte, padding: 0, overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, minWidth: 860 }}>
        <thead><tr>{["", "Position", "Vorschlag", "h/E", "EP", "GP", "Sicherheit"].map((t, i) => <th key={i} style={{ textAlign: i >= 3 && i <= 5 ? "right" : "left", fontWeight: 400, fontSize: 13, color: "var(--text2)", padding: "10px 8px", borderBottom: "1px solid var(--border2)" }}>{t}</th>)}</tr></thead>
        <tbody>
          {angebotspositionen.map(p => {
            if (String(p.bez).startsWith("──")) return <tr key={p.id}><td colSpan={7} style={{ padding: "12px 8px 4px", fontWeight: 500 }}>{p.bez.replace(/─/g, "").trim()}</td></tr>;
            const vs = s.vorschlaege?.[p.id];
            const vor = vs ? vorschlagVorschau(vs, p, ctx) : {};
            const offen = !vs || vs.art === "offen";
            return (
              <tr key={p.id}>
                <td style={{ padding: "10px 8px", borderTop: "1px solid var(--border)", verticalAlign: "top" }}>
                  {!offen && <input type="checkbox" aria-label={`${p.bez} übernehmen`} checked={auswahl.has(p.id)} onChange={() => setze({ auswahl: auswahl.has(p.id) ? [...auswahl].filter(x => x !== p.id) : [...auswahl, p.id] })} />}
                </td>
                <td style={{ padding: "10px 8px", borderTop: "1px solid var(--border)", verticalAlign: "top", maxWidth: 260 }}>
                  <div>{p.bez}</div><div style={{ ...zahl, fontSize: 13, color: "var(--muted)" }}>{zahlDe(p.menge, 3)} {p.einheit}</div>
                </td>
                <td style={{ padding: "10px 8px", borderTop: "1px solid var(--border)", verticalAlign: "top", maxWidth: 360 }}>
                  <div>{offen ? <span style={{ color: "var(--text2)" }}>Offen</span> : vs.art === "katalog" ? vor.quelle : rezepturText(vs.rezeptur, kalkulationspreise)}</div>
                  {vs?.begruendung && <div style={{ fontSize: 13, color: "var(--text2)", marginTop: 2, lineHeight: 1.45 }}>{vs.begruendung}</div>}
                  {vs?.fehlt?.length > 0 && <div style={{ fontSize: 13, color: "var(--akzent)", marginTop: 2 }}>Fehlt: {vs.fehlt.join(", ")}</div>}
                </td>
                <td style={{ padding: "10px 8px", borderTop: "1px solid var(--border)", verticalAlign: "top", textAlign: "right", ...zahl }}>{vor.stunden != null ? zahlDe(vor.stunden, 3) : "–"}</td>
                <td style={{ padding: "10px 8px", borderTop: "1px solid var(--border)", verticalAlign: "top", textAlign: "right", ...zahl, whiteSpace: "nowrap" }}>{offen ? "–" : eur(vor.ep)}</td>
                <td style={{ padding: "10px 8px", borderTop: "1px solid var(--border)", verticalAlign: "top", textAlign: "right", ...zahl, whiteSpace: "nowrap" }}>{offen ? "–" : eur(vor.ep * p.menge)}</td>
                <td style={{ padding: "10px 8px", borderTop: "1px solid var(--border)", verticalAlign: "top", fontSize: 13 }}>
                  {!offen && <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 6, height: 6, borderRadius: 3, background: FARBE[vs.sicherheit] }} />{vs.sicherheit}</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  const befunde = schritt === "pruefung" ? sortieren([...regelPruefung(endPositionen, { kalkulationspreise, standardZuschlaege }), ...(s.pruefungKi?.befunde || [])]) : [];
  const zaehler = zaehlen(befunde);
  const pruefungAnsicht = schritt === "pruefung" && (
    <>
      <div style={{ ...karte, display: "flex", gap: 32, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div><div style={{ fontSize: 13, color: "var(--text2)" }}>Angebotssumme netto</div><div style={{ ...zahl, fontSize: 24 }}>{eur(netto)}</div></div>
        <div><div style={{ fontSize: 13, color: "var(--text2)" }}>Positionen</div><div style={{ ...zahl, fontSize: 24 }}>{endPositionen.filter(p => !String(p.bez).startsWith("──")).length}</div></div>
        <div><div style={{ fontSize: 13, color: "var(--text2)" }}>Befunde</div><div style={{ ...zahl, fontSize: 24 }}>{zaehler.hoch} · {zaehler.mittel} · {zaehler.hinweis}</div></div>
        <button onClick={() => ausfuehren("pruefung")} disabled={!!lauf} style={{ ...knopf(), marginLeft: "auto" }}>{s.pruefungKi ? "KI-Prüfung erneut" : "Zusätzlich von der KI prüfen lassen"}</button>
      </div>
      {s.pruefungKi?.fehlend?.length > 0 && (
        <div style={karte}>
          <h2 style={h2}>Möglicherweise fehlende Leistungen</h2>
          {s.pruefungKi.fehlend.map(f => <div key={f.text} style={{ padding: "6px 0", borderTop: "1px solid var(--border)" }}>{f.text}<div style={{ fontSize: 13, color: "var(--text2)" }}>{f.begruendung}</div></div>)}
        </div>
      )}
      <div style={karte}>
        <h2 style={h2}>Befunde</h2>
        {!befunde.length && <div style={{ color: "var(--text2)" }}>Keine Auffälligkeiten</div>}
        {befunde.map(b => {
          const p = endPositionen.find(x => x.id === b.posId);
          return (
            <div key={b.id} style={{ display: "flex", gap: 12, padding: "10px 0", borderTop: "1px solid var(--border)" }}>
              <span style={{ width: 6, height: 6, borderRadius: 3, background: BEFUND_FARBE[b.schwere], marginTop: 8, flexShrink: 0 }} />
              <div>{p && <div style={{ fontSize: 13, color: "var(--text2)" }}>{p.bez}</div>}<div>{b.text}</div>{b.vorschlag && <div style={{ fontSize: 13, color: "var(--text2)" }}>{b.vorschlag}</div>}</div>
            </div>
          );
        })}
        <div style={{ fontSize: 13, color: "var(--text2)", marginTop: 12 }}>Befunde lassen sich nach der Übernahme im Angebot bearbeiten; die Prüfung steht dort unter KI-Kalkulation</div>
      </div>
    </>
  );

  const inhalt = { eingabe, verstehen: verstehenAnsicht, mengen: mengenAnsicht, positionen: positionenAnsicht, kalkulation: kalkulationAnsicht, pruefung: pruefungAnsicht }[schritt];
  const naechster = SCHRITTE[idx + 1];
  const weiterText = {
    eingabe: "Verstehen", verstehen: "Mengen ermitteln", mengen: "Positionen aufstellen", positionen: "Kalkulieren", kalkulation: "Prüfen",
  }[schritt];
  const eingabeLeer = !String(s.eingabe?.text || "").trim() && !(s.anhaenge || []).length;
  const aufmassB = aufmassBauteil && v?.bauteile.find(b => b.id === aufmassBauteil);

  return createPortal(
    <div role="dialog" aria-label="Kalkulations-Copilot" style={{ position: "fixed", inset: 0, background: "var(--bg)", zIndex: 720, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 24px", background: "var(--surface)", borderBottom: "1px solid var(--border)" }}>
        <div style={{ flex: 1, fontSize: 18, fontWeight: 500 }}>Kalkulations-Copilot</div>
        <button onClick={onClose} aria-label="Schließen" style={{ ...knopf(), width: 36, padding: 0, justifyContent: "center" }}><X size={16} strokeWidth={1.5} /></button>
      </div>
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <nav aria-label="Schritte" style={{ width: 220, flexShrink: 0, borderRight: "1px solid var(--border)", padding: "16px 12px", background: "var(--surface)" }}>
          {SCHRITTE.map((x, i) => {
            const vorhanden = x.key === "eingabe" || (x.key === "kalkulation" ? s.kalkulation : x.key === "pruefung" ? s.kalkulation : s[x.key]);
            const aktiv = x.key === schritt;
            const fertig = i < idx && vorhanden;
            return (
              <button key={x.key} disabled={!vorhanden || !!lauf} onClick={() => setze({ schritt: x.key })} aria-current={aktiv ? "step" : undefined}
                style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", height: 36, padding: "0 8px", border: "none", borderRadius: 8, marginBottom: 2,
                  background: aktiv ? "var(--bg)" : "transparent", boxShadow: aktiv ? "inset 0 0 0 1px var(--border2)" : "none", cursor: vorhanden ? "pointer" : "default",
                  fontFamily: "inherit", fontSize: 14, color: vorhanden ? "var(--text)" : "var(--muted)", textAlign: "left" }}>
                <span style={{ ...zahl, width: 20, height: 20, borderRadius: 10, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 12,
                  background: fertig ? "var(--text)" : "transparent", color: fertig ? "var(--surface)" : "inherit", border: fertig ? "none" : "1px solid var(--border2)" }}>
                  {fertig ? <Check size={12} strokeWidth={2} /> : i + 1}
                </span>
                <span style={{ flex: 1 }}>{x.label}</span>
                {veraltet[x.key] && <span title="Frühere Schritte wurden geändert" style={{ width: 6, height: 6, borderRadius: 3, background: "var(--akzent)" }} />}
              </button>
            );
          })}
        </nav>

        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <div style={{ flex: 1, overflowY: "auto", padding: 24 }}>
            <div style={{ maxWidth: 1040 }}>
              {veraltet[schritt] && !lauf && (
                <div style={{ ...karte, display: "flex", alignItems: "center", gap: 12, borderColor: "var(--akzent)" }}>
                  <span style={{ flex: 1, fontSize: 14 }}>Frühere Schritte wurden geändert. Dieser Schritt passt evtl. nicht mehr dazu</span>
                  {schritt !== "pruefung" && <button onClick={() => ausfuehren(schritt)} style={klein}>Neu erzeugen</button>}
                  <button onClick={() => setze({ veraltet: { ...veraltet, [schritt]: false } })} style={klein}>So lassen</button>
                </div>
              )}
              {lauf ? <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--text2)", padding: "24px 0" }}><Spinner size={16} /> {LAUF_TEXT[lauf]}</div> : inhalt}
              {fehler && <div role="alert" style={{ color: "var(--red)", background: "var(--rbg)", borderRadius: 8, padding: "8px 12px", fontSize: 14 }}>{fehler}</div>}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 24px", background: "var(--surface)", borderTop: "1px solid var(--border)" }}>
            {idx > 0 && <button onClick={() => setze({ schritt: SCHRITTE[idx - 1].key })} disabled={!!lauf} style={knopf()}>Zurück</button>}
            <span style={{ flex: 1, fontSize: 13, color: "var(--text2)" }}>
              {s.kalkulation && schritt !== "eingabe" ? <>Stand <span style={zahl}>{eur(netto)}</span> netto</> : `Schritt ${idx + 1} von ${SCHRITTE.length}`}
            </span>
            {naechster ? (
              <button onClick={weiter} disabled={!!lauf || (schritt === "eingabe" && eingabeLeer) || !session?.access_token}
                style={{ ...knopf(true), opacity: lauf || (schritt === "eingabe" && eingabeLeer) || !session?.access_token ? 0.5 : 1 }}>
                Weiter: {weiterText}
              </button>
            ) : (
              <button onClick={() => onUebernehmen(endPositionen, annahmenListe(v))} disabled={!!lauf} style={knopf(true)}>Ins Angebot übernehmen</button>
            )}
          </div>
        </div>
      </div>
      {aufmassB && (
        <AufmassWerkzeug ziel={{ bez: aufmassB.bez, einheit: (m.jeBauteil[aufmassB.id] || [])[0]?.einheit || "m²" }} initial={{ zeilen: m.jeBauteil[aufmassB.id] || [] }} session={session}
          onClose={() => setAufmassBauteil(null)} onUebernehmen={({ zeilen }) => { zeilenSetzen(aufmassB.id, zeilen); setAufmassBauteil(null); }} />
      )}
    </div>,
    document.body,
  );
}
