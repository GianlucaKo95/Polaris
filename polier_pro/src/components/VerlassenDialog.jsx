import { useEffect, useRef, useState } from "react";
import { dialogRegistrieren, hatUngespeichert, verlassenBestaetigen } from "../lib/ungespeichert.js";

// Rückfrage beim Verlassen mit ungespeicherten Änderungen (lib/ungespeichert.js).
// Fängt außerdem Klicks in Navigationsbereichen ([data-navigation]) ab, fragt
// nach und führt den Klick bei „Weiter“ erneut aus.
export function VerlassenDialog() {
  const [offen, setOffen] = useState(null);   // { eintraege, aufloesen }
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState("");
  const durchlassen = useRef(false);
  const erster = useRef(null);

  useEffect(() => dialogRegistrieren(eintraege => new Promise(aufloesen => { setFehler(""); setOffen({ eintraege, aufloesen }); })), []);

  useEffect(() => {
    const klick = e => {
      if (durchlassen.current || !hatUngespeichert()) return;
      const ziel = e.target.closest?.("button, a, [role='tab'], [role='menuitem']");
      if (!ziel || !ziel.closest("[data-navigation]") || ziel.closest("[data-navigation-frei]")) return;
      e.preventDefault(); e.stopPropagation();
      verlassenBestaetigen().then(ok => {
        if (!ok) return;
        durchlassen.current = true;
        try { ziel.click(); } finally { durchlassen.current = false; }
      });
    };
    document.addEventListener("click", klick, true);
    return () => document.removeEventListener("click", klick, true);
  }, []);

  useEffect(() => {
    if (!offen) return undefined;
    erster.current?.focus();
    const taste = e => { if (e.key === "Escape") schliessen(false); };
    document.addEventListener("keydown", taste);
    return () => document.removeEventListener("keydown", taste);
  }, [offen]);

  if (!offen) return null;
  const kannSpeichern = offen.eintraege.every(e => e.hatSpeichern());
  function schliessen(ok) { const a = offen.aufloesen; setOffen(null); a(ok); }
  async function speichern() {
    setLaeuft(true); setFehler("");
    try {
      for (const e of offen.eintraege) {
        if (await e.speichern() === false) { setFehler(`${e.titel} konnte nicht gespeichert werden`); return; }
      }
      schliessen(true);
    } finally { setLaeuft(false); }
  }
  function verwerfen() { for (const e of offen.eintraege) e.verwerfen(); schliessen(true); }

  const knopf = haupt => ({ height: 36, padding: "0 14px", borderRadius: 8, fontFamily: "inherit", fontSize: 14, cursor: "pointer", fontWeight: haupt ? 500 : 400,
    border: haupt ? "none" : "1px solid var(--border2)", background: haupt ? "var(--text)" : "var(--surface)", color: haupt ? "var(--surface)" : "var(--text)" });
  return (
    <div role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) schliessen(false); }}
      style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(22,24,29,0.32)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="verlassen-titel" aria-describedby="verlassen-text"
        style={{ width: "100%", maxWidth: 440, background: "var(--surface)", color: "var(--text)", borderRadius: 12, padding: 24, boxShadow: "0 16px 48px rgba(22,24,29,0.24)",
          animation: "desk-auf 120ms ease-out", fontSize: 14, lineHeight: "20px" }}>
        <div id="verlassen-titel" style={{ fontSize: 18, lineHeight: "24px", fontWeight: 500 }}>Ungespeicherte Änderungen</div>
        <div id="verlassen-text" style={{ color: "var(--text2)", marginTop: 8 }}>
          {offen.eintraege.length === 1
            ? <>{offen.eintraege[0].titel} hat Änderungen, die noch nicht gespeichert sind.</>
            : <>Diese Einträge haben Änderungen, die noch nicht gespeichert sind: {offen.eintraege.map(e => e.titel).join(", ")}.</>}
        </div>
        {fehler && <div role="alert" style={{ marginTop: 12, color: "var(--red)", fontSize: 13 }}>{fehler}</div>}
        <div style={{ display: "flex", gap: 8, marginTop: 24, flexWrap: "wrap" }}>
          {kannSpeichern && <button ref={erster} onClick={speichern} disabled={laeuft} style={knopf(true)}>{laeuft ? "Speichert" : "Speichern"}</button>}
          <button ref={kannSpeichern ? undefined : erster} onClick={verwerfen} disabled={laeuft} style={knopf(!kannSpeichern)}>Verwerfen</button>
          <button onClick={() => schliessen(false)} disabled={laeuft} style={{ ...knopf(false), marginLeft: "auto", border: "none" }}>Zurück zum Bearbeiten</button>
        </div>
      </div>
    </div>
  );
}
