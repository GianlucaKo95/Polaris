import { Fragment, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Sparkles } from "lucide-react";
import { Spinner } from "./Spinner.jsx";
import { sbClientMitToken } from "../lib/supabase.js";
import { kiToolAufruf } from "../lib/ai.js";
import { beobachtungen, erfahrungJeStammposition, zeitansatzUebernehmen, abweichungenErklaeren, MIN_SOLL } from "../lib/erfahrungswerte.js";

// Erfahrungswerte: Ist-Stunden aller Baustellen je Stammposition gegen den
// Zeitansatz, mit geglättetem Vorschlag und KI-Erklärung. Logik in
// lib/erfahrungswerte.js. Lädt die Daten der ganzen Firma selbst, weil die App
// sonst nur die aktive Baustelle im Speicher hat.

const z = (n, st = 3) => n == null ? "–" : (Number(n) || 0).toLocaleString("de-DE", { maximumFractionDigits: st });
const zahl = { fontFamily: "var(--font-zahl)", fontVariantNumeric: "tabular-nums" };
const th = { textAlign: "left", fontWeight: 400, fontSize: 13, color: "var(--text2)", padding: "8px", borderBottom: "1px solid var(--border2)", whiteSpace: "nowrap" };
const td = { padding: "10px 8px", borderTop: "1px solid var(--border)", verticalAlign: "top" };
const knopf = (haupt = false) => ({ height: 32, padding: "0 12px", borderRadius: 8, fontFamily: "inherit", fontSize: 13, cursor: "pointer",
  display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap", fontWeight: haupt ? 500 : 400,
  border: haupt ? "none" : "1px solid var(--border2)", background: haupt ? "var(--text)" : "var(--surface)", color: haupt ? "var(--surface)" : "var(--text)" });
const STATUS = { anpassen: "Anpassen", bestaetigt: "Bestätigt", zu_wenig: "Zu wenig Daten", eingeflossen: "Eingeflossen" };
const EMPFEHLUNG = { uebernehmen: "Übernehmen", teilweise: "Teilweise", beibehalten: "Beibehalten" };

export function ErfahrungswertePanel({ stammpositionen, setStammpositionen, kalkulationspreise, projekte = [], session, demoDaten = null }) {
  const [daten, setDaten] = useState(demoDaten);
  const [fehler, setFehler] = useState(null);
  const [filter, setFilter] = useState("anpassen");
  const [offen, setOffen] = useState(null);
  const [werte, setWerte] = useState({});      // sp.id → eingegebener Zeitansatz (Text)
  const [ki, setKi] = useState(new Map());
  const [kiLauf, setKiLauf] = useState(false);
  const [meldung, setMeldung] = useState(null);

  useEffect(() => {
    if (demoDaten || !session?.access_token) return;
    const c = sbClientMitToken(session);
    Promise.all([
      c.from("angebote").select("id, projekt_id, status, positionen, preisstand").eq("status", "angenommen"),
      c.from("baufortschritt").select("angebot_id, position_id, prozent"),
      c.from("stunden_positionen").select("angebot_id, position_id, stunden"),
    ]).then(([a, f, v]) => {
      const e = a.error || f.error || v.error;
      if (e) { setFehler(e.message); return; }
      setDaten({ angebote: a.data || [], fortschritt: f.data || [], verteilung: v.data || [] });
    });
  }, [session?.access_token, demoDaten]);

  const eintraege = useMemo(() => daten
    ? erfahrungJeStammposition(beobachtungen({ ...daten, kalkulationspreise, projekte }), stammpositionen, kalkulationspreise)
    : [], [daten, stammpositionen, kalkulationspreise, projekte]);
  const zaehler = eintraege.reduce((s, e) => ({ ...s, [e.status]: (s[e.status] || 0) + 1 }), {});
  const sichtbar = eintraege.filter(e => filter === "alle" || e.status === filter);

  async function kiErklaeren() {
    setKiLauf(true); setMeldung(null);
    try {
      const ziel = eintraege.filter(e => e.status === "anpassen").slice(0, 30);
      const rufeKi = (system, messages, tools, toolChoice) => kiToolAufruf({ system, messages, tools, toolChoice, maxTokens: 4000 }, session);
      setKi(await abweichungenErklaeren(ziel, rufeKi));
    } catch (e) { setMeldung(e.message); }
    setKiLauf(false);
  }

  function uebernehmen(e) {
    const neu = Number(String(werte[e.sp.id] ?? e.vorschlag).replace(",", "."));
    if (!(neu > 0)) { setMeldung("Bitte einen Zeitansatz größer 0 eintragen"); return; }
    setStammpositionen(prev => zeitansatzUebernehmen(prev, e, neu, kalkulationspreise));
    setMeldung(`${e.sp.bez}: Zeitansatz ${z(e.aktuell)} → ${z(neu)} h/${e.sp.einheit}. Neue Angebote rechnen damit, bestehende behalten ihre Urkalkulation`);
  }

  if (!session?.access_token && !demoDaten) return <p style={{ color: "var(--text2)" }}>Erfahrungswerte brauchen eine Anmeldung, weil sie die Baustellen der ganzen Firma auswerten</p>;
  if (fehler) return <div role="alert" style={{ color: "var(--red)" }}>Erfahrungswerte konnten nicht geladen werden: {fehler}</div>;
  if (!daten) return <div style={{ display: "flex", gap: 8, color: "var(--text2)" }}><Spinner size={14} /> Baustellen werden ausgewertet</div>;

  return (
    <div className="eigen-felder">
      <p style={{ margin: "0 0 16px", color: "var(--text2)", lineHeight: 1.55, maxWidth: 760 }}>
        Ist-Stunden aus der Leistungserfassung aller Baustellen je Stammposition, verglichen mit dem Zeitansatz. Der Vorschlag rückt nur so weit an den Ist-Wert, wie die Datenbasis trägt.
        Übernommene Werte gelten für neue Angebote
      </p>

      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <div role="radiogroup" aria-label="Filter" style={{ display: "inline-flex", border: "1px solid var(--border2)", borderRadius: 8, padding: 2 }}>
          {["anpassen", "bestaetigt", "zu_wenig", "eingeflossen", "alle"].map(k => (
            <button key={k} role="radio" aria-checked={filter === k} onClick={() => setFilter(k)}
              style={{ height: 28, padding: "0 10px", border: "none", borderRadius: 6, fontFamily: "inherit", fontSize: 13, cursor: "pointer",
                background: filter === k ? "var(--bg)" : "transparent", color: filter === k ? "var(--text)" : "var(--text2)", boxShadow: filter === k ? "inset 0 0 0 1px var(--border2)" : "none" }}>
              {k === "alle" ? "Alle" : STATUS[k]} <span style={{ ...zahl, color: "var(--muted)" }}>{k === "alle" ? eintraege.length : zaehler[k] || 0}</span>
            </button>
          ))}
        </div>
        <button onClick={kiErklaeren} disabled={kiLauf || !zaehler.anpassen || !session?.access_token} style={{ ...knopf(), marginLeft: "auto", opacity: zaehler.anpassen && session?.access_token ? 1 : 0.5 }}>
          {kiLauf ? <Spinner size={13} /> : <Sparkles size={14} strokeWidth={1.5} />} Abweichungen erklären
        </button>
      </div>
      {meldung && <div role="status" style={{ fontSize: 13, color: "var(--text2)", marginBottom: 12 }}>{meldung}</div>}

      {!eintraege.length ? (
        <div style={{ color: "var(--text2)", padding: "16px 0", lineHeight: 1.55 }}>
          Noch keine Daten. Erfahrungswerte entstehen, wenn auf Baustellen mit angenommenen Angeboten die Stunden in der Leistungserfassung auf Positionen verteilt
          werden und diese Positionen aus Stammpositionen stammen
        </div>
      ) : (
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, minWidth: 900 }}>
            <thead><tr>
              <th style={{ ...th, width: 28 }} /><th style={th}>Stammposition</th>
              <th style={{ ...th, textAlign: "right" }}>Baustellen</th><th style={{ ...th, textAlign: "right" }}>Soll-Std.</th>
              <th style={{ ...th, textAlign: "right" }}>Zeitansatz</th><th style={{ ...th, textAlign: "right" }}>Ist</th>
              <th style={{ ...th, textAlign: "right" }}>Abw.</th><th style={{ ...th, textAlign: "right" }}>Neu h/E</th><th style={th} />
            </tr></thead>
            <tbody>
              {sichtbar.map(e => {
                const k = ki.get(e.sp.id);
                const auf = offen === e.sp.id;
                const abw = e.faktor ? (e.faktor - 1) * 100 : null;
                return (
                  <Fragment key={e.sp.id}>
                    <tr>
                      <td style={td}>
                        <button onClick={() => setOffen(auf ? null : e.sp.id)} aria-expanded={auf} aria-label="Baustellen zeigen"
                          style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "var(--text2)", display: "flex" }}>
                          {auf ? <ChevronDown size={16} strokeWidth={1.5} /> : <ChevronRight size={16} strokeWidth={1.5} />}
                        </button>
                      </td>
                      <td style={{ ...td, maxWidth: 340 }}>
                        <div>{e.sp.bez}</div>
                        <div style={{ fontSize: 13, color: "var(--muted)" }}>{STATUS[e.status]}{e.eingeflosseneAnzahl ? ` · ${e.eingeflosseneAnzahl} schon eingeflossen` : ""}</div>
                        {k && <div style={{ fontSize: 13, color: "var(--text2)", marginTop: 4, lineHeight: 1.45 }}>
                          <span style={{ color: "var(--text)" }}>KI: {EMPFEHLUNG[k.empfehlung]}{k.zeitansatz ? ` ${z(k.zeitansatz)} h/${e.sp.einheit}` : ""}.</span> {k.erklaerung}
                          {k.ausreisser?.length > 0 && <> · Ausreißer: {k.ausreisser.join(", ")}</>}
                        </div>}
                      </td>
                      <td style={{ ...td, ...zahl, textAlign: "right" }}>{e.baustellen}</td>
                      <td style={{ ...td, ...zahl, textAlign: "right" }}>{z(e.sollErbracht, 1)}</td>
                      <td style={{ ...td, ...zahl, textAlign: "right", whiteSpace: "nowrap" }}>{z(e.aktuell)}</td>
                      <td style={{ ...td, ...zahl, textAlign: "right", whiteSpace: "nowrap" }}>{z(e.istJeE)}</td>
                      <td style={{ ...td, ...zahl, textAlign: "right", whiteSpace: "nowrap", color: abw == null ? "var(--muted)" : Math.abs(abw) > 15 ? "var(--red)" : Math.abs(abw) > 5 ? "var(--akzent)" : "var(--text2)" }}>
                        {abw == null ? "–" : `${abw > 0 ? "+" : ""}${z(abw, 0)} %`}
                      </td>
                      <td style={{ ...td, textAlign: "right" }}>
                        {e.status === "anpassen" && e.aktuell > 0 && (
                          <input value={werte[e.sp.id] ?? String(k?.zeitansatz ?? e.vorschlag).replace(".", ",")} inputMode="decimal"
                            aria-label={`Neuer Zeitansatz ${e.sp.bez}`} onChange={ev => setWerte(w => ({ ...w, [e.sp.id]: ev.target.value }))}
                            style={{ ...zahl, width: 72, height: 32, textAlign: "right", padding: "0 8px", border: "1px solid var(--border2)", borderRadius: 6, background: "var(--surface)", color: "var(--text)", fontSize: 14 }} />
                        )}
                        {e.status === "anpassen" && k?.zeitansatz && Math.abs(k.zeitansatz - e.vorschlag) > 0.0005 && (
                          <div style={{ ...zahl, fontSize: 12, color: "var(--muted)", marginTop: 4, whiteSpace: "nowrap" }}>aus Daten {z(e.vorschlag)}</div>
                        )}
                      </td>
                      <td style={td}>
                        {e.status === "anpassen" && e.aktuell > 0 && setStammpositionen && (
                          <button onClick={() => uebernehmen({ ...e, vorschlag: k?.zeitansatz ?? e.vorschlag })} style={knopf(true)}>Übernehmen</button>
                        )}
                      </td>
                    </tr>
                    {auf && (
                      <tr><td />
                        <td colSpan={8} style={{ padding: "0 8px 12px" }}>
                          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                            <thead><tr>
                              <th style={th}>Baustelle</th><th style={th}>Position</th><th style={{ ...th, textAlign: "right" }}>Erbracht</th>
                              <th style={{ ...th, textAlign: "right" }}>Kalkuliert h/E</th><th style={{ ...th, textAlign: "right" }}>Ist h/E</th><th style={{ ...th, textAlign: "right" }}>Ist-Std.</th>
                            </tr></thead>
                            <tbody>{e.beobachtungen.map(b => (
                              <tr key={b.key}>
                                <td style={{ padding: "6px 8px" }}>{b.projekt}</td>
                                <td style={{ padding: "6px 8px", color: "var(--text2)" }}><span style={zahl}>{b.oz}</span> {b.bez}</td>
                                <td style={{ padding: "6px 8px", ...zahl, textAlign: "right" }}>{z(b.mengeErbracht, 1)} {b.einheit} · {Math.round(b.prozent)} %</td>
                                <td style={{ padding: "6px 8px", ...zahl, textAlign: "right" }}>{z(b.sollJeE)}</td>
                                <td style={{ padding: "6px 8px", ...zahl, textAlign: "right" }}>{z(b.istJeE)}</td>
                                <td style={{ padding: "6px 8px", ...zahl, textAlign: "right" }}>{z(b.ist, 1)}</td>
                              </tr>
                            ))}</tbody>
                          </table>
                          {!e.beobachtungen.length && <div style={{ color: "var(--text2)", padding: "8px 0" }}>Alle Beobachtungen sind schon in den Zeitansatz eingeflossen</div>}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {!sichtbar.length && <tr><td colSpan={9} style={{ ...td, color: "var(--text2)", padding: 20 }}>Keine Stammpositionen in diesem Filter{filter === "zu_wenig" ? "" : filter === "anpassen" ? `. Unter ${MIN_SOLL} Soll-Stunden gibt es noch keinen Vorschlag` : ""}</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
