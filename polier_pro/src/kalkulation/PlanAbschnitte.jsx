// Abschlag nach Planabschnitten (lib/kalk/planAbschnitt.js).
// "Abschnitt melden": Satz wie "S–T / 13–15 Abdichtung fertig" → Vorschau je
// Position → Aufmaßzeilen. "Einrichten": PDF-Plan laden (Achsen aus den
// Achsblasen), je Position Fläche, Linie oder Stückpunkte im Plan zeichnen.
// Der Plan selbst wird nicht gespeichert, nur Achsen und Geometrie (Meter).

import { useMemo, useRef, useState } from "react";
import { Upload, Undo2, Check, Minus, Plus, Trash2, Grid3x3, ScanSearch, Wand2 } from "lucide-react";
import { Knopf, Dialog, Meldung, menge as mengeText } from "./ui.jsx";
import { schluessel } from "../lib/kalk/abrechnung.js";
import { dachErkennen, zuordnungVorschlagen } from "../lib/kalk/dachAssistent.js";
import { achsenAusBlasen, rasterAusAchsen, abschnittBerechnen, abschnittInsAufmass, gebuchtAusAufmass, fortschritt,
  bezugGesamt, zellenDesBereichs, oeffnungenFinden, polygonFlaeche } from "../lib/kalk/planAbschnitt.js";

const PT_IN_M = 25.4 / 72 / 1000;
const ART = { flaeche: "Fläche", strecke: "Linie", zaehlen: "Stückpunkte" };
const EINHEIT_ART = [[/^(m2|m²|qm)$/i, "flaeche"], [/^(m|lfm|lfdm)$/i, "strecke"], [/^(st|stk|stck|stück|stueck|psch)$/i, "zaehlen"]];
export const artFuerEinheit = e => (EINHEIT_ART.find(([re]) => re.test(String(e || "").trim().replace(/\.$/, ""))) || [])[1] || null;
const pz = x => `${(x * 100).toLocaleString("de-DE", { maximumFractionDigits: 1 })} %`;
const FARBE = { flaeche: "rgba(37, 99, 235, 0.18)", linie: "#2563eb", abzug: "rgba(220, 38, 38, 0.2)", feld: "rgba(234, 88, 12, 0.16)" };

export function PlanAbschnitteDialog({ projekt, zeilen, aufmass, darf, onProjektAendern, onUebernehmen, onSchliessen }) {
  const [plan, setPlan] = useState(() => ({ achsen: [], bezuege: {}, ...(projekt.planraster || {}) }));
  const [geaendert, setGeaendert] = useState(false);
  const [reiter, setReiter] = useState(plan.achsen?.length ? "melden" : "einrichten");
  const [bild, setBild] = useState(null);          // { url, breite, hoehe, transform, f, punkte }
  const [laeuft, setLaeuft] = useState(null);
  const [fehler, setFehler] = useState(null);
  const [hinweis, setHinweis] = useState(null);
  const [satz, setSatz] = useState("");
  const [ab, setAb] = useState(() => new Set());   // abgewählte Positionen
  const [aktiv, setAktiv] = useState(null);
  const [teil, setTeil] = useState([]);            // Punkte des Teils in Arbeit
  const [abzug, setAbzug] = useState(false);
  const [zoom, setZoom] = useState(1);
  const datei = useRef(null);
  const planDaten = useRef(null);                  // Linien, Flächen, Texte des geladenen Plans (Meter)
  const [dach, setDach] = useState(null);          // Ergebnis Dach-Assistent
  const [zuord, setZuord] = useState({});          // posKey → Mengen-ID
  const [rsEingabe, setRsEingabe] = useState("");
  const [ueberschreiben, setUeberschreiben] = useState(false);

  const positionen = useMemo(() => zeilen.filter(z => artFuerEinheit(z.einheit)).map(z => ({
    key: schluessel(z.standId, z.knotenId), standId: z.standId, knotenId: z.knotenId, oz: z.oz, kurztext: z.kurztext,
    einheit: z.einheit, mengeLv: z.mengeLv, art: artFuerEinheit(z.einheit) })), [zeilen]);
  const raster = useMemo(() => rasterAusAchsen(plan.achsen || []), [plan.achsen]);
  const gebucht = useMemo(() => gebuchtAusAufmass(aufmass), [aufmass]);
  const stand = useMemo(() => fortschritt(plan, gebucht), [plan, gebucht]);
  const ergebnis = useMemo(() => satz.trim() && plan.achsen?.length ? abschnittBerechnen({ planraster: plan, positionen, satz, gebucht }) : null,
    [satz, plan, positionen, gebucht]);
  const gewaehlt = ergebnis?.zeilen?.filter(z => !ab.has(z.key) && z.menge > 0) || [];

  const aendern = fn => { setPlan(p => fn(p)); setGeaendert(true); };
  const speichern = async () => { await onProjektAendern({ planraster: plan }); setGeaendert(false); };
  const schliessen = () => { if (!laeuft && (!geaendert || window.confirm("Änderungen an der Einrichtung verwerfen?"))) onSchliessen(); };

  // ── Plan laden ──
  const laden = async f => {
    setLaeuft(`Lese ${f.name} …`); setFehler(null);
    try {
      const { pdfPlanLesen, pdfSeiteRendern, pdfObjekteInMeter } = await import("../lib/pdfPlan.js");
      const geo = await pdfPlanLesen(f);
      const ms = geo.massstab || plan.massstab;
      if (!ms) throw new Error("Kein Maßstab im Plan gefunden (z. B. „M 1:50“ im Schriftfeld).");
      const m = pdfObjekteInMeter(geo, ms);
      const { achsen, einzeln } = achsenAusBlasen(m);
      if (rasterAusAchsen(achsen).fehler.length) throw new Error("Keine Achsen in zwei Richtungen erkannt. Polaris sucht Achsbeschriftungen in Kreisen an beiden Linienenden.");
      setLaeuft("Zeichne den Plan …");
      const r = await pdfSeiteRendern(f, 1, 4000);
      const punkte = [];
      for (const l of m.linien) punkte.push(l.p1, l.p2);
      planDaten.current = m;
      setBild({ ...r, f: PT_IN_M * ms, punkte, plan: { texte: m.texte, umrisse: m.umrisse } });
      const alt = (plan.achsen || []).map(a => a.tag).sort().join(",");
      aendern(p => ({ ...p, datei: f.name, massstab: ms, achsen }));
      if (alt && alt !== achsen.map(a => a.tag).sort().join(",")) setFehler(`Achsen weichen von der bisherigen Einrichtung ab (${alt}). Gezeichnete Geometrie bitte prüfen.`);
      else if (einzeln.length) setFehler(`Ohne Gegenstück und darum nicht verwendet: Achse ${einzeln.join(", ")}.`);
    } catch (e) { setFehler(e.message); }
    finally { setLaeuft(null); if (datei.current) datei.current.value = ""; }
  };

  // Dach-Assistent: Umrisse, Längen, Öffnungen, Durchführungen → Mengen + Zuordnung
  const erkennen = start => {
    if (!planDaten.current) return;
    const xs = (plan.achsen || []).flatMap(a => [a.p1.x, a.p2.x]), ys = (plan.achsen || []).flatMap(a => [a.p1.y, a.p2.y]);
    const bereich = xs.length ? [{ x: Math.min(...xs) - 3, y: Math.min(...ys) - 3 }, { x: Math.max(...xs) + 3, y: Math.min(...ys) - 3 },
      { x: Math.max(...xs) + 3, y: Math.max(...ys) + 3 }, { x: Math.min(...xs) - 3, y: Math.max(...ys) + 3 }] : undefined;
    const rs = rsEingabe.trim() === "" ? undefined : Number(rsEingabe.replace(",", "."));
    const e = dachErkennen(planDaten.current, { start, bereich, randstreifen: Number.isFinite(rs) ? rs : undefined });
    setDach(e);
    if (!e.fehler) {
      setZuord(Object.fromEntries(zuordnungVorschlagen(positionen, e.mengen).map(z => [z.key, z.id || ""])));
      if (rsEingabe.trim() === "") setRsEingabe(String(e.randstreifen ?? "").replace(".", ","));
    }
  };
  const zuordnungUebernehmen = () => {
    const bezuege = { ...plan.bezuege };
    let n = 0;
    for (const p of positionen) {
      const id = zuord[p.key], m = id && dach?.mengen?.find(x => x.id === id);
      if (!m || (bezuege[p.key] && !ueberschreiben)) continue;
      bezuege[p.key] = { ...m.bezug, ...(bezuege[p.key]?.modus ? { modus: bezuege[p.key].modus } : {}), quelle: `dach:${id}` };
      n++;
    }
    aendern(pl => ({ ...pl, bezuege }));
    setHinweis(n ? `${n} Positionen mit Plangeometrie versehen. „Einrichtung speichern“ nicht vergessen.` : "Nichts übernommen — alle gewählten Positionen haben schon Geometrie (Häkchen „ersetzen“).");
  };

  // Meter ↔ Bildpunkte (PDF-Punkte über die Viewport-Matrix)
  const zuPx = p => { const t = bild.transform, x = p.x / bild.f, y = p.y / bild.f; return [t[0] * x + t[2] * y + t[4], t[1] * x + t[3] * y + t[5]]; };
  const ausPx = (px, py) => {
    const t = bild.transform, det = t[0] * t[3] - t[1] * t[2];
    const x = (t[3] * (px - t[4]) - t[2] * (py - t[5])) / det, y = (-t[1] * (px - t[4]) + t[0] * (py - t[5])) / det;
    return { x: x * bild.f, y: y * bild.f };
  };
  const klick = e => {
    if (!darf) return;
    const svg = e.currentTarget, pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const q = pt.matrixTransform(svg.getScreenCTM().inverse());
    if (reiter === "assistent") { erkennen(ausPx(q.x, q.y)); return; }
    if (!aktiv) return;
    let p = ausPx(q.x, q.y);
    // auf Linienenden im Plan fangen (8 Bildpunkte)
    const fang = 8 / (bild.renderFaktor || 1) * bild.f;
    let best = null, d0 = fang;
    for (const c of bild.punkte) { const d = Math.hypot(c.x - p.x, c.y - p.y); if (d < d0) { d0 = d; best = c; } }
    if (best) p = { x: best.x, y: best.y };
    const art = positionen.find(x => x.key === aktiv)?.art;
    if (art === "zaehlen") aendern(pl => {
      const b = pl.bezuege[aktiv] || { art, teile: [] };
      const teile = b.teile.length ? b.teile.map((t, i) => (i === 0 ? { ...t, punkte: [...t.punkte, p] } : t)) : [{ punkte: [p] }];
      return { ...pl, bezuege: { ...pl.bezuege, [aktiv]: { ...b, art, teile } } };
    });
    else setTeil(t => [...t, p]);
  };
  // Öffnungen (Lichtkuppel, Dachausstieg, Durchbrüche mit Maß) in den Flächenteilen
  // suchen und als Abzug ergänzen — jede erkannte Öffnung, ohne Übermessung.
  const mitOeffnungen = (teile) => {
    if (!bild?.plan) return { teile, neu: [] };
    const neu = [];
    for (const t of teile.filter(x => !x.abzug)) for (const o of oeffnungenFinden(t.punkte, bild.plan)) {
      const c = o.punkte.reduce((a, p) => ({ x: a.x + p.x / o.punkte.length, y: a.y + p.y / o.punkte.length }), { x: 0, y: 0 });
      const schon = [...teile, ...neu].some(x => x.abzug && Math.abs(polygonFlaeche(x.punkte) - o.flaeche) < 0.02
        && x.punkte.some(p => Math.hypot(p.x - c.x, p.y - c.y) < Math.sqrt(o.flaeche)));
      if (!schon) neu.push({ punkte: o.punkte, abzug: true, oeffnung: o.text });
    }
    return { teile: [...teile, ...neu], neu };
  };
  const meldeOeffnungen = neu => setHinweis(neu.length
    ? `Automatisch abgezogen: ${neu.map(o => `${o.oeffnung} (${mengeText(polygonFlaeche(o.punkte))} m²)`).join(", ")}. Mit „Zurück“ entfernen, falls falsch.`
    : "Keine beschriftete Öffnung in der Fläche gefunden. Fehlende Öffnungen mit „Abzug“ nachzeichnen.");
  const teilFertig = () => {
    const art = positionen.find(x => x.key === aktiv)?.art;
    if (teil.length < (art === "flaeche" ? 3 : 2)) return;
    const b = plan.bezuege[aktiv] || { art, teile: [] };
    let teile = [...b.teile, { punkte: teil, ...(abzug ? { abzug: true } : {}) }];
    if (art === "flaeche" && !abzug) { const r = mitOeffnungen(teile); teile = r.teile; meldeOeffnungen(r.neu); }
    aendern(pl => ({ ...pl, bezuege: { ...pl.bezuege, [aktiv]: { ...b, art, teile } } }));
    setTeil([]); setAbzug(false);
  };
  const bezugSetzen = (key, b) => aendern(pl => {
    const bezuege = { ...pl.bezuege };
    if (b) bezuege[key] = b; else delete bezuege[key];
    return { ...pl, bezuege };
  });

  // Feld des gemeldeten Abschnitts zur Anzeige (Randfelder 1,5 m über die Achse)
  const feldPolygon = useMemo(() => {
    if (!ergebnis?.zeilen || !ergebnis.bereiche || raster.felder.length < 2) return null;
    const zellen = zellenDesBereichs(raster, ergebnis.bereiche);
    const grenzen = raster.felder.map((f, k) => {
      const idx = [...new Set(zellen.map(z => Number(z.split("|")[k])))];
      const lo = f.baender[Math.min(...idx)].von, hi = f.baender[Math.max(...idx)].bis;
      return [Number.isFinite(lo) ? lo : f.achsen[0].pos - 1.5, Number.isFinite(hi) ? hi : f.achsen.at(-1).pos + 1.5];
    });
    const [n1, n2] = raster.felder.map(f => f.normale);
    const det = n1.x * n2.y - n1.y * n2.x;
    const s = (a, b) => ({ x: (a * n2.y - n1.y * b) / det, y: (n1.x * b - a * n2.x) / det });
    return [s(grenzen[0][0], grenzen[1][0]), s(grenzen[0][1], grenzen[1][0]), s(grenzen[0][1], grenzen[1][1]), s(grenzen[0][0], grenzen[1][1])];
  }, [ergebnis, raster]);

  // Ausschnitt: Achsraster samt Achsblasen, etwas Rand
  const ausschnitt = useMemo(() => {
    if (!bild) return null;
    const pts = (plan.achsen || []).flatMap(a => [zuPx(a.p1), zuPx(a.p2)]);
    if (pts.length < 4) return [0, 0, bild.breite, bild.hoehe];
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const r = Math.max(x1 - x0, y1 - y0) * 0.04;
    return [x0 - r, y0 - r, x1 - x0 + 2 * r, y1 - y0 + 2 * r];
  }, [bild, plan.achsen]); // eslint-disable-line react-hooks/exhaustive-deps

  const planAnsicht = bild && (
    <div style={{ flex: "none", border: "1px solid var(--border)", borderRadius: 8, overflow: "auto", height: reiter === "melden" ? "36vh" : reiter === "assistent" ? "46vh" : "56vh", background: "#fff" }}>
      <svg viewBox={ausschnitt.join(" ")} onClick={klick} aria-label="Plan zum Zeichnen"
        style={{ display: "block", ...(zoom === 1 ? { width: "100%", height: "100%" } : { width: `${zoom * 100}%`, height: "auto" }), cursor: aktiv && darf && reiter === "einrichten" ? "crosshair" : "default" }}>
        <clipPath id="plan-ausschnitt"><rect x={ausschnitt[0]} y={ausschnitt[1]} width={ausschnitt[2]} height={ausschnitt[3]} /></clipPath>
        <image href={bild.url} x={0} y={0} width={bild.breite} height={bild.hoehe} clipPath="url(#plan-ausschnitt)" />
        {raster.felder.flatMap(f => f.achsen.map(a => {
          const ach = plan.achsen.find(x => x.tag === a.tag);
          const [x1, y1] = zuPx(ach.p1), [x2, y2] = zuPx(ach.p2);
          return <line key={a.tag} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#ea580c" strokeWidth={3} strokeDasharray="18 10" opacity={0.55} />;
        }))}
        {reiter === "melden" && feldPolygon && <polygon points={feldPolygon.map(p => zuPx(p).join(",")).join(" ")} fill={FARBE.feld} stroke="#ea580c" strokeWidth={5} />}
        {reiter === "assistent" && dach && !dach.fehler && <>
          {dach.aussen && <polygon points={dach.aussen.punkte.map(p => zuPx(p).join(",")).join(" ")} fill="none" stroke="#7c3aed" strokeWidth={4} />}
          <polygon points={dach.innen.punkte.map(p => zuPx(p).join(",")).join(" ")} fill="rgba(22,163,74,0.14)" stroke="#16a34a" strokeWidth={5} />
          {dach.feld && <polygon points={dach.feld.map(p => zuPx(p).join(",")).join(" ")} fill="none" stroke="#16a34a" strokeWidth={3} strokeDasharray="14 8" />}
          {dach.oeffnungen.map((o, i) => <polygon key={i} points={o.punkte.map(p => zuPx(p).join(",")).join(" ")} fill={FARBE.abzug} stroke="#dc2626" strokeWidth={4} />)}
          {dach.mengen.filter(m => m.id.startsWith("df_")).flatMap(m => m.bezug.teile[0].punkte.map((p, i) => { const [x, y] = zuPx(p); return <circle key={m.id + i} cx={x} cy={y} r={12} fill="#2563eb" opacity={0.8} />; }))}
        </>}
        {reiter === "einrichten" && Object.entries(plan.bezuege).map(([key, b]) => {
          const an = key === aktiv;
          return b.teile.map((t, i) => {
            const pts = t.punkte.map(p => zuPx(p).join(",")).join(" ");
            if (b.art === "zaehlen") return t.punkte.map((p, j) => { const [x, y] = zuPx(p); return <circle key={`${key}${i}${j}`} cx={x} cy={y} r={an ? 14 : 8} fill={an ? "#2563eb" : "#93c5fd"} />; });
            return b.art === "flaeche"
              ? <polygon key={`${key}${i}`} points={pts} fill={t.abzug ? FARBE.abzug : an ? FARBE.flaeche : "rgba(37,99,235,0.05)"} stroke={an ? FARBE.linie : "#93c5fd"} strokeWidth={an ? 4 : 2} />
              : <polyline key={`${key}${i}`} points={pts} fill="none" stroke={an ? FARBE.linie : "#93c5fd"} strokeWidth={an ? 6 : 3} />;
          });
        })}
        {teil.length > 0 && <polyline points={teil.map(p => zuPx(p).join(",")).join(" ")} fill="none" stroke={abzug ? "#dc2626" : "#16a34a"} strokeWidth={5} />}
        {teil.map((p, i) => { const [x, y] = zuPx(p); return <circle key={i} cx={x} cy={y} r={9} fill={abzug ? "#dc2626" : "#16a34a"} />; })}
      </svg>
    </div>
  );
  const zoomLeiste = bild && <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
    <Knopf klein leise Icon={Minus} aria-label="Verkleinern" onClick={() => setZoom(z => Math.max(1, z / 1.5))} />
    <span className="kb-zahl" style={{ fontSize: 12, color: "var(--text2)", width: 44, textAlign: "center" }}>{Math.round(zoom * 100)} %</span>
    <Knopf klein leise Icon={Plus} aria-label="Vergrößern" onClick={() => setZoom(z => Math.min(6, z * 1.5))} />
  </div>;

  const aktivPos = positionen.find(p => p.key === aktiv);
  const aktivBezug = aktiv ? plan.bezuege[aktiv] : null;

  return (
    <Dialog titel="Abschlag nach Planabschnitten" breite={1240} onSchliessen={schliessen}
      fuss={reiter === "melden" ? <>
        <Knopf leise onClick={schliessen}>Schließen</Knopf>
        {darf && <Knopf haupt disabled={!gewaehlt.length || geaendert} title={geaendert ? "Erst die Einrichtung speichern" : ""}
          onClick={() => { onUebernehmen(abschnittInsAufmass({ ...ergebnis, zeilen: gewaehlt }, { neueZeile: f => f, satz })); setSatz(""); setAb(new Set()); }}>
          {gewaehlt.length ? `${gewaehlt.length} Aufmaßzeilen anlegen` : "Aufmaßzeilen anlegen"}</Knopf>}
      </> : <>
        <Knopf leise onClick={schliessen}>Schließen</Knopf>
        {darf && <Knopf haupt disabled={!geaendert || !!laeuft} onClick={speichern}>Einrichtung speichern</Knopf>}
      </>}>
      <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
        {[["melden", "Abschnitt melden"], ["einrichten", "Einrichten"], ["assistent", "Dach-Assistent"]].map(([id, l]) =>
          <button key={id} className="kb-knopf klein" aria-pressed={reiter === id} onClick={() => setReiter(id)}
            style={{ background: reiter === id ? "var(--surface2)" : "none", border: "none", fontWeight: reiter === id ? 500 : 400 }}>{l}</button>)}
        <span style={{ marginLeft: "auto", fontSize: 13, color: "var(--text2)" }}>
          {plan.achsen?.length ? `${plan.datei || "Plan"} · M 1:${plan.massstab} · Achsen ${raster.felder.map(f => f.achsen.map(a => a.tag).join(" ")).join(" | ")}` : "Noch kein Plan eingerichtet"}
        </span>
        {zoomLeiste}
      </div>
      {fehler && <Meldung art="fehler" onSchliessen={() => setFehler(null)}>{fehler}</Meldung>}
      {hinweis && <Meldung art="info" onSchliessen={() => setHinweis(null)}>{hinweis}</Meldung>}
      {laeuft && <div style={{ color: "var(--text2)", fontSize: 13 }}>{laeuft}</div>}

      {reiter === "melden" && <>
        {!plan.achsen?.length ? <Meldung art="info">Erst unter „Einrichten“ den Plan laden und den Positionen ihre Flächen, Linien und Stückpunkte zuordnen.</Meldung> : <>
          <div>
            <input className="kb-eingabe" value={satz} onChange={e => { setSatz(e.target.value); setAb(new Set()); }} autoFocus
              placeholder="z. B. S–T / 13–15 Abdichtung fertig · ohne Kies · zu 50 %" aria-label="Abschnitt melden" style={{ width: "100%", height: 40, fontSize: 15 }} />
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>Achsen je Richtung von–bis. Ein Wort wie „Abdichtung“ wählt Positionen nach dem Kurztext, „ohne Kies“ schließt aus. Randachsen schließen den Überstand bis zur Außenkante ein.</div>
          </div>
          {planAnsicht}
          {ergebnis && <>
            {ergebnis.fehler?.map(f => <Meldung key={f} art="fehler">{f}</Meldung>)}
            {ergebnis.hinweise?.length > 0 && <div style={{ fontSize: 13, color: "var(--text2)" }}>{ergebnis.hinweise.join(" ")}</div>}
            {ergebnis.zeilen?.length > 0 && <table className="am-tabelle">
              <thead><tr><th style={{ width: 32 }} /><th style={{ width: 90 }}>OZ</th><th>Position</th><th className="r" style={{ width: 190 }}>Plan im Abschnitt</th><th className="r" style={{ width: 80 }}>Anteil</th><th className="r" style={{ width: 130 }}>Aufmaß</th><th style={{ width: 120 }}>Rechnung</th></tr></thead>
              <tbody>{ergebnis.zeilen.map(z => (
                <tr key={z.key} style={{ opacity: ab.has(z.key) ? 0.45 : 1 }}>
                  <td><input type="checkbox" checked={!ab.has(z.key)} aria-label={`${z.oz} übernehmen`}
                    onChange={e => setAb(s => { const n = new Set(s); e.target.checked ? n.delete(z.key) : n.add(z.key); return n; })} /></td>
                  <td className="kb-zahl" style={{ color: "var(--muted)" }}>{z.oz}</td>
                  <td style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 420 }}>{z.kurztext}</td>
                  <td className="r kb-zahl" style={{ whiteSpace: "nowrap" }}>{mengeText(z.planNeu)} <span style={{ color: "var(--muted)" }}>/ {mengeText(z.planGesamt)}</span></td>
                  <td className="r kb-zahl">{pz(z.quote)}</td>
                  <td className="r kb-zahl" style={{ fontWeight: 500, whiteSpace: "nowrap" }}>{mengeText(z.menge)} {z.einheit}</td>
                  <td style={{ fontSize: 12, color: "var(--text2)" }}>{z.modus === "plan" ? "Planmenge" : `Anteil × LV ${mengeText(z.mengeLv)}`}</td>
                </tr>))}</tbody>
            </table>}
          </>}
          {!satz && Object.keys(stand).length > 0 && <div style={{ fontSize: 13, color: "var(--text2)" }}>
            Gemeldet bisher: {positionen.filter(p => stand[p.key] != null).map(p => `${p.oz} ${pz(stand[p.key])}`).join(" · ")}</div>}
        </>}
      </>}

      {reiter === "einrichten" && <div style={{ display: "grid", gridTemplateColumns: "360px 1fr", gap: 16, minHeight: 0 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
          {darf && <Knopf Icon={Upload} disabled={!!laeuft} onClick={() => datei.current?.click()}>{bild ? "Anderen Plan laden" : plan.achsen?.length ? "Plan zum Bearbeiten laden" : "PDF-Plan laden"}</Knopf>}
          <input ref={datei} type="file" hidden accept=".pdf,application/pdf" onChange={e => e.target.files?.[0] && laden(e.target.files[0])} />
          <div style={{ fontSize: 12, color: "var(--muted)" }}>Vektor-PDF aus dem CAD mit Maßstab im Schriftfeld. Gespeichert werden nur Achsen und Geometrie, nicht der Plan.</div>
          <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflowY: "auto", maxHeight: "50vh" }}>
            {positionen.map(p => {
              const b = plan.bezuege[p.key];
              return <button key={p.key} className="am-pos" aria-current={aktiv === p.key} onClick={() => { setAktiv(p.key); setTeil([]); setAbzug(false); setHinweis(null); }}>
                <span className="kb-zahl" style={{ color: "var(--muted)", width: 70, flex: "none" }}>{p.oz}</span>
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.kurztext}</span>
                <span className="kb-zahl" style={{ fontSize: 12, width: 92, flex: "none", textAlign: "right", color: b ? "var(--text)" : "var(--muted)" }}>
                  {b ? `${mengeText(bezugGesamt(b))} ${p.einheit}` : ART[p.art]}</span>
              </button>;
            })}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
          {aktivPos && <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            <strong style={{ fontWeight: 500 }}>{aktivPos.oz}</strong>
            <span style={{ color: "var(--text2)", fontSize: 13 }}>{ART[aktivPos.art]} · Plan {mengeText(bezugGesamt(aktivBezug))} {aktivPos.einheit} · LV {mengeText(aktivPos.mengeLv)}</span>
            {darf && <>
              {aktivPos.art !== "zaehlen" && <>
                <Knopf klein Icon={Check} disabled={teil.length < (aktivPos.art === "flaeche" ? 3 : 2)} onClick={teilFertig}>{aktivPos.art === "flaeche" ? "Fläche schließen" : "Linie fertig"}</Knopf>
                {aktivPos.art === "flaeche" && <label style={{ fontSize: 13, display: "flex", gap: 4, alignItems: "center" }}><input type="checkbox" checked={abzug} onChange={e => setAbzug(e.target.checked)} /> Abzug</label>}
              </>}
              <Knopf klein leise Icon={Undo2} disabled={!teil.length && !aktivBezug} onClick={() => {
                if (teil.length) setTeil(t => t.slice(0, -1));
                else if (aktivBezug) {
                  const teile = aktivBezug.art === "zaehlen" ? aktivBezug.teile.map(t => ({ ...t, punkte: t.punkte.slice(0, -1) })).filter(t => t.punkte.length) : aktivBezug.teile.slice(0, -1);
                  bezugSetzen(aktiv, teile.length ? { ...aktivBezug, teile } : null);
                }
              }}>Zurück</Knopf>
              <Knopf klein leise Icon={Trash2} disabled={!aktivBezug} onClick={() => bezugSetzen(aktiv, null)}>Leeren</Knopf>
              {aktivPos.art === "flaeche" && <Knopf klein leise Icon={ScanSearch} disabled={!aktivBezug || !bild} title={bild ? "" : "Plan laden"}
                onClick={() => { const r = mitOeffnungen(aktivBezug.teile); if (r.neu.length) bezugSetzen(aktiv, { ...aktivBezug, teile: r.teile }); meldeOeffnungen(r.neu); }}>Öffnungen abziehen</Knopf>}
              <select className="kb-eingabe" aria-label="Geometrie übernehmen von" value="" style={{ width: 200, height: 30 }}
                onChange={e => { const q = plan.bezuege[e.target.value]; if (q) bezugSetzen(aktiv, { ...q, modus: aktivBezug?.modus }); }}>
                <option value="">Übernehmen von …</option>
                {positionen.filter(p => p.key !== aktiv && plan.bezuege[p.key]?.art === aktivPos.art).map(p => <option key={p.key} value={p.key}>{p.oz} {p.kurztext.slice(0, 40)}</option>)}
              </select>
              <select className="kb-eingabe" aria-label="Menge fürs Aufmaß" value={aktivBezug?.modus || "anteil"} disabled={!aktivBezug} style={{ width: 240, height: 30 }}
                onChange={e => bezugSetzen(aktiv, { ...aktivBezug, modus: e.target.value })}>
                <option value="anteil">Aufmaß = Anteil × LV-Menge</option>
                <option value="plan">Aufmaß = Planmenge</option>
              </select>
            </>}
          </div>}
          {bild ? planAnsicht : <div style={{ border: "1px dashed var(--border)", borderRadius: 8, padding: 32, textAlign: "center", color: "var(--text2)", fontSize: 13 }}>
            <Grid3x3 size={20} strokeWidth={1.5} style={{ marginBottom: 8 }} /><br />
            {plan.achsen?.length ? `${Object.keys(plan.bezuege).length} Positionen mit Geometrie. Zum Zeichnen den Plan erneut laden.` : "Dachaufsicht oder Grundriss als PDF laden. Polaris liest Maßstab und Achsen."}
          </div>}
          {bild && aktivPos && <div style={{ fontSize: 12, color: "var(--muted)" }}>
            {aktivPos.art === "zaehlen" ? "Jeder Klick setzt einen Stückpunkt." : "Punkte nacheinander anklicken, dann schließen. Klicks rasten auf Linienenden im Plan ein."}
            {" "}Beschriftete Öffnungen (z. B. „BD 120 x 120“, Lichtkuppel) zieht Polaris beim Schließen automatisch ab, egal wie groß. Fehlende mit „Abzug“ nachzeichnen.</div>}
        </div>
      </div>}

      {reiter === "assistent" && <>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          {darf && <Knopf Icon={Upload} disabled={!!laeuft} onClick={() => datei.current?.click()}>{bild ? "Anderen Plan laden" : "Dachaufsicht laden"}</Knopf>}
          <input ref={datei} type="file" hidden accept=".pdf,application/pdf" onChange={e => e.target.files?.[0] && laden(e.target.files[0])} />
          {darf && <Knopf haupt Icon={Wand2} disabled={!bild || !!laeuft} onClick={() => erkennen()}>Dach erkennen</Knopf>}
          <label style={{ fontSize: 13, display: "flex", gap: 6, alignItems: "center", color: "var(--text2)" }}>Randstreifen
            <input className="kb-eingabe" value={rsEingabe} onChange={e => setRsEingabe(e.target.value)} placeholder="auto" aria-label="Randstreifenbreite in m" style={{ width: 64, height: 30 }} /> m</label>
          <span style={{ fontSize: 12, color: "var(--muted)" }}>Klappt die Erkennung nicht, einmal in die Dachfläche klicken.</span>
        </div>
        {!bild && <Meldung art="info">Dachaufsicht als Vektor-PDF laden. Der Assistent sucht Dachfläche, Attika, Randstreifen, Öffnungen und Durchführungen und schlägt die Zuordnung zu den LV-Positionen vor.</Meldung>}
        {dach?.fehler && <Meldung art="fehler">{dach.fehler}</Meldung>}
        {bild && (!dach || dach.fehler) && planAnsicht}
        {dach && !dach.fehler && <div style={{ display: "grid", gridTemplateColumns: "380px 1fr", gap: 16 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
            <table className="am-tabelle"><tbody>{dach.mengen.map(m => (
              <tr key={m.id} title={m.info || ""}><td>{m.name}{m.annahme && <span style={{ color: "var(--muted)" }}> · prüfen</span>}
                {m.info && <div style={{ fontSize: 11, color: "var(--muted)" }}>{m.info}</div>}</td>
                <td className="r kb-zahl" style={{ whiteSpace: "nowrap", fontWeight: 500 }}>{mengeText(m.menge)} {m.einheit}</td></tr>))}</tbody></table>
            {dach.hinweise.map(h => <div key={h} style={{ fontSize: 12, color: "var(--text2)" }}>{h}</div>)}
          </div>
          {planAnsicht}
        </div>}
        {dach && !dach.fehler && <>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <strong style={{ fontWeight: 500 }}>Zuordnung zu den Positionen</strong>
            <span style={{ fontSize: 12, color: "var(--muted)" }}>Vorschlag nach Einheit und Kurztext. Rot = Plan weicht mehr als 25 % von der LV-Menge ab.</span>
            <label style={{ marginLeft: "auto", fontSize: 13, display: "flex", gap: 4, alignItems: "center" }}><input type="checkbox" checked={ueberschreiben} onChange={e => setUeberschreiben(e.target.checked)} /> vorhandene Geometrie ersetzen</label>
            {darf && <Knopf haupt disabled={!Object.values(zuord).some(Boolean)} onClick={zuordnungUebernehmen}>Zuordnung übernehmen</Knopf>}
          </div>
          <table className="am-tabelle">
            <thead><tr><th style={{ width: 90 }}>OZ</th><th>Position</th><th style={{ width: 300 }}>Planmenge aus</th><th className="r" style={{ width: 110 }}>Plan</th><th className="r" style={{ width: 110 }}>LV</th><th className="r" style={{ width: 80 }}>Abw.</th></tr></thead>
            <tbody>{positionen.map(p => {
              const m = dach.mengen.find(x => x.id === zuord[p.key]);
              const abw = m && p.mengeLv > 0 ? m.menge / p.mengeLv - 1 : null;
              return <tr key={p.key} style={{ opacity: m ? 1 : 0.6 }}>
                <td className="kb-zahl" style={{ color: "var(--muted)" }}>{p.oz}</td>
                <td style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 420 }}>{p.kurztext}{plan.bezuege[p.key] && <span style={{ color: "var(--muted)", fontSize: 12 }}> · hat Geometrie</span>}</td>
                <td><select className="kb-eingabe" value={zuord[p.key] || ""} aria-label={`Planmenge für ${p.oz}`} style={{ width: "100%", height: 30 }}
                  onChange={e => setZuord(z => ({ ...z, [p.key]: e.target.value }))}>
                  <option value="">—</option>
                  {dach.mengen.filter(x => x.art === p.art).map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
                </select></td>
                <td className="r kb-zahl" style={{ whiteSpace: "nowrap" }}>{m ? `${mengeText(m.menge)} ${{ flaeche: "m²", strecke: "m", zaehlen: "Stk" }[m.art]}` : ""}</td>
                <td className="r kb-zahl" style={{ whiteSpace: "nowrap" }}>{mengeText(p.mengeLv)} {p.einheit}</td>
                <td className="r kb-zahl" style={{ color: abw != null && Math.abs(abw) > 0.25 ? "var(--danger, #dc2626)" : "var(--text2)" }}>{abw == null ? "" : `${abw > 0 ? "+" : ""}${Math.round(abw * 100)} %`}</td>
              </tr>;
            })}</tbody>
          </table>
        </>}
      </>}
    </Dialog>
  );
}

