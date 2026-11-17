import { useMemo, useState } from "react";
import { ERINNERUNG_STANDARD, RHYTHMEN, erinnerungsPunkte, erinnerungPlanen, erinnerungHtml, erinnerungBetreff } from "../lib/erinnerung.js";
import { sbErinnerungTestmail } from "../lib/supabase.js";
import { escapeHtml } from "../lib/utils.js";

// Einstellungen und Vorschau der E-Mail-Erinnerung (lib/erinnerung.js,
// Versand: supabase/functions/fristen-erinnerung).
const ROLLEN = [["administrator", "Administration"], ["geschaeftsfuehrer", "Geschäftsführung"], ["bauleiter", "Bauleitung"]];
const feld = { boxSizing: "border-box", height: 36, padding: "0 10px", background: "var(--surface)", color: "var(--text)",
  border: "1px solid var(--border2)", borderRadius: 8, fontFamily: "inherit", fontSize: 14 };
const knopf = haupt => ({ height: 36, padding: "0 14px", borderRadius: 8, fontFamily: "inherit", fontSize: 14, cursor: "pointer", fontWeight: haupt ? 500 : 400,
  border: haupt ? "none" : "1px solid var(--border2)", background: haupt ? "var(--text)" : "var(--surface)", color: haupt ? "var(--surface)" : "var(--text)" });

export function ErinnerungPanel({ einstellungen, setEinstellungen, darfAendern, session, firmaName, daten, land = "NW", fristWerktage = 6 }) {
  const e = { ...ERINNERUNG_STANDARD, ...(einstellungen || {}) };
  const [test, setTest] = useState(null);
  const heute = new Date().toLocaleDateString("sv-SE");
  const punkte = useMemo(() => erinnerungsPunkte({ ...daten, heute, vorlaufTage: e.vorlaufTage, land, fristWerktage }), [daten, heute, e.vorlaufTage, land, fristWerktage]);
  const plan = erinnerungPlanen({ punkte, heute, rhythmus: e.rhythmus });
  const html = erinnerungHtml({ firmaName, neu: punkte, weiter: [], heute, appUrl: window.location.origin, esc: escapeHtml });
  const setze = t => setEinstellungen?.({ ...e, ...t });

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(280px, 360px) minmax(0, 1fr)", gap: 24, alignItems: "start" }}>
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 20 }}>
        <label style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: darfAendern ? "pointer" : "default" }}>
          <input type="checkbox" checked={e.aktiv} disabled={!darfAendern} onChange={x => setze({ aktiv: x.target.checked })} style={{ marginTop: 3 }} />
          <span><span style={{ display: "block", fontWeight: 500 }}>Erinnerung per E-Mail</span>
            <span style={{ display: "block", fontSize: 13, color: "var(--text2)", marginTop: 2 }}>Jeden Morgen um 6:30 Uhr prüft Polaris Fristen, Bürgschaften, Geräteprüfungen und Regieberichte</span></span>
        </label>
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 13, color: "var(--text2)", marginBottom: 4 }}>Wann senden</div>
          <select value={e.rhythmus} disabled={!darfAendern} onChange={x => setze({ rhythmus: x.target.value })} style={{ ...feld, width: "100%" }}>
            {RHYTHMEN.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 13, color: "var(--text2)", marginBottom: 4 }}>An</div>
          {ROLLEN.map(([k, l]) => (
            <label key={k} style={{ display: "flex", gap: 8, alignItems: "center", height: 28 }}>
              <input type="checkbox" checked={e.rollen.includes(k)} disabled={!darfAendern}
                onChange={x => setze({ rollen: x.target.checked ? [...e.rollen, k] : e.rollen.filter(r => r !== k) })} />{l}
            </label>
          ))}
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>Jede Person kann die Mail im eigenen Profil abbestellen. Konten mit Benutzernamen statt E-Mail bekommen keine Mail</div>
        </div>
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 13, color: "var(--text2)", marginBottom: 4 }}>Vorlauf in Tagen</div>
          <input type="number" min="1" max="180" value={e.vorlaufTage} disabled={!darfAendern} onChange={x => setze({ vorlaufTage: Number(x.target.value) || 30 })}
            style={{ ...feld, width: 96, textAlign: "right", fontFamily: "var(--font-zahl)" }} />
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>Gewährleistungsende meldet Polaris 90 Tage vorher, Regiefristen 2 Werktage vorher</div>
        </div>
        <div style={{ borderTop: "1px solid var(--border)", marginTop: 20, paddingTop: 16, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button disabled={!darfAendern || test === "laeuft"} onClick={async () => { setTest("laeuft"); const r = await sbErinnerungTestmail(session); setTest(r); }} style={knopf(false)}>
            {test === "laeuft" ? "Sendet" : "Testmail an mich"}
          </button>
          {test && test !== "laeuft" && (
            <span role="status" style={{ fontSize: 13, color: test.ok ? "var(--text2)" : "var(--red)" }}>
              {test.ok ? (test.gesendet ? "Testmail gesendet" : test.hinweis || "Nicht gesendet") : test.fehler}
            </span>
          )}
        </div>
        {!darfAendern && <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 12 }}>Ändern dürfen Administration und Geschäftsführung</div>}
      </div>

      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, marginBottom: 8, flexWrap: "wrap" }}>
          <span style={{ fontWeight: 500 }}>Vorschau mit dem heutigen Stand</span>
          <span style={{ fontSize: 13, color: "var(--text2)" }}>
            {!e.aktiv ? "Erinnerung ist ausgeschaltet" : punkte.length === 0 ? "Heute ist nichts fällig, es geht keine Mail raus"
              : e.rhythmus === "woechentlich" && !plan.senden ? "Würde am Montag gesendet" : `Betreff: ${erinnerungBetreff({ neu: punkte, weiter: [] })}`}
          </span>
        </div>
        <iframe title="Vorschau der Erinnerungsmail" srcDoc={html} sandbox=""
          style={{ width: "100%", height: 560, border: "1px solid var(--border)", borderRadius: 12, background: "#F5F5F2" }} />
      </div>
    </div>
  );
}
