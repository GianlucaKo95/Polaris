// Gesellschaften, Niederlassungen und Rechte im Kalkulationsbereich.
// Ohne eigenen Eintrag gilt die Polaris-Rolle (Admin/GF verwalten,
// Bauleitung gibt frei, Polier liest).
import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Knopf, Feld, Dialog, Meldung } from "./ui.jsx";

export const STUFEN = [[1, "Lesen"], [2, "Kalkulieren"], [3, "Freigeben"], [4, "Verwalten"]];
const STUFE_LABEL = Object.fromEntries(STUFEN);
const ROLLE_STUFE = { administrator: 4, geschaeftsfuehrer: 4, bauleiter: 3, polier: 1 };
const ROLLE_LABEL = { administrator: "Administrator", geschaeftsfuehrer: "Geschäftsführung", bauleiter: "Bauleitung", polier: "Polier", vorarbeiter: "Vorarbeiter", facharbeiter: "Facharbeiter" };

export function Gesellschaften({ speicher, gesellschaften, onGeaendert }) {
  const [nutzer, setNutzer] = useState([]);
  const [rechte, setRechte] = useState([]);
  const [fehler, setFehler] = useState(null);
  const [bearbeiten, setBearbeiten] = useState(null);

  const laden = async () => {
    try { setNutzer(await speicher.nutzerLaden()); setRechte(await speicher.rechteLaden()); }
    catch (e) { setFehler(e.nutzerText || e.message); }
  };
  useEffect(() => { laden(); }, [speicher]); // eslint-disable-line react-hooks/exhaustive-deps

  const haupt = gesellschaften.filter(g => !g.parent_id);
  const spalten = [{ id: null, name: "Alle Gesellschaften" }, ...gesellschaften];

  const setzen = async (profilId, gesId, wert) => {
    try { await speicher.rechtSetzen(profilId, gesId, wert ? Number(wert) : null); setRechte(await speicher.rechteLaden()); }
    catch (e) { setFehler(e.nutzerText || e.message); }
  };
  const recht = (profilId, gesId) => rechte.find(r => r.profil_id === profilId && (r.gesellschaft_id || null) === gesId)?.stufe || "";

  return (
    <div style={{ padding: "24px 32px", overflowY: "auto", height: "100%", boxSizing: "border-box" }}>
      <h1 style={{ margin: 0, fontSize: 28, lineHeight: "36px", fontWeight: 500 }}>Gesellschaften & Rechte</h1>
      <div style={{ color: "var(--text2)", marginTop: 4, marginBottom: 24, maxWidth: 720 }}>
        Für Unternehmen mit mehreren Gesellschaften oder Niederlassungen. Jedes Projekt gehört zu einer Gesellschaft; Rechte lassen sich je Gesellschaft vergeben.
      </div>
      {fehler && <div style={{ marginBottom: 16 }}><Meldung art="fehler" onSchliessen={() => setFehler(null)}>{fehler}</Meldung></div>}

      <section style={{ marginBottom: 32, maxWidth: 720 }}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
          <h2 style={{ fontSize: 16, fontWeight: 500, margin: 0, flex: 1 }}>Gesellschaften</h2>
          <Knopf klein Icon={Plus} onClick={() => setBearbeiten({ name: "", kuerzel: "", parent_id: null })}>Gesellschaft</Knopf>
        </div>
        <table className="kb-tabelle" style={{ background: "var(--surface)", maxWidth: 720 }}>
          <thead><tr><th>Name</th><th>Kürzel</th><th>Art</th><th>KI</th></tr></thead>
          <tbody>
            {haupt.flatMap(g => [g, ...gesellschaften.filter(n => n.parent_id === g.id)]).map(g => (
              <tr key={g.id} onClick={() => setBearbeiten(g)}>
                <td style={{ paddingLeft: g.parent_id ? 32 : 12 }}>{g.name}</td>
                <td className="kb-zahl">{g.kuerzel}</td>
                <td style={{ color: "var(--text2)" }}>{g.parent_id ? "Niederlassung" : "Gesellschaft"}</td>
                <td style={{ color: "var(--text2)" }}>{g.ki_aktiv === false ? "aus" : "an"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2 style={{ fontSize: 16, fontWeight: 500, margin: "0 0 4px" }}>Rechte</h2>
        <div style={{ color: "var(--text2)", fontSize: 13, marginBottom: 12 }}>
          Leer heißt: es gilt die Polaris-Rolle. Stufen: Lesen · Kalkulieren · Freigeben · Verwalten.
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="kb-tabelle" style={{ background: "var(--surface)" }}>
            <thead><tr><th>Nutzer</th><th>Rolle</th>{spalten.map(g => <th key={g.id || "alle"}>{g.name}</th>)}</tr></thead>
            <tbody>
              {nutzer.map(n => (
                <tr key={n.id} style={{ cursor: "default" }}>
                  <td>{[n.vorname, n.nachname].filter(Boolean).join(" ")}</td>
                  <td style={{ color: "var(--text2)" }}>{ROLLE_LABEL[n.rolle] || n.rolle} · {STUFE_LABEL[ROLLE_STUFE[n.rolle]] || "kein Zugriff"}</td>
                  {spalten.map(g => (
                    <td key={g.id || "alle"}>
                      <select className="kb-eingabe" style={{ height: 30 }} value={recht(n.id, g.id)} onChange={e => setzen(n.id, g.id, e.target.value)} aria-label={`Recht ${n.nachname} ${g.name}`}>
                        <option value="">Rolle</option>
                        {STUFEN.map(([w, l]) => <option key={w} value={w}>{l}</option>)}
                      </select>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {bearbeiten && <GesellschaftDialog g={bearbeiten} haupt={haupt} onSchliessen={() => setBearbeiten(null)}
        onSpeichern={async g => { try { await speicher.gesellschaftSpeichern(g); setBearbeiten(null); onGeaendert(); } catch (e) { setFehler(e.nutzerText || e.message); } }} />}
    </div>
  );
}

function GesellschaftDialog({ g, haupt, onSchliessen, onSpeichern }) {
  const [f, setF] = useState(g);
  return (
    <Dialog titel={g.id ? "Gesellschaft bearbeiten" : "Neue Gesellschaft"} onSchliessen={onSchliessen}
      fuss={<><Knopf onClick={onSchliessen}>Abbrechen</Knopf><Knopf haupt disabled={!f.name?.trim()} onClick={() => onSpeichern({ ...f, name: f.name.trim() })}>Speichern</Knopf></>}>
      <Feld label="Name"><input className="kb-eingabe" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></Feld>
      <Feld label="Kürzel"><input className="kb-eingabe" value={f.kuerzel || ""} onChange={e => setF({ ...f, kuerzel: e.target.value })} /></Feld>
      <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14 }}>
        <input type="checkbox" checked={f.ki_aktiv !== false} onChange={e => setF({ ...f, ki_aktiv: e.target.checked })} />
        KI-Funktionen in dieser Gesellschaft nutzen
      </label>
      <Feld label="Gehört zu" hinweis="Leer lassen für eine eigene Gesellschaft; sonst ist es eine Niederlassung.">
        <select className="kb-eingabe" value={f.parent_id || ""} onChange={e => setF({ ...f, parent_id: e.target.value || null })}>
          <option value="">Eigene Gesellschaft</option>
          {haupt.filter(h => h.id !== g.id).map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
        </select>
      </Feld>
    </Dialog>
  );
}
