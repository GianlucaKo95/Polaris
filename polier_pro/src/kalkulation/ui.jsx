// Gemeinsame Bausteine des Kalkulationsbereichs (Werkplan-Gestaltung).
import { useEffect, useRef } from "react";
import { X } from "lucide-react";

const eur = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const zahl3 = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 0, maximumFractionDigits: 3 });
export const euro = x => eur.format(Number(x) || 0);
export const menge = x => zahl3.format(Number(x) || 0);
export const datum = d => (d ? new Date(d).toLocaleDateString("de-DE") : "");
export const zeitpunkt = d => (d ? new Date(d).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "");

// Deutsche Zahleneingabe: "1.234,5" und "1234.5" → 1234.5
export function zahlLesen(text) {
  let t = String(text ?? "").trim().replace(/\s/g, "");
  if (!t) return 0;
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export const PROJEKT_STATUS = [
  ["anfrage", "Anfrage"], ["in_bearbeitung", "In Bearbeitung"], ["abgegeben", "Abgegeben"], ["auftrag", "Auftrag"],
  ["verloren", "Verloren"], ["abgerechnet", "Abgerechnet"], ["archiviert", "Archiviert"],
];
export const STATUS_LABEL = Object.fromEntries(PROJEKT_STATUS);
const STATUS_FARBE = { auftrag: "var(--green)", abgegeben: "var(--blue)", verloren: "var(--muted)", anfrage: "var(--akzent)" };

export const STAND_ARTEN = [["angebot", "Angebot"], ["verhandlung", "Verhandlung"], ["auftrag", "Auftrag"], ["arbeitskalkulation", "Arbeitskalkulation"], ["nachtrag", "Nachtrag"]];
export const STAND_LABEL = Object.fromEntries(STAND_ARTEN);

export function StatusPunkt({ status }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
      <span style={{ width: 8, height: 8, borderRadius: 4, background: STATUS_FARBE[status] || "var(--text2)" }} />
      {STATUS_LABEL[status] || status}
    </span>
  );
}

export function Knopf({ children, haupt, leise, gefahr, klein, Icon, ...rest }) {
  return (
    <button {...rest} className={`kb-knopf${haupt ? " haupt" : ""}${leise ? " leise" : ""}${gefahr ? " gefahr" : ""}${klein ? " klein" : ""}`}>
      {Icon && <Icon size={16} strokeWidth={1.5} aria-hidden="true" />}
      {children}
    </button>
  );
}

export function Feld({ label, children, hinweis }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13, color: "var(--text2)" }}>
      {label}
      {children}
      {hinweis && <span style={{ fontSize: 12, color: "var(--muted)" }}>{hinweis}</span>}
    </label>
  );
}

export function Dialog({ titel, onSchliessen, children, fuss, breite = 520 }) {
  const box = useRef(null);
  useEffect(() => {
    const t = e => { if (e.key === "Escape") onSchliessen(); };
    window.addEventListener("keydown", t);
    box.current?.querySelector("input, select, textarea, button.haupt")?.focus();
    return () => window.removeEventListener("keydown", t);
  }, [onSchliessen]);
  return (
    <div onMouseDown={onSchliessen} style={{ position: "fixed", inset: 0, background: "rgba(22,24,29,0.32)", zIndex: 300, display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: "10vh" }}>
      <div ref={box} role="dialog" aria-label={titel} onMouseDown={e => e.stopPropagation()}
        style={{ width: breite, maxWidth: "calc(100vw - 32px)", maxHeight: "80vh", display: "flex", flexDirection: "column", background: "var(--surface)",
          border: "1px solid var(--border)", borderRadius: 12, boxShadow: "0 12px 32px rgba(22,24,29,0.16)", animation: "desk-auf 140ms ease-out" }}>
        <div style={{ display: "flex", alignItems: "center", padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 500, flex: 1 }}>{titel}</h2>
          <button onClick={onSchliessen} aria-label="Schließen" className="kb-symbol"><X size={16} strokeWidth={1.5} /></button>
        </div>
        <div style={{ padding: 20, overflowY: "auto", display: "flex", flexDirection: "column", gap: 16 }}>{children}</div>
        {fuss && <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "12px 20px", borderTop: "1px solid var(--border)" }}>{fuss}</div>}
      </div>
    </div>
  );
}

export function Meldung({ art = "info", children, onSchliessen }) {
  const farbe = art === "fehler" ? "var(--red)" : art === "ok" ? "var(--green)" : "var(--text2)";
  const grund = art === "fehler" ? "var(--rbg)" : art === "ok" ? "var(--gbg)" : "var(--surface2)";
  return (
    <div role={art === "fehler" ? "alert" : "status"} style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "10px 12px", borderRadius: 8, background: grund, color: farbe, fontSize: 13 }}>
      <div style={{ flex: 1 }}>{children}</div>
      {onSchliessen && <button onClick={onSchliessen} aria-label="Schließen" className="kb-symbol" style={{ width: 20, height: 20, color: farbe }}><X size={14} /></button>}
    </div>
  );
}

export function Leer({ titel, text, children }) {
  return (
    <div style={{ padding: "48px 24px", textAlign: "center", color: "var(--text2)", border: "1px dashed var(--border2)", borderRadius: 12 }}>
      <div style={{ fontSize: 16, fontWeight: 500, color: "var(--text)", marginBottom: 4 }}>{titel}</div>
      {text && <div style={{ maxWidth: 480, margin: "0 auto" }}>{text}</div>}
      {children && <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 16 }}>{children}</div>}
    </div>
  );
}

export function Taste({ children }) {
  return <kbd className="kb-taste">{children}</kbd>;
}
