import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Plus, Printer, X } from "lucide-react";
import { useIstDesktop } from "../hooks/useIstDesktop.js";
import { UnterschriftPad } from "../components/UnterschriftPad.jsx";
import { escapeHtml } from "../lib/utils.js";
import { tagessatz } from "../lib/geraete.js";
import {
  REGIE_STANDARD, regieSummen, regieStand, abrechenbar, naechsteNummer, regieAlsPositionen, leererBericht, regieHtml,
} from "../lib/regie.js";

// Regieberichte (Stundenlohnzettel) einer Baustelle: links die Liste mit
// Rückgabefrist nach § 15 VOB/B, rechts (Handy: eigene Seite) der Bericht mit
// Personal, Geräten, Material, Unterschrift des Auftraggebers und Druck.
// Unterschriebene oder als anerkannt geltende Berichte werden gesammelt als
// Nachtrag abgerechnet. Logik in lib/regie.js.

const heuteIso = () => new Date().toLocaleDateString("sv-SE");
const datumDe = s => s ? new Date(`${s}T12:00:00`).toLocaleDateString("de-DE") : "–";
const eur = n => (n || 0).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
const zahlFmt = n => (Number(n) || 0).toLocaleString("de-DE", { maximumFractionDigits: 2 });
const zahl = { fontFamily: "var(--font-zahl)", fontVariantNumeric: "tabular-nums" };
const STAND_FARBE = { entwurf: "var(--border2)", offen: "var(--akzent)", anerkannt: "var(--green)", beanstandet: "var(--red)", abgerechnet: "var(--muted)" };

const feld = { boxSizing: "border-box", width: "100%", height: 36, padding: "0 10px", background: "var(--surface)", color: "var(--text)",
  border: "1px solid var(--border2)", borderRadius: 8, fontFamily: "inherit", fontSize: 14 };
const knopf = (haupt = false) => ({ height: 36, padding: "0 14px", borderRadius: 8, fontFamily: "inherit", fontSize: 14, cursor: "pointer",
  display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap", fontWeight: haupt ? 500 : 400,
  border: haupt ? "none" : "1px solid var(--border2)", background: haupt ? "var(--text)" : "var(--surface)", color: haupt ? "var(--surface)" : "var(--text)" });
const leise = { ...knopf(), border: "none", background: "none", color: "var(--text2)", padding: "0 6px" };
const abschnitt = { borderTop: "1px solid var(--border)", paddingTop: 16, marginTop: 16 };
const titel = { fontSize: 13, color: "var(--text2)", marginBottom: 8 };
const label = { display: "block", fontSize: 13, color: "var(--text2)", marginBottom: 4 };

function Punkt({ stand }) {
  return <span aria-hidden="true" style={{ display: "inline-block", width: 6, height: 6, borderRadius: 3, background: STAND_FARBE[stand], flexShrink: 0 }} />;
}

// Tabelle mit bearbeitbaren Zeilen (Personal, Geräte, Material)
function Zeilen({ spalten, zeilen, onAendern, gesperrt, neu, hinzuLabel, extra }) {
  const setze = (i, k, v) => onAendern(zeilen.map((z, j) => j === i ? { ...z, [k]: v } : z));
  return (
    <div>
      {zeilen.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: spalten.map(s => s.breite).join(" ") + " 28px", gap: 6, alignItems: "center" }}>
          {spalten.map(s => <div key={s.k} style={{ fontSize: 12, color: "var(--muted)", textAlign: s.rechts ? "right" : "left" }}>{s.l}</div>)}<div />
          {zeilen.map((z, i) => [
            ...spalten.map(s => s.render ? <div key={s.k + i} style={{ textAlign: "right", ...zahl, fontSize: 13 }}>{s.render(z)}</div> : s.optionen ? (
              <select key={s.k + i} value={z[s.k] ?? ""} disabled={gesperrt} onChange={e => setze(i, s.k, e.target.value)} style={{ ...feld, padding: "0 6px" }} aria-label={s.l}>
                {s.optionen.map(o => <option key={o}>{o}</option>)}
              </select>
            ) : (
              <input key={s.k + i} value={s.zahl ? String(z[s.k] ?? "").replace(".", ",") : z[s.k] ?? ""} disabled={gesperrt} list={s.liste} inputMode={s.zahl ? "decimal" : undefined} aria-label={s.l}
                onChange={e => setze(i, s.k, s.zahl ? e.target.value.replace(",", ".") : e.target.value)}
                style={{ ...feld, padding: "0 6px", ...(s.zahl ? { ...zahl, textAlign: "right" } : {}) }} />
            )),
            gesperrt ? <div key={"x" + i} /> : (
              <button key={"x" + i} onClick={() => onAendern(zeilen.filter((_, j) => j !== i))} aria-label="Zeile entfernen"
                style={{ ...leise, height: 28, width: 28, padding: 0, justifyContent: "center", color: "var(--muted)" }}><X size={16} strokeWidth={1.5} /></button>
            ),
          ])}
        </div>
      )}
      {!gesperrt && (
        <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
          <button onClick={() => onAendern([...zeilen, neu()])} style={{ ...leise, paddingLeft: 0 }}><Plus size={16} strokeWidth={1.5} /> {hinzuLabel}</button>
          {extra}
        </div>
      )}
    </div>
  );
}

export function RegieView({ projekt, api, geraete = [], grundlagen, kolonnen = [], einstellungen, setEinstellungen, angebote = [], onAngebotSpeichern,
  eigeneFirma, darfErfassen = true, darfAbrechnen = false, land = "NW" }) {
  const einst = { ...REGIE_STANDARD, ...(einstellungen || {}) };
  const { zeilen: berichte, fehler, speichern, loeschen } = api;
  const istDesktop = useIstDesktop();
  const heute = heuteIso();
  const [auswahlId, setAuswahlId] = useState(null);
  const [entwurf, setEntwurf] = useState(null);
  const [geaendert, setGeaendert] = useState(false);
  const [unterschreiben, setUnterschreiben] = useState(false);
  const [unterzeichner, setUnterzeichner] = useState("");
  const [beanstanden, setBeanstanden] = useState(null);
  const [markiert, setMarkiert] = useState([]);
  const [saetzeOffen, setSaetzeOffen] = useState(false);
  const [saetze, setSaetze] = useState(einst);
  const [meldung, setMeldung] = useState(null);
  const opt = { land, fristWerktage: einst.fristWerktage };

  const liste = useMemo(() => [...berichte].sort((a, b) => b.nummer - a.nummer), [berichte]);
  const gespeichert = berichte.find(b => b.id === auswahlId) || null;
  useEffect(() => {
    if (auswahlId === "neu") return;
    setEntwurf(gespeichert ? structuredClone(gespeichert) : null);
    setGeaendert(false); setUnterschreiben(false); setBeanstanden(null);
  }, [auswahlId, gespeichert]);

  const lohngruppen = einst.lohnsaetze.map(l => l.bez);
  const satzFuer = lg => Number(einst.lohnsaetze.find(l => l.bez === lg)?.satz) || 0;
  const aendern = teil => { setEntwurf(e => ({ ...e, ...teil })); setGeaendert(true); };
  const namen = [...new Set(kolonnen.flatMap(k => (k.mitarbeiter || []).map(m => m.name)).filter(Boolean))];
  const geraeteHier = geraete.filter(g => g.status !== "ausgemustert")
    .sort((a, b) => (String(b.projekt_id) === String(projekt?.id)) - (String(a.projekt_id) === String(projekt?.id)));

  const neu = () => {
    setAuswahlId("neu"); setMeldung(null);
    setEntwurf(leererBericht(projekt.id, naechsteNummer(berichte), heute));
    setGeaendert(true);
  };
  async function sichern(b = entwurf, text = "Gespeichert") {
    if (!b.beschreibung?.trim()) { setMeldung("Bitte die ausgeführte Leistung beschreiben"); return null; }
    const g = await speichern(b);
    if (g) { setAuswahlId(g.id); setEntwurf(structuredClone(g)); setGeaendert(false); setMeldung(text); }
    return g;
  }
  const drucken = b => {
    const w = window.open("", "_blank");
    if (!w) { setMeldung("Der Browser hat das Druckfenster blockiert"); return; }
    w.document.write(regieHtml(b, { projekt, firma: eigeneFirma, einst, esc: escapeHtml }));
    w.document.close(); w.focus(); setTimeout(() => w.print(), 300);
  };

  const abrechenbare = liste.filter(b => abrechenbar(b, heute, opt));
  async function nachtragErzeugen() {
    const auswahl = abrechenbare.filter(b => markiert.includes(b.id));
    if (!auswahl.length) return;
    const auftrag = angebote.find(a => a.status === "angenommen" && !a.nachtrag_zu);
    const nrn = auswahl.map(b => b.nummer).sort((a, b) => a - b);
    const a = {
      titel: `Stundenlohnarbeiten, Regieberichte Nr. ${nrn.join(", ")}`,
      empfaenger: auftrag?.empfaenger || projekt?.auftraggeber || "",
      datum: heute, gueltig_bis: heute, positionen: regieAlsPositionen(auswahl, einst),
      rabatt: 0, mwst: auftrag?.mwst ?? 19, status: "entwurf",
      ...(auftrag ? { nachtrag_zu: auftrag.id, nachtrag_info: { grund: "zusaetzlich", status: "angeboten",
        begruendung: `Stundenlohnarbeiten nach § 15 VOB/B, belegt durch die vom Auftraggeber anerkannten Regieberichte Nr. ${nrn.join(", ")}.` } } : {}),
    };
    const gespeichertesAngebot = await onAngebotSpeichern?.(a, true);
    if (!gespeichertesAngebot) { setMeldung("Nachtrag konnte nicht angelegt werden"); return; }
    for (const b of auswahl) await speichern({ ...b, abgerechnet_in: { angebot_id: gespeichertesAngebot.id, am: heute } });
    setMarkiert([]);
    setMeldung(`${auftrag ? "Nachtrag" : "Angebot"} „${a.titel}“ unter Angebote & Nachträge angelegt`);
  }

  // ── Liste ──
  const listenAnsicht = (
    <div style={{ minWidth: 0, flex: 1 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ color: "var(--text2)", flex: 1, minWidth: 200 }}>
          Stundenlohnarbeiten nach § 15 VOB/B. Der Auftraggeber gibt unterschriebene Zettel innerhalb von {einst.fristWerktage} Werktagen zurück, sonst gelten sie als anerkannt
        </div>
        {darfAbrechnen && <button onClick={() => { setSaetze(einst); setSaetzeOffen(o => !o); setAuswahlId(null); }} style={knopf()}>Verrechnungssätze</button>}
        {darfErfassen && <button onClick={neu} style={knopf(true)}><Plus size={16} strokeWidth={1.5} /> Regiebericht</button>}
      </div>
      {fehler && <div role="alert" style={{ color: "var(--red)", background: "var(--rbg)", borderRadius: 8, padding: "8px 12px", marginBottom: 12, fontSize: 13 }}>{fehler}</div>}
      {darfAbrechnen && einst.lohnsaetze.every(l => !Number(l.satz)) && (
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "12px 16px", marginBottom: 12, color: "var(--text2)" }}>
          Noch keine Verrechnungssätze hinterlegt. Unter „Verrechnungssätze“ den Stundensatz je Lohngruppe und den Materialzuschlag eintragen
        </div>
      )}

      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, overflow: "clip" }}>
        {liste.length === 0 ? (
          <div style={{ padding: "32px 20px", color: "var(--text2)" }}>Noch keine Regieberichte auf dieser Baustelle</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, tableLayout: istDesktop ? "fixed" : "auto" }}>
            {istDesktop && <colgroup>{darfAbrechnen && <col style={{ width: 40 }} />}<col style={{ width: 48 }} /><col style={{ width: 104 }} /><col /><col style={{ width: 120 }} /><col style={{ width: 196 }} /></colgroup>}
            {istDesktop && (
              <thead><tr style={{ textAlign: "left", color: "var(--text2)", fontSize: 13 }}>
                {darfAbrechnen && <th style={{ width: 40, borderBottom: "1px solid var(--border2)" }} />}
                {["Nr.", "Datum", "Leistung", "Netto", "Stand"].map((h, i) => (
                  <th key={h} style={{ padding: "10px 8px", paddingLeft: i === 0 && !darfAbrechnen ? 16 : 8, fontWeight: 400, whiteSpace: "nowrap",
                    borderBottom: "1px solid var(--border2)", textAlign: i === 3 ? "right" : "left" }}>{h}</th>
                ))}
              </tr></thead>
            )}
            <tbody>
              {liste.map(b => {
                const st = regieStand(b, heute, opt);
                const s = regieSummen(b, einst);
                const aktiv = b.id === auswahlId;
                const kannMarkieren = darfAbrechnen && st.stand === "anerkannt";
                return (
                  <tr key={b.id} className="desk-zeile" onClick={() => { setAuswahlId(b.id); setSaetzeOffen(false); setMeldung(null); }}
                    style={{ borderTop: "1px solid var(--border)", cursor: "pointer", background: aktiv ? "var(--bg)" : undefined,
                      boxShadow: aktiv ? "inset 2px 0 0 var(--akzent)" : undefined }}>
                    {darfAbrechnen && (
                      <td style={{ paddingLeft: 16 }} onClick={e => e.stopPropagation()}>
                        {kannMarkieren && <input type="checkbox" aria-label={`Bericht ${b.nummer} abrechnen`} checked={markiert.includes(b.id)}
                          onChange={e => setMarkiert(m => e.target.checked ? [...m, b.id] : m.filter(x => x !== b.id))} />}
                      </td>
                    )}
                    <td style={{ padding: "10px 8px", paddingLeft: darfAbrechnen ? 8 : 16, ...zahl, color: "var(--text2)" }}>{b.nummer}</td>
                    <td style={{ padding: "10px 8px", ...zahl, fontSize: 13, whiteSpace: "nowrap" }}>{datumDe(b.datum)}</td>
                    <td style={{ padding: "10px 8px", maxWidth: istDesktop ? undefined : 320 }}>
                      <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.beschreibung || "–"}</div>
                      <div style={{ fontSize: 13, color: "var(--muted)", ...zahl }}>{zahlFmt(s.stunden)} h{!istDesktop && ` · ${eur(s.netto)}`}</div>
                    </td>
                    {istDesktop && <td style={{ padding: "10px 8px", textAlign: "right", ...zahl, whiteSpace: "nowrap" }}>{eur(s.netto)}</td>}
                    <td style={{ padding: "10px 16px 10px 8px", fontSize: 13, whiteSpace: "nowrap" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 8, color: st.stand === "entwurf" ? "var(--text2)" : "var(--text)" }}><Punkt stand={st.stand} />{st.text}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {darfAbrechnen && abrechenbare.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderTop: "1px solid var(--border)", flexWrap: "wrap" }}>
            <span style={{ color: "var(--text2)", fontSize: 13, flex: 1 }}>
              {markiert.length
                ? <>{markiert.length} markiert, <span style={zahl}>{eur(abrechenbare.filter(b => markiert.includes(b.id)).reduce((s, b) => s + regieSummen(b, einst).netto, 0))}</span> netto</>
                : `${abrechenbare.length} anerkannte Berichte noch nicht abgerechnet`}
            </span>
            <button onClick={() => setMarkiert(markiert.length === abrechenbare.length ? [] : abrechenbare.map(b => b.id))} style={leise}>
              {markiert.length === abrechenbare.length ? "Keine" : "Alle"} markieren
            </button>
            <button onClick={nachtragErzeugen} disabled={!markiert.length} style={{ ...knopf(!!markiert.length), opacity: markiert.length ? 1 : 0.6 }}>Als Nachtrag abrechnen</button>
          </div>
        )}
      </div>
      {meldung && !entwurf && <div style={{ marginTop: 12, color: "var(--text2)", fontSize: 13 }}>{meldung}</div>}
    </div>
  );

  // ── Verrechnungssätze ──
  const saetzeAnsicht = saetzeOffen && (
    <div>
      <div style={{ fontSize: 18, fontWeight: 500, marginBottom: 4 }}>Verrechnungssätze</div>
      <div style={{ color: "var(--text2)", fontSize: 13, marginBottom: 16 }}>Gelten für alle Baustellen. Bestehende Berichte behalten ihre Sätze</div>
      {saetze.lohnsaetze.map((l, i) => (
        <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 112px 28px", gap: 8, marginBottom: 8, alignItems: "center" }}>
          <input value={l.bez} aria-label="Lohngruppe" onChange={e => setSaetze(s => ({ ...s, lohnsaetze: s.lohnsaetze.map((x, j) => j === i ? { ...x, bez: e.target.value } : x) }))} style={feld} />
          <label style={{ position: "relative" }}>
            <input value={l.satz || ""} inputMode="decimal" aria-label={`${l.bez}: € je Stunde`} placeholder="€/h"
              onChange={e => setSaetze(s => ({ ...s, lohnsaetze: s.lohnsaetze.map((x, j) => j === i ? { ...x, satz: Number(e.target.value.replace(",", ".")) || 0 } : x) }))}
              style={{ ...feld, ...zahl, textAlign: "right", paddingRight: 40 }} />
            <span style={{ position: "absolute", right: 10, top: 9, fontSize: 13, color: "var(--muted)" }}>€/h</span>
          </label>
          <button onClick={() => setSaetze(s => ({ ...s, lohnsaetze: s.lohnsaetze.filter((_, j) => j !== i) }))} aria-label="Lohngruppe entfernen"
            style={{ ...leise, width: 28, padding: 0, justifyContent: "center", color: "var(--muted)" }}><X size={16} strokeWidth={1.5} /></button>
        </div>
      ))}
      <button onClick={() => setSaetze(s => ({ ...s, lohnsaetze: [...s.lohnsaetze, { bez: "", satz: 0 }] }))} style={{ ...leise, paddingLeft: 0 }}><Plus size={16} strokeWidth={1.5} /> Lohngruppe</button>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, ...abschnitt }}>
        <div><label style={label}>Materialzuschlag in %</label><input value={saetze.materialZuschlag || ""} inputMode="decimal"
          onChange={e => setSaetze(s => ({ ...s, materialZuschlag: Number(e.target.value.replace(",", ".")) || 0 }))} style={{ ...feld, ...zahl, textAlign: "right" }} /></div>
        <div><label style={label}>Rückgabefrist in Werktagen</label><input value={saetze.fristWerktage || ""} inputMode="numeric"
          onChange={e => setSaetze(s => ({ ...s, fristWerktage: Number(e.target.value) || 6 }))} style={{ ...feld, ...zahl, textAlign: "right" }} /></div>
      </div>
      <div style={{ display: "flex", gap: 8, ...abschnitt }}>
        <button onClick={() => { setEinstellungen?.({ ...saetze, lohnsaetze: saetze.lohnsaetze.filter(l => l.bez.trim()) }); setSaetzeOffen(false); setMeldung("Verrechnungssätze gespeichert"); }} style={knopf(true)}>Speichern</button>
        <button onClick={() => setSaetzeOffen(false)} style={knopf()}>Abbrechen</button>
      </div>
    </div>
  );

  // ── Bericht ──
  const berichtAnsicht = entwurf && (() => {
    const b = entwurf;
    const st = regieStand(b, heute, opt);
    const s = regieSummen(b, einst);
    const gesperrt = !darfErfassen || b.status === "unterschrieben" || !!b.abgerechnet_in;
    return (
      <div>
        {!istDesktop && <button onClick={() => setAuswahlId(null)} style={{ ...leise, paddingLeft: 0, marginBottom: 8 }}><ArrowLeft size={16} strokeWidth={1.5} /> Alle Regieberichte</button>}
        <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
          <div style={{ fontSize: 18, fontWeight: 500 }}>Regiebericht <span style={zahl}>{b.nummer}</span></div>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text2)" }}><Punkt stand={st.stand} />{st.text}</span>
        </div>
        {b.status === "beanstandet" && b.beanstandung && <div style={{ marginTop: 8, fontSize: 13, color: "var(--red)" }}>Beanstandet: {b.beanstandung}</div>}

        <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: 8, marginTop: 16 }}>
          <div><label style={label}>Datum</label><input type="date" value={b.datum} disabled={gesperrt} onChange={e => aendern({ datum: e.target.value })} style={{ ...feld, ...zahl, padding: "0 6px" }} /></div>
          <div><label style={label}>Angeordnet von</label><input value={b.angeordnet_von || ""} disabled={gesperrt} placeholder="Name, Funktion beim Auftraggeber"
            onChange={e => aendern({ angeordnet_von: e.target.value })} style={feld} /></div>
        </div>
        <div style={{ marginTop: 8 }}>
          <label style={label}>Ausgeführte Leistung</label>
          <textarea value={b.beschreibung} disabled={gesperrt} rows={3} onChange={e => aendern({ beschreibung: e.target.value })}
            placeholder="z. B. Bestandsleitung DN 150 freigelegt, gesichert und wieder verfüllt, Achse C/3"
            style={{ ...feld, height: "auto", padding: "8px 10px", resize: "vertical", lineHeight: "20px" }} />
        </div>

        <div style={abschnitt}>
          <div style={titel}>Personal</div>
          <datalist id="regie-namen">{namen.map(n => <option key={n} value={n} />)}</datalist>
          <Zeilen gesperrt={gesperrt} zeilen={b.personal} hinzuLabel="Person"
            onAendern={personal => aendern({ personal: personal.map((p, i) => {
              // Lohngruppe gewechselt: Satz nachziehen, solange er noch dem Satz der alten Gruppe entspricht
              const alt = b.personal[i];
              return alt && alt.lohngruppe !== p.lohngruppe && (!Number(p.satz) || Number(p.satz) === satzFuer(alt.lohngruppe)) ? { ...p, satz: satzFuer(p.lohngruppe) } : p;
            }) })}
            neu={() => ({ name: "", lohngruppe: lohngruppen[2] || lohngruppen[0] || "", stunden: "", satz: satzFuer(lohngruppen[2] || lohngruppen[0]) })}
            spalten={[
              { k: "name", l: "Name", breite: "minmax(0,1fr)", liste: "regie-namen" },
              { k: "lohngruppe", l: "Lohngruppe", breite: "120px", optionen: [...new Set([...lohngruppen, ...b.personal.map(p => p.lohngruppe)])].filter(Boolean) },
              { k: "stunden", l: "Std.", breite: "56px", zahl: true, rechts: true },
              { k: "satz", l: "€/h", breite: "64px", zahl: true, rechts: true },
            ]}
            extra={kolonnen.length > 0 && (
              <select value="" aria-label="Kolonne übernehmen" style={{ ...feld, width: "auto", height: 36, color: "var(--text2)" }} onChange={e => {
                const k = kolonnen.find(x => String(x.id) === e.target.value);
                if (!k) return;
                const vorhanden = new Set(b.personal.map(p => p.name));
                const neue = (k.mitarbeiter || []).filter(m => m.name && !vorhanden.has(m.name)).map(m => {
                  const lg = lohngruppen.find(l => l.toLowerCase() === String(m.rolle || "").toLowerCase()) || lohngruppen[2] || lohngruppen[0] || "";
                  return { name: m.name, lohngruppe: lg, stunden: "", satz: satzFuer(lg) };
                });
                aendern({ personal: [...b.personal, ...neue] });
              }}>
                <option value="">Kolonne übernehmen</option>
                {kolonnen.map(k => <option key={k.id} value={k.id}>{k.name}</option>)}
              </select>
            )} />
        </div>

        <div style={abschnitt}>
          <div style={titel}>Geräte</div>
          <Zeilen gesperrt={gesperrt} zeilen={b.geraete} onAendern={geraete => aendern({ geraete })} hinzuLabel="Gerät frei"
            neu={() => ({ geraet_id: null, bezeichnung: "", stunden: "", satz: "" })}
            spalten={[
              { k: "bezeichnung", l: "Gerät", breite: "minmax(0,2.4fr)" },
              { k: "stunden", l: "Std.", breite: "56px", zahl: true, rechts: true },
              { k: "satz", l: "€/h", breite: "64px", zahl: true, rechts: true },
            ]}
            extra={geraeteHier.length > 0 && (
              <select value="" aria-label="Gerät aus der Geräteverwaltung" style={{ ...feld, width: "auto", height: 36, color: "var(--text2)" }} onChange={e => {
                const g = geraete.find(x => String(x.id) === e.target.value);
                if (!g) return;
                const satz = Math.round(tagessatz(g, grundlagen) / (Number(g.stunden_je_tag) || 8) * 100) / 100;
                aendern({ geraete: [...b.geraete, { geraet_id: g.id, bezeichnung: [g.inventarnr, g.bezeichnung].filter(Boolean).join(" "), stunden: "", satz: satz || "" }] });
              }}>
                <option value="">Aus Geräteverwaltung</option>
                {geraeteHier.map(g => <option key={g.id} value={g.id}>{g.bezeichnung}{String(g.projekt_id) === String(projekt?.id) ? " (auf der Baustelle)" : ""}</option>)}
              </select>
            )} />
        </div>

        <div style={abschnitt}>
          <div style={titel}>Material</div>
          <Zeilen gesperrt={gesperrt} zeilen={b.material} onAendern={material => aendern({ material })} hinzuLabel="Material"
            neu={() => ({ bezeichnung: "", menge: "", einheit: "Stk", preis: "" })}
            spalten={[
              { k: "bezeichnung", l: "Material", breite: "minmax(0,1.6fr)" },
              { k: "menge", l: "Menge", breite: "56px", zahl: true, rechts: true },
              { k: "einheit", l: "ME", breite: "56px" },
              { k: "preis", l: "€/ME", breite: "64px", zahl: true, rechts: true },
            ]} />
        </div>

        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, ...abschnitt, display: "table", borderTop: "1px solid var(--border)" }}>
          <tbody>
            {[["Lohn", s.lohn, `${zahlFmt(s.stunden)} h`], ["Geräte", s.geraete], [`Material${s.materialZuschlag ? ` inkl. ${einst.materialZuschlag} % Zuschlag` : ""}`, s.material]].map(([l, w, h]) => (
              <tr key={l}><td style={{ padding: "4px 0", color: "var(--text2)" }}>{l}{h && <span style={{ ...zahl, color: "var(--muted)" }}> · {h}</span>}</td>
                <td style={{ padding: "4px 0", textAlign: "right", ...zahl }}>{eur(w)}</td></tr>
            ))}
            <tr style={{ borderTop: "1px solid var(--border2)" }}><td style={{ padding: "8px 0 0", fontWeight: 500 }}>Netto</td>
              <td style={{ padding: "8px 0 0", textAlign: "right", ...zahl, fontWeight: 500, fontSize: 16 }}>{eur(s.netto)}</td></tr>
          </tbody>
        </table>

        {b.unterschrift && (
          <div style={abschnitt}>
            <div style={titel}>Unterschrift Auftraggeber</div>
            {b.unterschrift.bild && <img src={b.unterschrift.bild} alt={`Unterschrift ${b.unterschrift.name}`} style={{ height: 56, background: "#fff", borderRadius: 6, border: "1px solid var(--border)" }} />}
            <div style={{ fontSize: 13, color: "var(--text2)", marginTop: 4 }}>{b.unterschrift.name}, {new Date(b.unterschrift.am).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" })}</div>
          </div>
        )}

        {unterschreiben && (
          <div style={abschnitt}>
            <label style={label}>Name des Unterzeichners beim Auftraggeber</label>
            <input value={unterzeichner} onChange={e => setUnterzeichner(e.target.value)} placeholder={b.angeordnet_von || "Vor- und Nachname"} style={{ ...feld, marginBottom: 8 }} />
            <UnterschriftPad label="Unterschrift" onSave={async bild => {
              const name = unterzeichner.trim() || b.angeordnet_von;
              if (!name) { setMeldung("Bitte den Namen des Unterzeichners eintragen"); return; }
              const g = await sichern({ ...b, status: "unterschrieben", unterschrift: { name, am: new Date().toISOString(), bild } }, "Unterschrieben");
              if (g) setUnterschreiben(false);
            }} />
          </div>
        )}

        {beanstanden !== null && (
          <div style={abschnitt}>
            <label style={label}>Was beanstandet der Auftraggeber?</label>
            <textarea value={beanstanden} onChange={e => setBeanstanden(e.target.value)} rows={2} style={{ ...feld, height: "auto", padding: "8px 10px" }} />
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button onClick={async () => { if (await sichern({ ...b, status: "beanstandet", beanstandung: beanstanden.trim() }, "Als beanstandet vermerkt")) setBeanstanden(null); }} style={knopf(true)}>Vermerken</button>
              <button onClick={() => setBeanstanden(null)} style={knopf()}>Abbrechen</button>
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", ...abschnitt }}>
          {!gesperrt && <button onClick={() => sichern()} disabled={!geaendert} style={{ ...knopf(geaendert), opacity: geaendert ? 1 : 0.6 }}>Speichern</button>}
          {!gesperrt && !unterschreiben && <button onClick={() => { setUnterzeichner(b.angeordnet_von || ""); setUnterschreiben(true); }} style={knopf()}>Unterschreiben lassen</button>}
          {!gesperrt && b.id && b.status !== "eingereicht" && (
            <button onClick={() => sichern({ ...b, status: "eingereicht", eingereicht_am: heute, beanstandung: "" }, `Eingereicht, Rückgabe innerhalb von ${einst.fristWerktage} Werktagen`)} style={knopf()}>Eingereicht</button>
          )}
          {!gesperrt && b.status === "eingereicht" && beanstanden === null && <button onClick={() => setBeanstanden("")} style={knopf()}>Beanstandet</button>}
          {b.id && <button onClick={() => drucken(b)} style={leise} aria-label="Drucken"><Printer size={16} strokeWidth={1.5} /> Drucken</button>}
          {!gesperrt && b.id && b.status === "entwurf" && (
            <button onClick={async () => { if (window.confirm(`Regiebericht ${b.nummer} löschen?`) && await loeschen(b.id)) setAuswahlId(null); }} style={{ ...leise, marginLeft: "auto", color: "var(--muted)" }}>Löschen</button>
          )}
        </div>
        {meldung && <div style={{ marginTop: 8, fontSize: 13, color: "var(--text2)" }}>{meldung}</div>}
      </div>
    );
  })();

  const rechts = saetzeAnsicht || berichtAnsicht;
  if (!istDesktop) return <div className="eigen-felder">{rechts ? <div style={{ background: "var(--surface)", borderRadius: 12, padding: 16 }}>{rechts}</div> : listenAnsicht}</div>;
  return (
    <div className="eigen-felder" style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
      {listenAnsicht}
      <aside style={{ flex: "0 0 440px", position: "sticky", top: 16, maxHeight: "calc(100vh - 32px)", overflowY: "auto", boxSizing: "border-box",
        background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 20 }}>
        {rechts || <div style={{ color: "var(--text2)", lineHeight: "20px" }}>Einen Bericht anklicken oder mit „Regiebericht“ einen neuen anlegen. Unterschreiben lässt er sich direkt hier auf dem Tablet</div>}
      </aside>
    </div>
  );
}
