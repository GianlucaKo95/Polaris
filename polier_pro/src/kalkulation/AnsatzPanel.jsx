// Ansätze der gewählten Position: was eine Mengeneinheit kostet, aus Lohn,
// Stoffen, Geräten, Nachunternehmer und Sonstigem, mit Zuschlag zum EP.
import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Boxes, Save } from "lucide-react";
import { Knopf, euro, zahlLesen, Meldung } from "./ui.jsx";
import { useStammdaten } from "./stammdaten.js";
import {
  KOSTENARTEN, KOSTENART_LABEL, MITTELLOHN_ID, ansatzMenge, ansatzPreis, ansatzFormelFehler, variablenVon,
  bausteinZuAnsaetze, ansaetzeZuBaustein, kostenartAusKategorie, epAusSaetzen,
} from "../lib/kalk/rechenkern.js";
import { neueId } from "../lib/kalk/lvBaum.js";

const zahl = (x, st = 4) => (Number(x) || 0).toLocaleString("de-DE", { maximumFractionDigits: st });
const RASTER = "128px minmax(160px, 1fr) 108px 52px 64px 84px 92px 28px";

// Eingabe, die erst bei Enter oder Verlassen übernimmt
function Zelle({ wert, onWert, disabled, rechts, liste, placeholder, breit, label, breite }) {
  const [t, setT] = useState(wert ?? "");
  useEffect(() => { setT(wert ?? ""); }, [wert]);
  return (
    <input className="ans-feld" value={t} disabled={disabled} list={liste} placeholder={placeholder} aria-label={label}
      style={{ textAlign: rechts ? "right" : "left", fontFamily: rechts ? "var(--font-zahl)" : undefined, width: breit ? "100%" : breite }}
      onChange={e => setT(e.target.value)}
      onBlur={() => { if (String(t) !== String(wert ?? "")) onWert(t); }}
      onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") { setT(wert ?? ""); e.currentTarget.blur(); } }} />
  );
}

export function AnsatzPanel({ k, ansaetze, z, ergebnis, saetze, gesperrt, anwenden }) {
  const sd = useStammdaten();
  const [meldung, setMeldung] = useState(null);
  const [bausteinSuche, setBausteinSuche] = useState(false);
  const vars = variablenVon(k);
  const preise = sd.kalkulationspreise || [];
  const preisNachLabel = useMemo(() => new Map(preise.map(p => [`${p.bezeichnung} · ${p.einheit || "–"} · ${euro(p.preis)} €`, p])), [preise]);
  const liste = useMemo(() => [...ansaetze].sort((a, b) => a.sort - b.sort), [ansaetze]);
  useEffect(() => { setMeldung(null); setBausteinSuche(false); }, [k?.id]);

  if (!k) return null;
  const aendern = (id, felder) => anwenden({ ansaetze: { aendern: [{ id, felder }] } });
  const extraSetzen = felder => anwenden({ aendern: [{ id: k.id, felder: { extra: { ...(k.extra || {}), ...felder } } }] });

  const neuerAnsatz = ka => {
    const sort = (liste.at(-1)?.sort ?? 0) + 1024;
    const basis = { id: neueId(), knoten_id: k.id, sort, kostenart: ka, ressource_id: null, bezeichnung: "", einheit: "", menge_je_me: 0, faktor: 1, preis: 0, formel: null, kommentar: "" };
    if (ka === "lohn") Object.assign(basis, { ressource_id: MITTELLOHN_ID, bezeichnung: "Mittellohn", einheit: "h" });
    if (ka === "fremd") Object.assign(basis, { bezeichnung: "Nachunternehmer", einheit: k.einheit || "", menge_je_me: 1 });
    anwenden({ ansaetze: { neu: [basis] } });
  };

  const ressourceSetzen = (a, text) => {
    const p = preisNachLabel.get(text);
    if (p) aendern(a.id, { ressource_id: String(p.id), bezeichnung: p.bezeichnung, einheit: p.einheit || "", preis: Number(p.preis) || 0, kostenart: kostenartAusKategorie(p.kategorie) });
    else if (/^mittellohn/i.test(text.trim()) && a.kostenart === "lohn") aendern(a.id, { ressource_id: MITTELLOHN_ID, bezeichnung: "Mittellohn", einheit: "h" });
    else aendern(a.id, { ressource_id: null, bezeichnung: text.trim() });
  };

  const mengeSetzen = (a, text) => {
    const t = String(text).trim();
    if (/[A-Za-zÄÖÜäöü_]/.test(t)) { aendern(a.id, { formel: t, menge_je_me: 0 }); return; }
    const n = zahlLesen(t);
    if (n == null) { setMeldung(`„${t}“ ist keine Zahl und keine Formel.`); return; }
    aendern(a.id, { formel: null, menge_je_me: n });
  };

  const bausteinEinfuegen = sp => {
    const { ansaetze: neu, variablen } = bausteinZuAnsaetze(sp, { knotenId: k.id, stammpositionen: sd.stammpositionen, kalkulationspreise: preise, startSort: (liste.at(-1)?.sort ?? 0) + 1024 });
    const felder = {};
    if (variablen) felder.extra = { ...(k.extra || {}), variablen: { ...variablen, ...(k.extra?.variablen || {}) } };
    if (!k.einheit && sp.einheit) felder.einheit = sp.einheit;
    if (!k.kurztext && sp.bez) felder.kurztext = sp.bez;
    if (!k.langtext && sp.langtext) felder.langtext = sp.langtext;
    anwenden({ ansaetze: { neu }, aendern: Object.keys(felder).length ? [{ id: k.id, felder }] : [] });
    setBausteinSuche(false);
    setMeldung(`${neu.length} Ansätze aus „${sp.bez}“ übernommen.`);
  };

  const alsBaustein = () => {
    if (!sd.onStammpositionenAendern) { setMeldung("Stammpositionen können hier nicht gespeichert werden (Stammdaten nicht geladen)."); return; }
    const { stammposition, uebersprungen } = ansaetzeZuBaustein(k, liste);
    if (!stammposition.rezeptur.length && !stammposition.fremdleistungJeEinheit) { setMeldung("Für einen Baustein braucht es Ansätze mit Stammdaten-Ressource."); return; }
    sd.onStammpositionenAendern([...(sd.stammpositionen || []), { id: Date.now(), ...stammposition }]);
    setMeldung(`Als Baustein „${stammposition.bez}“ gespeichert.${uebersprungen.length ? ` Ohne Stammdaten-Ressource nicht übernommen: ${uebersprungen.join(", ")}.` : ""}`);
  };

  const variableSetzen = (name, text) => {
    const v = { ...(k.extra?.variablen || {}) };
    if (text === null) delete v[name];
    else { const n = zahlLesen(text); if (n == null) return; v[name] = n; }
    extraSetzen({ variablen: v });
  };
  const variableNeu = () => {
    const eingabe = window.prompt("Variable anlegen, z. B. d = 0,25");
    const m = String(eingabe || "").match(/^\s*([A-Za-zÄÖÜäöü_]\w*)\s*=\s*(.+)$/);
    if (m) variableSetzen(m[1], m[2]);
  };

  const ek = ergebnis?.ekJeMe || {};
  const manuell = !!k.extra?.epManuell;
  const epKalk = ergebnis ? epAusSaetzen(ek, saetze) : 0;

  return (
    <section aria-label="Ansätze" style={{ borderTop: "1px solid var(--border2)", marginTop: 10, paddingTop: 10, display: "flex", flexDirection: "column", gap: 8, minHeight: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", fontSize: 13 }}>
        <strong style={{ fontWeight: 500 }}>Kalkulation {k.oz}</strong>
        <span style={{ color: "var(--text2)" }}>je {k.einheit || "ME"}</span>
        <span style={{ display: "flex", gap: 6, alignItems: "center", color: "var(--text2)" }}>
          Variablen:
          {Object.entries(vars).map(([n, w]) => (
            <span key={n} className="kb-zahl" style={{ display: "inline-flex", alignItems: "center", gap: 2, padding: "0 4px", border: "1px solid var(--border2)", borderRadius: 6 }}>
              {n} =
              <Zelle wert={zahl(w, 6)} rechts breite={64} disabled={gesperrt} label={`Variable ${n}`} onWert={t => variableSetzen(n, t)} />
              {!gesperrt && <button className="kb-symbol" style={{ width: 18, height: 18 }} aria-label={`Variable ${n} entfernen`} onClick={() => variableSetzen(n, null)}>×</button>}
            </span>
          ))}
          {!gesperrt && <button className="kb-knopf leise klein" onClick={variableNeu}>+ Variable</button>}
        </span>
        <div style={{ flex: 1 }} />
        <label style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--text2)" }} title="Mit manuellem EP bleibt der EP fest; die Ansätze dienen nur zur Information">
          <input type="checkbox" checked={manuell} disabled={gesperrt || !liste.length} onChange={e => extraSetzen({ epManuell: e.target.checked || undefined })} />
          EP manuell
        </label>
      </div>

      <div role="table" aria-label="Ansätze" style={{ overflowY: "auto", maxHeight: 168, border: "1px solid var(--border)", borderRadius: 8, background: "var(--surface)" }}>
        <div role="row" className="ans-zeile kopf" style={{ gridTemplateColumns: RASTER }}>
          <span>Kostenart</span><span>Ressource / Bezeichnung</span><span className="r">Menge / Formel</span><span>ME</span><span className="r">Faktor</span><span className="r">Preis €</span><span className="r">€ je {k.einheit || "ME"}</span><span />
        </div>
        {liste.map(a => {
          const f = ansatzFormelFehler(a, vars);
          const kosten = ansatzMenge(a, vars) * ansatzPreis(a, z);
          return (
            <div role="row" key={a.id} className="ans-zeile" style={{ gridTemplateColumns: RASTER }}>
              <select className="ans-feld" value={a.kostenart} disabled={gesperrt} aria-label="Kostenart" onChange={e => aendern(a.id, { kostenart: e.target.value })}>
                {KOSTENARTEN.map(ka => <option key={ka} value={ka}>{KOSTENART_LABEL[ka]}</option>)}
              </select>
              <Zelle wert={a.ressource_id === MITTELLOHN_ID ? "Mittellohn" : a.bezeichnung} liste="kb-ressourcen" breit disabled={gesperrt} label="Ressource"
                placeholder="Ressource suchen oder Text" onWert={t => ressourceSetzen(a, t)} />
              <span title={f || (a.formel ? `= ${zahl(ansatzMenge(a, vars) / (a.faktor ?? 1), 6)}` : "")} style={{ display: "flex" }}>
                <Zelle wert={a.formel || zahl(a.menge_je_me, 6)} rechts breit disabled={gesperrt} label="Menge je ME" onWert={t => mengeSetzen(a, t)} />
              </span>
              <Zelle wert={a.einheit} breit disabled={gesperrt || a.ressource_id === MITTELLOHN_ID} label="Einheit" onWert={t => aendern(a.id, { einheit: t.trim() })} />
              <Zelle wert={zahl(a.faktor ?? 1, 4)} rechts breit disabled={gesperrt} label="Faktor" onWert={t => { const n = zahlLesen(t); if (n != null) aendern(a.id, { faktor: n }); }} />
              {a.ressource_id === MITTELLOHN_ID
                ? <span className="kb-zahl r" title="Mittellohn des Stands (Reiter Zuschläge)">{euro(z.mittellohn)}</span>
                : <Zelle wert={zahl(a.preis, 4)} rechts breit disabled={gesperrt} label="Preis" onWert={t => { const n = zahlLesen(t); if (n != null) aendern(a.id, { preis: n }); }} />}
              <span className="kb-zahl r" style={{ color: f ? "var(--red)" : undefined }}>{f ? "Formel?" : euro(kosten)}</span>
              {!gesperrt ? <button className="kb-symbol" aria-label="Ansatz löschen" onClick={() => anwenden({ ansaetze: { loeschen: [a.id] } })}><Trash2 size={14} /></button> : <span />}
            </div>
          );
        })}
        {!liste.length && <div style={{ padding: "12px 10px", color: "var(--muted)", fontSize: 13 }}>Noch keine Ansätze. Der EP ist ein Festpreis.</div>}
      </div>
      <datalist id="kb-ressourcen">
        <option value="Mittellohn" />
        {[...preisNachLabel.keys()].map(l => <option key={l} value={l} />)}
      </datalist>

      <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
        {!gesperrt && KOSTENARTEN.map(ka => <Knopf key={ka} klein leise Icon={Plus} onClick={() => neuerAnsatz(ka)}>{KOSTENART_LABEL[ka]}</Knopf>)}
        {!gesperrt && (
          <div style={{ position: "relative" }}>
            <Knopf klein leise Icon={Boxes} onClick={() => setBausteinSuche(s => !s)} disabled={!(sd.stammpositionen || []).length}>Baustein</Knopf>
            {bausteinSuche && <BausteinWahl stammpositionen={sd.stammpositionen || []} einheit={k.einheit} onWahl={bausteinEinfuegen} onSchliessen={() => setBausteinSuche(false)} />}
          </div>
        )}
        {!gesperrt && liste.length > 0 && <Knopf klein leise Icon={Save} onClick={alsBaustein}>Als Baustein speichern</Knopf>}
        <div style={{ flex: 1 }} />
        <div className="kb-zahl" style={{ display: "flex", gap: 14, fontSize: 12.5, color: "var(--text2)", flexWrap: "wrap" }}>
          {KOSTENARTEN.filter(ka => ek[ka]).map(ka => <span key={ka}>{KOSTENART_LABEL[ka]} {euro(ek[ka])}</span>)}
          {ergebnis?.stundenJeMe ? <span>{zahl(ergebnis.stundenJeMe, 4)} h</span> : null}
          <span>EK {euro(ergebnis?.summeJeMe)}</span>
          <span style={{ color: "var(--text)" }}>EP kalkuliert {euro(epKalk)}{manuell && Math.round(epKalk * 100) !== Math.round(Number(k.ep) * 100) ? ` · gesetzt ${euro(k.ep)}` : ""}</span>
        </div>
      </div>
      {meldung && <Meldung onSchliessen={() => setMeldung(null)}>{meldung}</Meldung>}
    </section>
  );
}

function BausteinWahl({ stammpositionen, einheit, onWahl, onSchliessen }) {
  const [q, setQ] = useState("");
  const treffer = stammpositionen
    .filter(s => !q.trim() || `${s.bez} ${s.gewerk || ""}`.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => (String(b.einheit) === String(einheit)) - (String(a.einheit) === String(einheit)) || String(a.bez).localeCompare(String(b.bez)))
    .slice(0, 30);
  return (
    <div style={{ position: "absolute", bottom: 32, left: 0, zIndex: 30, width: 360, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, boxShadow: "0 8px 24px rgba(22,24,29,0.14)", padding: 6 }}>
      <input autoFocus className="kb-eingabe" placeholder="Baustein suchen" value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === "Escape") onSchliessen(); if (e.key === "Enter" && treffer[0]) onWahl(treffer[0]); }} style={{ height: 32, marginBottom: 4 }} />
      <div style={{ maxHeight: 260, overflowY: "auto" }}>
        {treffer.map(s => (
          <button key={s.id} className="kb-knopf leise klein" style={{ width: "100%", justifyContent: "space-between", fontWeight: 400 }} onClick={() => onWahl(s)}>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{s.bez}</span><span style={{ color: "var(--muted)" }}>{s.einheit}</span>
          </button>
        ))}
        {!treffer.length && <div style={{ padding: 8, color: "var(--muted)", fontSize: 13 }}>Kein Baustein gefunden</div>}
      </div>
    </div>
  );
}
