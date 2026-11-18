// KI-Spalte im Kalkulationsplatz: Assistent in Schritten, Vorkalkulation mit
// Prüfliste, Prüfung, LV-Risiken und Bieterfragen. Jeder Vorschlag zeigt
// Quelle, Sicherheit und Begründung und wird erst nach Bestätigung übernommen.
import { useMemo, useState } from "react";
import { Sparkles, Check, Copy, ChevronRight } from "lucide-react";
import { Knopf, Meldung, euro } from "./ui.jsx";
import { useStammdaten } from "./stammdaten.js";
import {
  kalkKatalog, zuVorkalkulieren, vorkalkulieren, vorschlagZuAenderung, vorschauEp, aenderungenBuendeln, quelleText,
  regelPruefungKalk, kiPruefenKalk, risikenPruefen,
} from "../lib/kalk/kiKalk.js";
import { RISIKO_ART, bieterfragenText } from "../lib/lvRisiken.js";

const REITER = [["assistent", "Assistent"], ["vorkalk", "Vorkalkulation"], ["pruefung", "Prüfung"], ["risiken", "LV-Risiken"]];
const SICHER_FARBE = { hoch: "var(--green)", mittel: "var(--akzent)", niedrig: "var(--red)" };
const SCHWERE_FARBE = { hoch: "var(--red)", mittel: "var(--akzent)", hinweis: "var(--text2)" };

function Chip({ farbe, children }) {
  return <span style={{ fontSize: 11.5, padding: "0 6px", borderRadius: 4, border: `1px solid ${farbe}`, color: farbe, whiteSpace: "nowrap" }}>{children}</span>;
}

export function KiPanel({ speicher, projekt, stand, knoten, ansaetze, z, saetze, gesperrt, anwenden, onFokus, onSchliessen }) {
  const sd = useStammdaten();
  const [reiter, setReiter] = useState("assistent");
  const [lauf, setLauf] = useState(null); // { was, schritt, von }
  const [fehler, setFehler] = useState(null);
  const [vk, setVk] = useState(null); // { vorschlaege: Map, kontext, auswahl: Set }
  const [pruef, setPruef] = useState(null); // { befunde, fehlend }
  const [risiko, setRisiko] = useState(null); // { risiken, fragen }
  const [schritt, setSchritt] = useState(0);
  const kontext = { projekt: { name: projekt.name, ort: projekt.ort }, angebotTitel: stand.bezeichnung, gewerke: sd.eigeneFirma?.gewerke || [] };
  const regeln = useMemo(() => regelPruefungKalk(knoten, ansaetze, z), [knoten, ansaetze, z]);
  const offen = useMemo(() => zuVorkalkulieren(knoten, ansaetze), [knoten, ansaetze]);
  const nachId = useMemo(() => new Map(knoten.map(k => [k.id, k])), [knoten]);

  if (!sd.rufeKi) {
    return <aside style={{ padding: 4 }}><Kopf onSchliessen={onSchliessen} /><Meldung>Die KI ist nur mit Anmeldung verfügbar.</Meldung></aside>;
  }

  const ausfuehren = async (was, fn) => {
    setFehler(null);
    setLauf({ was, schritt: 0, von: 0 });
    try { return await fn((schritt, von) => setLauf({ was, schritt, von })); }
    catch (e) { setFehler(`${was} fehlgeschlagen: ${e.message}`); return null; }
    finally { setLauf(null); }
  };

  const vorkalkulierenStarten = alle => ausfuehren("Vorkalkulation", async fort => {
    const positionen = zuVorkalkulieren(knoten, ansaetze, { alle });
    if (!positionen.length) { setFehler("Keine Positionen zu kalkulieren."); return null; }
    const vergleiche = speicher.vergleichsKalkulationen ? await speicher.vergleichsKalkulationen({ ausserProjekt: projekt.id }).catch(() => []) : [];
    const { katalog, vergleich } = kalkKatalog(sd, vergleiche);
    const vorschlaege = await vorkalkulieren({ positionen, katalog, kalkulationspreise: sd.kalkulationspreise, kontext, rufeKi: sd.rufeKi, onFortschritt: fort });
    const auswahl = new Set([...vorschlaege].filter(([, v]) => v.art !== "offen" && v.sicherheit !== "niedrig").map(([id]) => id));
    const ergebnis = { vorschlaege, vergleich, auswahl, vergleichAnzahl: vergleiche.length };
    setVk(ergebnis);
    return ergebnis;
  });

  const vkUebernehmen = (e = vk, nur = null) => {
    const ctx = { stammdaten: sd, vergleich: e.vergleich, bestehendeAnsaetze: ansaetze };
    const ids = nur || [...e.auswahl];
    const paket = aenderungenBuendeln(ids.map(id => vorschlagZuAenderung(nachId.get(id), e.vorschlaege.get(id), ctx)));
    if (!paket.aendern.length) return 0;
    anwenden(paket);
    const rest = new Map(e.vorschlaege);
    ids.forEach(id => rest.delete(id));
    setVk({ ...e, vorschlaege: rest, auswahl: new Set([...e.auswahl].filter(id => rest.has(id))) });
    return ids.length;
  };

  const pruefenStarten = () => ausfuehren("Prüfung", async fort => {
    const r = await kiPruefenKalk({ knoten, ansaetze, z, kontext, rufeKi: sd.rufeKi, onFortschritt: fort });
    setPruef(r);
    return r;
  });

  const risikenStarten = () => ausfuehren("LV-Prüfung", async fort => {
    const r = await risikenPruefen({ knoten, kontext, rufeKi: sd.rufeKi, onFortschritt: fort });
    setRisiko(r);
    return r;
  });

  const laeuft = lauf && (
    <div role="status" style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, color: "var(--text2)", padding: "8px 0" }}>
      <Sparkles size={14} color="var(--akzent)" /> {lauf.was} läuft{lauf.von > 1 ? ` · Teil ${lauf.schritt} von ${lauf.von}` : ""} …
    </div>
  );

  // ── Assistent ──
  const SCHRITTE = [
    { titel: "LV lesen", text: "Unklare Texte, Vertragsrisiken und Bieterfragen finden", fertig: !!risiko, ergebnis: risiko && `${risiko.risiken.length} Risiken, ${risiko.fragen.length} Bieterfragen`, los: risikenStarten, reiter: "risiken" },
    { titel: "Vorkalkulieren", text: `${offen.length} Positionen ohne Preis aus eigenen Kalkulationen, Bausteinen und Kostenbausteinen kalkulieren`, fertig: !!vk, ergebnis: vk && `${vk.vorschlaege.size} Vorschläge, ${vk.auswahl.size} vorausgewählt`, los: () => vorkalkulierenStarten(false), reiter: "vorkalk", aus: gesperrt || !offen.length && !vk },
    { titel: "Übernehmen", text: "Vorschläge mit hoher und mittlerer Sicherheit übernehmen", fertig: vk && vk.auswahl.size === 0, ergebnis: null, los: async () => (vk ? vkUebernehmen() : 0), reiter: "vorkalk", aus: gesperrt || !vk?.auswahl.size },
    { titel: "Prüfen", text: "Regeln und zweiter Blick der KI auf die fertige Kalkulation", fertig: !!pruef, ergebnis: pruef && `${regeln.length + pruef.befunde.length} Befunde, ${pruef.fehlend.length} fehlende Leistungen`, los: pruefenStarten, reiter: "pruefung" },
  ];

  return (
    <aside aria-label="KI" style={{ overflowY: "auto", minHeight: 0, display: "flex", flexDirection: "column", gap: 8 }}>
      <Kopf onSchliessen={onSchliessen} />
      <div role="tablist" style={{ display: "flex", gap: 2, padding: 2, background: "var(--surface2)", borderRadius: 8 }}>
        {REITER.map(([id, l]) => (
          <button key={id} role="tab" aria-selected={reiter === id} onClick={() => setReiter(id)}
            style={{ flex: 1, height: 26, border: "none", borderRadius: 6, font: "inherit", fontSize: 12.5, cursor: "pointer", whiteSpace: "nowrap",
              background: reiter === id ? "var(--surface)" : "transparent", color: reiter === id ? "var(--text)" : "var(--text2)", boxShadow: reiter === id ? "0 0 0 1px var(--border)" : "none" }}>{l}</button>
        ))}
      </div>
      {fehler && <Meldung art="fehler" onSchliessen={() => setFehler(null)}>{fehler}</Meldung>}
      {laeuft}

      {reiter === "assistent" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 13, color: "var(--text2)" }}>Aus der Ausschreibung ein kalkuliertes Angebot, Schritt für Schritt. Du siehst jedes Zwischenergebnis und entscheidest, was übernommen wird.</div>
          {SCHRITTE.map((s, i) => (
            <div key={s.titel} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 10, background: i === schritt ? "var(--surface)" : "transparent", opacity: s.aus && !s.fertig ? 0.6 : 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className="kb-zahl" style={{ width: 20, height: 20, borderRadius: 10, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 12,
                  background: s.fertig ? "var(--green)" : "var(--surface2)", color: s.fertig ? "var(--surface)" : "var(--text2)" }}>{s.fertig ? <Check size={12} /> : i + 1}</span>
                <strong style={{ fontWeight: 500, flex: 1 }}>{s.titel}</strong>
                {s.fertig && <button className="kb-knopf leise klein" onClick={() => setReiter(s.reiter)}>Ansehen <ChevronRight size={12} /></button>}
              </div>
              <div style={{ fontSize: 12.5, color: "var(--text2)", margin: "4px 0 0 28px" }}>{s.ergebnis || s.text}</div>
              {i === schritt && (
                <div style={{ margin: "8px 0 0 28px", display: "flex", gap: 6 }}>
                  <Knopf klein haupt disabled={!!lauf || s.aus} onClick={async () => { const r = await s.los(); if (r !== null) setSchritt(x => Math.min(SCHRITTE.length, x + 1)); }}>
                    {i === 2 ? `${vk?.auswahl.size || 0} übernehmen` : "Starten"}
                  </Knopf>
                  <Knopf klein leise disabled={!!lauf} onClick={() => setSchritt(x => x + 1)}>Überspringen</Knopf>
                </div>
              )}
            </div>
          ))}
          {schritt >= SCHRITTE.length && <Meldung art="ok">Fertig. Zuschläge und Zielpreis stellst du im Reiter „Zuschläge“ ein.</Meldung>}
        </div>
      )}

      {reiter === "vorkalk" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {!vk && (
            <>
              <div style={{ fontSize: 13, color: "var(--text2)" }}>Die KI wählt für jede Position eine Vorlage oder baut eine Rezeptur aus deinen Kostenbausteinen. Sie nennt keine Preise; die kommen aus deinen Daten.</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <Knopf klein haupt disabled={!!lauf || gesperrt || !offen.length} onClick={() => vorkalkulierenStarten(false)}>{offen.length} ohne Preis</Knopf>
                <Knopf klein disabled={!!lauf || gesperrt} onClick={() => { if (window.confirm("Alle Positionen neu vorkalkulieren? Übernommene Vorschläge ersetzen vorhandene Ansätze.")) vorkalkulierenStarten(true); }}>Alle Positionen</Knopf>
              </div>
            </>
          )}
          {vk && (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                <span style={{ flex: 1, color: "var(--text2)" }}>{vk.vorschlaege.size} Vorschläge{vk.vergleichAnzahl ? ` · Vorlagen aus ${vk.vergleichAnzahl} früheren Projekten` : ""}</span>
                <Knopf klein haupt disabled={gesperrt || !vk.auswahl.size} onClick={() => vkUebernehmen()}>{vk.auswahl.size} übernehmen</Knopf>
                <Knopf klein leise onClick={() => setVk(null)}>Neu</Knopf>
              </div>
              {[...vk.vorschlaege].map(([id, v]) => {
                const k = nachId.get(id);
                if (!k) return null;
                const ep = v.art !== "offen" ? vorschauEp(k, v, z, saetze, { stammdaten: sd, vergleich: vk.vergleich, bestehendeAnsaetze: ansaetze }) : null;
                const an = vk.auswahl.has(id);
                return (
                  <div key={id} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 8, background: "var(--surface)", fontSize: 13 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                      <input type="checkbox" checked={an} disabled={v.art === "offen" || gesperrt} aria-label={`Vorschlag ${k.oz} übernehmen`}
                        onChange={() => setVk(x => { const s = new Set(x.auswahl); if (s.has(id)) s.delete(id); else s.add(id); return { ...x, auswahl: s }; })} style={{ marginTop: 3 }} />
                      <button onClick={() => onFokus(id)} style={{ all: "unset", cursor: "pointer", flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          <span className="kb-zahl" style={{ color: "var(--muted)" }}>{k.oz}</span>
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{k.kurztext}</span>
                          {ep != null && <span className="kb-zahl">{euro(ep)}</span>}
                        </div>
                        <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 4, flexWrap: "wrap" }}>
                          {v.art === "offen" ? <Chip farbe="var(--muted)">offen</Chip> : <Chip farbe={SICHER_FARBE[v.sicherheit]}>Sicherheit {v.sicherheit}</Chip>}
                          <span style={{ color: "var(--text2)", fontSize: 12 }}>{quelleText(v, vk.vergleich)}</span>
                        </div>
                        <div style={{ color: "var(--text2)", fontSize: 12, marginTop: 4 }}>{v.begruendung}</div>
                        {v.fehlt?.length > 0 && <div style={{ color: "var(--akzent)", fontSize: 12, marginTop: 2 }}>Fehlt: {v.fehlt.join(", ")}</div>}
                      </button>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}

      {reiter === "pruefung" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ flex: 1, fontSize: 13, color: "var(--text2)" }}>{regeln.length} Befunde aus festen Regeln{pruef ? `, ${pruef.befunde.length} von der KI` : ""}</span>
            <Knopf klein haupt disabled={!!lauf} onClick={pruefenStarten}>{pruef ? "KI-Prüfung erneut" : "KI-Prüfung starten"}</Knopf>
          </div>
          {[...regeln, ...(pruef?.befunde || [])].map(b => (
            <button key={b.id} onClick={() => b.posId && onFokus(b.posId)} style={{ all: "unset", cursor: b.posId ? "pointer" : "default", border: "1px solid var(--border)", borderRadius: 8, padding: 8, background: "var(--surface)", fontSize: 13 }}>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <Chip farbe={SCHWERE_FARBE[b.schwere]}>{b.schwere}</Chip>
                <span className="kb-zahl" style={{ color: "var(--muted)" }}>{b.posId ? nachId.get(b.posId)?.oz : "Stand"}</span>
                <span style={{ color: "var(--muted)", fontSize: 12, marginLeft: "auto" }}>{b.quelle === "ki" ? "KI" : "Regel"}</span>
              </div>
              <div style={{ marginTop: 4 }}>{b.text}</div>
              {b.vorschlag && <div style={{ color: "var(--text2)", fontSize: 12, marginTop: 2 }}>{b.vorschlag}</div>}
            </button>
          ))}
          {pruef?.fehlend?.length > 0 && (
            <div style={{ fontSize: 13 }}>
              <div style={{ fontWeight: 500, margin: "8px 0 4px" }}>Möglicherweise fehlende Leistungen</div>
              {pruef.fehlend.map(f => <div key={f.text} style={{ padding: "2px 0" }}>{f.text}{f.begruendung && <span style={{ color: "var(--text2)" }}> · {f.begruendung}</span>}</div>)}
            </div>
          )}
          {!regeln.length && !pruef && <div style={{ fontSize: 13, color: "var(--muted)" }}>Die festen Regeln finden nichts. Die KI-Prüfung schaut zusätzlich auf Nebenleistungen, Zeitansätze und Widersprüche.</div>}
        </div>
      )}

      {reiter === "risiken" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ flex: 1, fontSize: 13, color: "var(--text2)" }}>{risiko ? `${risiko.risiken.length} Risiken, ${risiko.fragen.length} Bieterfragen` : "Vorbemerkungen und Positionstexte auf Risiken lesen"}</span>
            <Knopf klein haupt disabled={!!lauf} onClick={risikenStarten}>{risiko ? "Erneut" : "LV lesen"}</Knopf>
          </div>
          {risiko?.risiken.map(r => (
            <button key={r.id} onClick={() => r.posId && onFokus(r.posId)} style={{ all: "unset", cursor: r.posId ? "pointer" : "default", border: "1px solid var(--border)", borderRadius: 8, padding: 8, background: "var(--surface)", fontSize: 13 }}>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <Chip farbe={SCHWERE_FARBE[r.schwere]}>{RISIKO_ART[r.art]}</Chip>
                <span className="kb-zahl" style={{ color: "var(--muted)" }}>{r.oz || "Vorbemerkungen"}</span>
              </div>
              <div style={{ marginTop: 4 }}>{r.text}</div>
              {r.empfehlung && <div style={{ color: "var(--text2)", fontSize: 12, marginTop: 2 }}>{r.empfehlung}</div>}
            </button>
          ))}
          {risiko?.fragen.length > 0 && (
            <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 8, background: "var(--surface)", fontSize: 13 }}>
              <div style={{ display: "flex", alignItems: "center", marginBottom: 4 }}>
                <strong style={{ fontWeight: 500, flex: 1 }}>Bieterfragen</strong>
                <Knopf klein leise Icon={Copy} onClick={() => navigator.clipboard?.writeText(bieterfragenText(risiko.fragen, { projekt, angebotTitel: stand.bezeichnung, firma: sd.eigeneFirma }))}>Kopieren</Knopf>
              </div>
              <ol style={{ margin: 0, paddingLeft: 18 }}>{risiko.fragen.map(f => <li key={f.id} style={{ marginBottom: 4 }}>{f.oz && <span className="kb-zahl" style={{ color: "var(--muted)" }}>{f.oz} </span>}{f.frage}</li>)}</ol>
            </div>
          )}
        </div>
      )}
    </aside>
  );
}

function Kopf({ onSchliessen }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <Sparkles size={16} color="var(--akzent)" />
      <strong style={{ fontWeight: 500, flex: 1 }}>KI-Kalkulation</strong>
      <button className="kb-knopf leise klein" onClick={onSchliessen}>Schließen</button>
    </div>
  );
}
