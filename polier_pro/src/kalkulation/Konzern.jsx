// Konzern-Controlling (Phase 7): Projekte über Gesellschaften und Niederlassungen,
// Ampel je Projekt, Summen je Ebene, Exporte für DATEV und ERP. Logik: lib/kalk/konzern.js, erpExport.js.
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Download } from "lucide-react";
import { useStammdaten } from "./stammdaten.js";
import { Knopf, Feld, Meldung, Leer, euro } from "./ui.jsx";
import { projektZeilen, konzernBaum } from "../lib/kalk/konzern.js";
import { datevAusgang, datevEingangNu, controllingCsv, rechnungenCsv, erpJson } from "../lib/kalk/erpExport.js";
import { monatName } from "../lib/kalk/controlling.js";

const AMPEL = { gruen: ["var(--green)", "Im Plan"], gelb: ["var(--akzent)", "Beobachten"], rot: ["var(--red)", "Ergebnis gefährdet"], grau: ["var(--muted)", "Noch keine Meldung"] };
function herunterladen(name, inhalt, typ) {
  const url = URL.createObjectURL(new Blob([inhalt], { type: typ }));
  const a = document.createElement("a"); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function KonzernBereich({ speicher, projekte, gesellschaften, onOeffnen }) {
  const sd = useStammdaten();
  const [daten, setDaten] = useState(null);
  const [anteil, setAnteil] = useState(true);
  const [zu, setZu] = useState(new Set());
  const [jahr, setJahr] = useState(String(new Date().getFullYear()));
  const [meldung, setMeldung] = useState(null);

  const laden = useCallback(async () => {
    try { setDaten(await speicher.konzernDaten()); } catch (e) { setMeldung({ art: "fehler", text: e.nutzerText || e.message }); setDaten({ meldungen: [], auftragssummen: [] }); }
  }, [speicher]);
  useEffect(() => { laden(); }, [laden]);

  const zeilen = useMemo(() => daten ? projektZeilen({ projekte, meldungen: daten.meldungen, nurEigenerAnteil: anteil,
    auftragssummen: new Map(daten.auftragssummen.map(a => [a.kalk_projekt_id, a.summe])),
    angebotssummen: new Map(projekte.filter(p => ["anfrage", "in_bearbeitung", "abgegeben"].includes(p.status)).map(p => [p.id, Number(p.summe) || 0])) }) : [], [daten, projekte, anteil]);
  const baum = useMemo(() => konzernBaum(gesellschaften, zeilen), [gesellschaften, zeilen]);

  const exportieren = async art => {
    try {
      const x = await speicher.exportDaten();
      const von = `${jahr}-01-01`, bis = `${jahr}-12-31`;
      const datev = sd.kalkulationsgrundlagen?.datev || {};
      if (art === "datev-aus" || art === "datev-nu") {
        const r = art === "datev-aus" ? datevAusgang(x.rechnungen, projekte, datev, { von, bis }) : datevEingangNu(x.nuRechnungen, x.vergaben, projekte, datev, { von, bis });
        if (r.fehler.length) { setMeldung({ art: "fehler", text: `DATEV: ${r.fehler.join(" ")} Die Nummern stehen in Polaris unter Einstellungen › DATEV.` }); return; }
        herunterladen(r.dateiname, r.text, "text/csv;charset=windows-1252");
      } else if (art === "controlling") herunterladen(`Controlling_${jahr}.csv`, controllingCsv(projekte, x.meldungen.filter(m => String(m.monat).startsWith(jahr))), "text/csv;charset=utf-8");
      else if (art === "rechnungen") herunterladen(`Rechnungen_${jahr}.csv`, rechnungenCsv(projekte, x.rechnungen.filter(r => String(r.datum).startsWith(jahr))), "text/csv;charset=utf-8");
      else herunterladen(`Polaris_Kalkulation_${jahr}.json`, erpJson({ projekte, meldungen: x.meldungen, rechnungen: x.rechnungen, nuRechnungen: x.nuRechnungen }), "application/json");
    } catch (e) { setMeldung({ art: "fehler", text: e.nutzerText || e.message }); }
  };

  if (!daten) return <div style={{ padding: 32, color: "var(--text2)" }}>Lädt …</div>;
  const g = baum.gesamt;
  const umschalten = id => setZu(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const Projektzeile = ({ z, tiefe }) => (
    <tr className="ko-projekt" onClick={() => onOeffnen(z.id)}>
      <td style={{ paddingLeft: 12 + tiefe * 20 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          {z.ampel && <span title={AMPEL[z.ampel][1]} style={{ width: 8, height: 8, borderRadius: 4, background: AMPEL[z.ampel][0], flex: "none" }} />}
          <span>{z.name}</span>{z.nummer && <span className="kb-zahl" style={{ color: "var(--muted)", fontSize: 12 }}>{z.nummer}</span>}
          {z.arge && <span style={{ fontSize: 12, color: "var(--text2)" }}>ARGE {Math.round(z.quote * 1000) / 10} %</span>}
        </span>
      </td>
      <Werte s={z} />
      <td style={{ color: "var(--text2)", fontSize: 13 }}>{z.meldung ? monatName(z.meldung) : z.angebote ? "Angebot" : "—"}</td>
    </tr>
  );
  const Ebene = ({ k, tiefe }) => {
    const offen = !zu.has(k.gesellschaft.id);
    return (<>
      <tr className="ko-ebene" onClick={() => umschalten(k.gesellschaft.id)}>
        <td style={{ paddingLeft: 8 + tiefe * 20 }}><span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          {offen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}{k.gesellschaft.name}
          <span style={{ color: "var(--muted)", fontSize: 12, fontWeight: 400 }}>{k.alleProjekte.length} Projekte{k.rot ? ` · ${k.rot} gefährdet` : ""}</span></span></td>
        <Werte s={k.summen} />
        <td />
      </tr>
      {offen && <>{k.projekte.map(z => <Projektzeile key={z.id} z={z} tiefe={tiefe + 1} />)}{k.unter.map(u => <Ebene key={u.gesellschaft.id} k={u} tiefe={tiefe + 1} />)}</>}
    </>);
  };

  return (
    <div style={{ padding: "24px 32px", display: "flex", flexDirection: "column", gap: 20, overflow: "auto", height: "100%", boxSizing: "border-box" }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 16 }}>
        <div style={{ flex: 1 }}><h1 style={{ margin: 0, fontSize: 22, fontWeight: 500 }}>Konzern</h1>
          <div style={{ color: "var(--text2)", fontSize: 13 }}>Stand der letzten gemeldeten Leistungsmeldungen je Projekt</div></div>
        <label style={{ fontSize: 13, color: "var(--text2)", display: "flex", gap: 6 }}><input type="checkbox" checked={anteil} onChange={e => setAnteil(e.target.checked)} /> Bei ARGE nur eigener Anteil</label>
      </div>
      {meldung && <Meldung art={meldung.art} onSchliessen={() => setMeldung(null)}>{meldung.text}</Meldung>}
      <div className="co-kennzahlen">
        {[["Auftragsbestand", g.auftrag], ["Leistung kumuliert", g.leistung], ["Nicht abgerechnet", g.nichtAbgerechnet], ["Ergebnis kalkuliert", g.ergebnisKalk], ["Ergebnis Prognose", g.ergebnisPrognose]].map(([l, w], i) => (
          <div key={l} className="co-kz"><div style={{ fontSize: 13, color: "var(--text2)" }}>{l}</div>
            <div className="kb-zahl" style={{ fontSize: i === 4 ? 24 : 18, lineHeight: "30px", color: i === 4 && g.abweichung < 0 ? "var(--red)" : undefined }}>{euro(w)}</div>
            {i === 4 && <div style={{ fontSize: 12, color: "var(--muted)" }}>{g.abweichung >= 0 ? "+" : ""}{euro(g.abweichung)} zur Kalkulation</div>}
            {i === 0 && g.angebote > 0 && <div style={{ fontSize: 12, color: "var(--muted)" }}>{euro(g.angebote)} in offenen Angeboten</div>}
          </div>))}
      </div>
      {!zeilen.length ? <Leer titel="Noch keine Projekte" /> : (
        <section className="co-karte" style={{ padding: 0, overflow: "hidden" }}>
          <table className="vg-spiegel ko-tabelle">
            <thead><tr><th>Gesellschaft / Projekt</th><th className="r">Auftrag</th><th className="r">Leistung</th><th className="r">Ist-Kosten</th><th className="r">Ergebnis kalk.</th><th className="r">Prognose</th><th className="r">Abweichung</th><th>Letzte Meldung</th></tr></thead>
            <tbody>
              {baum.wurzeln.map(k => <Ebene key={k.gesellschaft.id} k={k} tiefe={0} />)}
              {baum.ohneGesellschaft.map(z => <Projektzeile key={z.id} z={z} tiefe={0} />)}
            </tbody>
          </table>
        </section>)}
      <div style={{ display: "flex", gap: 16, fontSize: 12, color: "var(--muted)" }}>{Object.entries(AMPEL).map(([k, [f, l]]) => <span key={k} style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><span style={{ width: 8, height: 8, borderRadius: 4, background: f }} />{l}</span>)}
        <span>Gelb auch bei Meldungen älter als 45 Tage. Rot ab 5 % Ergebnisverlust.</span></div>

      <section className="co-karte">
        <h2>Export für Buchhaltung und ERP</h2>
        <p className="co-text">DATEV-Buchungsstapel mit der Projektnummer als Kostenstelle, Controlling und Rechnungen als CSV (Semikolon, UTF-8) für SAP, Dynamics oder Excel, alles zusammen als JSON. Für eine laufende Anbindung gibt es in der Datenbank die Lesesichten kalk_export_controlling, kalk_export_ergebnis und kalk_export_rechnungen.</p>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
          <Feld label="Jahr"><select className="kb-eingabe" value={jahr} onChange={e => setJahr(e.target.value)} style={{ width: 100 }}>
            {[0, 1, 2].map(i => String(new Date().getFullYear() - i)).map(j => <option key={j}>{j}</option>)}</select></Feld>
          <Knopf leise Icon={Download} onClick={() => exportieren("datev-aus")}>DATEV Ausgangsrechnungen</Knopf>
          <Knopf leise Icon={Download} onClick={() => exportieren("datev-nu")}>DATEV NU-Rechnungen</Knopf>
          <Knopf leise Icon={Download} onClick={() => exportieren("controlling")}>Controlling CSV</Knopf>
          <Knopf leise Icon={Download} onClick={() => exportieren("rechnungen")}>Rechnungen CSV</Knopf>
          <Knopf leise Icon={Download} onClick={() => exportieren("json")}>JSON</Knopf>
        </div>
      </section>
    </div>
  );
}

function Werte({ s }) {
  return (<>
    <td className="r kb-zahl">{euro(s.auftrag)}</td><td className="r kb-zahl">{euro(s.leistung)}</td><td className="r kb-zahl">{euro(s.istKosten)}</td>
    <td className="r kb-zahl" style={{ color: "var(--text2)" }}>{euro(s.ergebnisKalk)}</td>
    <td className="r kb-zahl" style={{ fontWeight: 500, color: s.ergebnisPrognose < 0 ? "var(--red)" : undefined }}>{euro(s.ergebnisPrognose)}</td>
    <td className="r kb-zahl" style={{ color: s.abweichung < 0 ? "var(--red)" : s.abweichung > 0 ? "var(--green)" : "var(--text2)" }}>{s.abweichung > 0 ? "+" : ""}{euro(s.abweichung)}</td>
  </>);
}
