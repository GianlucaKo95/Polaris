import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

// Ausklappmenü für die Desktop-Werkzeugleisten. Einträge: { label, hinweis,
// aktion, disabled } oder { gruppe } als Zwischenüberschrift. Falsy-Einträge
// werden übersprungen, damit Aufrufer bedingt Einträge setzen können.
export function Menue({ label, icon: Icon, eintraege, primaer = false }) {
  const [offen, setOffen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!offen) return;
    const klick = e => { if (!ref.current?.contains(e.target)) setOffen(false); };
    const taste = e => { if (e.key === "Escape") setOffen(false); };
    document.addEventListener("mousedown", klick);
    document.addEventListener("keydown", taste);
    return () => { document.removeEventListener("mousedown", klick); document.removeEventListener("keydown", taste); };
  }, [offen]);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button onClick={() => setOffen(o => !o)} aria-haspopup="menu" aria-expanded={offen}
        className={primaer ? undefined : "desk-nav"}
        style={{ display: "flex", alignItems: "center", gap: 8, height: 36, padding: "0 12px",
          background: primaer ? "var(--text)" : "var(--surface)", color: primaer ? "var(--surface)" : "var(--text)",
          border: primaer ? "none" : "1px solid var(--border2)", borderRadius: 8, cursor: "pointer",
          fontFamily: "inherit", fontSize: 14, fontWeight: 500, whiteSpace: "nowrap" }}>
        {Icon && <Icon size={16} strokeWidth={1.5} />}{label}<ChevronDown size={14} strokeWidth={1.5} />
      </button>
      {offen && (
        <div role="menu" style={{ position: "absolute", right: 0, top: "calc(100% + 4px)", minWidth: 280, zIndex: 40,
          background: "var(--surface)", border: "1px solid var(--border2)", borderRadius: 10, padding: 4,
          boxShadow: "0 8px 24px rgba(22,24,29,0.12)", animation: "desk-auf 120ms ease-out" }}>
          {eintraege.filter(Boolean).map((e, i) => e.gruppe ? (
            <div key={i} style={{ padding: "8px 10px 4px", fontSize: 12, color: "var(--muted)" }}>{e.gruppe}</div>
          ) : (
            <button key={i} role="menuitem" disabled={e.disabled} className="desk-nav"
              onClick={() => { setOffen(false); e.aktion(); }}
              style={{ display: "flex", width: "100%", alignItems: "center", justifyContent: "space-between", gap: 16,
                height: 32, padding: "0 10px", background: "none", border: "none", borderRadius: 6,
                color: e.disabled ? "var(--muted)" : "var(--text)", cursor: e.disabled ? "default" : "pointer",
                fontFamily: "inherit", fontSize: 14, textAlign: "left" }}>
              <span>{e.label}</span>
              {e.hinweis && <span style={{ fontFamily: "var(--font-zahl)", fontSize: 12, color: "var(--muted)" }}>{e.hinweis}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
