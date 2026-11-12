import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { nettoSumme } from "../lib/lv.js";

const eur = n => `${(n || 0).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const zahl = { fontFamily: "var(--font-zahl)", fontVariantNumeric: "tabular-nums" };

export function angebotStatus(a) {
  if (a.interne_freigabe?.status === "angefragt") return { key: "freigabe", label: "Freigabe nötig", farbe: "var(--akzent)" };
  return ({
    entwurf: { key: "entwurf", label: "Entwurf", farbe: "var(--muted)" },
    versendet: { key: "versendet", label: "Versendet", farbe: "var(--blue)" },
    angenommen: { key: "angenommen", label: "Beauftragt", farbe: "var(--green)" },
    abgelehnt: { key: "abgelehnt", label: "Abgelehnt", farbe: "var(--red)" },
  })[a.status] || { key: a.status, label: a.status || "–", farbe: "var(--muted)" };
}

const FILTER = [["alle", "Alle"], ["freigabe", "Freigabe nötig"], ["entwurf", "Entwurf"], ["versendet", "Versendet"], ["angenommen", "Beauftragt"], ["abgelehnt", "Abgelehnt"]];

// Desktop: alle Angebote und Nachträge aller Baustellen in einer Tabelle.
export function AngeboteListeView({ projekte = [], firmenDaten, onOeffnen }) {
  const [filter, setFilter] = useState("alle");
  const [suche, setSuche] = useState("");
  const zeilen = useMemo(() => (firmenDaten.angebote || []).map(a => ({
    a, status: angebotStatus(a), projekt: projekte.find(p => String(p.id) === String(a.projekt_id)),
    netto: nettoSumme(a.positionen || []) * (1 - (Number(a.rabatt) || 0) / 100),
  })).sort((x, y) => String(y.a.datum || y.a.created_at || "").localeCompare(String(x.a.datum || x.a.created_at || ""))), [firmenDaten.angebote, projekte]);
  const anzahl = k => k === "alle" ? zeilen.length : zeilen.filter(z => z.status.key === k).length;
  const q = suche.trim().toLowerCase();
  const sichtbar = zeilen.filter(z => (filter === "alle" || z.status.key === filter)
    && (!q || [z.a.titel, z.a.empfaenger, z.projekt?.name, z.projekt?.projektnummer].some(x => String(x || "").toLowerCase().includes(q))));
  const summe = sichtbar.reduce((s, z) => s + z.netto, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", justifyContent: "space-between" }}>
        <div role="tablist" aria-label="Status" style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {FILTER.map(([k, l]) => (
            <button key={k} role="tab" aria-selected={filter === k} onClick={() => setFilter(k)} className="desk-nav"
              style={{ height: 32, padding: "0 12px", borderRadius: 8, border: "none", fontFamily: "inherit", fontSize: 14, cursor: "pointer", display: "flex", gap: 8, alignItems: "center",
                background: filter === k ? "var(--surface2)" : "transparent", color: filter === k ? "var(--text)" : "var(--text2)", fontWeight: filter === k ? 500 : 400 }}>
              {l}<span style={{ ...zahl, fontSize: 12, color: "var(--muted)" }}>{anzahl(k)}</span>
            </button>
          ))}
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, height: 36, padding: "0 12px", width: 280, boxSizing: "border-box",
          background: "var(--surface)", border: "1px solid var(--border2)", borderRadius: 8, color: "var(--muted)" }}>
          <Search size={16} strokeWidth={1.5} aria-hidden="true" />
          <input className="ohne-rahmen" value={suche} onChange={e => setSuche(e.target.value)} placeholder="Titel, Empfänger, Baustelle" aria-label="Angebote durchsuchen"
            style={{ border: "none", outline: "none", background: "transparent", font: "inherit", color: "var(--text)", width: "100%" }} />
        </label>
      </div>

      <section style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 880 }}>
          <thead>
            <tr style={{ textAlign: "left", color: "var(--text2)", fontSize: 13 }}>
              <th style={{ padding: "12px 20px", fontWeight: 400 }}>Angebot</th>
              <th style={{ padding: 12, fontWeight: 400 }}>Baustelle</th>
              <th style={{ padding: 12, fontWeight: 400 }}>Empfänger</th>
              <th style={{ padding: 12, fontWeight: 400 }}>Datum</th>
              <th style={{ padding: 12, fontWeight: 400 }}>Status</th>
              <th style={{ padding: "12px 20px", fontWeight: 400, textAlign: "right" }}>Netto</th>
            </tr>
          </thead>
          <tbody>
            {firmenDaten.laedt && !zeilen.length && <tr><td colSpan={6} style={{ padding: 20, color: "var(--text2)" }}>Lädt …</td></tr>}
            {sichtbar.map(({ a, status, projekt, netto }) => (
              <tr key={a.id} className="desk-zeile" onClick={() => onOeffnen(a.projekt_id, a.id)} style={{ borderTop: "1px solid var(--border)", cursor: "pointer" }}>
                <td style={{ padding: "12px 20px" }}>
                  <button onClick={e => { e.stopPropagation(); onOeffnen(a.projekt_id, a.id); }} style={{ all: "unset", cursor: "pointer", fontWeight: 500 }}>{a.titel || "Angebot"}</button>
                  {a.nachtrag_zu && <div style={{ fontSize: 12, color: "var(--muted)" }}>Nachtrag</div>}
                </td>
                <td style={{ padding: 12, color: "var(--text2)" }}>{projekt?.name || "–"}</td>
                <td style={{ padding: 12, color: "var(--text2)" }}>{a.empfaenger || "–"}</td>
                <td style={{ padding: 12, ...zahl, fontSize: 13, color: "var(--text2)" }}>{a.datum ? new Date(a.datum).toLocaleDateString("de-DE") : "–"}</td>
                <td style={{ padding: 12 }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                    <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 4, background: status.farbe }} />{status.label}
                  </span>
                </td>
                <td style={{ padding: "12px 20px", textAlign: "right", ...zahl }}>{eur(netto)}</td>
              </tr>
            ))}
            {!firmenDaten.laedt && !sichtbar.length && <tr><td colSpan={6} style={{ padding: 20, color: "var(--text2)" }}>{zeilen.length ? "Kein Angebot passt zu Filter und Suche" : "Noch keine Angebote. Angebote entstehen in der jeweiligen Baustelle"}</td></tr>}
          </tbody>
          {sichtbar.length > 1 && (
            <tfoot><tr style={{ borderTop: "1px solid var(--border2)" }}>
              <td colSpan={5} style={{ padding: "12px 20px", color: "var(--text2)" }}>{sichtbar.length} Angebote</td>
              <td style={{ padding: "12px 20px", textAlign: "right", ...zahl, fontWeight: 500 }}>{eur(summe)}</td>
            </tr></tfoot>
          )}
        </table>
      </section>
    </div>
  );
}
