// Abrechnung (Phase 5): Aufmaß je Position, Nachträge, Rechnungen, NU-Rechnungen.
// Grundlage ist der Auftragsstand und die Stände der Nachträge. Logik: lib/kalk/abrechnung.js.
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2, Upload, Download, Printer, Sparkles, Ruler, Search, FileText, Box, Grid3x3 } from "lucide-react";
import { BimDialog } from "./Bim.jsx";
import { bimInsAufmass } from "../lib/kalk/bim.js";
import { useStammdaten } from "./stammdaten.js";
import { Knopf, Feld, Dialog, Meldung, Leer, BetragFeld, euro, menge as mengeText } from "./ui.jsx";
import { RechnungenBereich, NuRechnungenBereich } from "./Rechnungen.jsx";
import {
  neueAufmassZeile, aufmassZeileAendern, zeilenAusWerkzeug, abrechnungsZeilen, mengenvergleich, aufmassX31, x31Lesen, x31ZuAufmass,
  nachtragUebersicht, begruendungKi, istBeauftragt, NACHTRAG_GRUENDE, NACHTRAG_STATUS, NACHTRAG_STATUS_LABEL, GRUND_LABEL, GRUND_VOB, formelFehler, schluessel,
} from "../lib/kalk/abrechnung.js";
import { angebotSummen, angebotHtml } from "../lib/kalk/angebotDruck.js";
import { QUELLE } from "../lib/aufmass.js";

const PlanAbschnitteDialog = lazy(() => import("./PlanAbschnitte.jsx").then(m => ({ default: m.PlanAbschnitteDialog })));
const AufmassWerkzeug = lazy(() => import("../components/AufmassWerkzeug.jsx").then(m => ({ default: m.AufmassWerkzeug })));
const UNTER = [["aufmass", "Aufmaß"], ["nachtraege", "Nachträge"], ["rechnungen", "Rechnungen"], ["nu", "NU-Rechnungen"]];
const heute = () => new Date().toISOString().slice(0, 10);
const dateiName = s => String(s || "Datei").replace(/[^\wäöüÄÖÜß.-]+/g, "_").slice(0, 60);
function herunterladen(name, inhalt, typ = "application/xml") {
  const url = URL.createObjectURL(new Blob([inhalt], { type: typ }));
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function AbrechnungBereich({ speicher, projekt, staende, darf, kiAktiv, onFehler, onStandGeaendert, onStandOeffnen, onProjektAendern }) {
  const sd = useStammdaten();
  const [unter, setUnter] = useState("aufmass");
  const [d, setD] = useState(null);
  const auftrag = useMemo(() => [...staende].filter(s => s.art === "auftrag").sort((a, b) => b.nummer - a.nummer)[0] || null, [staende]);

  const laden = useCallback(async () => {
    try {
      const [aufmass, nachtraege, rechnungen, nuRechnungen, vergaben] = await Promise.all([
        speicher.aufmassLaden(projekt.id), speicher.nachtraegeLaden(projekt.id), speicher.rechnungenLaden(projekt.id),
        speicher.nuRechnungenLaden(projekt.id), speicher.vergabenLaden(projekt.id)]);
      const ids = [auftrag?.id, ...nachtraege.map(n => n.stand_id)].filter(Boolean);
      const knoten = new Map(await Promise.all(ids.map(async id => [id, await speicher.knotenLaden(id)])));
      setD({ aufmass, nachtraege, rechnungen, nuRechnungen, vergaben, knoten });
    } catch (e) { onFehler(e.nutzerText || e.message); setD({ fehler: true }); }
  }, [speicher, projekt.id, auftrag?.id, onFehler]);
  useEffect(() => { laden(); }, [laden]);

  const auftragAnlegen = async () => {
    const basis = staende.find(s => s.id === projekt.aktueller_stand) || staende.at(-1);
    if (!basis || !window.confirm(`Auftragsstand aus Stand ${basis.nummer} anlegen? Der Stand wird kopiert; der Auftragsstand ist die Grundlage für Aufmaß und Rechnungen.`)) return;
    try { const s = await speicher.standKopieren(basis.id, "auftrag", "Auftrag"); await onStandGeaendert(s.id); } catch (e) { onFehler(e.nutzerText || e.message); }
  };

  if (!auftrag) {
    return <div style={{ padding: 24 }}><Leer titel="Noch kein Auftragsstand" text="Abgerechnet wird gegen den beauftragten Stand. Lege ihn aus dem aktuellen Stand an; Preise und Mengen sind dann der Vertrag.">
      {darf && <Knopf haupt onClick={auftragAnlegen}>Auftragsstand anlegen</Knopf>}</Leer></div>;
  }
  if (!d) return <div style={{ padding: 24, color: "var(--text2)" }}>Lädt …</div>;
  if (d.fehler) return null;

  const nachtragStaende = new Map(staende.filter(s => s.art === "nachtrag").map(s => [s.id, s]));
  const alleTeile = [{ stand: auftrag, knoten: d.knoten.get(auftrag.id) || [] },
    ...d.nachtraege.filter(n => n.stand_id && nachtragStaende.has(n.stand_id)).map(n => ({ stand: nachtragStaende.get(n.stand_id), knoten: d.knoten.get(n.stand_id) || [], nachtrag: n }))];
  const abrechenbar = alleTeile.filter(t => !t.nachtrag || istBeauftragt(t.nachtrag));
  const ctx = { speicher, projekt, auftrag, darf, kiAktiv, sd, onFehler, laden, d, setD, alleTeile, abrechenbar, nachtragStaende, onStandGeaendert, onStandOeffnen, onProjektAendern };

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", gap: 4, padding: "12px 24px 0", borderBottom: "1px solid var(--border)", alignItems: "center" }}>
        {UNTER.map(([id, l]) => <button key={id} className="kb-knopf klein" aria-pressed={unter === id} onClick={() => setUnter(id)}
          style={{ marginBottom: 8, background: unter === id ? "var(--surface2)" : "none", border: "none", fontWeight: unter === id ? 500 : 400 }}>{l}</button>)}
        <span style={{ marginLeft: "auto", fontSize: 13, color: "var(--text2)", marginBottom: 8 }}>Grundlage: Stand {auftrag.nummer} · {auftrag.bezeichnung || "Auftrag"}</span>
      </div>
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        {unter === "aufmass" && <AufmassBereich {...ctx} />}
        {unter === "nachtraege" && <NachtraegeBereich {...ctx} />}
        {unter === "rechnungen" && <RechnungenBereich {...ctx} />}
        {unter === "nu" && <NuRechnungenBereich {...ctx} />}
      </div>
    </div>
  );
}

// ── Aufmaß ─────────────────────────────────────────────────────────────────
function AufmassBereich({ speicher, projekt, auftrag, darf, sd, kiAktiv, onFehler, d, setD, alleTeile, onProjektAendern }) {
  const [abschnitte, setAbschnitte] = useState(false);
  const [auswahl, setAuswahl] = useState(null); // schluessel
  const [suche, setSuche] = useState("");
  const [messen, setMessen] = useState(false);
  const [bim, setBim] = useState(false);
  const [meldung, setMeldung] = useState(null);
  const x31Datei = useRef(null);
  const timer = useRef({});
  const zeilen = useMemo(() => abrechnungsZeilen(alleTeile, d.aufmass), [alleTeile, d.aufmass]);
  const mv = useMemo(() => mengenvergleich(zeilen.filter(z => !z.nachtrag || istBeauftragt(alleTeile.find(t => t.nachtrag?.id === z.nachtrag.id)?.nachtrag))), [zeilen, alleTeile]);
  const gefiltert = suche ? zeilen.filter(z => `${z.oz} ${z.kurztext}`.toLowerCase().includes(suche.toLowerCase())) : zeilen;
  const aktiv = zeilen.find(z => schluessel(z.standId, z.knotenId) === auswahl) || null;
  const aktivZeilen = aktiv ? d.aufmass.filter(a => a.stand_id === aktiv.standId && a.knoten_id === aktiv.knotenId).sort((a, b) => a.sort - b.sort) : [];

  const speichern = async ae => {
    try { await speicher.aufmassSpeichern(projekt.id, ae); } catch (e) { onFehler(e.nutzerText || e.message); }
  };
  const neu = async (felder = {}) => {
    const letzte = aktivZeilen.at(-1);
    const z = neueAufmassZeile({ stand_id: aktiv.standId, knoten_id: aktiv.knotenId, blatt: letzte?.blatt || "", ort: letzte?.ort || "", sort: (letzte?.sort || 0) + 1024, ...felder });
    setD(x => ({ ...x, aufmass: [...x.aufmass, z] }));
    await speichern({ neu: [z] });
    return z;
  };
  const aendern = (z, felder) => {
    const n = aufmassZeileAendern(z, felder);
    setD(x => ({ ...x, aufmass: x.aufmass.map(a => (a.id === z.id ? n : a)) }));
    clearTimeout(timer.current[z.id]);
    timer.current[z.id] = setTimeout(() => speichern({ aendern: [{ id: z.id, felder: { ...felder, menge: n.menge } }] }), 500);
  };
  const entfernen = z => {
    setD(x => ({ ...x, aufmass: x.aufmass.filter(a => a.id !== z.id) }));
    speichern({ loeschen: [z.id] });
  };
  const ausWerkzeug = async ({ zeilen: wz }) => {
    const n = zeilenAusWerkzeug(wz, { standId: aktiv.standId, knotenId: aktiv.knotenId, blatt: aktivZeilen.at(-1)?.blatt || "" });
    setD(x => ({ ...x, aufmass: [...x.aufmass, ...n] }));
    await speichern({ neu: n });
    setMessen(false);
  };
  const x31Export = () => {
    const r = aufmassX31(auftrag, d.knoten.get(auftrag.id) || [], d.aufmass, { projekt });
    herunterladen(`Aufmass_${dateiName(projekt.name)}.X31`, r.text);
  };
  const x31Import = async file => {
    try {
      const { zeilen: neuZ, fehlend } = x31ZuAufmass(x31Lesen(await file.text()), auftrag, d.knoten.get(auftrag.id) || [], { datei: file.name });
      if (!neuZ.length) { onFehler("Keine Position der Datei passt zum Auftragsstand."); return; }
      setD(x => ({ ...x, aufmass: [...x.aufmass, ...neuZ] }));
      await speichern({ neu: neuZ });
      setMeldung(`${neuZ.length} Mengen aus ${file.name} übernommen${fehlend.length ? `, ${fehlend.length} OZ nicht im Auftrag (${fehlend.slice(0, 4).join(", ")})` : ""}.`);
    } catch (e) { onFehler(`X31 konnte nicht gelesen werden: ${e.message}`); }
    finally { if (x31Datei.current) x31Datei.current.value = ""; }
  };

  return (
    <div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: "minmax(380px, 460px) 1fr" }}>
      <aside style={{ borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column", minHeight: 0 }}>
        <div style={{ padding: 16, borderBottom: "1px solid var(--border)", display: "grid", gap: 8 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, fontSize: 13 }}>
            <Kennzahl label="Auftrag inkl. NT" wert={euro(mv.auftrag)} />
            <Kennzahl label="Aufgemessen" wert={euro(mv.abgerechnet)} unter={`${Math.round(mv.anteil * 100)} %`} />
            <Kennzahl label="Über 10 % Mehrmenge" wert={mv.mehr} unter={mv.mehr ? `${euro(mv.mehrBetrag)} mehr` : ""} warn={mv.mehr > 0} />
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <div style={{ position: "relative", flex: 1 }}>
              <Search size={14} style={{ position: "absolute", left: 8, top: 9, color: "var(--muted)" }} />
              <input className="kb-eingabe" value={suche} onChange={e => setSuche(e.target.value)} placeholder="OZ oder Text" style={{ paddingLeft: 28, height: 32 }} aria-label="Positionen filtern" />
            </div>
            <Knopf klein leise Icon={Download} onClick={x31Export} title="Aufmaß als GAEB X31">X31</Knopf>
            {darf && <Knopf klein leise Icon={Upload} onClick={() => x31Datei.current?.click()} title="Aufmaß aus GAEB X31 übernehmen">X31</Knopf>}
            {darf && <Knopf klein leise Icon={Box} onClick={() => setBim(true)} title="Aufmaß aus einem IFC-Modell">BIM</Knopf>}
            {(darf || projekt.planraster?.achsen?.length > 0) && <Knopf klein leise Icon={Grid3x3} onClick={() => setAbschnitte(true)} title="Abschnitt nach Planachsen fertig melden">Abschnitte</Knopf>}
            <input ref={x31Datei} type="file" hidden accept=".x31,.xml" onChange={e => e.target.files?.[0] && x31Import(e.target.files[0])} />
          </div>
        </div>
        <div style={{ flex: 1, overflowY: "auto" }}>
          {gefiltert.map((z, i) => {
            const vorher = gefiltert[i - 1];
            const kopf = (z.nachtrag?.id || null) !== (vorher?.nachtrag?.id || null) || i === 0;
            const nt = z.nachtrag && alleTeile.find(t => t.nachtrag?.id === z.nachtrag.id)?.nachtrag;
            const anteil = z.mengeLv > 0 ? z.mengeKum / z.mengeLv : z.mengeKum ? 1 : 0;
            return (
              <div key={schluessel(z.standId, z.knotenId)}>
                {kopf && <div className="am-kopf">{z.nachtrag ? `Nachtrag ${z.nachtrag.nummer}: ${z.nachtrag.titel}${nt && !istBeauftragt(nt) ? ` · ${NACHTRAG_STATUS_LABEL[nt.status]}` : ""}` : "Hauptauftrag"}</div>}
                <button className="am-pos" aria-current={auswahl === schluessel(z.standId, z.knotenId)} onClick={() => setAuswahl(schluessel(z.standId, z.knotenId))}>
                  <span className="kb-zahl" style={{ color: "var(--muted)", width: 76, flex: "none" }}>{z.oz}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{z.kurztext}</span>
                    {z.mengeKum !== 0 && <span className="am-balken"><span style={{ width: `${Math.min(100, anteil * 100)}%`, background: z.vob === "mehr" ? "var(--red)" : "var(--text2)" }} /></span>}
                  </span>
                  <span className="kb-zahl" style={{ textAlign: "right", fontSize: 13, width: 112, flex: "none" }}>
                    {mengeText(z.mengeKum)} <span style={{ color: "var(--muted)" }}>/ {mengeText(z.mengeLv)} {z.einheit}</span>
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      </aside>
      <main style={{ minWidth: 0, overflow: "auto", padding: 24 }}>
        {meldung && <div style={{ marginBottom: 12 }}><Meldung art="ok" onSchliessen={() => setMeldung(null)}>{meldung}</Meldung></div>}
        {!aktiv ? <Leer titel="Position wählen" text="Links eine Position wählen und Rechenansätze erfassen, im Plan oder Foto messen oder ein Aufmaß als GAEB X31 übernehmen." /> : <>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="kb-zahl" style={{ color: "var(--muted)", fontSize: 13 }}>{aktiv.oz}{aktiv.nachtrag ? ` · Nachtrag ${aktiv.nachtrag.nummer}` : ""}</div>
              <h2 style={{ margin: "2px 0 0", fontSize: 18, fontWeight: 500 }}>{aktiv.kurztext}</h2>
              {aktiv.langtext && <div style={{ color: "var(--text2)", fontSize: 13, marginTop: 4, maxHeight: 60, overflow: "hidden" }}>{aktiv.langtext}</div>}
            </div>
            <div style={{ textAlign: "right" }}>
              <div className="kb-zahl" style={{ fontSize: 20 }}>{mengeText(aktiv.mengeKum)} {aktiv.einheit}</div>
              <div style={{ fontSize: 13, color: aktiv.vob ? "var(--red)" : "var(--text2)" }}>
                LV {mengeText(aktiv.mengeLv)} {aktiv.einheit}{aktiv.abweichung != null && aktiv.mengeKum ? ` · ${aktiv.abweichung > 0 ? "+" : ""}${Math.round(aktiv.abweichung * 1000) / 10} %` : ""}
              </div>
              {aktiv.vob === "mehr" && <div style={{ fontSize: 12, color: "var(--red)" }}>Über 10 %: neuer Preis für die Übermenge möglich (§ 2 Abs. 3 VOB/B)</div>}
            </div>
          </div>
          <table className="am-tabelle" style={{ marginTop: 16 }}>
            <thead><tr><th style={{ width: 70 }}>Blatt</th><th style={{ width: 120 }}>Ort</th><th>Bezeichnung</th><th style={{ width: 200 }}>Rechenansatz</th><th className="r" style={{ width: 100 }}>Menge</th><th style={{ width: 56 }}>Abzug</th><th style={{ width: 110 }}>Quelle</th><th style={{ width: 36 }} /></tr></thead>
            <tbody>
              {aktivZeilen.map((z, i) => (
                <tr key={z.id}>
                  <td><input className="am-feld" value={z.blatt || ""} disabled={!darf} onChange={e => aendern(z, { blatt: e.target.value })} aria-label="Blatt" /></td>
                  <td><input className="am-feld" value={z.ort || ""} disabled={!darf} onChange={e => aendern(z, { ort: e.target.value })} aria-label="Ort" /></td>
                  <td><input className="am-feld" value={z.bezeichnung || ""} disabled={!darf} onChange={e => aendern(z, { bezeichnung: e.target.value })} aria-label="Bezeichnung" /></td>
                  <td><input className="am-feld kb-zahl" value={z.formel || ""} disabled={!darf} aria-label="Rechenansatz" aria-invalid={!!formelFehler(z)} title={formelFehler(z) || ""}
                    onChange={e => aendern(z, { formel: e.target.value })} autoFocus={i === aktivZeilen.length - 1 && !z.formel}
                    onKeyDown={e => { if (e.key === "Enter" && darf) { e.preventDefault(); neu(); } }} /></td>
                  <td className="r kb-zahl" style={{ color: z.abzug ? "var(--red)" : undefined }}>{z.abzug ? "−" : ""}{mengeText(z.menge)}</td>
                  <td style={{ textAlign: "center" }}><input type="checkbox" checked={!!z.abzug} disabled={!darf} onChange={e => aendern(z, { abzug: e.target.checked })} aria-label="Abzug" /></td>
                  <td style={{ fontSize: 12, color: "var(--text2)" }}>{QUELLE[z.quelle] || (z.quelle === "import" ? "Import" : z.quelle)}{z.toleranz ? ` ±${Math.round(z.toleranz * 100)} %` : ""}</td>
                  <td>{darf && <button className="kb-symbol" aria-label="Zeile löschen" onClick={() => entfernen(z)}><Trash2 size={14} /></button>}</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr><td colSpan={4} style={{ color: "var(--text2)" }}>Summe</td><td className="r kb-zahl" style={{ fontWeight: 500 }}>{mengeText(aktiv.mengeKum)}</td><td colSpan={3}>{aktiv.einheit}</td></tr></tfoot>
          </table>
          {darf && <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <Knopf Icon={Plus} onClick={() => neu()}>Zeile</Knopf>
            <Knopf leise Icon={Ruler} onClick={() => setMessen(true)}>Im Plan oder Foto messen</Knopf>
            <span style={{ fontSize: 12, color: "var(--muted)", alignSelf: "center" }}>Rechenansatz wie 12,40*2,75 oder (3+2)*1,5. Enter legt die nächste Zeile an.</span>
          </div>}
        </>}
      </main>
      {bim && <BimDialog knoten={d.knoten.get(auftrag.id) || []} ziel="aufmass" sd={sd} kiAktiv={kiAktiv} onSchliessen={() => setBim(false)}
        onUebernehmen={async ({ gruppen, zuordnung, datei }) => {
          const n = bimInsAufmass(gruppen, zuordnung, { standId: auftrag.id, datei, neueZeile: neueAufmassZeile });
          setD(x => ({ ...x, aufmass: [...x.aufmass, ...n] }));
          await speichern({ neu: n });
          setBim(false);
          setMeldung(`${n.length} Aufmaßzeilen aus ${datei} angelegt (Blatt „BIM“).`);
        }} />}
      {abschnitte && <Suspense fallback={null}><PlanAbschnitteDialog projekt={projekt} darf={darf} aufmass={d.aufmass}
        zeilen={zeilen.filter(z => !z.nachtrag || istBeauftragt(alleTeile.find(t => t.nachtrag?.id === z.nachtrag.id)?.nachtrag))}
        onProjektAendern={onProjektAendern} onSchliessen={() => setAbschnitte(false)}
        onUebernehmen={async roh => {
          const n = roh.map(f => neueAufmassZeile(f));
          setD(x => ({ ...x, aufmass: [...x.aufmass, ...n] }));
          await speichern({ neu: n });
          setMeldung(`${n.length} Aufmaßzeilen für Abschnitt ${n[0]?.ort || ""} angelegt (Blatt „Abschnitte“).`);
        }} /></Suspense>}
      {messen && aktiv && <Suspense fallback={null}><AufmassWerkzeug ziel={{ bez: aktiv.kurztext, einheit: aktiv.einheit }} session={sd.session || null} onUebernehmen={ausWerkzeug} onClose={() => setMessen(false)} /></Suspense>}
    </div>
  );
}

function Kennzahl({ label, wert, unter, warn }) {
  return (
    <div>
      <div style={{ color: "var(--text2)", fontSize: 12 }}>{label}</div>
      <div className="kb-zahl" style={{ fontSize: 15, color: warn ? "var(--red)" : undefined }}>{wert}</div>
      {unter && <div style={{ color: "var(--muted)", fontSize: 12 }}>{unter}</div>}
    </div>
  );
}

// ── Nachträge ──────────────────────────────────────────────────────────────
function NachtraegeBereich({ speicher, projekt, auftrag, darf, kiAktiv, sd, onFehler, laden, d, setD, nachtragStaende, onStandGeaendert, onStandOeffnen }) {
  const [aktivId, setAktivId] = useState(d.nachtraege[0]?.id || null);
  const [neu, setNeu] = useState(null);
  const [ki, setKi] = useState(null);
  const timer = useRef(null);
  const summeJeStand = useMemo(() => new Map(d.nachtraege.filter(n => n.stand_id).map(n => [n.stand_id, angebotSummen(d.knoten.get(n.stand_id) || [], nachtragStaende.get(n.stand_id)).nettoNach])), [d, nachtragStaende]);
  const ue = nachtragUebersicht(d.nachtraege, summeJeStand);
  const aktiv = d.nachtraege.find(n => n.id === aktivId) || null;

  const speichern = (n, { sofort = false } = {}) => {
    setD(x => ({ ...x, nachtraege: x.nachtraege.map(y => (y.id === n.id ? n : y)) }));
    clearTimeout(timer.current);
    const los = async () => { try { await speicher.nachtragSpeichern(projekt.id, n); } catch (e) { onFehler(e.nutzerText || e.message); } };
    if (sofort) return los();
    timer.current = setTimeout(los, 600);
  };
  const anlegen = async () => {
    try {
      const nr = Math.max(0, ...d.nachtraege.map(n => n.nummer || 0)) + 1;
      const st = await speicher.standAnlegen(projekt.id, { art: "nachtrag", bezeichnung: `Nachtrag ${nr}: ${neu.titel}` });
      const n = await speicher.nachtragSpeichern(projekt.id, { id: crypto.randomUUID(), stand_id: st.id, nummer: nr, titel: neu.titel, grund: neu.grund, status: "entwurf",
        begruendung: "", angemeldet_am: neu.angemeldet ? heute() : null, ...(neu.angemeldet ? { status: "angemeldet" } : {}) });
      setNeu(null);
      await onStandGeaendert();
      await laden();
      setAktivId(n.id);
    } catch (e) { onFehler(e.nutzerText || e.message); }
  };
  const statusSetzen = s => {
    const felder = { status: s };
    if (s === "angemeldet" && !aktiv.angemeldet_am) felder.angemeldet_am = heute();
    if (s === "angeboten") { if (!aktiv.angeboten_am) felder.angeboten_am = heute(); if (aktiv.betrag_angeboten == null) felder.betrag_angeboten = summeJeStand.get(aktiv.stand_id) || 0; }
    if (istBeauftragt({ status: s })) { if (!aktiv.beauftragt_am) felder.beauftragt_am = heute(); if (aktiv.betrag_beauftragt == null) felder.betrag_beauftragt = aktiv.betrag_angeboten ?? summeJeStand.get(aktiv.stand_id) ?? 0; }
    speichern({ ...aktiv, ...felder }, { sofort: true });
  };
  const kiBegruendung = async () => {
    setKi("laeuft");
    try {
      const r = await begruendungKi({ nachtrag: aktiv, knoten: d.knoten.get(aktiv.stand_id) || [], projekt, notizen: aktiv.begruendung, rufeKi: sd.rufeKi });
      speichern({ ...aktiv, begruendung: r.begruendung }, { sofort: true });
      setKi(r.fehlend);
    } catch (e) { setKi(null); onFehler(`KI-Begründung fehlgeschlagen: ${e.message}`); }
  };
  const drucken = async () => {
    try {
      const st = nachtragStaende.get(aktiv.stand_id);
      const { druckePDF } = await import("../lib/pdf.jsx");
      const einleitung = `${GRUND_LABEL[aktiv.grund]}${GRUND_VOB[aktiv.grund] ? ` (${GRUND_VOB[aktiv.grund]})` : ""}\n\n${aktiv.begruendung || ""}`;
      const html = angebotHtml(d.knoten.get(aktiv.stand_id) || [], { stand: { ...st, bezeichnung: `Nachtragsangebot ${aktiv.nummer}: ${aktiv.titel}` }, projekt, firma: sd.eigeneFirma || {}, einleitung });
      await druckePDF(html, `Nachtrag_${aktiv.nummer}_${dateiName(aktiv.titel)}.pdf`);
    } catch (e) { onFehler(`Drucken fehlgeschlagen: ${e.message}`); }
  };

  return (
    <div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: "minmax(420px, 1fr) minmax(420px, 560px)" }}>
      <section style={{ padding: 24, overflow: "auto", borderRight: "1px solid var(--border)" }}>
        <div style={{ display: "flex", gap: 24, marginBottom: 16, alignItems: "flex-end" }}>
          <Kennzahl label="Beauftragt" wert={euro(ue.beauftragt)} unter={`${ue.beauftragtAnzahl} Nachträge`} />
          <Kennzahl label="Offen" wert={euro(ue.offen)} unter={`${ue.offenAnzahl} Nachträge`} />
          <Kennzahl label="Abgelehnt" wert={euro(ue.abgelehnt)} />
          {ue.quote != null && <Kennzahl label="Durchsetzung" wert={`${Math.round(ue.quote * 100)} %`} />}
          <span style={{ flex: 1 }} />
          {darf && <Knopf haupt Icon={Plus} onClick={() => setNeu({ titel: "", grund: "geaendert", angemeldet: true })}>Nachtrag</Knopf>}
        </div>
        {!d.nachtraege.length ? <Leer titel="Keine Nachträge" text="Geänderte oder zusätzliche Leistungen als Nachtrag anlegen. Jeder Nachtrag bekommt ein eigenes LV mit Kalkulation; beauftragte Nachträge gehen in die Rechnung." /> : (
          <table className="kb-tabelle">
            <thead><tr><th>Nr.</th><th>Titel</th><th>Grund</th><th>Status</th><th className="r">Betrag</th></tr></thead>
            <tbody>{d.nachtraege.map(n => (
              <tr key={n.id} onClick={() => setAktivId(n.id)} style={{ background: n.id === aktivId ? "var(--surface2)" : undefined }}>
                <td className="kb-zahl">N{n.nummer}</td><td>{n.titel}</td><td style={{ color: "var(--text2)" }}>{GRUND_LABEL[n.grund]}</td>
                <td>{NACHTRAG_STATUS_LABEL[n.status]}</td>
                <td className="r kb-zahl">{euro(n.betrag_beauftragt ?? n.betrag_angeboten ?? summeJeStand.get(n.stand_id) ?? 0)}</td>
              </tr>))}</tbody>
          </table>)}
      </section>
      <section style={{ padding: 24, overflow: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
        {!aktiv ? <div style={{ color: "var(--muted)" }}>Nachtrag wählen.</div> : <>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 500 }}>Nachtrag {aktiv.nummer}</h2>
          <Feld label="Titel"><input className="kb-eingabe" value={aktiv.titel} disabled={!darf} onChange={e => speichern({ ...aktiv, titel: e.target.value })} /></Feld>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Feld label="Grund" hinweis={GRUND_VOB[aktiv.grund]}><select className="kb-eingabe" value={aktiv.grund} disabled={!darf} onChange={e => speichern({ ...aktiv, grund: e.target.value }, { sofort: true })}>
              {NACHTRAG_GRUENDE.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Feld>
            <Feld label="Status"><select className="kb-eingabe" value={aktiv.status} disabled={!darf} onChange={e => statusSetzen(e.target.value)}>
              {NACHTRAG_STATUS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Feld>
          </div>
          {aktiv.grund === "zusaetzlich" && !aktiv.angemeldet_am && <Meldung art="fehler">Zusätzliche Leistungen vor Ausführung ankündigen (§ 2 Abs. 6 VOB/B), sonst droht der Verlust des Anspruchs.</Meldung>}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <Feld label="Angemeldet"><input type="date" className="kb-eingabe" value={aktiv.angemeldet_am || ""} disabled={!darf} onChange={e => speichern({ ...aktiv, angemeldet_am: e.target.value || null })} /></Feld>
            <Feld label="Angeboten"><input type="date" className="kb-eingabe" value={aktiv.angeboten_am || ""} disabled={!darf} onChange={e => speichern({ ...aktiv, angeboten_am: e.target.value || null })} /></Feld>
            <Feld label="Beauftragt"><input type="date" className="kb-eingabe" value={aktiv.beauftragt_am || ""} disabled={!darf} onChange={e => speichern({ ...aktiv, beauftragt_am: e.target.value || null })} /></Feld>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, alignItems: "end" }}>
            <Kennzahl label="LV des Nachtrags" wert={euro(summeJeStand.get(aktiv.stand_id) || 0)} />
            <Feld label="Angeboten €"><BetragFeld wert={aktiv.betrag_angeboten} disabled={!darf} onSetzen={v => speichern({ ...aktiv, betrag_angeboten: v }, { sofort: true })} /></Feld>
            <Feld label="Beauftragt €"><BetragFeld wert={aktiv.betrag_beauftragt} disabled={!darf} onSetzen={v => speichern({ ...aktiv, betrag_beauftragt: v }, { sofort: true })} /></Feld>
          </div>
          <Feld label="Begründung (erscheint im Nachtragsangebot)">
            <textarea className="kb-eingabe" rows={8} value={aktiv.begruendung || ""} disabled={!darf} onChange={e => speichern({ ...aktiv, begruendung: e.target.value })}
              placeholder="Was war beauftragt, was hat sich geändert, wer hat es angeordnet und wann." />
          </Feld>
          {Array.isArray(ki) && ki.length > 0 && <Meldung onSchliessen={() => setKi(null)}>Bitte noch belegen: {ki.join("; ")}</Meldung>}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {aktiv.stand_id && <Knopf Icon={FileText} onClick={() => onStandOeffnen(aktiv.stand_id)}>LV und Kalkulation öffnen</Knopf>}
            <Knopf leise Icon={Printer} onClick={drucken}>Nachtragsangebot</Knopf>
            {darf && kiAktiv && sd.rufeKi && <Knopf leise Icon={Sparkles} disabled={ki === "laeuft"} onClick={kiBegruendung}>{ki === "laeuft" ? "KI schreibt …" : "Begründung entwerfen"}</Knopf>}
          </div>
        </>}
      </section>
      {neu && (
        <Dialog titel="Neuer Nachtrag" onSchliessen={() => setNeu(null)}
          fuss={<><Knopf leise onClick={() => setNeu(null)}>Abbrechen</Knopf><Knopf haupt disabled={!neu.titel.trim()} onClick={anlegen}>Anlegen</Knopf></>}>
          <Feld label="Titel"><input className="kb-eingabe" value={neu.titel} onChange={e => setNeu({ ...neu, titel: e.target.value })} placeholder="z. B. Mehrstärke Bodenplatte" /></Feld>
          <Feld label="Grund" hinweis={GRUND_VOB[neu.grund]}><select className="kb-eingabe" value={neu.grund} onChange={e => setNeu({ ...neu, grund: e.target.value })}>
            {NACHTRAG_GRUENDE.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Feld>
          <label style={{ display: "flex", gap: 8, fontSize: 14 }}><input type="checkbox" checked={neu.angemeldet} onChange={e => setNeu({ ...neu, angemeldet: e.target.checked })} /> Heute beim Auftraggeber angemeldet</label>
          <div style={{ fontSize: 13, color: "var(--text2)" }}>Der Nachtrag bekommt einen eigenen Stand. Positionen und Kalkulation legst du dort im LV an, wie bei einem Angebot.</div>
        </Dialog>
      )}
    </div>
  );
}
