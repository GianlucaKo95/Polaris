import { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { useIstDesktop } from "../hooks/useIstDesktop.js";
import {
  SICHERHEIT_ARTEN, FRIST_ARTEN, sicherheitLabel, fristLabel, gewaehrleistungsEnde, rueckgabeDatum, avalkostenJahr, terminListe, stand,
  neueSicherheit, neueFrist,
} from "../lib/fristen.js";
import { useUngespeichert } from "../hooks/useUngespeichert.js";
import { verlassenBestaetigen } from "../lib/ungespeichert.js";

// Sicherheiten und Fristen über alle Baustellen: anstehende Termine,
// Bürgschaften und Bareinbehalte, Gewährleistungs- und Vertragsfristen.
// Rechts (Handy: darunter) das gewählte Objekt zum Bearbeiten.
// Logik in lib/fristen.js.

const heuteIso = () => new Date().toLocaleDateString("sv-SE");
const datumDe = s => s ? new Date(`${s}T12:00:00`).toLocaleDateString("de-DE") : "–";
const eur = n => n == null || n === "" ? "–" : Number(n).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
const zahl = { fontFamily: "var(--font-zahl)", fontVariantNumeric: "tabular-nums" };
const FARBE = { ueberfaellig: "var(--red)", bald: "var(--akzent)", ok: "var(--green)" };
const feld = { boxSizing: "border-box", width: "100%", height: 36, padding: "0 10px", background: "var(--surface)", color: "var(--text)",
  border: "1px solid var(--border2)", borderRadius: 8, fontFamily: "inherit", fontSize: 14 };
const knopf = (haupt = false) => ({ height: 36, padding: "0 14px", borderRadius: 8, fontFamily: "inherit", fontSize: 14, cursor: "pointer",
  display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap", fontWeight: haupt ? 500 : 400,
  border: haupt ? "none" : "1px solid var(--border2)", background: haupt ? "var(--text)" : "var(--surface)", color: haupt ? "var(--surface)" : "var(--text)" });
const label = { display: "block", fontSize: 13, color: "var(--text2)", marginBottom: 4 };
const th = { padding: "10px 8px", fontWeight: 400, borderBottom: "1px solid var(--border2)", whiteSpace: "nowrap", textAlign: "left" };
const td = { padding: "10px 8px", borderTop: "1px solid var(--border)" };

function Punkt({ st }) {
  return <span aria-hidden="true" style={{ display: "inline-block", width: 6, height: 6, borderRadius: 3, background: FARBE[st] || "var(--border2)", flexShrink: 0 }} />;
}
const relativ = t => t.tage === 0 ? "heute" : t.tage < 0 ? `seit ${-t.tage} ${t.tage === -1 ? "Tag" : "Tagen"}` : `in ${t.tage} ${t.tage === 1 ? "Tag" : "Tagen"}`;

function Feld({ l, children }) { return <div><label style={label}>{l}</label>{children}</div>; }

export function FristenView({ projekte = [], sicherheitenApi, fristenApi }) {
  const istDesktop = useIstDesktop();
  const heute = heuteIso();
  const [reiter, setReiter] = useState("termine");
  const [baustelle, setBaustelle] = useState("");
  const [auswahl, setAuswahl] = useState(null);  // { typ: "sicherheit"|"frist", id | "neu" }
  const [entwurf, setEntwurf] = useState(null);
  const [meldung, setMeldung] = useState(null);
  const sicherheiten = sicherheitenApi.zeilen, fristen = fristenApi.zeilen;
  const fehler = sicherheitenApi.fehler || fristenApi.fehler;

  const projektName = id => projekte.find(p => String(p.id) === String(id))?.name || "ohne Baustelle";
  const abnahmeJeProjekt = useMemo(() => Object.fromEntries(projekte.filter(p => p.abschluss_datum).map(p => [p.id, String(p.abschluss_datum).slice(0, 10)])), [projekte]);
  const passt = x => !baustelle || String(x.projekt_id) === baustelle;
  const termine = useMemo(() => terminListe({ fristen, sicherheiten, abnahmeJeProjekt, heute }), [fristen, sicherheiten, abnahmeJeProjekt, heute]);

  const gewaehlt = auswahl && auswahl.id !== "neu"
    ? (auswahl.typ === "sicherheit" ? sicherheiten : fristen).find(x => x.id === auswahl.id) : null;
  useEffect(() => { if (auswahl?.id !== "neu") setEntwurf(gewaehlt ? structuredClone(gewaehlt) : null); }, [auswahl?.typ, auswahl?.id, gewaehlt]);
  // Ungespeicherte Änderungen: Entwurf weicht vom gespeicherten Eintrag ab (oder neuer Eintrag mit Inhalt)
  const [vorlage, setVorlage] = useState(null);   // Ausgangsstand eines neuen Eintrags
  const geaendert = !!entwurf && JSON.stringify(entwurf) !== JSON.stringify(auswahl?.id === "neu" ? vorlage : gewaehlt);
  useUngespeichert(geaendert, { titel: auswahl?.typ === "sicherheit" ? "Die Sicherheit" : "Die Frist", speichern: async () => !!(await sichern()) });
  const oeffnen = async (typ, id) => { if (geaendert && !(await verlassenBestaetigen())) return; setAuswahl({ typ, id }); setMeldung(null); };
  const neu = async typ => {
    if (geaendert && !(await verlassenBestaetigen())) return;
    const teil = { projekt_id: baustelle ? Number(baustelle) : null };
    setAuswahl({ typ, id: "neu" });
    const v = typ === "sicherheit" ? neueSicherheit(teil) : neueFrist({ ...teil, abnahme_am: abnahmeJeProjekt[teil.projekt_id] || null });
    setVorlage(v); setEntwurf(structuredClone(v));
    setMeldung(null);
  };
  const aendern = t => setEntwurf(e => ({ ...e, ...t }));
  async function sichern(e = entwurf, text = "Gespeichert") {
    const api = auswahl.typ === "sicherheit" ? sicherheitenApi : fristenApi;
    const g = await api.speichern(e);
    if (g) { setAuswahl({ typ: auswahl.typ, id: g.id }); setEntwurf(structuredClone(g)); setMeldung(text); }
    return !!g;
  }
  async function entfernen() {
    if (!window.confirm("Eintrag löschen?")) return;
    const api = auswahl.typ === "sicherheit" ? sicherheitenApi : fristenApi;
    if (await api.loeschen(entwurf.id)) { setAuswahl(null); setEntwurf(null); }
  }

  const baustellenAuswahl = (
    <select value={baustelle} onChange={e => setBaustelle(e.target.value)} aria-label="Baustelle filtern" style={{ ...feld, width: "auto", minWidth: 200 }}>
      <option value="">Alle Baustellen</option>
      {projekte.map(p => <option key={p.id} value={p.id}>{p.name}{p.archiviert ? " (abgeschlossen)" : ""}</option>)}
    </select>
  );

  // ── Termine ──
  const termineAnsicht = (() => {
    const liste = termine.filter(passt).filter(t => t.tage >= -365);
    return liste.length === 0 ? <div style={{ padding: "32px 20px", color: "var(--text2)" }}>Keine anstehenden Termine. Sie entstehen aus Sicherheiten und Fristen</div> : (
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
        <thead><tr style={{ color: "var(--text2)", fontSize: 13 }}>
          <th style={{ ...th, paddingLeft: 16 }}>Datum</th><th style={th}></th><th style={th}>Termin</th>{istDesktop && <th style={{ ...th, paddingRight: 16 }}>Baustelle</th>}
        </tr></thead>
        <tbody>
          {liste.map((t, i) => (
            <tr key={i} className="desk-zeile" style={{ cursor: "pointer" }} onClick={() => { setReiter(t.quelle.typ === "sicherheit" ? "sicherheiten" : "fristen"); oeffnen(t.quelle.typ, t.quelle.id); }}>
              <td style={{ ...td, paddingLeft: 16, ...zahl, fontSize: 13, whiteSpace: "nowrap" }}>{datumDe(t.datum)}</td>
              <td style={{ ...td, whiteSpace: "nowrap", fontSize: 13, color: t.stand === "ok" ? "var(--muted)" : FARBE[t.stand] }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><Punkt st={t.stand} />{relativ(t)}</span>
              </td>
              <td style={td}>{t.titel}{!istDesktop && <div style={{ fontSize: 13, color: "var(--text2)" }}>{projektName(t.projekt_id)}</div>}</td>
              {istDesktop && <td style={{ ...td, paddingRight: 16, color: "var(--text2)" }}>{projektName(t.projekt_id)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    );
  })();

  // ── Sicherheiten ──
  const sichtbareS = sicherheiten.filter(passt).sort((a, b) => (a.status === "zurueck") - (b.status === "zurueck") || String(a.projekt_id).localeCompare(String(b.projekt_id)));
  const summe = r => sichtbareS.filter(s => s.richtung === r && s.status !== "zurueck").reduce((x, s) => x + (Number(s.betrag) || 0), 0);
  const sicherheitenAnsicht = sichtbareS.length === 0 ? <div style={{ padding: "32px 20px", color: "var(--text2)" }}>Noch keine Bürgschaften oder Einbehalte erfasst</div> : (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
      <thead><tr style={{ color: "var(--text2)", fontSize: 13 }}>
        <th style={{ ...th, paddingLeft: 16 }}>Sicherheit</th>{istDesktop && <th style={th}>Baustelle</th>}<th style={{ ...th, textAlign: "right" }}>Betrag</th>
        {istDesktop && <th style={th}>Rückgabe</th>}<th style={{ ...th, paddingRight: 16 }}>Stand</th>
      </tr></thead>
      <tbody>
        {sichtbareS.map(s => {
          const r = rueckgabeDatum(s, { abnahme: abnahmeJeProjekt[s.projekt_id] });
          const st = s.status === "gestellt" && r ? stand(r, heute) : null;
          const aktiv = auswahl?.typ === "sicherheit" && auswahl.id === s.id;
          return (
            <tr key={s.id} className="desk-zeile" onClick={() => oeffnen("sicherheit", s.id)}
              style={{ cursor: "pointer", background: aktiv ? "var(--bg)" : undefined, boxShadow: aktiv ? "inset 2px 0 0 var(--akzent)" : undefined, opacity: s.status === "zurueck" ? 0.6 : 1 }}>
              <td style={{ ...td, paddingLeft: 16 }}>{sicherheitLabel(s.art)}
                <div style={{ fontSize: 13, color: "var(--text2)" }}>{s.richtung === "gestellt" ? "an" : "von"} {s.partner || "–"}{!istDesktop && ` · ${projektName(s.projekt_id)}`}</div></td>
              {istDesktop && <td style={{ ...td, color: "var(--text2)" }}>{projektName(s.projekt_id)}</td>}
              <td style={{ ...td, textAlign: "right", ...zahl, whiteSpace: "nowrap" }}>{eur(s.betrag)}</td>
              {istDesktop && <td style={{ ...td, ...zahl, fontSize: 13, whiteSpace: "nowrap" }}>{r ? datumDe(r) : <span style={{ color: "var(--muted)", fontFamily: "inherit" }}>nach Abnahme</span>}</td>}
              <td style={{ ...td, paddingRight: 16, fontSize: 13, whiteSpace: "nowrap" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  {st && <Punkt st={st.stand} />}
                  {s.status === "zurueck" ? "zurück" : s.status === "zurueckgefordert" ? "zurückgefordert" : st?.stand === "ueberfaellig" ? (s.richtung === "gestellt" ? "zurückfordern" : "zurückgeben") : s.richtung === "gestellt" ? "gestellt" : "liegt vor"}
                </span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  // ── Fristen ──
  const sichtbareF = fristen.filter(passt).map(f => {
    const ende = f.art === "gewaehrleistung" ? (f.datum || gewaehrleistungsEnde(f.abnahme_am || abnahmeJeProjekt[f.projekt_id], f.jahre ?? 4)) : f.datum;
    return { f, ende, st: !f.erledigt_am && ende ? stand(ende, heute, f.art === "gewaehrleistung" ? 90 : f.erinnerung_tage ?? 30) : null };
  }).sort((a, b) => !!a.f.erledigt_am - !!b.f.erledigt_am || String(a.ende || "9").localeCompare(String(b.ende || "9")));
  const fristenAnsicht = sichtbareF.length === 0 ? <div style={{ padding: "32px 20px", color: "var(--text2)" }}>Noch keine Fristen. Für abgenommene Baustellen eine Gewährleistung anlegen, das Ende rechnet Polaris aus der Abnahme</div> : (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
      <thead><tr style={{ color: "var(--text2)", fontSize: 13 }}>
        <th style={{ ...th, paddingLeft: 16 }}>Frist</th>{istDesktop && <th style={th}>Baustelle</th>}<th style={th}>Datum</th><th style={{ ...th, paddingRight: 16 }}>Stand</th>
      </tr></thead>
      <tbody>
        {sichtbareF.map(({ f, ende, st }) => {
          const aktiv = auswahl?.typ === "frist" && auswahl.id === f.id;
          return (
            <tr key={f.id} className="desk-zeile" onClick={() => oeffnen("frist", f.id)}
              style={{ cursor: "pointer", background: aktiv ? "var(--bg)" : undefined, boxShadow: aktiv ? "inset 2px 0 0 var(--akzent)" : undefined, opacity: f.erledigt_am ? 0.6 : 1 }}>
              <td style={{ ...td, paddingLeft: 16 }}>{f.titel || fristLabel(f.art)}
                <div style={{ fontSize: 13, color: "var(--text2)" }}>{fristLabel(f.art)}{f.art === "gewaehrleistung" && ` · ${String(f.jahre ?? 4).replace(".", ",")} Jahre`}{!istDesktop && ` · ${projektName(f.projekt_id)}`}</div></td>
              {istDesktop && <td style={{ ...td, color: "var(--text2)" }}>{projektName(f.projekt_id)}</td>}
              <td style={{ ...td, ...zahl, fontSize: 13, whiteSpace: "nowrap" }}>{ende ? datumDe(ende) : <span style={{ color: "var(--muted)" }}>Abnahme fehlt</span>}</td>
              <td style={{ ...td, paddingRight: 16, fontSize: 13, whiteSpace: "nowrap" }}>
                {f.erledigt_am ? "erledigt" : st ? <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><Punkt st={st.stand} />{relativ(st)}</span> : "–"}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  // ── Bearbeiten ──
  const formular = entwurf && auswahl && (() => {
    const e = entwurf;
    const projektFeld = (
      <Feld l="Baustelle">
        <select value={e.projekt_id ?? ""} onChange={x => aendern({ projekt_id: x.target.value ? Number(x.target.value) : null, ...(auswahl.typ === "frist" && !e.abnahme_am ? { abnahme_am: abnahmeJeProjekt[x.target.value] || null } : {}) })} style={feld}>
          <option value="">ohne Baustelle</option>
          {projekte.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </Feld>
    );
    const datumFeld = (l, k) => <Feld l={l}><input type="date" value={e[k] || ""} onChange={x => aendern({ [k]: x.target.value || null })} style={{ ...feld, ...zahl, padding: "0 6px" }} /></Feld>;
    const zahlFeld = (l, k, ph) => <Feld l={l}><input inputMode="decimal" value={e[k] == null ? "" : String(e[k]).replace(".", ",")} placeholder={ph}
      onChange={x => aendern({ [k]: x.target.value === "" ? null : Number(x.target.value.replace(/\./g, "").replace(",", ".")) })} style={{ ...feld, ...zahl, textAlign: "right" }} /></Feld>;
    const raster = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 };

    if (auswahl.typ === "sicherheit") {
      const r = rueckgabeDatum(e, { abnahme: abnahmeJeProjekt[e.projekt_id] });
      const art = SICHERHEIT_ARTEN.find(a => a.art === e.art);
      return (
        <div>
          <div style={{ fontSize: 18, fontWeight: 500, marginBottom: 16 }}>{e.id ? sicherheitLabel(e.art) : "Neue Sicherheit"}</div>
          <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
            {[["gestellt", "Von uns gestellt"], ["erhalten", "Von NU erhalten"]].map(([k, l]) => (
              <button key={k} onClick={() => aendern({ richtung: k })} aria-pressed={e.richtung === k}
                style={{ ...knopf(), height: 32, border: "none", background: e.richtung === k ? "var(--surface2)" : "none", color: e.richtung === k ? "var(--text)" : "var(--text2)", fontWeight: e.richtung === k ? 500 : 400 }}>{l}</button>
            ))}
          </div>
          <Feld l="Art"><select value={e.art} onChange={x => aendern({ art: x.target.value })} style={feld}>{SICHERHEIT_ARTEN.map(a => <option key={a.art} value={a.art}>{a.label}</option>)}</select></Feld>
          {art?.hinweis && <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>{art.hinweis}</div>}
          <div style={{ marginTop: 8 }}>{projektFeld}</div>
          <div style={raster}>
            <Feld l={e.richtung === "gestellt" ? "Auftraggeber" : "Nachunternehmer"}><input value={e.partner || ""} onChange={x => aendern({ partner: x.target.value })} style={feld} /></Feld>
            {e.art !== "einbehalt" && <Feld l="Bürge (Bank, Versicherer)"><input value={e.aussteller || ""} onChange={x => aendern({ aussteller: x.target.value })} style={feld} /></Feld>}
          </div>
          <div style={raster}>
            {zahlFeld("Betrag in €", "betrag")}
            {e.art !== "einbehalt" ? <Feld l="Urkundennummer"><input value={e.nummer || ""} onChange={x => aendern({ nummer: x.target.value })} style={{ ...feld, ...zahl }} /></Feld> : zahlFeld("Prozent", "prozent", "5")}
          </div>
          <div style={raster}>
            {datumFeld("Ausgestellt am", "ausgestellt_am")}
            {e.art !== "einbehalt" && datumFeld("Befristet bis", "befristet_bis")}
          </div>
          <div style={raster}>
            {datumFeld("Rückgabe vereinbart", "rueckgabe_am")}
            {e.richtung === "gestellt" && e.art !== "einbehalt" && zahlFeld("Avalprovision % p. a.", "aval_prozent", "1,0")}
          </div>
          <div style={{ fontSize: 13, color: "var(--text2)", marginTop: 8 }}>
            {r ? <>Rückgabe <span style={zahl}>{datumDe(r)}</span>{!e.rueckgabe_am && " (nach VOB/B § 17 Abs. 8 aus der Abnahme)"}</>
              : e.art === "vertragserfuellung" || e.art === "gewaehrleistung" ? "Rückgabe ergibt sich aus der Abnahme. Sie fehlt noch für diese Baustelle" : ""}
          </div>
          <Feld l=" "><textarea value={e.notiz || ""} placeholder="Notiz" onChange={x => aendern({ notiz: x.target.value })} rows={2} style={{ ...feld, height: "auto", padding: "8px 10px", marginTop: 8 }} /></Feld>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", borderTop: "1px solid var(--border)", paddingTop: 16, marginTop: 16 }}>
            <button onClick={() => sichern()} style={knopf(true)}>Speichern</button>
            {e.id && e.status === "gestellt" && <button onClick={() => sichern({ ...e, status: "zurueckgefordert" }, "Als zurückgefordert vermerkt")} style={knopf()}>{e.richtung === "gestellt" ? "Zurückgefordert" : "Rückgabe angefragt"}</button>}
            {e.id && e.status !== "zurueck" && <button onClick={() => sichern({ ...e, status: "zurueck" }, "Als zurück vermerkt")} style={knopf()}>{e.richtung === "gestellt" ? "Urkunde zurück" : "Zurückgegeben"}</button>}
            {e.id && <button onClick={entfernen} style={{ ...knopf(), border: "none", background: "none", color: "var(--muted)", marginLeft: "auto" }}>Löschen</button>}
          </div>
          {meldung && <div style={{ marginTop: 8, fontSize: 13, color: "var(--text2)" }}>{meldung}</div>}
        </div>
      );
    }

    const abnahme = e.abnahme_am || abnahmeJeProjekt[e.projekt_id];
    const ende = e.art === "gewaehrleistung" ? (e.datum || gewaehrleistungsEnde(abnahme, e.jahre ?? 4)) : e.datum;
    return (
      <div>
        <div style={{ fontSize: 18, fontWeight: 500, marginBottom: 16 }}>{e.id ? (e.titel || fristLabel(e.art)) : "Neue Frist"}</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <Feld l="Art"><select value={e.art} onChange={x => aendern({ art: x.target.value })} style={feld}>{FRIST_ARTEN.map(a => <option key={a.art} value={a.art}>{a.label}</option>)}</select></Feld>
          {projektFeld}
        </div>
        <div style={{ marginTop: 8 }}><Feld l="Bezeichnung"><input value={e.titel || ""} onChange={x => aendern({ titel: x.target.value })}
          placeholder={e.art === "gewaehrleistung" ? "z. B. Rohbau, Abdichtung, Haustechnik" : "z. B. Fertigstellung 2. OG"} style={feld} /></Feld></div>
        {e.art === "gewaehrleistung" ? (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
              {datumFeld("Abnahme am", "abnahme_am")}
              {zahlFeld("Jahre", "jahre", "4")}
            </div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>VOB/B § 13 Abs. 4: Bauwerke 4 Jahre, wartungsbedürftige Anlagenteile 2 Jahre. BGB: 5 Jahre. Was vereinbart ist, gilt</div>
            <div style={{ marginTop: 8 }}>{datumFeld("Abweichend vereinbartes Ende", "datum")}</div>
            <div style={{ fontSize: 13, color: "var(--text2)", marginTop: 8 }}>{ende ? <>Endet am <span style={zahl}>{datumDe(ende)}</span>, Erinnerung zur Begehung 3 Monate vorher</> : "Abnahmedatum eintragen, dann rechnet Polaris das Ende"}</div>
          </>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
            {datumFeld("Datum", "datum")}
            {zahlFeld("Erinnern Tage vorher", "erinnerung_tage", "30")}
          </div>
        )}
        <textarea value={e.notiz || ""} placeholder="Notiz" onChange={x => aendern({ notiz: x.target.value })} rows={2} style={{ ...feld, height: "auto", padding: "8px 10px", marginTop: 8 }} />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", borderTop: "1px solid var(--border)", paddingTop: 16, marginTop: 16 }}>
          <button onClick={() => sichern()} style={knopf(true)}>Speichern</button>
          {e.id && !e.erledigt_am && <button onClick={() => sichern({ ...e, erledigt_am: heute }, "Erledigt")} style={knopf()}>Erledigt</button>}
          {e.id && e.erledigt_am && <button onClick={() => sichern({ ...e, erledigt_am: null }, "Wieder offen")} style={knopf()}>Wieder öffnen</button>}
          {e.id && <button onClick={entfernen} style={{ ...knopf(), border: "none", background: "none", color: "var(--muted)", marginLeft: "auto" }}>Löschen</button>}
        </div>
        {meldung && <div style={{ marginTop: 8, fontSize: 13, color: "var(--text2)" }}>{meldung}</div>}
      </div>
    );
  })();

  const offen = termine.filter(passt).filter(t => t.stand !== "ok");
  const REITER = [["termine", "Termine", offen.length], ["sicherheiten", "Sicherheiten", sicherheiten.filter(passt).filter(s => s.status !== "zurueck").length], ["fristen", "Fristen", fristen.filter(passt).filter(f => !f.erledigt_am).length]];

  const links = (
    <div style={{ minWidth: 0, flex: 1 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        {baustellenAuswahl}
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button onClick={() => { setReiter("fristen"); neu("frist"); }} style={knopf()}><Plus size={16} strokeWidth={1.5} /> Frist</button>
          <button onClick={() => { setReiter("sicherheiten"); neu("sicherheit"); }} style={knopf(true)}><Plus size={16} strokeWidth={1.5} /> Sicherheit</button>
        </div>
      </div>
      <div role="tablist" style={{ display: "flex", gap: 24, borderBottom: "1px solid var(--border)", marginBottom: 16 }}>
        {REITER.map(([k, l, n]) => (
          <button key={k} role="tab" aria-selected={reiter === k} onClick={() => setReiter(k)}
            style={{ height: 40, padding: 0, marginBottom: -1, background: "none", border: "none", borderBottom: `2px solid ${reiter === k ? "var(--text)" : "transparent"}`,
              color: reiter === k ? "var(--text)" : "var(--text2)", fontFamily: "inherit", fontSize: 14, fontWeight: reiter === k ? 500 : 400, cursor: "pointer", display: "flex", gap: 6, alignItems: "center" }}>
            {l}<span style={{ ...zahl, color: k === "termine" && n ? "var(--red)" : "var(--muted)" }}>{n}</span>
          </button>
        ))}
      </div>
      {fehler && <div role="alert" style={{ color: "var(--red)", background: "var(--rbg)", borderRadius: 8, padding: "8px 12px", marginBottom: 12, fontSize: 13 }}>{fehler}</div>}
      {reiter === "sicherheiten" && sichtbareS.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: istDesktop ? "repeat(3, minmax(0,1fr))" : "1fr", gap: 16, marginBottom: 16 }}>
          {[["Von uns gestellt", eur(summe("gestellt"))], ["Von NU erhalten", eur(summe("erhalten"))], ["Avalprovision je Jahr", eur(avalkostenJahr(sichtbareS))]].map(([l, w]) => (
            <div key={l} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "16px 20px" }}>
              <div style={{ fontSize: 13, color: "var(--text2)" }}>{l}</div>
              <div style={{ ...zahl, fontSize: 24, lineHeight: "32px", fontWeight: 500, marginTop: 8 }}>{w}</div>
            </div>
          ))}
        </div>
      )}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, overflow: "clip" }}>
        {reiter === "termine" ? termineAnsicht : reiter === "sicherheiten" ? sicherheitenAnsicht : fristenAnsicht}
      </div>
    </div>
  );

  if (!istDesktop) return <div className="eigen-felder">{formular ? <div style={{ background: "var(--surface)", borderRadius: 12, padding: 16 }}>
    <button onClick={async () => { if (geaendert && !(await verlassenBestaetigen())) return; setAuswahl(null); setEntwurf(null); }} style={{ ...knopf(), border: "none", background: "none", paddingLeft: 0, color: "var(--text2)", marginBottom: 8 }}>Zurück</button>{formular}</div> : links}</div>;
  return (
    <div className="eigen-felder" style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
      {links}
      <aside style={{ flex: "0 0 400px", position: "sticky", top: 16, maxHeight: "calc(100vh - 32px)", overflowY: "auto", boxSizing: "border-box",
        background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 20 }}>
        {formular || <div style={{ color: "var(--text2)", lineHeight: "20px" }}>Einen Termin, eine Sicherheit oder eine Frist anklicken. Rückgabe- und Gewährleistungstermine rechnet Polaris aus der Abnahme nach VOB/B, vereinbarte Daten gehen vor</div>}
      </aside>
    </div>
  );
}
