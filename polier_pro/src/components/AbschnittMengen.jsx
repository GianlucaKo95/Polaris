import { useMemo, useState } from "react";
import { Grid3x3, Upload, Loader2, TriangleAlert, Check, Copy, Undo2 } from "lucide-react";
import { DiktierFeld } from "./DiktierFeld.jsx";
import { inputStyle } from "./Label.jsx";
import { istTitel } from "../lib/lv.js";
import { rasterBauen, abschnittVerstehen, abschnittAuswerten, zuordnungVorschlagen, leistungsstandBerechnen,
  abschnittAlsText, mengenartFuerEinheit } from "../lib/achsraster.js";

const z = n => (n || 0).toLocaleString("de-DE", { maximumFractionDigits: 2 });
const SPEICHER = id => `polaris.abschnitt.${id}`;

function laden(id) {
  try { return JSON.parse(localStorage.getItem(SPEICHER(id)) || "null"); } catch { return null; }
}
function sichern(id, daten) {
  try { localStorage.setItem(SPEICHER(id), JSON.stringify(daten)); return true; } catch { return false; }
}

// "Abschnitt A–B / 1–2 im EG fertig": Modell (IFC mit Achsraster oder DXF mit
// beschrifteten Achsen) einmal je Baustelle laden, dann per Satz/Diktat
// Abschnitte melden. Polaris sucht die Bauteile im Feld, rechnet die Mengen,
// ordnet sie den LV-Positionen zu und schlägt den neuen Leistungsstand vor.
// Gebucht wird erst nach Bestätigung; bereits gebuchte Bauteile (Stützen auf
// gemeinsamen Achsen, Decken über mehrere Felder) zählen nicht doppelt.
export function AbschnittMengen({ projekt, auftraege, baufortschritt, onBaufortschrittSpeichern, session }) {
  const [stand, setStand] = useState(() => laden(projekt.id) || { gebucht: {}, zuordnung: {}, log: [] });
  const [laedt, setLaedt] = useState(false);
  const [fehlerDatei, setFehlerDatei] = useState("");
  const [satz, setSatz] = useState("");
  const [ergebnis, setErgebnis] = useState(null);
  const [kiHinweis, setKiHinweis] = useState("");
  const [zuordnung, setZuordnung] = useState({});
  const [bucht, setBucht] = useState(false);
  const [meldung, setMeldung] = useState("");

  function aktualisieren(neu) {
    setStand(neu);
    if (!sichern(projekt.id, neu)) setMeldung("Hinweis: Modell zu groß für den Gerätespeicher — nach dem Neuladen bitte erneut wählen.");
  }

  const modell = stand.modell;
  const raster = useMemo(() => modell ? rasterBauen(modell.achsen) : null, [modell]);

  const positionen = useMemo(() => auftraege.flatMap(a => (a.positionen || [])
    .filter(p => !istTitel(p) && p.bez && Number(p.menge) > 0 && mengenartFuerEinheit(p.einheit))
    .map(p => ({
      key: `${a.id}:${p.id}`, angebotId: a.id, positionId: p.id, oz: p.oz, bez: p.bez, einheit: p.einheit, menge: Number(p.menge),
      prozent: Number(baufortschritt.find(b => String(b.angebot_id) === String(a.id) && String(b.position_id) === String(p.id))?.prozent) || 0,
      titel: auftraege.length > 1 ? a.titel : "",
    }))), [auftraege, baufortschritt]);

  async function dateiGewaehlt(datei) {
    if (!datei) return;
    setLaedt(true); setFehlerDatei(""); setErgebnis(null);
    try {
      let m;
      if (/\.ifc$/i.test(datei.name)) {
        const { ifcRasterAusDatei } = await import("../lib/ifcLaden.js");
        m = await ifcRasterAusDatei(datei);
      } else if (/\.pdf$/i.test(datei.name)) {
        const { pdfPlanLesen, pdfObjekteInMeter } = await import("../lib/pdfPlan.js");
        const { dxfRasterAuswerten } = await import("../lib/achsraster.js");
        const plan = await pdfPlanLesen(datei);
        let massstab = plan.massstab;
        if (!massstab) {
          const eingabe = window.prompt("Maßstab des Plans nicht gefunden. Maßstab 1 : …", "100");
          massstab = Number(String(eingabe || "").replace(/^1\s*:\s*/, ""));
          if (!(massstab > 0)) throw new Error("Ohne Maßstab lassen sich keine Mengen messen.");
        }
        m = dxfRasterAuswerten(pdfObjekteInMeter(plan, massstab), { skala: 1, alleLinien: true });
        m.raeume = plan.raeume; m.massstab = massstab;
        m.warnungen = [];
        if (!plan.linien.length && !plan.flaechen.length) m.warnungen.push("Keine Vektorgrafik gefunden — vermutlich ein Scan. Bitte den PDF-Export aus dem CAD verwenden.");
        else if (!m.achsen.length) m.warnungen.push("Keine beschrifteten Achsen erkannt — Abschnitte gehen nur mit Achsraster. Raumstempel stehen trotzdem bereit.");
        if (plan.seiten > 1) m.warnungen.push(`PDF hat ${plan.seiten} Seiten — ausgewertet wurde Seite 1.`);
      } else {
        const { dxfObjekteLesen } = await import("../lib/dxf.js");
        const { dxfRasterAuswerten } = await import("../lib/achsraster.js");
        m = dxfRasterAuswerten(dxfObjekteLesen(await datei.text()));
        m.warnungen = m.achsen.length ? [] : ["Keine beschrifteten Achsen gefunden. Achslinien müssen auf einem Layer mit „Achse“/„Raster“ im Namen liegen, die Beschriftung (A, B, 1, 2 …) nahe am Linienende."];
      }
      aktualisieren({ ...stand, modell: m, modellName: datei.name, gebucht: {}, log: [] });
    } catch (e) {
      setFehlerDatei(`Datei konnte nicht gelesen werden: ${e.message}`);
    }
    setLaedt(false);
  }

  async function auswerten() {
    if (!modell || !satz.trim()) return;
    setMeldung(""); setKiHinweis("");
    let auftrag = abschnittVerstehen(satz, raster, modell.geschosse);
    // Unklarer Satz → KI formuliert ihn in die feste Form um; geprüft wird
    // danach wieder deterministisch gegen die Achsen des Modells.
    if (auftrag.fehler.length && session) {
      setLaedt(true);
      try {
        const { kiText } = await import("../lib/ai.js");
        const achsen = [...raster.tags.values()].map(t => t.tag).join(", ");
        const antwort = await kiText(
          `Ein Polier meldet einen fertigen Bauabschnitt. Übersetze die Meldung in genau eine Zeile der Form\n` +
          `ACHSEN <Achse> <Achse> <Achse> <Achse> | GESCHOSS <Name oder -> | BAUTEILE <Wörter oder -> | PROZENT <Zahl>\n` +
          `Erlaubte Achsen: ${achsen}. Geschosse: ${modell.geschosse.join(", ") || "-"}. Bauteilwörter: Decke, Wand, Stütze, Unterzug, Fundament, Treppe, Dach.\n` +
          `Je Achsrichtung die beiden Grenzachsen nennen. Wenn die Meldung nicht eindeutig ist, schreibe nur: UNKLAR <kurze Rückfrage>.\n\nMeldung: ${satz}`, session, 200);
        if (/^UNKLAR/i.test(antwort)) {
          auftrag.fehler = [antwort.replace(/^UNKLAR\s*/i, "")];
        } else {
          const normiert = antwort.replace(/PROZENT\s*(\d+(?:[.,]\d+)?)/i, "$1 %").replace(/ACHSEN|GESCHOSS|BAUTEILE|PROZENT|\|/gi, " ").replace(/(^|\s)-(?=\s|$)/g, " ");
          const neu = abschnittVerstehen(normiert, raster, modell.geschosse);
          if (!neu.fehler.length) { auftrag = neu; setKiHinweis(`Von der KI verstanden als: ${antwort}`); }
        }
      } catch { /* ohne KI bleibt die Fehlermeldung */ }
      setLaedt(false);
    }
    const r = abschnittAuswerten(modell, auftrag, stand.gebucht);
    setErgebnis({ ...r, auftrag });
    setZuordnung(zuordnungVorschlagen(r.gruppen, positionen, stand.zuordnung));
  }

  const vorschau = useMemo(() => ergebnis ? leistungsstandBerechnen(ergebnis.gruppen, zuordnung, positionen) : [],
    [ergebnis, zuordnung, positionen]);

  async function buchen() {
    setBucht(true); setMeldung("");
    const fehler = [];
    for (const v of vorschau) {
      const p = positionen.find(x => x.key === v.key);
      const f = await onBaufortschrittSpeichern?.(p.angebotId, p.positionId, v.neu);
      if (f) fehler.push(`${p.bez}: ${f}`);
    }
    const gebucht = { ...stand.gebucht };
    const elemente = {};
    for (const t of ergebnis.treffer) if (t.anteil > 0) { gebucht[t.element.id] = (gebucht[t.element.id] || 0) + t.anteil; elemente[t.element.id] = t.anteil; }
    const eintrag = { id: Date.now(), datum: new Date().toISOString().slice(0, 10), bereich: ergebnis.bereich,
      text: abschnittAlsText(ergebnis), positionen: vorschau.map(v => ({ key: v.key, alt: v.alt, neu: v.neu })), elemente };
    aktualisieren({ ...stand, gebucht, zuordnung: { ...stand.zuordnung, ...zuordnung }, log: [eintrag, ...(stand.log || [])].slice(0, 100) });
    setBucht(false);
    setErgebnis(null); setSatz("");
    setMeldung(fehler.length ? `Teilweise fehlgeschlagen: ${fehler.join("; ")}` : `✓ Leistungsstand für ${vorschau.length} Position(en) gebucht`);
  }

  async function rueckgaengig(eintrag) {
    if (!window.confirm(`Buchung „${eintrag.bereich}“ vom ${eintrag.datum} zurücknehmen?`)) return;
    for (const pz of eintrag.positionen) {
      const p = positionen.find(x => x.key === pz.key);
      if (p) await onBaufortschrittSpeichern?.(p.angebotId, p.positionId, Math.max(0, Math.round((p.prozent - (pz.neu - pz.alt)) * 10) / 10));
    }
    const gebucht = { ...stand.gebucht };
    for (const [id, a] of Object.entries(eintrag.elemente || {})) gebucht[id] = Math.max(0, (gebucht[id] || 0) - a);
    aktualisieren({ ...stand, gebucht, log: stand.log.filter(l => l.id !== eintrag.id) });
  }

  const karte = { background:"var(--surface)", border:"1.5px solid var(--border)", borderRadius:14, padding:12, marginBottom:12 };
  const knopf = { background:"var(--surface2)", border:"1px solid var(--border)", color:"var(--text)", borderRadius:9, padding:"7px 10px",
    fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"inherit", display:"inline-flex", alignItems:"center", gap:5 };

  const familienText = raster ? Object.values(raster.familien).map(f => f.achsen.length > 1 ? `${f.achsen[0].tag}–${f.achsen.at(-1).tag}` : f.achsen[0]?.tag).join(" / ") : "";

  return (
    <div style={karte}>
      <div style={{ color:"var(--text)", fontWeight:700, fontSize:13.5, marginBottom:6, display:"flex", alignItems:"center", gap:6 }}>
        <Grid3x3 size={15} /> Mengen nach Achsabschnitt
      </div>

      {!modell ? (
        <div style={{ fontSize:12, color:"var(--muted)", marginBottom:8 }}>
          IFC-Modell (mit Achsraster), DXF oder PDF-Plan aus dem CAD (mit beschrifteten Achsen) dieser Baustelle wählen. Danach reicht ein Satz wie
          „Abschnitt A–B / 1–2 im EG fertig“.
        </div>
      ) : (
        <div style={{ fontSize:12, color:"var(--muted)", marginBottom:8 }}>
          {stand.modellName} · Achsen {familienText || "—"} · {modell.elemente.length} Bauteile
          {modell.geschosse?.length ? ` · ${modell.geschosse.join(", ")}` : ""}
          {modell.massstab ? ` · M 1:${modell.massstab}` : ""}
          {(modell.warnungen || []).map(w => <div key={w} style={{ color:"var(--ydark)", marginTop:4 }}>{w}</div>)}
        </div>
      )}
      <label style={{ ...knopf, marginBottom:10 }}>
        {laedt && !ergebnis ? <Loader2 size={13} style={{ animation: "polaris-spin 0.8s linear infinite" }} /> : <Upload size={13} />}
        {modell ? "Anderes Modell wählen" : "IFC, DXF oder PDF-Plan wählen"}
        <input type="file" accept=".ifc,.dxf,.pdf,application/pdf" style={{ display:"none" }} onChange={e => dateiGewaehlt(e.target.files?.[0])} />
      </label>
      {fehlerDatei && <div style={{ color:"var(--red)", fontSize:12, marginBottom:8 }}>{fehlerDatei}</div>}

      {modell && raster?.tags.size > 0 && (
        <>
          <DiktierFeld label="Was ist fertig?" value={satz} onChange={setSatz} rows={2} />
          <button onClick={auswerten} disabled={laedt || !satz.trim()}
            style={{ width:"100%", background:"var(--yellow)", color:"#1a1200", border:"none", borderRadius:10, padding:10,
              fontWeight:800, cursor:"pointer", fontFamily:"inherit", marginTop:6, display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>
            {laedt ? <Loader2 size={14} style={{ animation: "polaris-spin 0.8s linear infinite" }} /> : <Grid3x3 size={14} />} Mengen ermitteln
          </button>
        </>
      )}

      {ergebnis && (
        <div style={{ marginTop:10 }}>
          {kiHinweis && <div style={{ fontSize:11.5, color:"var(--muted)", marginBottom:6 }}>{kiHinweis}</div>}
          {ergebnis.fehler.map(f => (
            <div key={f} style={{ background:"var(--rbg)", color:"var(--red)", borderRadius:9, padding:"8px 10px", fontSize:12, marginBottom:6, display:"flex", gap:6 }}>
              <TriangleAlert size={13} style={{ flexShrink:0, marginTop:1 }} /> {f}
            </div>
          ))}
          {!ergebnis.fehler.length && (
            <>
              <div style={{ fontWeight:700, fontSize:12.5, marginBottom:4 }}>Abschnitt {ergebnis.bereich}</div>
              {ergebnis.annahmen.map(a => <div key={a} style={{ color:"var(--ydark)", fontSize:11.5 }}>{a}</div>)}
              {!ergebnis.gruppen.length && <div style={{ color:"var(--muted)", fontSize:12, marginTop:4 }}>Keine (noch nicht gebuchten) Bauteile in diesem Abschnitt.</div>}
              {ergebnis.gruppen.map(g => {
                const passend = positionen.filter(p => g[mengenartFuerEinheit(p.einheit)] > 0);
                return (
                  <div key={g.key} style={{ borderTop:"1px solid var(--border)", padding:"7px 0", fontSize:12 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", gap:8 }}>
                      <b>{g.bauteil}{g.material ? ` · ${g.material}` : ""}</b>
                      <span style={{ color:"var(--muted)", whiteSpace:"nowrap" }}>
                        {z(g.stueck)} Stk{g.volumen ? ` · ${z(g.volumen)} m³` : ""}{g.flaeche ? ` · ${z(g.flaeche)} m²` : ""}{g.laenge ? ` · ${z(g.laenge)} m` : ""}
                      </span>
                    </div>
                    {(g.anteilig > 0 || g.berechnet > 0) && (
                      <div style={{ color:"var(--muted)", fontSize:11 }}>
                        {g.anteilig > 0 && `${g.anteilig} Bauteil(e) anteilig (reichen über den Abschnitt hinaus)`}
                        {g.anteilig > 0 && g.berechnet > 0 && " · "}
                        {g.berechnet > 0 && `${g.berechnet} ohne IFC-Menge, aus Geometrie berechnet`}
                      </div>
                    )}
                    <select value={zuordnung[g.key] || ""} onChange={e => setZuordnung(x => ({ ...x, [g.key]: e.target.value }))}
                      style={{ ...inputStyle(), padding:"6px 8px", fontSize:12, marginTop:4 }}>
                      <option value="">— keiner LV-Position zuordnen —</option>
                      {passend.map(p => <option key={p.key} value={p.key}>{p.titel ? `${p.titel}: ` : ""}{p.oz ? `${p.oz} ` : ""}{p.bez} ({z(p.menge)} {p.einheit})</option>)}
                    </select>
                  </div>
                );
              })}
              {vorschau.length > 0 && (
                <div style={{ background:"var(--surface2)", borderRadius:10, padding:"8px 10px", marginTop:8, fontSize:12 }}>
                  <div style={{ fontWeight:700, marginBottom:3 }}>Neuer Leistungsstand</div>
                  {vorschau.map(v => {
                    const p = positionen.find(x => x.key === v.key);
                    return <div key={v.key} style={{ color: v.ueberLv ? "var(--ydark)" : "var(--text)" }}>
                      {p.oz ? `${p.oz} ` : ""}{p.bez}: {z(v.alt)} % → <b>{z(v.neu)} %</b> (+{z(v.menge)} {p.einheit})
                      {v.ueberLv && " — mehr als die LV-Menge, Nachtrag prüfen"}
                    </div>;
                  })}
                </div>
              )}
              <div style={{ display:"flex", gap:6, marginTop:8 }}>
                <button onClick={buchen} disabled={bucht || !vorschau.length}
                  style={{ flex:1, background: vorschau.length ? "var(--green)" : "var(--surface2)", color: vorschau.length ? "#fff" : "var(--muted)", border:"none",
                    borderRadius:10, padding:10, fontWeight:800, cursor:"pointer", fontFamily:"inherit", display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>
                  <Check size={14} /> Leistungsstand buchen
                </button>
                <button onClick={() => navigator.clipboard?.writeText(abschnittAlsText(ergebnis)).then(() => setMeldung("✓ Mengen kopiert"))} style={knopf}>
                  <Copy size={13} /> Mengen
                </button>
              </div>
            </>
          )}
        </div>
      )}
      {meldung && <div style={{ fontSize:12, marginTop:6, color: meldung.startsWith("✓") ? "var(--green)" : "var(--ydark)" }}>{meldung}</div>}

      {modell?.raeume?.length > 0 && (
        <details style={{ marginTop:10, fontSize:12 }}>
          <summary style={{ cursor:"pointer", color:"var(--muted)" }}>
            Raumstempel aus dem Plan ({modell.raeume.length} Räume, {z(modell.raeume.reduce((s, r) => s + r.flaeche, 0))} m²)
          </summary>
          {modell.raeume.map((r, i) => (
            <div key={i} style={{ display:"flex", justifyContent:"space-between", borderTop:"1px solid var(--border)", padding:"4px 0" }}>
              <span>{r.raum}</span><span style={{ color:"var(--muted)" }}>{z(r.flaeche)} m²{r.umfang ? ` · U ${z(r.umfang)} m` : ""}</span>
            </div>
          ))}
          <button onClick={async () => { const { raumstempelAlsText } = await import("../lib/pdfPlan.js");
            navigator.clipboard?.writeText(raumstempelAlsText(modell.raeume, stand.modellName)).then(() => setMeldung("✓ Raumflächen kopiert")); }}
            style={{ ...knopf, marginTop:6 }}><Copy size={13} /> Raumflächen kopieren</button>
        </details>
      )}

      {stand.log?.length > 0 && (
        <details style={{ marginTop:10, fontSize:12 }}>
          <summary style={{ cursor:"pointer", color:"var(--muted)" }}>Gemeldete Abschnitte ({stand.log.length})</summary>
          {stand.log.map(l => (
            <div key={l.id} style={{ borderTop:"1px solid var(--border)", padding:"6px 0", display:"flex", justifyContent:"space-between", gap:8 }}>
              <div><b>{l.datum}</b> · {l.bereich}
                <div style={{ color:"var(--muted)", whiteSpace:"pre-line", fontSize:11 }}>{l.text.split("\n").slice(1).join("\n")}</div>
              </div>
              <button onClick={() => rueckgaengig(l)} style={{ ...knopf, padding:"4px 7px", alignSelf:"flex-start" }}><Undo2 size={12} /></button>
            </div>
          ))}
        </details>
      )}
    </div>
  );
}

