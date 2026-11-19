// BIM 5D: IFC-Modell laden, Bauteilgruppen den LV-Positionen zuordnen
// (Vorschlag oder KI), Mengen ins LV oder ins Aufmaß übernehmen. Logik: lib/kalk/bim.js.
import { useMemo, useRef, useState } from "react";
import { Upload, Sparkles } from "lucide-react";
import { Knopf, Dialog, Meldung, menge as mengeText } from "./ui.jsx";
import { zuordnungVorschlagen, mengenJePosition, bimZuordnungKi, gruppenSchluessel, gruppenWert, groesseFuerEinheit, GROESSEN } from "../lib/kalk/bim.js";

export function BimDialog({ knoten, ziel = "lv", sd, kiAktiv, onUebernehmen, onSchliessen }) {
  const [modell, setModell] = useState(null);      // { datei, gruppen }
  const [zuordnung, setZuordnung] = useState([]);
  const [laeuft, setLaeuft] = useState(null);
  const [fehler, setFehler] = useState(null);
  const datei = useRef(null);
  const pos = useMemo(() => knoten.filter(k => k.typ === "position" && groesseFuerEinheit(k.einheit)), [knoten]);
  const mengen = useMemo(() => (modell ? mengenJePosition(modell.gruppen, zuordnung) : new Map()), [modell, zuordnung]);

  const laden = async f => {
    setLaeuft(`Lese ${f.name} …`); setFehler(null);
    try {
      const { ifcMengenAusDatei } = await import("../lib/ifcLaden.js");
      const { gruppen } = await ifcMengenAusDatei(f);
      if (!gruppen.length) throw new Error("Im Modell stehen keine Bauteile mit Mengen.");
      setModell({ datei: f.name, gruppen });
      setZuordnung(zuordnungVorschlagen(gruppen, knoten));
    } catch (e) { setFehler(`Das Modell konnte nicht gelesen werden: ${e.message}`); }
    finally { setLaeuft(null); if (datei.current) datei.current.value = ""; }
  };
  const ki = async () => {
    setLaeuft("Die KI ordnet zu …"); setFehler(null);
    try { setZuordnung(await bimZuordnungKi({ gruppen: modell.gruppen, knoten, rufeKi: sd.rufeKi })); }
    catch (e) { setFehler(`KI-Zuordnung fehlgeschlagen: ${e.message}`); }
    finally { setLaeuft(null); }
  };
  const setze = (i, felder) => setZuordnung(l => l.map((z, j) => {
    if (j !== i) return z;
    const n = { ...z, ...felder, sicher: 1 };
    if ("knotenId" in felder) n.groesse = groesseFuerEinheit(pos.find(k => k.id === felder.knotenId)?.einheit);
    return n;
  }));
  const anzahl = zuordnung.filter(z => z.knotenId && z.groesse).length;

  return (
    <Dialog titel="Mengen aus dem BIM-Modell" breite={980} onSchliessen={() => !laeuft && onSchliessen()}
      fuss={<>
        {modell && kiAktiv && sd.rufeKi && <Knopf leise Icon={Sparkles} disabled={!!laeuft} onClick={ki} style={{ marginRight: "auto" }}>Von der KI zuordnen lassen</Knopf>}
        <Knopf leise disabled={!!laeuft} onClick={onSchliessen}>Abbrechen</Knopf>
        {modell ? <Knopf haupt disabled={!anzahl || !!laeuft} onClick={() => onUebernehmen({ gruppen: modell.gruppen, zuordnung, datei: modell.datei })}>
          {ziel === "lv" ? `${mengen.size} LV-Mengen setzen` : `${anzahl} Aufmaßzeilen anlegen`}</Knopf>
          : <Knopf haupt Icon={Upload} disabled={!!laeuft} onClick={() => datei.current?.click()}>IFC-Datei wählen</Knopf>}
      </>}>
      <input ref={datei} type="file" hidden accept=".ifc" onChange={e => e.target.files?.[0] && laden(e.target.files[0])} />
      {laeuft && <Meldung>{laeuft}</Meldung>}
      {fehler && <Meldung art="fehler">{fehler}</Meldung>}
      {!modell ? (
        <div style={{ fontSize: 14, color: "var(--text2)", lineHeight: 1.5 }}>
          Polaris liest die Mengen, die das CAD-Programm beim IFC-Export an die Bauteile hängt (Netto-Flächen, -Volumen, Längen, Stückzahlen), und fasst sie je Bauteilart und Material zusammen.
          Du ordnest jede Gruppe einer Position zu; {ziel === "lv" ? "die Summe wird die LV-Menge. Die vorherige Menge bleibt an der Position vermerkt." : "je Gruppe entsteht eine Aufmaßzeile mit Quelle „Import“."}
        </div>
      ) : (
        <div style={{ maxHeight: 520, overflow: "auto", border: "1px solid var(--border)", borderRadius: 8 }}>
          <table className="vg-spiegel">
            <thead><tr><th>Bauteil</th><th>Material</th><th className="r">Stk</th><th className="r">Fläche</th><th className="r">Volumen</th><th className="r">Länge</th><th style={{ minWidth: 260 }}>Position</th><th>Größe</th><th className="r">Faktor</th><th className="r">Menge</th></tr></thead>
            <tbody>{modell.gruppen.map((g, i) => {
              const z = zuordnung[i] || {};
              return (
                <tr key={gruppenSchluessel(g)} style={{ opacity: z.knotenId ? 1 : 0.7 }}>
                  <td>{g.bauteil}</td><td style={{ color: "var(--text2)" }}>{g.material || "—"}</td>
                  <td className="r kb-zahl">{g.anzahl}{g.ohneMengen ? <span title={`${g.ohneMengen} ohne Mengen im Modell`} style={{ color: "var(--red)" }}> !</span> : ""}</td>
                  <td className="r kb-zahl">{g.flaeche ? mengeText(Math.round(g.flaeche * 100) / 100) : ""}</td>
                  <td className="r kb-zahl">{g.volumen ? mengeText(Math.round(g.volumen * 1000) / 1000) : ""}</td>
                  <td className="r kb-zahl">{g.laenge ? mengeText(Math.round(g.laenge * 100) / 100) : ""}</td>
                  <td><select className="kb-eingabe" style={{ height: 30 }} value={z.knotenId || ""} onChange={e => setze(i, { knotenId: e.target.value || null })} aria-label={`Position für ${g.bauteil} ${g.material}`}>
                    <option value="">nicht übernehmen</option>
                    {pos.map(k => <option key={k.id} value={k.id}>{k.oz} {k.kurztext.slice(0, 50)} ({k.einheit})</option>)}
                  </select>{z.begruendung ? <div style={{ fontSize: 12, color: "var(--muted)" }}>{z.begruendung}</div> : null}</td>
                  <td style={{ color: "var(--text2)" }}>{GROESSEN.find(([k]) => k === z.groesse)?.[1] || "—"}</td>
                  <td className="r"><input className="vg-preis kb-zahl" style={{ width: 56 }} value={String(z.faktor ?? 1).replace(".", ",")} aria-label="Faktor"
                    onChange={e => { const f = Number(e.target.value.replace(",", ".")); if (f > 0) setze(i, { faktor: f }); }} /></td>
                  <td className="r kb-zahl">{z.knotenId && z.groesse ? mengeText(Math.round(gruppenWert(g, z.groesse) * (z.faktor || 1) * 1000) / 1000) : ""}</td>
                </tr>);
            })}</tbody>
          </table>
        </div>
      )}
      {modell && <div style={{ fontSize: 12, color: "var(--muted)" }}>{modell.datei} · {modell.gruppen.length} Gruppen · Mehrere Gruppen auf einer Position werden addiert. Faktor z. B. 2 für beidseitige Schalung.</div>}
    </Dialog>
  );
}
