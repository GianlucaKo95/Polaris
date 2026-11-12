import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { baustellenUebersicht } from "../lib/cockpit.js";
import { Achsblase } from "./CockpitView.jsx";

const eur = n => `${Math.round(n || 0).toLocaleString("de-DE")} €`;
const zahl = { fontFamily: "var(--font-zahl)", fontVariantNumeric: "tabular-nums" };

function letzterAbschnitt(id) {
  try { return JSON.parse(localStorage.getItem(`polaris.abschnitt.${id}`) || "null")?.log?.[0] || null; } catch { return null; }
}

// Desktop: alle laufenden Baustellen als Tabelle; Archiv als zweiter Reiter.
export function BaustellenListeView({ projekte = [], firmenDaten, onOeffnen, archiv }) {
  const [reiter, setReiter] = useState("laufend");
  const [suche, setSuche] = useState("");
  const zeilen = useMemo(() => baustellenUebersicht({ projekte: projekte.filter(p => !p.archiviert), angebote: firmenDaten.angebote, baufortschritt: firmenDaten.baufortschritt }),
    [projekte, firmenDaten.angebote, firmenDaten.baufortschritt]);
  const q = suche.trim().toLowerCase();
  const sichtbar = zeilen.filter(b => !q || [b.projekt.name, b.projekt.projektnummer, b.projekt.ort, b.projekt.auftraggeber, b.projekt.bauleiter]
    .some(x => String(x || "").toLowerCase().includes(q)));
  const heute = new Date();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", justifyContent: "space-between" }}>
        <div role="tablist" style={{ display: "flex", gap: 4 }}>
          {[["laufend", `Laufend (${zeilen.length})`], ["archiv", "Archiv"]].map(([k, l]) => (
            <button key={k} role="tab" aria-selected={reiter === k} onClick={() => setReiter(k)} className="desk-nav"
              style={{ height: 32, padding: "0 12px", borderRadius: 8, border: "none", fontFamily: "inherit", fontSize: 14, cursor: "pointer",
                background: reiter === k ? "var(--surface2)" : "transparent", color: reiter === k ? "var(--text)" : "var(--text2)", fontWeight: reiter === k ? 500 : 400 }}>{l}</button>
          ))}
        </div>
        {reiter === "laufend" && (
          <label style={{ display: "flex", alignItems: "center", gap: 8, height: 36, padding: "0 12px", width: 280, boxSizing: "border-box",
            background: "var(--surface)", border: "1px solid var(--border2)", borderRadius: 8, color: "var(--muted)" }}>
            <Search size={16} strokeWidth={1.5} aria-hidden="true" />
            <input className="ohne-rahmen" value={suche} onChange={e => setSuche(e.target.value)} placeholder="Name, Nummer, Ort" aria-label="Baustellen durchsuchen"
              style={{ border: "none", outline: "none", background: "transparent", font: "inherit", color: "var(--text)", width: "100%" }} />
          </label>
        )}
      </div>

      {reiter === "archiv" ? archiv : (
        <section style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 880 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--text2)", fontSize: 13 }}>
                <th style={{ padding: "12px 20px", fontWeight: 400 }}>Baustelle</th>
                <th style={{ padding: "12px", fontWeight: 400 }}>Ort</th>
                <th style={{ padding: "12px", fontWeight: 400 }}>Bauleitung</th>
                <th style={{ padding: "12px", fontWeight: 400 }}>Zuletzt gemeldet</th>
                <th style={{ padding: "12px", fontWeight: 400, textAlign: "right" }}>Aufgaben in Verzug</th>
                <th style={{ padding: "12px", fontWeight: 400 }}>Leistungsstand</th>
                <th style={{ padding: "12px 20px", fontWeight: 400, textAlign: "right" }}>Auftrag netto</th>
              </tr>
            </thead>
            <tbody>
              {sichtbar.map(b => {
                const p = b.projekt;
                const eltern = (p.felder || []).filter(f => !f.parentId);
                const verzug = eltern.filter(f => f.status !== "done" && f.geplant && new Date(f.geplant) < heute).length;
                const meldung = letzterAbschnitt(p.id);
                const prozent = b.leistungsstand != null ? Math.round(b.leistungsstand * 100) : null;
                return (
                  <tr key={p.id} className="desk-zeile" onClick={() => onOeffnen(p.id)} style={{ borderTop: "1px solid var(--border)", cursor: "pointer" }}>
                    <td style={{ padding: "12px 20px" }}>
                      <button onClick={e => { e.stopPropagation(); onOeffnen(p.id); }} style={{ all: "unset", cursor: "pointer", fontWeight: 500 }}>{p.name}</button>
                      {p.projektnummer && <div style={{ ...zahl, fontSize: 12, color: "var(--muted)" }}>{p.projektnummer}</div>}
                    </td>
                    <td style={{ padding: 12, color: "var(--text2)" }}>{p.ort || "–"}</td>
                    <td style={{ padding: 12, color: "var(--text2)" }}>{p.bauleiter || "–"}</td>
                    <td style={{ padding: 12 }}>{meldung ? <Achsblase bereich={meldung.bereich} /> : <span style={{ color: "var(--muted)" }}>–</span>}</td>
                    <td style={{ padding: 12, textAlign: "right", ...zahl, color: verzug ? "var(--red)" : "var(--muted)" }}>{verzug || "–"}</td>
                    <td style={{ padding: 12, width: 168 }}>
                      {prozent == null ? <span style={{ color: "var(--muted)" }}>kein Auftrag</span> : (
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ flexGrow: 1, height: 4, background: "var(--surface2)", borderRadius: 2, overflow: "hidden" }}>
                            <div style={{ height: 4, width: `${prozent}%`, background: "var(--text)" }} />
                          </div>
                          <span style={{ ...zahl, fontSize: 12, width: 36, textAlign: "right" }}>{prozent} %</span>
                        </div>
                      )}
                    </td>
                    <td style={{ padding: "12px 20px", textAlign: "right", ...zahl }}>{b.auftragNetto ? eur(b.auftragNetto) : "–"}</td>
                  </tr>
                );
              })}
              {!sichtbar.length && <tr><td colSpan={7} style={{ padding: 20, color: "var(--text2)" }}>{zeilen.length ? "Keine Baustelle passt zur Suche" : "Noch keine Baustellen angelegt"}</td></tr>}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
