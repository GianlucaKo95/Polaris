// Einstieg: alle Kalkulationsprojekte mit Status, Abgabetermin und Summe.
import { useMemo, useState } from "react";
import { Plus, Search, ArrowDownToLine } from "lucide-react";
import { Knopf, Feld, Dialog, Leer, StatusPunkt, PROJEKT_STATUS, euro, datum } from "./ui.jsx";

const FILTER = [["offen", "Offen"], ["auftrag", "Aufträge"], ["alle", "Alle"]];
const OFFEN = new Set(["anfrage", "in_bearbeitung", "abgegeben"]);

export function ProjektListe({ projekte, gesellschaften, darfAnlegen, onOeffnen, onAnlegen, baustellen = [], uebernahmeOffen, onUebernahme }) {
  const [suche, setSuche] = useState("");
  const [filter, setFilter] = useState("offen");
  const [neu, setNeu] = useState(false);
  const gesName = id => gesellschaften.find(g => g.id === id)?.name || "";
  const mehrereGes = gesellschaften.length > 1;

  const liste = useMemo(() => {
    const q = suche.trim().toLowerCase();
    return projekte
      .filter(p => filter === "alle" || (filter === "offen" ? OFFEN.has(p.status) : p.status === "auftrag"))
      .filter(p => !q || [p.name, p.nummer, p.auftraggeber, p.ort].join(" ").toLowerCase().includes(q));
  }, [projekte, suche, filter]);

  const zaehler = id => projekte.filter(p => id === "alle" || (id === "offen" ? OFFEN.has(p.status) : p.status === "auftrag")).length;

  return (
    <div style={{ padding: "24px 32px", overflowY: "auto", height: "100%", boxSizing: "border-box" }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 16, marginBottom: 20, flexWrap: "wrap" }}>
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: 0, fontSize: 28, lineHeight: "36px", fontWeight: 500 }}>Projekte</h1>
          <div style={{ color: "var(--text2)", marginTop: 4 }}>Ausschreibungen, Angebote und Aufträge in Kalkulation</div>
        </div>
        {uebernahmeOffen > 0 && <Knopf Icon={ArrowDownToLine} onClick={onUebernahme}>{uebernahmeOffen} Angebote übernehmen</Knopf>}
        {darfAnlegen && <Knopf haupt Icon={Plus} onClick={() => setNeu(true)}>Neues Projekt</Knopf>}
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <div role="tablist" style={{ display: "flex", gap: 4, padding: 2, background: "var(--surface2)", borderRadius: 8 }}>
          {FILTER.map(([id, label]) => (
            <button key={id} role="tab" aria-selected={filter === id} onClick={() => setFilter(id)}
              style={{ height: 28, padding: "0 12px", border: "none", borderRadius: 6, font: "inherit", fontSize: 13, cursor: "pointer",
                background: filter === id ? "var(--surface)" : "transparent", color: filter === id ? "var(--text)" : "var(--text2)",
                boxShadow: filter === id ? "0 0 0 1px var(--border)" : "none" }}>
              {label} <span className="kb-zahl" style={{ color: "var(--muted)", fontSize: 12 }}>{zaehler(id)}</span>
            </button>
          ))}
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 6, height: 32, padding: "0 10px", border: "1px solid var(--border2)", borderRadius: 8, color: "var(--muted)", marginLeft: "auto", background: "var(--surface)" }}>
          <Search size={14} />
          <input value={suche} onChange={e => setSuche(e.target.value)} placeholder="Projekt, Nummer, Auftraggeber" aria-label="Projekte durchsuchen"
            style={{ border: "none", outline: "none", background: "transparent", font: "inherit", fontSize: 14, width: 240, color: "var(--text)" }} />
        </label>
      </div>

      {projekte.length === 0 ? (
        <Leer titel="Noch keine Kalkulationsprojekte" text="Lege ein Projekt an und importiere die Ausschreibung als GAEB-Datei, oder übernimm deine bisherigen Angebote aus Polaris.">
          {darfAnlegen && <Knopf haupt Icon={Plus} onClick={() => setNeu(true)}>Neues Projekt</Knopf>}
          {uebernahmeOffen > 0 && <Knopf Icon={ArrowDownToLine} onClick={onUebernahme}>Angebote übernehmen</Knopf>}
        </Leer>
      ) : (
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
          <table className="kb-tabelle">
            <thead>
              <tr>
                <th>Nr.</th><th>Projekt</th><th>Auftraggeber</th>{mehrereGes && <th>Gesellschaft</th>}<th>Status</th><th>Abgabe</th>
                <th className="r">Positionen</th><th className="r">Netto</th><th>Geändert</th>
              </tr>
            </thead>
            <tbody>
              {liste.map(p => {
                const ueberfaellig = p.abgabe_am && OFFEN.has(p.status) && p.status !== "abgegeben" && p.abgabe_am < new Date().toISOString().slice(0, 10);
                return (
                  <tr key={p.id} onClick={() => onOeffnen(p.id)} tabIndex={0} onKeyDown={e => { if (e.key === "Enter") onOeffnen(p.id); }}>
                    <td className="kb-zahl" style={{ color: "var(--text2)" }}>{p.nummer}</td>
                    <td style={{ fontWeight: 500 }}>{p.name}</td>
                    <td style={{ color: "var(--text2)" }}>{p.auftraggeber}</td>
                    {mehrereGes && <td style={{ color: "var(--text2)" }}>{gesName(p.gesellschaft_id)}</td>}
                    <td><StatusPunkt status={p.status} /></td>
                    <td className="kb-zahl" style={{ color: ueberfaellig ? "var(--red)" : undefined }}>{datum(p.abgabe_am)}</td>
                    <td className="r kb-zahl">{p.positionen || ""}</td>
                    <td className="r kb-zahl">{euro(p.summe)}</td>
                    <td style={{ color: "var(--text2)" }}>{datum(p.updated_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {liste.length === 0 && <div style={{ padding: 24, color: "var(--text2)", textAlign: "center" }}>Keine Projekte für diese Auswahl</div>}
        </div>
      )}
      {neu && <NeuesProjekt gesellschaften={gesellschaften} baustellen={baustellen} onSchliessen={() => setNeu(false)} onAnlegen={async f => { await onAnlegen(f); setNeu(false); }} />}
    </div>
  );
}

function NeuesProjekt({ gesellschaften, baustellen, onSchliessen, onAnlegen }) {
  const [f, setF] = useState({ name: "", nummer: "", auftraggeber: "", ort: "", abgabe_am: "", status: "anfrage", gesellschaft_id: gesellschaften[0]?.id || "", projekt_id: "" });
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState(null);
  const baustelle = id => {
    const b = baustellen.find(x => String(x.id) === String(id));
    setF(x => ({ ...x, projekt_id: id, ...(b ? { name: x.name || b.name, auftraggeber: x.auftraggeber || b.auftraggeber || "", ort: x.ort || b.ort || "", nummer: x.nummer || b.projektnummer || "" } : {}) }));
  };
  const anlegen = async () => {
    setLaeuft(true); setFehler(null);
    try {
      await onAnlegen({ ...f, name: f.name.trim(), abgabe_am: f.abgabe_am || null, projekt_id: f.projekt_id ? Number(f.projekt_id) || f.projekt_id : null, gesellschaft_id: f.gesellschaft_id || undefined });
    } catch (e) { setFehler(e.nutzerText || e.message); setLaeuft(false); }
  };
  return (
    <Dialog titel="Neues Projekt" onSchliessen={onSchliessen} fuss={<>
      <Knopf onClick={onSchliessen}>Abbrechen</Knopf>
      <Knopf haupt disabled={!f.name.trim() || laeuft} onClick={anlegen}>Anlegen</Knopf>
    </>}>
      {fehler && <div style={{ color: "var(--red)", fontSize: 13 }}>{fehler}</div>}
      <Feld label="Name"><input className="kb-eingabe" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="z. B. Neubau Kita Süd" /></Feld>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Feld label="Nummer"><input className="kb-eingabe" value={f.nummer} onChange={e => setF({ ...f, nummer: e.target.value })} /></Feld>
        <Feld label="Status">
          <select className="kb-eingabe" value={f.status} onChange={e => setF({ ...f, status: e.target.value })}>
            {PROJEKT_STATUS.slice(0, 4).map(([w, l]) => <option key={w} value={w}>{l}</option>)}
          </select>
        </Feld>
      </div>
      <Feld label="Auftraggeber"><input className="kb-eingabe" value={f.auftraggeber} onChange={e => setF({ ...f, auftraggeber: e.target.value })} /></Feld>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Feld label="Ort"><input className="kb-eingabe" value={f.ort} onChange={e => setF({ ...f, ort: e.target.value })} /></Feld>
        <Feld label="Abgabe am"><input type="date" className="kb-eingabe" value={f.abgabe_am} onChange={e => setF({ ...f, abgabe_am: e.target.value })} /></Feld>
      </div>
      {gesellschaften.length > 1 && (
        <Feld label="Gesellschaft">
          <select className="kb-eingabe" value={f.gesellschaft_id} onChange={e => setF({ ...f, gesellschaft_id: e.target.value })}>
            {gesellschaften.map(g => <option key={g.id} value={g.id}>{g.parent_id ? "– " : ""}{g.name}</option>)}
          </select>
        </Feld>
      )}
      {baustellen.length > 0 && (
        <Feld label="Baustelle in Polaris" hinweis="Optional. Verknüpft die Kalkulation mit Stunden, Regie und Bautagebuch der Baustelle.">
          <select className="kb-eingabe" value={f.projekt_id} onChange={e => baustelle(e.target.value)}>
            <option value="">Keine</option>
            {baustellen.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </Feld>
      )}
    </Dialog>
  );
}
