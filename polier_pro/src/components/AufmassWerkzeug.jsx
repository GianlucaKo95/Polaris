import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Minus, Plus, Sparkles, Trash2, Upload, X } from "lucide-react";
import { Spinner } from "./Spinner.jsx";
import { kiToolAufruf } from "../lib/ai.js";
import {
  ABZUGSREGELN, QUELLE, zahlDe, neueZeile, zeileAendern, zeileAusMessung, aufmassSumme, zeilenAusRaumstempeln,
  massstabAusKalibrierung, massstabAusPdf, abstand, kiAufmass,
} from "../lib/aufmass.js";

// Aufmaß aus Plan oder Foto. Links das Bild mit Messwerkzeugen, rechts die
// Aufmaßzeilen. Logik in lib/aufmass.js.
//
// Props: ziel { bez, einheit }, initial { zeilen, abzugsregel }, session,
// onUebernehmen({ zeilen, abzugsregel, summe, einheit, toleranz }), onClose

const WERKZEUGE = [
  ["kalibrieren", "Maßstab"], ["strecke", "Strecke"], ["linienzug", "Linienzug"], ["flaeche", "Fläche"], ["zaehlen", "Zählen"],
];
const PUNKTE_FUER = { kalibrieren: 2, strecke: 2 };
const zahl = { fontFamily: "var(--font-zahl)", fontVariantNumeric: "tabular-nums" };
const knopf = (haupt = false) => ({ height: 32, padding: "0 12px", borderRadius: 8, fontFamily: "inherit", fontSize: 13, cursor: "pointer",
  display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap", fontWeight: haupt ? 500 : 400,
  border: haupt ? "none" : "1px solid var(--border2)", background: haupt ? "var(--text)" : "var(--surface)", color: haupt ? "var(--surface)" : "var(--text)" });
const feld = { boxSizing: "border-box", height: 30, padding: "0 8px", border: "1px solid var(--border2)", borderRadius: 6,
  background: "var(--surface)", color: "var(--text)", fontFamily: "inherit", fontSize: 13 };

async function bildVerkleinern(datei, maxPx) {
  const bild = await createImageBitmap(datei);
  const f = Math.min(1, maxPx / Math.max(bild.width, bild.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bild.width * f); c.height = Math.round(bild.height * f);
  c.getContext("2d").drawImage(bild, 0, 0, c.width, c.height);
  return { url: c.toDataURL("image/jpeg", 0.88), breite: c.width, hoehe: c.height };
}
const base64 = url => url.slice(url.indexOf(",") + 1);

export function AufmassWerkzeug({ ziel = {}, initial = null, session, onUebernehmen, onClose }) {
  const [zeilen, setZeilen] = useState(initial?.zeilen || []);
  const [regel, setRegel] = useState(initial?.abzugsregel || "alle");
  const [bild, setBild] = useState(null);        // { url, breite, hoehe, art: "plan"|"foto", datei, seite, seiten, renderFaktor }
  const [laden, setLaden] = useState(false);
  const [mProPx, setMProPx] = useState(null);
  const [massstabQuelle, setMassstabQuelle] = useState("");
  const [referenzPx, setReferenzPx] = useState(null);
  const [raeume, setRaeume] = useState([]);
  const [werkzeug, setWerkzeug] = useState("strecke");
  const [punkte, setPunkte] = useState([]);
  const [messungen, setMessungen] = useState([]);
  const [kalibLaenge, setKalibLaenge] = useState("");
  const [zoom, setZoom] = useState(1);
  const [kiLauf, setKiLauf] = useState(false);
  const [referenz, setReferenz] = useState("");
  const [hinweise, setHinweise] = useState([]);
  const [fehler, setFehler] = useState(null);
  const svgRef = useRef(null);
  const dateiRef = useRef(null);
  const einheit = ziel.einheit || "m²";
  const grenze = ABZUGSREGELN.find(r => r.key === regel)?.grenze || 0;
  const summe = aufmassSumme(zeilen, einheit, grenze);

  async function dateiLaden(datei, seite = 1) {
    setFehler(null); setHinweise([]); setLaden(true); setPunkte([]); setMessungen([]);
    try {
      if (datei.type === "application/pdf") {
        const { pdfSeiteRendern, pdfPlanLesen } = await import("../lib/pdfPlan.js");
        const r = await pdfSeiteRendern(datei, seite);
        setBild({ ...r, art: "plan", datei, seite });
        try {
          const plan = await pdfPlanLesen(datei, seite);
          setRaeume(plan.raeume || []);
          const m = massstabAusPdf(plan.massstab, r.renderFaktor);
          setMProPx(m); setMassstabQuelle(m ? `1:${plan.massstab} aus dem Plan` : "");
        } catch { setRaeume([]); setMProPx(null); setMassstabQuelle(""); }
      } else if (datei.type.startsWith("image/")) {
        const r = await bildVerkleinern(datei, 2400);
        setBild({ ...r, art: "foto", datei }); setRaeume([]); setMProPx(null); setMassstabQuelle("");
        setWerkzeug("kalibrieren");
      } else setFehler("Nur PDF-Pläne und Fotos");
    } catch (e) { setFehler(`Datei nicht lesbar: ${e.message}`); }
    setLaden(false);
  }

  // Klickposition in Bildpunkten
  function punktAus(e) {
    const r = svgRef.current.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width * bild.breite, y: (e.clientY - r.top) / r.height * bild.hoehe };
  }
  function klick(e) {
    if (!bild) return;
    const p = punktAus(e);
    const neu = [...punkte, p];
    setPunkte(neu);
    if (PUNKTE_FUER[werkzeug] && neu.length === PUNKTE_FUER[werkzeug] && werkzeug === "strecke") abschliessen(neu);
  }
  function abschliessen(roh = punkte) {
    if (werkzeug === "kalibrieren") return;
    // Ein Doppelklick zum Abschließen setzt vorher noch zwei Klickpunkte an dieselbe Stelle
    const pkt = roh.filter((p, i) => i === 0 || abstand(p, roh[i - 1]) > strich * 3);
    const noetig = { strecke: 2, linienzug: 2, flaeche: 3, zaehlen: 1 }[werkzeug];
    if (pkt.length < noetig) return;
    if (!mProPx && werkzeug !== "zaehlen") { setFehler("Zuerst den Maßstab festlegen: zwei Punkte mit bekanntem Abstand anklicken"); return; }
    const m = { id: `m${Date.now()}`, art: werkzeug === "linienzug" ? "strecke" : werkzeug, punkte: pkt,
      bez: { strecke: "Länge", linienzug: "Länge", flaeche: "Fläche", zaehlen: "Anzahl" }[werkzeug] };
    setMessungen(ms => [...ms, m]);
    setZeilen(zs => [...zs, zeileAusMessung(m, mProPx || 1, { foto: bild.art === "foto", referenzPx })]);
    setPunkte([]);
  }
  function kalibrieren() {
    const l = Number(String(kalibLaenge).replace(",", "."));
    const m = punkte.length === 2 ? massstabAusKalibrierung(punkte[0], punkte[1], l) : null;
    if (!m) { setFehler("Zwei Punkte anklicken und den echten Abstand in Metern eintragen"); return; }
    setMProPx(m); setMassstabQuelle(`kalibriert über ${zahlDe(l, 3)} m`); setReferenzPx(abstand(punkte[0], punkte[1]));
    if (!referenz) setReferenz(`Bezugsmaß ${zahlDe(l, 3)} m im Bild markiert`);
    setPunkte([]); setKalibLaenge(""); setWerkzeug(bild.art === "foto" ? "flaeche" : "strecke"); setFehler(null);
  }
  useEffect(() => {
    const taste = e => {
      if (e.key === "Escape") setPunkte([]);
      if (e.key === "Enter" && e.target.tagName !== "INPUT") abschliessen();
    };
    window.addEventListener("keydown", taste);
    return () => window.removeEventListener("keydown", taste);
  });

  async function kiLesen() {
    setFehler(null); setKiLauf(true);
    try {
      let block;
      if (bild.art === "plan" && bild.datei.size <= 8 * 1024 * 1024) {
        const url = await new Promise((ok, f) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = f; r.readAsDataURL(bild.datei); });
        block = { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64(url) } };
      } else {
        const klein = bild.art === "foto" ? await bildVerkleinern(bild.datei, 1600) : null;
        block = { type: "image", source: { type: "base64", media_type: "image/jpeg", data: base64(klein ? klein.url : bild.url) } };
      }
      const rufeKi = (system, messages, tools, toolChoice) => kiToolAufruf({ system, messages, tools, toolChoice, maxTokens: 4000 }, session);
      const r = await kiAufmass({ bildBlock: block, art: bild.art, ziel: ziel.bez, referenz, rufeKi });
      setZeilen(zs => [...zs, ...r.zeilen]);
      setHinweise(r.hinweise);
      if (!r.zeilen.length) setFehler("Die KI hat keine verwertbaren Maße gefunden");
    } catch (e) { setFehler(e.message); }
    setKiLauf(false);
  }

  const aendern = (id, teil) => setZeilen(zs => zs.map(z => z.id === id ? zeileAendern(z, teil) : z));
  const loeschen = id => {
    const z = zeilen.find(x => x.id === id);
    setZeilen(zs => zs.filter(x => x.id !== id));
    if (z?.messungId) setMessungen(ms => ms.filter(m => m.id !== z.messungId));
  };
  const strich = Math.max(1.5, (bild?.breite || 1000) / 900) / zoom;

  return createPortal(
    <div role="dialog" aria-label="Aufmaß" style={{ position: "fixed", inset: 0, background: "var(--bg)", zIndex: 760, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 24px", background: "var(--surface)", borderBottom: "1px solid var(--border)" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 18, fontWeight: 500 }}>Aufmaß</div>
          {ziel.bez && <div style={{ fontSize: 13, color: "var(--text2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ziel.bez}</div>}
        </div>
        <button onClick={onClose} aria-label="Schließen" style={{ ...knopf(), width: 32, padding: 0, justifyContent: "center" }}><X size={16} strokeWidth={1.5} /></button>
      </div>

      <div style={{ flex: 1, display: "flex", minHeight: 0, flexWrap: "wrap" }}>
        {/* Bild */}
        <div style={{ flex: "1 1 560px", minWidth: 0, minHeight: 360, display: "flex", flexDirection: "column", borderRight: "1px solid var(--border)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 16px", borderBottom: "1px solid var(--border)", flexWrap: "wrap", background: "var(--surface)" }}>
            <input ref={dateiRef} type="file" accept="application/pdf,image/*" hidden onChange={e => e.target.files?.[0] && dateiLaden(e.target.files[0])} />
            <button onClick={() => dateiRef.current?.click()} style={knopf(!bild)}><Upload size={14} strokeWidth={1.5} /> {bild ? "Andere Datei" : "Plan oder Foto"}</button>
            {bild && (<>
              <div role="radiogroup" aria-label="Werkzeug" style={{ display: "inline-flex", border: "1px solid var(--border2)", borderRadius: 8, padding: 2 }}>
                {WERKZEUGE.map(([k, l]) => (
                  <button key={k} role="radio" aria-checked={werkzeug === k} onClick={() => { setWerkzeug(k); setPunkte([]); }}
                    style={{ height: 26, padding: "0 10px", border: "none", borderRadius: 6, fontFamily: "inherit", fontSize: 13, cursor: "pointer",
                      background: werkzeug === k ? "var(--bg)" : "transparent", color: werkzeug === k ? "var(--text)" : "var(--text2)",
                      boxShadow: werkzeug === k ? "inset 0 0 0 1px var(--border2)" : "none" }}>{l}</button>
                ))}
              </div>
              {bild.seiten > 1 && (
                <select aria-label="Seite" value={bild.seite} onChange={e => dateiLaden(bild.datei, Number(e.target.value))} style={feld}>
                  {Array.from({ length: bild.seiten }, (_, i) => <option key={i} value={i + 1}>Seite {i + 1}</option>)}
                </select>
              )}
              <span style={{ marginLeft: "auto", display: "inline-flex", gap: 4 }}>
                <button aria-label="Verkleinern" onClick={() => setZoom(z => Math.max(0.5, z / 1.25))} style={{ ...knopf(), width: 30, padding: 0, justifyContent: "center" }}><Minus size={14} strokeWidth={1.5} /></button>
                <button onClick={() => setZoom(1)} style={{ ...knopf(), ...zahl, width: 52, padding: 0, justifyContent: "center" }}>{Math.round(zoom * 100)} %</button>
                <button aria-label="Vergrößern" onClick={() => setZoom(z => Math.min(6, z * 1.25))} style={{ ...knopf(), width: 30, padding: 0, justifyContent: "center" }}><Plus size={14} strokeWidth={1.5} /></button>
              </span>
            </>)}
          </div>

          {bild && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 16px", fontSize: 13, color: "var(--text2)", borderBottom: "1px solid var(--border)", height: 40, boxSizing: "border-box", whiteSpace: "nowrap", overflow: "hidden" }}>
              {werkzeug === "kalibrieren" ? (<>
                <span>{punkte.length < 2 ? `Zwei Punkte mit bekanntem Abstand anklicken${bild.art === "foto" ? " (Zollstock, Türhöhe 2,01 m, Fliesenraster)" : ""}` : "Echter Abstand:"}</span>
                {punkte.length === 2 && <>
                  <input autoFocus value={kalibLaenge} onChange={e => setKalibLaenge(e.target.value)} onKeyDown={e => e.key === "Enter" && kalibrieren()}
                    inputMode="decimal" aria-label="Abstand in Metern" placeholder="2,01" style={{ ...feld, ...zahl, width: 80, height: 28 }} /> m
                  <button onClick={kalibrieren} style={{ ...knopf(true), height: 28 }}>Übernehmen</button>
                </>}
              </>) : (
                <span>
                  {{ strecke: "Anfang und Ende anklicken", linienzug: "Punkte anklicken, mit Enter abschließen", flaeche: "Ecken anklicken, mit Enter abschließen", zaehlen: "Jedes Stück anklicken, mit Enter abschließen" }[werkzeug]}
                  {punkte.length > 0 && werkzeug !== "strecke" && <> · <button onClick={() => abschliessen()} style={{ ...knopf(), height: 24, verticalAlign: "middle" }}>Fertig</button></>}
                </span>
              )}
              <span style={{ marginLeft: "auto", color: mProPx ? "var(--text2)" : "var(--akzent)" }}>{mProPx ? `Maßstab ${massstabQuelle}` : "Noch kein Maßstab"}</span>
            </div>
          )}

          <div style={{ flex: 1, overflow: "auto", background: "var(--surface2, var(--bg))", position: "relative" }}>
            {laden && <div style={{ padding: 24, display: "flex", gap: 8, color: "var(--text2)" }}><Spinner size={14} /> Datei wird geladen</div>}
            {!bild && !laden && (
              <div style={{ padding: 32, maxWidth: 520, color: "var(--text2)", lineHeight: 1.55 }}>
                Einen PDF-Plan oder ein Foto laden. Bei Plänen mit Maßstabsangabe ist der Maßstab sofort gesetzt, Raumstempel lassen sich direkt übernehmen.
                Bei Fotos zuerst ein bekanntes Maß markieren; Ergebnisse aus Fotos sind Schätzungen und tragen eine Toleranz
              </div>
            )}
            {bild && !laden && (
              <div style={{ width: `${zoom * 100}%`, minWidth: "100%", position: "relative" }}>
                <img src={bild.url} alt="" draggable={false} style={{ display: "block", width: "100%", userSelect: "none" }} />
                <svg ref={svgRef} data-messflaeche="" aria-label="Messfläche" viewBox={`0 0 ${bild.breite} ${bild.hoehe}`} onClick={klick}
                  onDoubleClick={e => { e.preventDefault(); abschliessen(); }}
                  style={{ position: "absolute", inset: 0, width: "100%", height: "100%", cursor: "crosshair" }}>
                  {messungen.map(m => m.art === "flaeche"
                    ? <polygon key={m.id} points={m.punkte.map(p => `${p.x},${p.y}`).join(" ")} fill="rgba(194,65,12,0.14)" stroke="#C2410C" strokeWidth={strich} />
                    : m.art === "zaehlen"
                      ? m.punkte.map((p, i) => <circle key={`${m.id}${i}`} cx={p.x} cy={p.y} r={strich * 4} fill="#C2410C" />)
                      : <polyline key={m.id} points={m.punkte.map(p => `${p.x},${p.y}`).join(" ")} fill="none" stroke="#C2410C" strokeWidth={strich * 1.5} />)}
                  {punkte.length > 0 && (werkzeug === "flaeche" && punkte.length > 2
                    ? <polygon points={punkte.map(p => `${p.x},${p.y}`).join(" ")} fill="rgba(22,24,29,0.08)" stroke="#16181D" strokeDasharray={`${strich * 4} ${strich * 3}`} strokeWidth={strich} />
                    : <polyline points={punkte.map(p => `${p.x},${p.y}`).join(" ")} fill="none" stroke="#16181D" strokeDasharray={`${strich * 4} ${strich * 3}`} strokeWidth={strich} />)}
                  {punkte.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={strich * 3} fill="#16181D" />)}
                </svg>
              </div>
            )}
          </div>
        </div>

        {/* Zeilen */}
        <div style={{ flex: "0 1 520px", minWidth: 340, display: "flex", flexDirection: "column", minHeight: 0, background: "var(--bg)" }}>
          <div style={{ padding: 16, borderBottom: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 8 }}>
            {raeume.length > 0 && (
              <button onClick={() => setZeilen(zs => [...zs, ...zeilenAusRaumstempeln(raeume)])} style={{ ...knopf(), justifyContent: "flex-start" }}>
                {raeume.length} Raumstempel aus dem Plan übernehmen
              </button>
            )}
            {bild && (
              <div style={{ display: "flex", gap: 8 }}>
                {bild.art === "foto" && <input value={referenz} onChange={e => setReferenz(e.target.value)} placeholder="Bezugsmaß, z.B. Tür 2,01 m hoch" aria-label="Bezugsmaß" style={{ ...feld, flex: 1, height: 32 }} />}
                <button onClick={kiLesen} disabled={kiLauf || !session?.access_token} style={{ ...knopf(), opacity: session?.access_token ? 1 : 0.5, ...(bild.art === "plan" ? { flex: 1, justifyContent: "flex-start" } : {}) }}>
                  {kiLauf ? <Spinner size={13} /> : <Sparkles size={14} strokeWidth={1.5} />} {bild.art === "plan" ? "KI liest Maßketten und Beschriftungen" : "KI schätzt"}
                </button>
              </div>
            )}
            {hinweise.length > 0 && <div style={{ fontSize: 13, color: "var(--text2)", lineHeight: 1.45 }}>{hinweise.join(" · ")}</div>}
            {fehler && <div role="alert" style={{ fontSize: 13, color: "var(--red)" }}>{fehler}</div>}
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "8px 16px" }}>
            {!zeilen.length && <div style={{ color: "var(--text2)", fontSize: 14, padding: "8px 0" }}>Noch keine Zeilen. Messen, übernehmen oder von Hand anlegen</div>}
            {zeilen.map(z => (
              <div key={z.id} style={{ padding: "8px 0", borderBottom: "1px solid var(--border)", opacity: aufmassSumme([z], einheit).summe === 0 && !z.abzug ? 0.55 : 1 }}>
                <div style={{ display: "flex", gap: 6 }}>
                  <input value={z.bez} onChange={e => aendern(z.id, { bez: e.target.value })} aria-label="Bezeichnung" placeholder="Bezeichnung" style={{ ...feld, flex: 1, minWidth: 0 }} />
                  <button onClick={() => loeschen(z.id)} aria-label="Zeile löschen" style={{ ...knopf(), width: 30, padding: 0, justifyContent: "center", color: "var(--text2)" }}><Trash2 size={14} strokeWidth={1.5} /></button>
                </div>
                <div style={{ display: "flex", gap: 6, marginTop: 6, alignItems: "center" }}>
                  <input value={z.formel} onChange={e => aendern(z.id, { formel: e.target.value })} aria-label="Formel" style={{ ...feld, ...zahl, flex: 1, minWidth: 0 }} />
                  <span style={{ ...zahl, width: 76, textAlign: "right", fontSize: 14, color: z.abzug ? "var(--text2)" : "var(--text)" }}>{z.abzug ? "−" : ""}{zahlDe(z.menge, 3)}</span>
                  <select value={z.einheit} onChange={e => aendern(z.id, { einheit: e.target.value })} aria-label="Einheit" style={{ ...feld, width: 62 }}>
                    {["m", "m²", "m³", "Stk"].map(e => <option key={e}>{e}</option>)}
                  </select>
                  <label style={{ display: "inline-flex", gap: 4, alignItems: "center", fontSize: 12, color: "var(--text2)" }}>
                    <input type="checkbox" checked={!!z.abzug} onChange={e => aendern(z.id, { abzug: e.target.checked })} /> Abzug
                  </label>
                </div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
                  {QUELLE[z.quelle] || z.quelle}{z.toleranz ? ` · ± ${Math.round(z.toleranz * 100)} %` : ""}{z.grundlage && z.grundlage !== QUELLE[z.quelle] ? ` · ${z.grundlage}` : ""}
                </div>
              </div>
            ))}
            <button onClick={() => setZeilen(zs => [...zs, neueZeile({ einheit })])} style={{ ...knopf(), marginTop: 8 }}><Plus size={14} strokeWidth={1.5} /> Zeile</button>
          </div>

          <div style={{ padding: 16, borderTop: "1px solid var(--border)", background: "var(--surface)" }}>
            <select value={regel} onChange={e => setRegel(e.target.value)} aria-label="Übermessung" style={{ ...feld, width: "100%", marginBottom: 12 }}>
              {ABZUGSREGELN.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
            </select>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ ...zahl, fontSize: 20 }}>{zahlDe(summe.summe, 3)} {einheit}</div>
                <div style={{ fontSize: 12, color: "var(--text2)" }}>
                  {summe.toleranz > 0 ? `davon geschätzt, ± ${Math.round(summe.toleranz * 100)} %` : "Summe"}{summe.uebermessen ? ` · ${summe.uebermessen} Öffnung${summe.uebermessen === 1 ? "" : "en"} übermessen` : ""}
                </div>
              </div>
              <button onClick={() => onUebernehmen({ zeilen, abzugsregel: regel, summe: summe.summe, einheit, toleranz: summe.toleranz })}
                disabled={!zeilen.length} style={{ ...knopf(true), height: 36, opacity: zeilen.length ? 1 : 0.5 }}>Menge übernehmen</button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
