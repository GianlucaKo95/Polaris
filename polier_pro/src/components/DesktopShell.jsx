import { LayoutDashboard, LogOut, Moon, Sun, Plus } from "lucide-react";

// Desktop-Rahmen (ab 1024 px): Seitenleiste mit Cockpit, Baustellenwahl,
// Baustellen- und Firmenfunktionen; rechts der Inhalt mit Seitentitel.
// Die Handy-App nutzt diesen Rahmen nicht (siehe App.jsx, istDesktop).
//
// gruppen: [{ titel, eintraege: [{ id, label, Icon, zahl? }] }]
export function DesktopShell({
  titel, untertitel, aktiv, onWaehlen, gruppen, projekte = [], aktivProjektId, onProjektWaehlen, onNeuesProjekt,
  firmenName, nutzerName, rolleLabel, dark, onThemeWechsel, onAbmelden, verbunden, aktionen, children,
}) {
  const zeile = istAktiv => ({
    display: "flex", alignItems: "center", gap: 8, height: 36, flexShrink: 0, padding: "0 8px", borderRadius: 8, width: "100%",
    border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 14, textAlign: "left",
    background: istAktiv ? "var(--surface2)" : "transparent",
    color: istAktiv ? "var(--text)" : "var(--text2)", fontWeight: istAktiv ? 500 : 400,
    boxShadow: istAktiv ? "inset 0 0 0 1px var(--border)" : "none",
  });
  const leiste = { flexShrink: 0, background: "none", border: "none", color: "var(--text2)", cursor: "pointer", width: 32, height: 32,
    display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8 };

  return (
    <div style={{ height: "100dvh", display: "flex", background: "var(--bg)", color: "var(--text)", fontSize: 14, lineHeight: "20px" }}>
      <nav aria-label="Hauptnavigation" style={{ width: 248, flexShrink: 0, boxSizing: "border-box", padding: "20px 12px 16px", background: "var(--surface)",
        borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column", overflowY: "auto" }} className="desk-leiste">
        <div style={{ display: "flex", alignItems: "center", gap: 8, height: 32, padding: "0 8px", marginBottom: 24 }}>
          <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
            <rect width="24" height="24" rx="6" fill="var(--text)" />
            <path d="M12 4.5 L13.6 10.4 L19.5 12 L13.6 13.6 L12 19.5 L10.4 13.6 L4.5 12 L10.4 10.4 Z" fill="var(--bg)" />
          </svg>
          <span style={{ fontWeight: 600, fontSize: 16 }}>Polaris</span>
          <span title={verbunden ? "Verbunden" : "Offline"} aria-label={verbunden ? "Verbunden" : "Offline"}
            style={{ marginLeft: "auto", width: 8, height: 8, borderRadius: 4, background: verbunden ? "var(--green)" : "var(--muted)" }} />
        </div>

        <button className="desk-nav" onClick={() => onWaehlen("cockpit")} style={zeile(aktiv === "cockpit")}>
          <LayoutDashboard size={18} strokeWidth={1.5} /> Cockpit
        </button>

        <div style={{ marginTop: 24, padding: "0 8px 8px", fontSize: 13, color: "var(--muted)" }}>Baustelle</div>
        <div style={{ display: "flex", gap: 4, padding: "0 4px 8px" }}>
          <label style={{ flex: 1, minWidth: 0 }}>
            <span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>Baustelle wählen</span>
            <select value={aktivProjektId ?? ""} onChange={e => onProjektWaehlen(e.target.value || null)}
              style={{ width: "100%", height: 36, padding: "0 8px", borderRadius: 8, border: "1px solid var(--border2)", background: "var(--surface)",
                color: "var(--text)", fontSize: 14, fontFamily: "inherit" }}>
              <option value="">Baustelle wählen</option>
              {projekte.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          {onNeuesProjekt && (
            <button onClick={onNeuesProjekt} aria-label="Neue Baustelle" title="Neue Baustelle"
              style={{ ...leiste, width: 36, height: 36, border: "1px solid var(--border2)" }}>
              <Plus size={16} strokeWidth={1.5} />
            </button>
          )}
        </div>

        {gruppen.map(g => (
          <div key={g.titel} style={{ marginTop: g.erste ? 0 : 24 }}>
            {!g.erste && <div style={{ padding: "0 8px 8px", fontSize: 13, color: "var(--muted)" }}>{g.titel}</div>}
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {g.eintraege.map(e => (
                <button key={e.id} className="desk-nav" onClick={() => onWaehlen(e.id)} disabled={e.gesperrt}
                  title={e.gesperrt ? "Zuerst eine Baustelle wählen" : undefined}
                  style={{ ...zeile(aktiv === e.id), opacity: e.gesperrt ? 0.45 : 1, cursor: e.gesperrt ? "default" : "pointer" }}>
                  {e.Icon ? <e.Icon size={18} strokeWidth={1.5} /> : <span style={{ width: 18 }} />}
                  <span style={{ flexGrow: 1 }}>{e.label}</span>
                  {e.zahl != null && <span style={{ fontFamily: "var(--font-zahl)", fontSize: 12, color: "var(--muted)" }}>{e.zahl}</span>}
                </button>
              ))}
            </div>
          </div>
        ))}

        <div style={{ flexGrow: 1, minHeight: 24 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 4, padding: 12, borderRadius: 8, background: "var(--bg)" }}>
          <div style={{ flex: 1, minWidth: 0, fontSize: 13, color: "var(--text2)" }}>
            <div style={{ fontWeight: 500, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{firmenName || "Polaris"}</div>
            <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{[nutzerName, rolleLabel].filter(Boolean).join(" · ")}</div>
          </div>
          <button onClick={onThemeWechsel} aria-label={dark ? "Helles Design" : "Dunkles Design"} title={dark ? "Helles Design" : "Dunkles Design"} style={leiste}>
            {dark ? <Sun size={16} strokeWidth={1.5} /> : <Moon size={16} strokeWidth={1.5} />}
          </button>
          <button onClick={onAbmelden} aria-label="Abmelden" title="Abmelden" style={leiste}><LogOut size={16} strokeWidth={1.5} /></button>
        </div>
      </nav>

      <main style={{ flex: 1, minWidth: 0, overflowY: "auto" }}>
        <div style={{ maxWidth: 1360, boxSizing: "border-box", padding: "32px 32px 48px" }}>
          <header style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: 16, marginBottom: 24 }}>
            <div style={{ minWidth: 0 }}>
              <h1 style={{ margin: 0, fontSize: 28, lineHeight: "36px", fontWeight: 500, letterSpacing: "-0.01em" }}>{titel}</h1>
              {untertitel && <div style={{ color: "var(--text2)", marginTop: 4 }}>{untertitel}</div>}
            </div>
            {aktionen && <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{aktionen}</div>}
          </header>
          {children}
        </div>
      </main>
    </div>
  );
}
