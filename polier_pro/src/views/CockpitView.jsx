import { useEffect, useMemo, useState } from "react";
import { sbClientMitToken } from "../lib/supabase.js";
import { kennzahlen, stundenVerlauf, abschnittTeile } from "../lib/cockpit.js";
import { leistungsfaktor } from "../lib/nachkalkulation.js";

const eur = n => `${Math.round(n || 0).toLocaleString("de-DE")} €`;
const std = n => `${Math.round(n || 0).toLocaleString("de-DE")} h`;
const heuteIso = () => new Date().toISOString().slice(0, 10);
const zahlFont = { fontFamily: "var(--font-zahl)", fontVariantNumeric: "tabular-nums" };
const karte = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12 };

function letzterAbschnitt(projektId) {
  try { return JSON.parse(localStorage.getItem(`polaris.abschnitt.${projektId}`) || "null")?.log?.[0] || null; } catch { return null; }
}

function Achsblasen({ bereich }) {
  const { gruppen, rest } = abschnittTeile(bereich);
  if (!gruppen.length) return <span style={{ color: "var(--muted)" }}>{bereich}</span>;
  const blase = { display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 20, height: 20, padding: "0 4px", boxSizing: "border-box",
    borderRadius: 10, border: "1px solid var(--text)", fontSize: 11, lineHeight: 1, ...zahlFont };
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }} aria-label={`Abschnitt ${bereich}`}>
        {gruppen.map((g, i) => (
          <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            {i > 0 && <span style={{ color: "var(--muted)", margin: "0 4px" }}>/</span>}
            {g.map((t, j) => <span key={j} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              {j > 0 && <span style={{ color: "var(--muted)" }}>–</span>}<span style={blase}>{t}</span></span>)}
          </span>
        ))}
      </div>
      {rest && <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>{rest}</div>}
    </div>
  );
}

// Gestempelte Stunden (kumuliert je Woche) gegen kalkulierte Stunden:
// gesamt laut Auftrag (gestrichelt) und für die bisher erbrachte Leistung (Punkt heute).
function StundenDiagramm({ verlauf, sollErbracht, sollGesamt, label }) {
  const B = 720, H = 248, L = 56, R = 704, O = 16, U = 224;
  const max = Math.max(1, ...verlauf.map(v => v.stunden), sollErbracht || 0, sollGesamt || 0) * 1.08;
  const schritt = [100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000].find(s => max / s <= 5) || 20000;
  const x = i => L + i * ((R - L) / Math.max(1, verlauf.length - 1));
  const y = v => U - v / max * (U - O);
  const pfad = verlauf.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v.stunden).toFixed(1)}`).join(" ");
  const flaeche = `${pfad} L${x(verlauf.length - 1).toFixed(1)} ${U} L${L} ${U} Z`;
  const gitter = [];
  for (let v = 0; v <= max; v += schritt) gitter.push(v);
  const letzte = verlauf.length - 1;
  return (
    <svg viewBox={`0 0 ${B} ${H}`} role="img" aria-label={label} style={{ width: "100%", height: "auto", display: "block", marginTop: 16 }}>
      {gitter.map(v => (
        <g key={v}>
          <line x1={L} x2={R} y1={y(v)} y2={y(v)} stroke="var(--border)" />
          <text x={L - 8} y={y(v) + 4} textAnchor="end" fontFamily="IBM Plex Mono, monospace" fontSize="11" fill="var(--muted)">{v ? v.toLocaleString("de-DE") : "0"}</text>
        </g>
      ))}
      {verlauf.map((v, i) => (i % 3 === (letzte % 3)) && (
        <text key={i} x={x(i)} y={H - 4} textAnchor="middle" fontFamily="IBM Plex Mono, monospace" fontSize="11" fill="var(--muted)">KW {v.kw}</text>
      ))}
      {sollGesamt > 0 && <>
        <line x1={L} x2={R} y1={y(sollGesamt)} y2={y(sollGesamt)} stroke="var(--muted)" strokeDasharray="4 4" />
        <text x={L + 4} y={y(sollGesamt) - 6} fontFamily="IBM Plex Sans, sans-serif" fontSize="12" fill="var(--text2)">Kalkuliert für den ganzen Auftrag</text>
      </>}
      <path d={flaeche} fill="var(--akzent)" fillOpacity="0.08" />
      <path d={pfad} fill="none" stroke="var(--akzent)" strokeWidth="2" strokeLinejoin="round" />
      {sollErbracht > 0 && <>
        <line x1={x(letzte)} x2={x(letzte)} y1={y(sollErbracht)} y2={y(verlauf[letzte].stunden)} stroke="var(--text2)" strokeWidth="1" />
        <circle cx={x(letzte)} cy={y(sollErbracht)} r="4" fill="var(--text)" />
      </>}
      <circle cx={x(letzte)} cy={y(verlauf[letzte].stunden)} r="4" fill="var(--surface)" stroke="var(--akzent)" strokeWidth="2" />
    </svg>
  );
}

export function CockpitView({ session, projekte = [], kalkulationspreise = [], onProjektOeffnen }) {
  const [daten, setDaten] = useState({ angebote: [], rechnungen: [], baufortschritt: [] });
  const [laedt, setLaedt] = useState(true);
  const [fehler, setFehler] = useState("");
  const [diagrammId, setDiagrammId] = useState(null);
  const [buchungen, setBuchungen] = useState([]);
  const heute = heuteIso();
  const ids = projekte.map(p => p.id);

  useEffect(() => {
    if (!session?.access_token || !ids.length) { setLaedt(false); return; }
    let aktiv = true;
    const c = sbClientMitToken(session);
    Promise.all([
      c.from("angebote").select("id,projekt_id,titel,status,positionen,rabatt,interne_freigabe,nachtrag_zu,created_at").in("projekt_id", ids),
      c.from("rechnungen").select("*").in("projekt_id", ids),
      c.from("baufortschritt").select("*").in("projekt_id", ids),
    ]).then(([a, r, b]) => {
      if (!aktiv) return;
      if (a.error) setFehler("Angebote konnten nicht geladen werden.");
      setDaten({ angebote: a.data || [], rechnungen: r.data || [], baufortschritt: b.data || [] });
      setLaedt(false);
    });
    return () => { aktiv = false; };
  }, [session?.access_token, ids.join(",")]);

  const k = useMemo(() => kennzahlen({ projekte, ...daten, heute }), [projekte, daten, heute]);
  const laufend = k.baustellen.filter(b => !b.projekt.archiviert).sort((a, b) => b.auftragNetto - a.auftragNetto);
  const gewaehlt = diagrammId ?? laufend.find(b => b.auftragNetto > 0)?.projekt.id ?? laufend[0]?.projekt.id ?? null;

  useEffect(() => {
    if (!gewaehlt || !session?.access_token) { setBuchungen([]); return; }
    let aktiv = true;
    sbClientMitToken(session).from("zeitbuchungen").select("eingestempelt_at,netto_minuten,status").eq("projekt_id", gewaehlt)
      .then(({ data }) => { if (aktiv) setBuchungen(data || []); });
    return () => { aktiv = false; };
  }, [gewaehlt, session?.access_token]);

  const diagramm = useMemo(() => {
    const auftraege = daten.angebote.filter(a => String(a.projekt_id) === String(gewaehlt) && a.status === "angenommen");
    const fortschritt = {};
    for (const b of daten.baufortschritt) (fortschritt[b.angebot_id] ||= []).push(b);
    const lf = leistungsfaktor({ angebote: auftraege, fortschritt, zeitbuchungen: buchungen, kalkulationspreise });
    const voll = Object.fromEntries(auftraege.map(a => [a.id, (a.positionen || []).map(p => ({ position_id: p.id, prozent: 100 }))]));
    const gesamt = leistungsfaktor({ angebote: auftraege, fortschritt: voll, zeitbuchungen: [], kalkulationspreise }).sollStunden;
    return { verlauf: stundenVerlauf(buchungen), soll: lf.sollStunden, ist: lf.istStunden, faktor: lf.faktor, hinweis: lf.hinweis, gesamt };
  }, [daten, gewaehlt, buchungen, kalkulationspreise]);
  const projektName = projekte.find(p => String(p.id) === String(gewaehlt))?.name || "";

  const kpis = [
    { label: "Angebote offen", wert: eur(k.angeboteOffen.netto), sub: `${k.angeboteOffen.anzahl} Angebote${k.angeboteOffen.zurFreigabe ? `, ${k.angeboteOffen.zurFreigabe} warten auf Freigabe` : ""}`, farbe: "var(--text2)" },
    { label: "Auftragsbestand", wert: eur(k.auftragsbestand), sub: "beauftragt, noch nicht abgerechnet", farbe: "var(--text2)" },
    { label: "Forderungen offen", wert: eur(k.forderungen), sub: k.ueberfaellig.anzahl ? `davon ${eur(k.ueberfaellig.summe)} überfällig` : "nichts überfällig",
      farbe: k.ueberfaellig.anzahl ? "var(--red)" : "var(--green)" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {fehler && <div style={{ color: "var(--red)" }}>{fehler}</div>}
      <section aria-label="Kennzahlen" style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 16 }}>
        {kpis.map(x => (
          <div key={x.label} style={{ ...karte, padding: 20 }}>
            <div style={{ color: "var(--text2)" }}>{x.label}</div>
            <div style={{ ...zahlFont, fontSize: 24, lineHeight: "32px", fontWeight: 500, marginTop: 8 }}>{laedt ? "…" : x.wert}</div>
            <div style={{ fontSize: 13, color: x.farbe, marginTop: 4 }}>{x.sub}</div>
          </div>
        ))}
      </section>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "stretch" }}>
        <section aria-label="Stunden" style={{ ...karte, flex: "999 1 560px", minWidth: 0, padding: "20px 24px 16px" }}>
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 16, lineHeight: "24px", fontWeight: 500 }}>Stunden: gestempelt gegen kalkuliert</h2>
              <div style={{ color: "var(--text2)", marginTop: 4 }}>Gestempelte Stunden kumuliert je Woche, kalkulierte Stunden aus dem Auftrag</div>
            </div>
            {laufend.length > 0 && <label>
              <span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>Baustelle für das Diagramm</span>
              <select value={gewaehlt ?? ""} onChange={e => setDiagrammId(e.target.value)}
                style={{ height: 36, padding: "0 8px", borderRadius: 8, border: "1px solid var(--border2)", background: "var(--surface)", color: "var(--text)", fontFamily: "inherit", fontSize: 14 }}>
                {laufend.map(b => <option key={b.projekt.id} value={b.projekt.id}>{b.projekt.name}</option>)}
              </select>
            </label>}
          </div>
          <div style={{ display: "flex", gap: 32, marginTop: 20, flexWrap: "wrap" }}>
            <div><div style={{ fontSize: 13, color: "var(--text2)" }}>Gestempelt</div><div style={{ ...zahlFont, fontSize: 20, lineHeight: "28px", color: "var(--akzent)" }}>{std(diagramm.ist)}</div></div>
            <div><div style={{ fontSize: 13, color: "var(--text2)" }}>Kalkuliert für das Erbrachte</div><div style={{ ...zahlFont, fontSize: 20, lineHeight: "28px" }}>{std(diagramm.soll)}</div></div>
            <div><div style={{ fontSize: 13, color: "var(--text2)" }}>Faktor</div><div style={{ ...zahlFont, fontSize: 20, lineHeight: "28px",
              color: diagramm.faktor > 1.05 ? "var(--red)" : diagramm.faktor ? "var(--green)" : "var(--muted)" }}>{diagramm.faktor ? diagramm.faktor.toFixed(2).replace(".", ",") : "–"}</div></div>
            {diagramm.hinweis && <div style={{ maxWidth: 260, fontSize: 13, color: "var(--text2)", alignSelf: "flex-end" }}>{diagramm.hinweis}</div>}
          </div>
          {diagramm.ist > 0 || diagramm.gesamt > 0 ? <StundenDiagramm verlauf={diagramm.verlauf} sollErbracht={diagramm.soll} sollGesamt={diagramm.gesamt}
            label={`${projektName}: ${std(diagramm.ist)} gestempelt, ${std(diagramm.soll)} kalkuliert für die erbrachte Leistung, ${std(diagramm.gesamt)} für den ganzen Auftrag`} />
            : <div style={{ marginTop: 16, padding: "48px 24px", borderRadius: 8, background: "var(--bg)", color: "var(--text2)", textAlign: "center" }}>
                {laufend.length ? "Für diese Baustelle gibt es noch keine gestempelten Stunden und keinen kalkulierten Auftrag" : "Sobald eine Baustelle läuft, steht hier ihr Stundenverlauf"}
              </div>}
        </section>

        <aside style={{ flex: "1 1 320px", minWidth: 0, display: "flex", flexDirection: "column", gap: 16 }}>
          <section aria-label="Freigaben" style={{ ...karte, padding: 20 }}>
            <h2 style={{ margin: "0 0 8px", fontSize: 16, lineHeight: "24px", fontWeight: 500 }}>Wartet auf Freigabe</h2>
            {!k.freigaben.length && <div style={{ color: "var(--text2)", padding: "12px 0", borderTop: "1px solid var(--border)" }}>Nichts offen</div>}
            {k.freigaben.map(f => (
              <button key={f.angebot.id} className="desk-zeile" onClick={() => onProjektOeffnen?.(f.angebot.projekt_id, "angebot")}
                style={{ all: "unset", cursor: "pointer", display: "flex", justifyContent: "space-between", gap: 12, padding: "12px 0", borderTop: "1px solid var(--border)", width: "100%", boxSizing: "border-box" }}>
                <div><div style={{ fontWeight: 500 }}>{f.angebot.titel || "Angebot"}</div><div style={{ fontSize: 13, color: "var(--text2)" }}>{f.projekt?.name}</div></div>
                <div style={{ ...zahlFont, whiteSpace: "nowrap" }}>{eur(f.netto)}</div>
              </button>
            ))}
          </section>
          <section aria-label="Überfällige Forderungen" style={{ ...karte, padding: 20 }}>
            <h2 style={{ margin: 0, fontSize: 16, lineHeight: "24px", fontWeight: 500 }}>Überfällige Forderungen</h2>
            <div style={{ ...zahlFont, fontSize: 20, lineHeight: "28px", marginTop: 8, color: k.ueberfaellig.anzahl ? "var(--red)" : "var(--text)" }}>{eur(k.ueberfaellig.summe)}</div>
            <div style={{ fontSize: 13, color: "var(--text2)" }}>
              {k.ueberfaellig.anzahl ? `${k.ueberfaellig.anzahl} Rechnung${k.ueberfaellig.anzahl > 1 ? "en" : ""}, älteste seit ${k.ueberfaellig.aeltesteTage} Tagen fällig` : "Alle Rechnungen im Zahlungsziel"}
            </div>
            <button onClick={() => onProjektOeffnen?.(null, "finanzen")} style={{ all: "unset", cursor: "pointer", marginTop: 12, fontWeight: 500, textDecoration: "underline", textUnderlineOffset: 3 }}>Offene Posten ansehen</button>
          </section>
        </aside>
      </div>

      <section aria-label="Baustellen" style={karte}>
        <div style={{ padding: "16px 20px" }}><h2 style={{ margin: 0, fontSize: 16, lineHeight: "24px", fontWeight: 500 }}>Laufende Baustellen</h2></div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--text2)", fontSize: 13 }}>
                <th style={{ padding: "8px 20px", fontWeight: 400 }}>Baustelle</th>
                <th style={{ padding: "8px 12px", fontWeight: 400 }}>Bauleitung</th>
                <th style={{ padding: "8px 12px", fontWeight: 400 }}>Zuletzt gemeldet</th>
                <th style={{ padding: "8px 12px", fontWeight: 400 }}>Leistungsstand</th>
                <th style={{ padding: "8px 20px", fontWeight: 400, textAlign: "right" }}>Auftrag netto</th>
              </tr>
            </thead>
            <tbody>
              {laufend.map(b => {
                const meldung = letzterAbschnitt(b.projekt.id);
                const prozent = b.leistungsstand != null ? Math.round(b.leistungsstand * 100) : null;
                return (
                  <tr key={b.projekt.id} className="desk-zeile" onClick={() => onProjektOeffnen?.(b.projekt.id, "dashboard")}
                    style={{ borderTop: "1px solid var(--border)", cursor: "pointer" }}>
                    <td style={{ padding: "12px 20px" }}>
                      <button onClick={e => { e.stopPropagation(); onProjektOeffnen?.(b.projekt.id, "dashboard"); }}
                        style={{ all: "unset", cursor: "pointer", fontWeight: 500 }}>{b.projekt.name}</button>
                      {b.projekt.projektnummer && <div style={{ ...zahlFont, fontSize: 12, color: "var(--muted)" }}>{b.projekt.projektnummer}</div>}
                    </td>
                    <td style={{ padding: 12, color: "var(--text2)" }}>{b.projekt.bauleiter || "–"}</td>
                    <td style={{ padding: 12 }}>
                      {meldung ? <><Achsblasen bereich={meldung.bereich} /><div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>{new Date(meldung.datum).toLocaleDateString("de-DE")}</div></>
                        : <span style={{ color: "var(--muted)" }}>noch keine Meldung</span>}
                    </td>
                    <td style={{ padding: 12, width: 180 }}>
                      {prozent == null ? <span style={{ color: "var(--muted)" }}>kein Auftrag</span> : (
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ flexGrow: 1, height: 4, background: "var(--surface2)", borderRadius: 2, overflow: "hidden" }}>
                            <div style={{ height: 4, width: `${prozent}%`, background: "var(--text)" }} />
                          </div>
                          <span style={{ ...zahlFont, fontSize: 12, width: 36, textAlign: "right" }}>{prozent} %</span>
                        </div>
                      )}
                    </td>
                    <td style={{ padding: "12px 20px", textAlign: "right", ...zahlFont }}>{b.auftragNetto ? eur(b.auftragNetto) : "–"}</td>
                  </tr>
                );
              })}
              {!laufend.length && <tr><td colSpan={5} style={{ padding: 20, color: "var(--text2)" }}>Noch keine Baustellen angelegt</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
