import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Plus, Search, Trash2 } from "lucide-react";
import { useIstDesktop } from "../hooks/useIstDesktop.js";
import { geraetekostenJeStunde } from "../lib/kalkulationsgrundlagen.js";
import {
  PRUEFARTEN, GERAETE_STATUS, pruefStand, naechstePruefung, umsetzen, pruefungErledigt,
  tagessatz, mieteJeBaustelle, summeMiete, neuesGeraet,
} from "../lib/geraete.js";
import { useUngespeichert } from "../hooks/useUngespeichert.js";
import { verlassenBestaetigen } from "../lib/ungespeichert.js";

// Geräteverwaltung: Liste aller Geräte der Firma mit Standort und nächster
// Prüfung, rechts (Handy: darunter) das gewählte Gerät mit Umsetzen,
// Prüfungen, Kosten, Wartung und Einsatzhistorie. Logik in lib/geraete.js.

const heuteIso = () => new Date().toLocaleDateString("sv-SE");
const datumDe = s => s ? new Date(`${s}T12:00:00`).toLocaleDateString("de-DE") : "–";
const eur = n => (n || 0).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
const zahl = { fontFamily: "var(--font-zahl)", fontVariantNumeric: "tabular-nums" };
const STAND_FARBE = { ueberfaellig: "var(--red)", offen: "var(--red)", bald: "var(--akzent)", ok: "var(--green)" };
const STAND_TEXT = { ueberfaellig: "überfällig", offen: "nie geprüft", bald: "bald fällig", ok: "gültig" };

const feld = { boxSizing: "border-box", width: "100%", height: 36, padding: "0 10px", background: "var(--surface)", color: "var(--text)",
  border: "1px solid var(--border2)", borderRadius: 8, fontFamily: "inherit", fontSize: 14 };
const knopf = (haupt = false) => ({ height: 36, padding: "0 14px", borderRadius: 8, fontFamily: "inherit", fontSize: 14, cursor: "pointer",
  display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap",
  border: haupt ? "none" : "1px solid var(--border2)", background: haupt ? "var(--text)" : "var(--surface)", color: haupt ? "var(--surface)" : "var(--text)",
  fontWeight: haupt ? 500 : 400 });
const abschnitt = { borderTop: "1px solid var(--border)", paddingTop: 16, marginTop: 16 };
const abschnittTitel = { fontSize: 13, color: "var(--text2)", marginBottom: 8 };
const label = { display: "block", fontSize: 13, color: "var(--text2)", marginBottom: 4 };

function Punkt({ stand }) {
  return <span aria-hidden="true" style={{ display: "inline-block", width: 6, height: 6, borderRadius: 3, background: STAND_FARBE[stand] || "var(--border2)", flexShrink: 0 }} />;
}

export function GeraeteView({ geraeteApi, projekte = [], grundlagen, darfBearbeiten = true, darfStammdaten = true, land = "NW" }) {
  const { geraete, fehler, speichern, loeschen } = geraeteApi;
  const istDesktop = useIstDesktop();
  const heute = heuteIso();
  const [filter, setFilter] = useState("alle");
  const [suche, setSuche] = useState("");
  const [auswahlId, setAuswahlId] = useState(null);
  const [entwurf, setEntwurf] = useState(null);
  const [geaendert, setGeaendert] = useState(false);
  const [umsetzenNach, setUmsetzenNach] = useState("");
  const [umsetzenAm, setUmsetzenAm] = useState(heute);
  const [wartung, setWartung] = useState({ datum: heute, text: "", kosten: "" });
  const [meldung, setMeldung] = useState(null);

  const projektName = id => projekte.find(p => String(p.id) === String(id))?.name || "Baustelle";
  const aktiveProjekte = projekte.filter(p => !p.archiviert);

  const zeilen = useMemo(() => geraete.map(g => ({ g, pruef: naechstePruefung(g, heute) }))
    .sort((a, b) => (a.g.inventarnr || "").localeCompare(b.g.inventarnr || "", "de", { numeric: true }) || a.g.bezeichnung.localeCompare(b.g.bezeichnung, "de")),
  [geraete, heute]);
  const faellig = z => z.pruef && z.pruef.stand !== "ok";
  const FILTER = [
    ["alle", "Alle", z => z.g.status !== "ausgemustert"],
    ["einsatz", "Auf Baustellen", z => z.g.status === "einsatz"],
    ["verfuegbar", "Bauhof", z => z.g.status === "verfuegbar"],
    ["werkstatt", "Werkstatt", z => z.g.status === "werkstatt"],
    ["pruefung", "Prüfung fällig", z => z.g.status !== "ausgemustert" && faellig(z)],
    ["ausgemustert", "Ausgemustert", z => z.g.status === "ausgemustert"],
  ];
  const filterFn = FILTER.find(f => f[0] === filter)[2];
  const q = suche.trim().toLowerCase();
  const sichtbar = zeilen.filter(filterFn).filter(z => !q || [z.g.bezeichnung, z.g.inventarnr, z.g.kategorie, z.g.projekt_id && projektName(z.g.projekt_id)]
    .some(t => String(t || "").toLowerCase().includes(q)));

  // Gewähltes Gerät in den Entwurf übernehmen, wenn sich Auswahl oder gespeicherte Fassung ändert
  const gespeichert = geraete.find(g => g.id === auswahlId) || null;
  useEffect(() => {
    if (auswahlId === "neu") return;
    setEntwurf(gespeichert ? structuredClone(gespeichert) : null);
    setGeaendert(false);
    setUmsetzenNach(gespeichert?.projekt_id ? String(gespeichert.projekt_id) : "");
    setUmsetzenAm(heute);
  }, [auswahlId, gespeichert]);

  const aendern = teil => { setEntwurf(e => ({ ...e, ...teil })); setGeaendert(true); };
  const neuAnlegen = async () => { if (geaendert && !(await verlassenBestaetigen())) return; setAuswahlId("neu"); setEntwurf(neuesGeraet()); setGeaendert(false); setMeldung(null); };
  async function sichern(g = entwurf, text = "Gespeichert") {
    if (!g.bezeichnung?.trim()) { setMeldung("Bitte eine Bezeichnung eintragen"); return false; }
    const neu = await speichern(g);
    if (neu) { setAuswahlId(neu.id); setEntwurf(structuredClone(neu)); setGeaendert(false); setMeldung(text); }
    return !!neu;
  }
  // Ungespeicherte Änderungen: Rückfrage beim Wechsel des Geräts und beim Verlassen
  useUngespeichert(geaendert && !!entwurf, { titel: `Das Gerät „${entwurf?.bezeichnung || "neu"}“`, speichern: () => sichern() });
  const waehlen = async id => { if (geaendert && !(await verlassenBestaetigen())) return; setGeaendert(false); setAuswahlId(id); setMeldung(null); };
  const umsetzenKlick = () => sichern(umsetzen(entwurf, umsetzenNach ? Number(umsetzenNach) : null, umsetzenAm),
    umsetzenNach ? `Umgesetzt auf ${projektName(umsetzenNach)}` : "Zurück auf dem Bauhof");
  const geprueft = art => sichern(pruefungErledigt(entwurf, art, heute), "Prüfung eingetragen");

  // ── Liste ──
  const liste = (
    <div style={{ minWidth: 0, flex: 1 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
        <label style={{ position: "relative", display: "block", flex: istDesktop ? "0 1 320px" : 1 }}>
          <Search size={16} strokeWidth={1.5} style={{ position: "absolute", left: 10, top: 10, color: "var(--muted)" }} />
          <input value={suche} onChange={e => setSuche(e.target.value)} placeholder="Gerät, Inventarnummer oder Baustelle" aria-label="Geräte suchen"
            style={{ ...feld, paddingLeft: 32 }} />
        </label>
        {darfStammdaten && <button onClick={neuAnlegen} style={{ ...knopf(true), marginLeft: "auto" }}><Plus size={16} strokeWidth={1.5} /> Gerät</button>}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap", marginBottom: 16 }}>
        {FILTER.map(([k, l, fn]) => {
          const n = zeilen.filter(fn).length;
          if (k === "ausgemustert" && !n) return null;
          return (
            <button key={k} className="desk-nav" aria-pressed={filter === k} onClick={() => setFilter(k)}
              style={{ height: 32, padding: "0 12px", borderRadius: 6, border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 14,
                background: filter === k ? "var(--surface2)" : "none", color: filter === k ? "var(--text)" : "var(--text2)", fontWeight: filter === k ? 500 : 400,
                display: "flex", gap: 6 }}>
              {l} <span style={{ ...zahl, color: k === "pruefung" && n ? "var(--red)" : "var(--muted)" }}>{n}</span>
            </button>
          );
        })}
      </div>

      {fehler && <div role="alert" style={{ color: "var(--red)", background: "var(--rbg)", borderRadius: 8, padding: "8px 12px", marginBottom: 12, fontSize: 13 }}>{fehler}</div>}

      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, overflow: "clip" }}>
        {sichtbar.length === 0 ? (
          <div style={{ padding: "32px 20px", color: "var(--text2)" }}>
            {geraete.length === 0 ? "Noch keine Geräte. Mit „Gerät“ das erste anlegen, mit Inventarnummer, Prüffristen und Tagessatz für die interne Miete" : "Keine Geräte für diesen Filter"}
          </div>
        ) : istDesktop ? (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--text2)", fontSize: 13 }}>
                {["Inv.-Nr.", "Gerät", "Standort", "Nächste Prüfung", "Tagessatz"].map((h, i) => (
                  <th key={h} style={{ padding: "10px 8px", paddingLeft: i === 0 ? 16 : 8, paddingRight: i === 4 ? 16 : 8, fontWeight: 400,
                    borderBottom: "1px solid var(--border2)", textAlign: i === 4 ? "right" : "left", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sichtbar.map(({ g, pruef }) => {
                const aktiv = g.id === auswahlId;
                return (
                  <tr key={g.id} className="desk-zeile" onClick={() => waehlen(g.id)}
                    style={{ borderTop: "1px solid var(--border)", cursor: "pointer", background: aktiv ? "var(--bg)" : undefined,
                      boxShadow: aktiv ? "inset 2px 0 0 var(--akzent)" : undefined }}>
                    <td style={{ padding: "10px 8px 10px 16px", ...zahl, fontSize: 13, color: "var(--text2)", whiteSpace: "nowrap" }}>{g.inventarnr || "–"}</td>
                    <td style={{ padding: "10px 8px" }}>{g.bezeichnung}{g.kategorie && <span style={{ color: "var(--muted)" }}> · {g.kategorie}</span>}</td>
                    <td style={{ padding: "10px 8px", color: g.status === "einsatz" ? "var(--text)" : "var(--text2)" }}>
                      {g.status === "einsatz" ? projektName(g.projekt_id) : GERAETE_STATUS[g.status]}
                    </td>
                    <td style={{ padding: "10px 8px" }}>
                      {pruef ? (
                        <>
                          <span style={{ display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap" }}>
                            <Punkt stand={pruef.stand} />
                            <span style={{ ...zahl, fontSize: 13 }}>{pruef.faellig ? datumDe(pruef.faellig) : "nie geprüft"}</span>
                            {pruef.faellig && pruef.stand !== "ok" && <span style={{ fontSize: 13, color: STAND_FARBE[pruef.stand] }}>{STAND_TEXT[pruef.stand]}</span>}
                          </span>
                          <span style={{ display: "block", marginLeft: 14, fontSize: 13, color: "var(--muted)" }}>{pruef.label}</span>
                        </>
                      ) : <span style={{ color: "var(--muted)" }}>keine</span>}
                    </td>
                    <td style={{ padding: "10px 16px 10px 8px", textAlign: "right", ...zahl, whiteSpace: "nowrap" }}>{tagessatz(g, grundlagen) ? eur(tagessatz(g, grundlagen)) : "–"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          sichtbar.map(({ g, pruef }, i) => (
            <button key={g.id} onClick={() => waehlen(g.id)}
              style={{ display: "flex", width: "100%", textAlign: "left", gap: 12, alignItems: "center", padding: "12px 14px", background: "none", border: "none",
                borderTop: i ? "1px solid var(--border)" : "none", fontFamily: "inherit", color: "var(--text)", cursor: "pointer" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15 }}>{g.bezeichnung} <span style={{ ...zahl, color: "var(--muted)", fontSize: 13 }}>{g.inventarnr}</span></div>
                <div style={{ fontSize: 13, color: "var(--text2)", marginTop: 2 }}>{g.status === "einsatz" ? projektName(g.projekt_id) : GERAETE_STATUS[g.status]}</div>
              </div>
              {pruef && pruef.stand !== "ok" && <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--text2)" }}><Punkt stand={pruef.stand} />{STAND_TEXT[pruef.stand]}</span>}
            </button>
          ))
        )}
      </div>
    </div>
  );

  // ── Detail ──
  const detail = entwurf && (() => {
    const g = entwurf;
    const stand = pruefStand(g, heute);
    const grund = (grundlagen?.geraete || []).find(x => String(x.id) === String(g.grundlage_id));
    const satz = tagessatz(g, grundlagen);
    const erster = (g.einsaetze || []).map(e => e.von).sort()[0];
    const miete = erster ? mieteJeBaustelle([g], grundlagen, { von: erster, bis: heute, land }) : [];
    const fehlendeArten = PRUEFARTEN.filter(p => !(g.pruefungen || []).some(x => x.art === p.art));
    const nurLesen = !darfBearbeiten;
    const stamm = !darfStammdaten || nurLesen;
    return (
      <div>
        {!istDesktop && (
          <button onClick={async () => { if (geaendert && !(await verlassenBestaetigen())) return; setGeaendert(false); setAuswahlId(null); setEntwurf(null); }} style={{ ...knopf(), border: "none", background: "none", paddingLeft: 0, marginBottom: 8, color: "var(--text2)" }}>
            <ArrowLeft size={16} strokeWidth={1.5} /> Alle Geräte
          </button>
        )}
        <input value={g.bezeichnung} disabled={stamm} onChange={e => aendern({ bezeichnung: e.target.value })} placeholder="Bezeichnung, z. B. Mobilbagger 14 t" aria-label="Bezeichnung"
          className="desk-feld" style={{ ...feld, height: 40, fontSize: 18, fontWeight: 500, border: "1px solid transparent", padding: "0 6px", marginLeft: -6, width: "calc(100% + 6px)" }} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
          <div><label style={label}>Inventarnummer</label><input value={g.inventarnr || ""} disabled={stamm} onChange={e => aendern({ inventarnr: e.target.value })} style={{ ...feld, ...zahl }} /></div>
          <div><label style={label}>Kategorie</label><input value={g.kategorie || ""} disabled={stamm} onChange={e => aendern({ kategorie: e.target.value })} placeholder="Erdbau, Hebezeug …" style={feld} /></div>
        </div>

        {g.id && (
          <div style={abschnitt}>
            <div style={abschnittTitel}>Standort</div>
            <div style={{ marginBottom: 8 }}>
              {g.status === "einsatz"
                ? <>Seit <span style={zahl}>{datumDe((g.einsaetze || []).find(e => !e.bis)?.von)}</span> auf {projektName(g.projekt_id)}</>
                : GERAETE_STATUS[g.status]}
            </div>
            {!nurLesen && g.status !== "ausgemustert" && (
              <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 8, alignItems: "end" }}>
                <div style={{ gridColumn: "1 / -1" }}><label style={label}>Umsetzen auf</label>
                  <select value={umsetzenNach} onChange={e => setUmsetzenNach(e.target.value)} style={feld}>
                    <option value="">Bauhof</option>
                    {aktiveProjekte.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div><label style={label}>ab</label><input type="date" value={umsetzenAm} onChange={e => setUmsetzenAm(e.target.value)} style={{ ...feld, ...zahl }} /></div>
                <button onClick={umsetzenKlick} disabled={String(umsetzenNach) === String(g.projekt_id ?? "")} style={knopf()}>Umsetzen</button>
              </div>
            )}
          </div>
        )}

        <div style={abschnitt}>
          <div style={abschnittTitel}>Prüfungen</div>
          {stand.length === 0 && <div style={{ color: "var(--muted)", marginBottom: 8 }}>Keine Prüfungen hinterlegt</div>}
          {stand.map(p => (
            <div key={p.art} style={{ display: "grid", gridTemplateColumns: "96px minmax(0,1fr) auto", gap: 8, alignItems: "center", marginBottom: 12 }}>
              <div style={{ minWidth: 0, gridColumn: "1 / -1" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}><Punkt stand={p.stand} />{p.label}</div>
                <div style={{ fontSize: 13, color: "var(--text2)", marginLeft: 14 }}>
                  {p.faellig ? <>fällig <span style={zahl}>{datumDe(p.faellig)}</span>{p.stand !== "ok" && `, ${STAND_TEXT[p.stand]}`}</> : STAND_TEXT[p.stand]}
                </div>
              </div>
              <label title="Intervall in Monaten" style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <input type="number" min="1" value={p.intervall_monate || ""} disabled={stamm} aria-label={`${p.label}: Intervall in Monaten`}
                  onChange={e => aendern({ pruefungen: g.pruefungen.map(x => x.art === p.art ? { ...x, intervall_monate: Number(e.target.value) || null } : x) })}
                  style={{ ...feld, ...zahl, padding: "0 6px", textAlign: "right" }} /><span style={{ fontSize: 13, color: "var(--muted)" }}>Mon.</span>
              </label>
              <input type="date" value={p.zuletzt || ""} disabled={nurLesen} aria-label={`${p.label}: zuletzt geprüft`}
                onChange={e => aendern({ pruefungen: g.pruefungen.map(x => x.art === p.art ? { ...x, zuletzt: e.target.value || null } : x) })}
                style={{ ...feld, ...zahl, padding: "0 6px" }} />
              {!nurLesen && g.id ? <button onClick={() => geprueft(p.art)} title="Heute geprüft" style={{ ...knopf(), padding: "0 10px" }}>Heute</button> : <span />}
            </div>
          ))}
          {!stamm && fehlendeArten.length > 0 && (
            <select value="" aria-label="Prüfung hinzufügen" onChange={e => {
              const a = PRUEFARTEN.find(p => p.art === e.target.value);
              if (a) aendern({ pruefungen: [...(g.pruefungen || []), { art: a.art, intervall_monate: a.monate, zuletzt: null }] });
            }} style={{ ...feld, width: "auto", color: "var(--text2)" }}>
              <option value="">Prüfung hinzufügen</option>
              {fehlendeArten.map(p => <option key={p.art} value={p.art}>{p.label} ({p.monate} Monate)</option>)}
            </select>
          )}
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 8 }}>Intervalle sind Vorschläge, verbindlich sind Gefährdungsbeurteilung und Herstellerangaben (BetrSichV)</div>
        </div>

        <div style={abschnitt}>
          <div style={abschnittTitel}>Interne Miete</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 88px", gap: 8 }}>
            <div><label style={label}>Kalkulationsgerät (BGL)</label>
              <select value={g.grundlage_id ?? ""} disabled={stamm} onChange={e => aendern({ grundlage_id: e.target.value ? Number(e.target.value) : null })} style={feld}>
                <option value="">keins</option>
                {(grundlagen?.geraete || []).filter(x => x.bez).map(x => <option key={x.id} value={x.id}>{x.bez} · {eur(geraetekostenJeStunde(x).gesamt)}/h</option>)}
              </select>
            </div>
            <div><label style={label}>h je Tag</label><input type="number" min="1" value={g.stunden_je_tag ?? 8} disabled={stamm} onChange={e => aendern({ stunden_je_tag: Number(e.target.value) || 8 })} style={{ ...feld, ...zahl, textAlign: "right" }} /></div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8, alignItems: "end" }}>
            <div><label style={label}>Eigener Tagessatz</label>
              <input type="number" min="0" step="0.01" value={g.tagessatz ?? ""} disabled={stamm} placeholder={grund ? "aus BGL" : "€ je Tag"}
                onChange={e => aendern({ tagessatz: e.target.value === "" ? null : Number(e.target.value) })} style={{ ...feld, ...zahl, textAlign: "right" }} /></div>
            <div style={{ paddingBottom: 8 }}><span style={{ color: "var(--text2)", fontSize: 13 }}>Gilt: </span><span style={{ ...zahl, fontWeight: 500 }}>{satz ? eur(satz) : "–"}</span><span style={{ color: "var(--muted)", fontSize: 13 }}> je Arbeitstag</span></div>
          </div>
        </div>

        {miete.length > 0 && (
          <div style={abschnitt}>
            <div style={abschnittTitel}>Einsätze</div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <tbody>
                {miete.slice().reverse().map((z, i) => (
                  <tr key={i} style={{ borderTop: i ? "1px solid var(--border)" : "none" }}>
                    <td style={{ padding: "6px 0" }}>{projektName(z.projekt_id)}<div style={{ color: "var(--muted)", ...zahl }}>{datumDe(z.von)} – {datumDe(z.bis)}</div></td>
                    <td style={{ padding: "6px 0", textAlign: "right", ...zahl, color: "var(--text2)" }}>{z.tage} T</td>
                    <td style={{ padding: "6px 0 6px 12px", textAlign: "right", ...zahl }}>{eur(z.betrag)}</td>
                  </tr>
                ))}
                <tr style={{ borderTop: "1px solid var(--border2)" }}>
                  <td style={{ padding: "6px 0", color: "var(--text2)" }}>Summe interne Miete</td><td />
                  <td style={{ padding: "6px 0 6px 12px", textAlign: "right", ...zahl, fontWeight: 500 }}>{eur(summeMiete(miete))}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        <div style={abschnitt}>
          <div style={abschnittTitel}>Wartung und Reparaturen</div>
          {(g.wartungen || []).slice().sort((a, b) => b.datum.localeCompare(a.datum)).map((w, i) => (
            <div key={i} style={{ display: "flex", gap: 12, padding: "6px 0", borderTop: i ? "1px solid var(--border)" : "none", fontSize: 13 }}>
              <span style={{ ...zahl, color: "var(--text2)" }}>{datumDe(w.datum)}</span>
              <span style={{ flex: 1 }}>{w.text}</span>
              {Number(w.kosten) > 0 && <span style={zahl}>{eur(Number(w.kosten))}</span>}
            </div>
          ))}
          {!nurLesen && (
            <div style={{ display: "grid", gridTemplateColumns: "132px 1fr 96px auto", gap: 8, marginTop: 8 }}>
              <input type="date" value={wartung.datum} onChange={e => setWartung(w => ({ ...w, datum: e.target.value }))} aria-label="Datum" style={{ ...feld, ...zahl, padding: "0 6px" }} />
              <input value={wartung.text} onChange={e => setWartung(w => ({ ...w, text: e.target.value }))} placeholder="Ölwechsel, Hydraulikschlauch …" aria-label="Arbeit" style={feld} />
              <input type="number" min="0" step="0.01" value={wartung.kosten} onChange={e => setWartung(w => ({ ...w, kosten: e.target.value }))} placeholder="€" aria-label="Kosten" style={{ ...feld, ...zahl, textAlign: "right" }} />
              <button disabled={!wartung.text.trim()} onClick={() => {
                aendern({ wartungen: [...(g.wartungen || []), { datum: wartung.datum, text: wartung.text.trim(), kosten: Number(wartung.kosten) || 0 }] });
                setWartung({ datum: heute, text: "", kosten: "" });
              }} style={{ ...knopf(), padding: "0 10px" }} aria-label="Wartung eintragen"><Plus size={16} strokeWidth={1.5} /></button>
            </div>
          )}
        </div>

        <div style={abschnitt}>
          <label style={label}>Notiz</label>
          <textarea value={g.notiz || ""} disabled={nurLesen} onChange={e => aendern({ notiz: e.target.value })} rows={2} style={{ ...feld, height: "auto", padding: "8px 10px", resize: "vertical" }} />
        </div>

        {!nurLesen && (
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", ...abschnitt }}>
            <button onClick={() => sichern()} disabled={!geaendert} style={{ ...knopf(geaendert), opacity: geaendert ? 1 : 0.6 }}>Speichern</button>
            {g.id && g.status !== "einsatz" && (
              <select value={g.status} aria-label="Status" onChange={e => sichern({ ...g, status: e.target.value }, "Status geändert")} style={{ ...feld, width: "auto" }}>
                <option value="verfuegbar">Bauhof</option>
                <option value="werkstatt">Werkstatt</option>
                <option value="ausgemustert">Ausgemustert</option>
              </select>
            )}
            {meldung && <span style={{ fontSize: 13, color: "var(--text2)" }}>{meldung}</span>}
            {g.id && darfStammdaten && (
              <button onClick={async () => { if (window.confirm(`„${g.bezeichnung}“ endgültig löschen? Die Einsatzhistorie geht verloren, besser „Ausgemustert“ setzen.`) && await loeschen(g.id)) { setAuswahlId(null); setEntwurf(null); } }}
                style={{ ...knopf(), marginLeft: "auto", border: "none", background: "none", color: "var(--muted)", padding: "0 6px" }} aria-label="Gerät löschen"><Trash2 size={16} strokeWidth={1.5} /></button>
            )}
          </div>
        )}
      </div>
    );
  })();

  if (!istDesktop) return <div className="eigen-felder">{detail ? <div style={{ background: "var(--surface)", borderRadius: 12, padding: 16 }}>{detail}</div> : liste}</div>;

  return (
    <div className="eigen-felder" style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
      {liste}
      <aside style={{ flex: "0 0 400px", position: "sticky", top: 16, maxHeight: "calc(100vh - 32px)", overflowY: "auto", boxSizing: "border-box",
        background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 20 }}>
        {detail || <div style={{ color: "var(--text2)", lineHeight: "20px" }}>Ein Gerät anklicken, um es umzusetzen, Prüfungen einzutragen oder die Einsätze und die interne Miete zu sehen</div>}
      </aside>
    </div>
  );
}
