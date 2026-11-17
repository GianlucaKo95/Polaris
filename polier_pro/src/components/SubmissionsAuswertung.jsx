import { useEffect, useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import { Spinner } from "./Spinner.jsx";
import { sbClientMitToken } from "../lib/supabase.js";
import { kiToolAufruf } from "../lib/ai.js";
import { firmenAuswertung, submissionAuswerten, musterErklaeren } from "../lib/submission.js";

// Firmenweite Auswertung der Submissionen: Trefferquote, Abstand zum Besten,
// Abweichung je Gewerk, KI erklärt Muster. Lädt die Angebote selbst.

const eur = n => n == null ? "–" : (Number(n) || 0).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
const pz = n => n == null ? "–" : `${n > 0 ? "+" : ""}${(Math.round(n * 1000) / 10).toLocaleString("de-DE")} %`;
const zahl = { fontFamily: "var(--font-zahl)", fontVariantNumeric: "tabular-nums" };
const th = { textAlign: "left", fontWeight: 400, fontSize: 13, color: "var(--text2)", padding: "8px", borderBottom: "1px solid var(--border2)", whiteSpace: "nowrap" };
const td = { padding: "10px 8px", borderTop: "1px solid var(--border)", verticalAlign: "top" };

export function SubmissionsAuswertung({ stammpositionen = [], projekte = [], session, demoAngebote = null }) {
  const [angebote, setAngebote] = useState(demoAngebote);
  const [fehler, setFehler] = useState(null);
  const [ki, setKi] = useState(null);
  const [lauf, setLauf] = useState(false);

  useEffect(() => {
    if (demoAngebote || !session?.access_token) return;
    sbClientMitToken(session).from("angebote").select("id, projekt_id, titel, status, positionen, submission").in("status", ["versendet", "angenommen", "abgelehnt"])
      .then(({ data, error }) => error ? setFehler(error.message.includes("submission") ? "Die Spalte für Submissionen fehlt noch: bitte supabase-kalkulation.sql ausführen" : error.message) : setAngebote(data || []));
  }, [session?.access_token, demoAngebote]);

  const a = useMemo(() => angebote ? firmenAuswertung(angebote, stammpositionen) : null, [angebote, stammpositionen]);
  const projektName = id => projekte.find(p => String(p.id) === String(id))?.name || "";

  if (!session?.access_token && !demoAngebote) return <p style={{ color: "var(--text2)" }}>Die Auswertung braucht eine Anmeldung</p>;
  if (fehler) return <div role="alert" style={{ color: "var(--red)" }}>{fehler}</div>;
  if (!a) return <div style={{ display: "flex", gap: 8, color: "var(--text2)" }}><Spinner size={14} /> Angebote werden ausgewertet</div>;

  return (
    <div className="eigen-felder">
      <p style={{ margin: "0 0 16px", color: "var(--text2)", lineHeight: 1.55, maxWidth: 820 }}>
        Grundlage sind die Submissionsergebnisse, die bei den Angeboten eingetragen sind (im Angebot unter KI-Kalkulation → Submissionsergebnis). Je mehr Ergebnisse mit Bestbieter-Preisen, desto belastbarer
      </p>
      <div style={{ display: "flex", gap: 32, paddingBottom: 16, borderBottom: "1px solid var(--border)", marginBottom: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div><div style={{ fontSize: 13, color: "var(--text2)" }}>Trefferquote</div><div style={{ ...zahl, fontSize: 22 }}>{a.quote == null ? "–" : `${Math.round(a.quote * 100)} %`}</div><div style={{ fontSize: 12, color: "var(--muted)" }}>{a.gewonnen} von {a.entschieden} entschieden</div></div>
        <div><div style={{ fontSize: 13, color: "var(--text2)" }}>Ø Abstand zum besten Mitbieter</div><div style={{ ...zahl, fontSize: 22 }}>{pz(a.abstandMittel)}</div><div style={{ fontSize: 12, color: "var(--muted)" }}>{a.angebote} Submissionen</div></div>
        <div><div style={{ fontSize: 13, color: "var(--text2)" }}>Knapp verloren</div><div style={{ ...zahl, fontSize: 22 }}>{a.knappVerloren}</div><div style={{ fontSize: 12, color: "var(--muted)" }}>höchstens 3 % über dem Besten</div></div>
        <button onClick={async () => { setLauf(true); try { setKi(await musterErklaeren(a, (system, messages, tools, toolChoice) => kiToolAufruf({ system, messages, tools, toolChoice, maxTokens: 3000 }, session))); } catch (e) { setFehler(e.message); } setLauf(false); }}
          disabled={lauf || !a.angebote || !session?.access_token} style={{ marginLeft: "auto", height: 34, padding: "0 12px", borderRadius: 8, border: "1px solid var(--border2)", background: "var(--surface)", color: "var(--text)", fontFamily: "inherit", fontSize: 13, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6, opacity: a.angebote ? 1 : 0.5 }}>
          {lauf ? <Spinner size={13} /> : <Sparkles size={14} strokeWidth={1.5} />} Muster erklären
        </button>
      </div>

      {ki && (
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <div style={{ lineHeight: 1.55 }}>{ki.zusammenfassung}</div>
          {ki.muster.map((m, i) => (
            <div key={i} style={{ padding: "10px 0", borderTop: "1px solid var(--border)", marginTop: i ? 0 : 10 }}>
              <div style={{ fontWeight: 500 }}>{m.gewerk}</div>
              <div style={{ lineHeight: 1.5 }}>{m.befund}{m.ursache ? ` ${m.ursache}` : ""}</div>
              <div style={{ fontSize: 13, color: "var(--text2)", marginTop: 2 }}>Ansatzpunkt: {m.empfehlung}</div>
            </div>
          ))}
        </div>
      )}

      {!a.angebote ? <div style={{ color: "var(--text2)" }}>Noch keine Submissionsergebnisse eingetragen</div> : (<>
        <h2 style={{ fontSize: 15, fontWeight: 500, margin: "0 0 8px" }}>Je Gewerk</h2>
        {!a.jeGewerk.length && <div style={{ color: "var(--text2)", marginBottom: 16 }}>Für den Vergleich je Gewerk braucht es Bestbieter-Preise je Position (Preisspiegel einlesen)</div>}
        {a.jeGewerk.length > 0 && (
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, overflowX: "auto", marginBottom: 24 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead><tr><th style={th}>Gewerk</th><th style={{ ...th, textAlign: "right" }}>Abweichung</th><th style={{ ...th, textAlign: "right" }}>Positionen</th><th style={{ ...th, textAlign: "right" }}>Angebote</th><th style={th}>Größte Abweichungen</th></tr></thead>
              <tbody>{a.jeGewerk.map(g => (
                <tr key={g.gewerk}>
                  <td style={td}>{g.gewerk}</td>
                  <td style={{ ...td, ...zahl, textAlign: "right", color: g.abweichung > 0.1 ? "var(--red)" : g.abweichung < -0.1 ? "var(--akzent)" : "var(--text2)" }}>{pz(g.abweichung)}</td>
                  <td style={{ ...td, ...zahl, textAlign: "right" }}>{g.positionen}</td>
                  <td style={{ ...td, ...zahl, textAlign: "right" }}>{g.angebote}</td>
                  <td style={{ ...td, fontSize: 13, color: "var(--text2)" }}>{g.beispiele.slice(0, 3).map(b => `${b.bez} ${pz(b.abweichung)}`).join(" · ")}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
        <h2 style={{ fontSize: 15, fontWeight: 500, margin: "0 0 8px" }}>Submissionen</h2>
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead><tr><th style={th}>Angebot</th><th style={th}>Status</th><th style={{ ...th, textAlign: "right" }}>Eigen</th><th style={{ ...th, textAlign: "right" }}>Bester Mitbieter</th><th style={{ ...th, textAlign: "right" }}>Rang</th><th style={{ ...th, textAlign: "right" }}>Abstand</th></tr></thead>
            <tbody>{angebote.filter(x => x.submission).map(x => {
              const r = submissionAuswerten(x);
              return (
                <tr key={x.id}>
                  <td style={td}>{x.titel}<div style={{ fontSize: 12, color: "var(--muted)" }}>{projektName(x.projekt_id)}</div></td>
                  <td style={{ ...td, fontSize: 13, color: "var(--text2)" }}>{{ angenommen: "Gewonnen", abgelehnt: "Verloren", versendet: "Offen" }[x.status] || x.status}</td>
                  <td style={{ ...td, ...zahl, textAlign: "right" }}>{eur(r.eigen)}</td>
                  <td style={{ ...td, ...zahl, textAlign: "right" }}>{eur(r.best)}</td>
                  <td style={{ ...td, ...zahl, textAlign: "right" }}>{r.rang ? `${r.rang}/${r.bieter}` : "–"}</td>
                  <td style={{ ...td, ...zahl, textAlign: "right" }}>{pz(r.abstand)}</td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      </>)}
    </div>
  );
}
