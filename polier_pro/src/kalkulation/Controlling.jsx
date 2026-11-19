// Controlling (Phase 6): Soll-Ist, Ergebnisprognose mit Brücke, monatliche
// Leistungsmeldung, Nachkalkulation zurück in die Stammdaten. Logik: lib/kalk/controlling.js.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Lock, Copy, FileText, RotateCcw } from "lucide-react";
import { useStammdaten } from "./stammdaten.js";
import { Knopf, Feld, Dialog, Meldung, Leer, euro, menge as mengeText, datum, zahlLesen } from "./ui.jsx";
import {
  controlling, nuKostenAusRechnungen, stundenAusZeitbuchungen, monatsErster, monatsEnde, monatName, meldungWerte, verlauf, nachkalkulationAnsaetze,
  STANDARD_EINSTELLUNGEN, MIN_SOLL_STUNDEN,
} from "../lib/kalk/controlling.js";
import { zeitansaetzeAnpassen } from "../lib/nachkalkulation.js";
import { argePruefen, argeAufteilung, argeBerichtHtml, neuerPartner } from "../lib/kalk/arge.js";

const heuteMonat = () => monatsErster(new Date().toISOString().slice(0, 10));
const prozent = x => (x == null ? "—" : `${(x * 100).toLocaleString("de-DE", { maximumFractionDigits: 1 })} %`);
const vorzeichen = x => `${x > 0 ? "+" : x < 0 ? "−" : ""}${euro(Math.abs(x))}`;

export function ControllingBereich({ speicher, projekt, staende, darf, onFehler, onStandGeaendert, onStandOeffnen, onProjektAendern }) {
  const sd = useStammdaten();
  const [d, setD] = useState(null);
  const [monat, setMonat] = useState(heuteMonat());
  const [stammDialog, setStammDialog] = useState(false);
  const [meldung, setMeldung] = useState(null);
  const timer = useRef(null);
  const auftrag = useMemo(() => staende.filter(s => s.art === "auftrag").sort((a, b) => b.nummer - a.nummer)[0] || null, [staende]);
  const arbeit = useMemo(() => staende.filter(s => s.art === "arbeitskalkulation").sort((a, b) => b.nummer - a.nummer)[0] || null, [staende]);
  const nachkalk = useMemo(() => staende.filter(s => s.art === "nachkalkulation").sort((a, b) => b.nummer - a.nummer)[0] || null, [staende]);
  const einstellungen = { ...STANDARD_EINSTELLUNGEN, ...(projekt.controlling || {}) };

  const laden = useCallback(async () => {
    if (!auftrag) return;
    try {
      const [nachtraege, aufmass, nuRechnungen, rechnungen, meldungen, zeit] = await Promise.all([
        speicher.nachtraegeLaden(projekt.id), speicher.aufmassLaden(projekt.id), speicher.nuRechnungenLaden(projekt.id), speicher.rechnungenLaden(projekt.id),
        speicher.leistungsmeldungenLaden(projekt.id), projekt.projekt_id && speicher.istStundenLaden ? speicher.istStundenLaden(projekt.projekt_id).catch(() => []) : []]);
      const ids = [auftrag.id, arbeit?.id, ...nachtraege.map(n => n.stand_id)].filter(Boolean);
      const lv = new Map(await Promise.all(ids.map(async id => [id, { knoten: await speicher.knotenLaden(id), ansaetze: await speicher.ansaetzeLaden(id) }])));
      setD({ nachtraege, aufmass, nuRechnungen, rechnungen, meldungen, zeit, lv });
    } catch (e) { onFehler(e.nutzerText || e.message); setD({ fehler: true }); }
  }, [speicher, projekt.id, projekt.projekt_id, auftrag?.id, arbeit?.id, onFehler]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { laden(); }, [laden]);

  const aktuelleMeldung = d?.meldungen?.find(m => m.monat === monat) || null;
  const bis = monatsEnde(monat);
  const vorschlag = useMemo(() => {
    if (!d || d.fehler) return {};
    return { stunden: stundenAusZeitbuchungen(d.zeit, { bis }).summe || undefined, fremd: nuKostenAusRechnungen(d.nuRechnungen, { bis }) || undefined };
  }, [d, bis]);
  const ist = aktuelleMeldung?.ist || {};
  const istWirksam = { ...Object.fromEntries(Object.entries(vorschlag).filter(([, v]) => v != null)), ...ist };

  const c = useMemo(() => {
    if (!d || d.fehler || !auftrag) return null;
    const teil = s => ({ stand: s, ...(d.lv.get(s.id) || { knoten: [], ansaetze: [] }) });
    const staendeNachId = new Map(staende.map(s => [s.id, s]));
    return controlling({
      auftrag: teil(auftrag), arbeit: arbeit ? teil(arbeit) : null,
      nachtraege: d.nachtraege.filter(n => n.stand_id && staendeNachId.has(n.stand_id)).map(n => ({ nachtrag: n, ...teil(staendeNachId.get(n.stand_id)) })),
      aufmass: d.aufmass.filter(a => !a.datum || a.datum <= bis), ist: istWirksam, einstellungen,
    });
  }, [d, auftrag, arbeit, staende, bis, JSON.stringify(istWirksam), JSON.stringify(einstellungen)]); // eslint-disable-line react-hooks/exhaustive-deps

  const istSetzen = (feld, wert) => {
    const neuIst = { ...ist, [feld]: wert };
    if (wert == null) delete neuIst[feld];
    const m = aktuelleMeldung ? { ...aktuelleMeldung, ist: neuIst } : { id: crypto.randomUUID(), monat, status: "entwurf", ist: neuIst, werte: {}, bemerkung: "" };
    setD(x => ({ ...x, meldungen: x.meldungen.some(y => y.id === m.id) ? x.meldungen.map(y => (y.id === m.id ? m : y)) : [...x.meldungen, m] }));
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => { try { await speicher.leistungsmeldungSpeichern(projekt.id, m); } catch (e) { onFehler(e.nutzerText || e.message); } }, 600);
  };
  const einstellen = felder => onProjektAendern({ controlling: { ...einstellungen, ...felder } });
  const melden = async () => {
    const abgerechnet = d.rechnungen.filter(r => ["gestellt", "bezahlt"].includes(r.status) && (!r.leistung_bis || r.leistung_bis <= bis)).reduce((s, r) => Math.max(s, Number(r.summen?.leistung) || 0), 0);
    if (c.istAngenommen.length && !window.confirm(`Für ${c.istAngenommen.length} Kostenarten sind keine Ist-Kosten erfasst; dort gilt Ist = Soll. Trotzdem melden?`)) return;
    if (!window.confirm(`Leistungsmeldung ${monatName(monat)} melden? Die Werte werden eingefroren.`)) return;
    const m = { ...(aktuelleMeldung || { id: crypto.randomUUID(), monat, bemerkung: "" }), ist: istWirksam, status: "gemeldet", werte: meldungWerte(c, { abgerechnet }) };
    try { await speicher.leistungsmeldungSpeichern(projekt.id, m); await laden(); setMeldung(`Leistungsmeldung ${monatName(monat)} gemeldet.`); } catch (e) { onFehler(e.nutzerText || e.message); }
  };
  const standKopieren = async (art, bezeichnung) => {
    try { const s = await speicher.standKopieren((arbeit || auftrag).id, art, bezeichnung); await onStandGeaendert(); return s; } catch (e) { onFehler(e.nutzerText || e.message); return null; }
  };
  const nachkalkulationAnlegen = async () => {
    const f = c.stunden.faktor;
    if (!window.confirm(`Nachkalkulationsstand aus ${arbeit ? "der Arbeitskalkulation" : "dem Auftrag"} anlegen${f ? `, Lohnstunden × ${String(Math.round(f * 1000) / 1000).replace(".", ",")}` : ""}? Die KI nimmt diese Ist-Werte bei künftigen Angeboten bevorzugt als Vorlage.`)) return;
    const s = await standKopieren("nachkalkulation", "Nachkalkulation (Ist-Werte)");
    if (!s || !f) return;
    try {
      const ans = await speicher.ansaetzeLaden(s.id);
      const ae = nachkalkulationAnsaetze(ans, f);
      if (ae.aendern.length) await speicher.ansaetzeSpeichern(s.id, { neu: [], loeschen: [], ...ae }, { aktuell: ans });
      setMeldung(`Nachkalkulation angelegt, ${ae.aendern.length} Lohnansätze mit Faktor ${String(Math.round(f * 1000) / 1000).replace(".", ",")}.`);
    } catch (e) { onFehler(e.nutzerText || e.message); }
  };

  if (!auftrag) return <div style={{ padding: 24 }}><Leer titel="Noch kein Auftragsstand" text="Controlling vergleicht die Leistung mit dem Auftrag. Lege im Reiter Abrechnung den Auftragsstand an." /></div>;
  if (!d) return <div style={{ padding: 24, color: "var(--text2)" }}>Lädt …</div>;
  if (d.fehler || !c) return null;
  const gemeldet = aktuelleMeldung?.status === "gemeldet";
  const werte = gemeldet ? aktuelleMeldung.werte : null;
  const anzeige = werte ? { ...c, ergebnis: werte.ergebnis, erloes: werte.erloes, kosten: werte.kosten, bruecke: werte.bruecke } : c;
  const monate = [...new Set([heuteMonat(), ...d.meldungen.map(m => m.monat)])].sort().reverse();
  const vl = verlauf(d.meldungen).length >= 2 ? verlauf(d.meldungen) : [];
  const kz = anzeige.ergebnis;

  return (
    <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
        <Feld label="Leistungsmeldung">
          <select className="kb-eingabe" value={monat} onChange={e => setMonat(e.target.value)} style={{ width: 250 }}>
            {monate.map(m => { const x = d.meldungen.find(y => y.monat === m); return <option key={m} value={m}>{monatName(m)}{x?.status === "gemeldet" ? " · gemeldet" : x ? " · Entwurf" : ""}</option>; })}
          </select>
        </Feld>
        <Feld label="Restkosten">
          <select className="kb-eingabe" value={einstellungen.methode} disabled={!darf} onChange={e => einstellen({ methode: e.target.value })} style={{ width: 300 }}>
            <option value="plan">Nach Arbeitskalkulation (Plan)</option><option value="trend">Hochgerechnet mit Ist/Soll (Trend)</option>
          </select>
        </Feld>
        <Feld label="Offene Nachträge zu"><select className="kb-eingabe" value={einstellungen.ntQuote} disabled={!darf} onChange={e => einstellen({ ntQuote: Number(e.target.value) })} style={{ width: 120 }}>
          {[0, 25, 50, 75, 100].map(q => <option key={q} value={q}>{q} %</option>)}</select></Feld>
        <span style={{ flex: 1 }} />
        {gemeldet ? <span style={{ display: "inline-flex", gap: 6, alignItems: "center", color: "var(--text2)", fontSize: 13 }}><Lock size={14} /> gemeldet {datum(aktuelleMeldung.gemeldet_am)}</span>
          : darf && <Knopf haupt onClick={melden}>{monatName(monat)} melden</Knopf>}
      </div>
      {meldung && <Meldung art="ok" onSchliessen={() => setMeldung(null)}>{meldung}</Meldung>}
      {!gemeldet && c.istAngenommen.length > 0 && <Meldung>Ohne erfasste Ist-Kosten gilt Ist = Soll für: {c.istAngenommen.map(k => c.kostenarten.find(x => x.kostenart === k).label).join(", ")}. Erst mit Ist-Kosten wird die Prognose aussagekräftig.</Meldung>}

      {!gemeldet && Number(istWirksam.stunden) > 0 && !ist.lohn && !c.stunden.mittellohn && <Meldung art="fehler">Ist-Stunden sind erfasst, aber im Stand ist kein Mittellohn hinterlegt (Reiter Zuschläge). Ohne ihn zählen die Stunden mit 0 €.</Meldung>}
      <div className="co-kennzahlen">
        <Kz label="Auftrag inkl. Nachträge" wert={euro(anzeige.erloes.prognose)} unter={`davon Nachträge ${euro(anzeige.erloes.nachtraege + anzeige.erloes.nachtraegeOffen)}`} />
        <Kz label="Leistung bis Monatsende" wert={euro(anzeige.erloes.kum)} unter={`${Math.round((werte?.fortschritt ?? c.fortschritt) * 100)} % erbracht`} />
        <Kz label="Ist-Kosten" wert={euro(anzeige.kosten.istKum)} unter={`Soll der Leistung ${euro(anzeige.kosten.sollKum)}`} />
        <Kz label="Ergebnis kalkuliert" wert={euro(kz.kalkuliert)} unter={prozent(kz.kalkProzent)} />
        <Kz label="Ergebnis Prognose" gross wert={euro(kz.prognose)} unter={`${prozent(kz.prognoseProzent)} · ${vorzeichen(kz.abweichung)} zur Kalkulation`} farbe={kz.abweichung < 0 ? "var(--red)" : kz.abweichung > 0 ? "var(--green)" : undefined} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: vl.length ? "minmax(0, 3fr) minmax(0, 2fr)" : "1fr", gap: 20 }}>
        <section className="co-karte"><h2>Ergebnisbrücke</h2><Bruecke daten={anzeige.bruecke} /></section>
        {vl.length > 0 && <section className="co-karte"><h2>Prognose je Monat</h2><Verlauf daten={vl} /></section>}
      </div>

      <section className="co-karte">
        <h2>Soll-Ist je Kostenart</h2>
        <table className="vg-spiegel">
          <thead><tr><th>Kostenart</th><th className="r">Kalkuliert</th><th className="r">Soll gesamt</th><th className="r">Soll der Leistung</th><th className="r">Ist</th><th className="r">Abweichung</th><th className="r">Ist/Soll</th><th className="r">Restkosten</th><th className="r">Prognose</th></tr></thead>
          <tbody>{(werte ? werte.kostenarten.map(w => ({ ...c.kostenarten.find(k => k.kostenart === w.kostenart), ...w, abweichung: w.sollKum - w.istKum })) : c.kostenarten).map(k => (
            <tr key={k.kostenart}>
              <td>{k.label}</td>
              <td className="r kb-zahl" style={{ color: "var(--text2)" }}>{euro(k.kalk)}</td>
              <td className="r kb-zahl">{euro(k.sollGesamt)}</td>
              <td className="r kb-zahl">{euro(k.sollKum)}</td>
              <td className="r">{gemeldet || !darf || k.kostenart === "lohn" && !ist.lohn && istWirksam.stunden
                ? <span className="kb-zahl">{euro(k.istKum)}{k.kostenart === "lohn" && !ist.lohn && istWirksam.stunden ? <span style={{ color: "var(--muted)" }}> ¹</span> : ""}</span>
                : <IstFeld wert={ist[k.kostenart] ?? (k.kostenart === "fremd" ? vorschlag.fremd : undefined)} platzhalter={k.angenommen ? "= Soll" : ""} onSetzen={v => istSetzen(k.kostenart, v)} />}</td>
              <td className="r kb-zahl" style={{ color: k.abweichung < -0.5 ? "var(--red)" : k.abweichung > 0.5 ? "var(--green)" : "var(--text2)" }}>{vorzeichen(k.abweichung)}</td>
              <td className="r kb-zahl" style={{ color: "var(--text2)" }}>{k.faktor == null ? "—" : k.faktor.toLocaleString("de-DE", { maximumFractionDigits: 2 })}</td>
              <td className="r kb-zahl">{euro(k.rest)}{k.trend ? <span style={{ color: "var(--muted)" }}> ²</span> : ""}</td>
              <td className="r kb-zahl" style={{ fontWeight: 500 }}>{euro(k.prognose)}</td>
            </tr>))}</tbody>
          <tfoot><tr className="stark"><td>Summe</td><td className="r kb-zahl">{euro(anzeige.kosten.kalk)}</td><td /><td className="r kb-zahl">{euro(anzeige.kosten.sollKum)}</td><td className="r kb-zahl">{euro(anzeige.kosten.istKum)}</td>
            <td className="r kb-zahl">{vorzeichen(anzeige.kosten.sollKum - anzeige.kosten.istKum)}</td><td /><td /><td className="r kb-zahl">{euro(anzeige.kosten.prognose)}</td></tr></tfoot>
        </table>
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap", fontSize: 13, color: "var(--text2)", marginTop: 10, alignItems: "center" }}>
          <span>Lohnstunden: Soll der Leistung <span className="kb-zahl">{mengeText(c.stunden.sollKum)} h</span></span>
          <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>Ist {gemeldet || !darf ? <span className="kb-zahl">{mengeText(istWirksam.stunden || 0)} h</span>
            : <IstFeld wert={ist.stunden ?? vorschlag.stunden} einheit="h" onSetzen={v => istSetzen("stunden", v)} />}
            {vorschlag.stunden != null && ist.stunden == null && <span style={{ color: "var(--muted)" }}>aus der Zeiterfassung</span>}</span>
          <span>Mittellohn <span className="kb-zahl">{euro(c.stunden.mittellohn)}</span></span>
          {c.stunden.faktor != null && <span>Stundenfaktor <b className="kb-zahl" style={{ color: c.stunden.faktor > 1.05 ? "var(--red)" : c.stunden.faktor < 0.95 ? "var(--green)" : "var(--text)" }}>{c.stunden.faktor.toLocaleString("de-DE", { maximumFractionDigits: 2 })}</b></span>}
        </div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>¹ Stunden × Mittellohn · ² Rest × bisheriges Ist/Soll{c.geschaetzt ? ` · ${c.geschaetzt} Positionen ohne Ansätze: Kosten = EP als Fremdleistung angenommen` : ""}</div>
      </section>

      <PositionenPrognose c={c} darf={darf && !gemeldet} einstellungen={einstellungen} onSetzen={pm => einstellen({ prognoseMengen: pm })} />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <section className="co-karte">
          <h2>Arbeitskalkulation</h2>
          <p className="co-text">Die Arbeitskalkulation ist das Budget der Baustelle: Auftrag mit den tatsächlichen Vergabepreisen und der geplanten Ausführung. Ohne sie gilt die Auftragskalkulation als Soll.</p>
          {arbeit ? <div style={{ display: "flex", gap: 8, alignItems: "center" }}><span style={{ fontSize: 14 }}>Stand {arbeit.nummer} · {arbeit.bezeichnung || "Arbeitskalkulation"}</span>
            <Knopf leise Icon={FileText} onClick={() => onStandOeffnen(arbeit.id)}>Öffnen</Knopf></div>
            : darf && <Knopf Icon={Copy} onClick={() => standKopieren("arbeitskalkulation", "Arbeitskalkulation")}>Aus dem Auftrag anlegen</Knopf>}
        </section>
        <section className="co-karte">
          <h2>Nachkalkulation</h2>
          <p className="co-text">{c.stunden.faktor != null
            ? `Für die erbrachte Leistung wurden ${prozent(Math.abs(c.stunden.faktor - 1))} ${c.stunden.faktor >= 1 ? "mehr" : "weniger"} Stunden gebraucht als kalkuliert. `
            : `Ein Stundenfaktor ist ab ${MIN_SOLL_STUNDEN} Soll-Stunden erbrachter Leistung aussagekräftig. `}
            Der Nachkalkulationsstand hält die Ist-Werte fest; die KI nimmt ihn bei künftigen Angeboten bevorzugt als Vorlage.</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {nachkalk && <Knopf leise Icon={FileText} onClick={() => onStandOeffnen(nachkalk.id)}>Stand {nachkalk.nummer} öffnen</Knopf>}
            {darf && <Knopf Icon={RotateCcw} onClick={nachkalkulationAnlegen}>{nachkalk ? "Neu anlegen" : "Nachkalkulation anlegen"}</Knopf>}
            {darf && c.stunden.faktor != null && sd.onStammpositionenAendern && <Knopf leise onClick={() => setStammDialog(true)}>Zeitansätze in Stammpositionen</Knopf>}
          </div>
        </section>
      </div>
      <ArgeKarte key={JSON.stringify(projekt.arge || {})} projekt={projekt} darf={darf} c={anzeige.erloes ? { ...c, ...anzeige } : c} monat={monat} onAendern={onProjektAendern} onFehler={onFehler} />
      {stammDialog && <StammDialog faktor={c.stunden.faktor} sd={sd} projekt={projekt} onSchliessen={() => setStammDialog(false)} onFertig={n => { setStammDialog(false); setMeldung(`${n} Stammpositionen angepasst.`); }} />}
    </div>
  );
}

function Kz({ label, wert, unter, gross, farbe }) {
  return (
    <div className="co-kz">
      <div style={{ fontSize: 13, color: "var(--text2)" }}>{label}</div>
      <div className="kb-zahl" style={{ fontSize: gross ? 24 : 18, lineHeight: gross ? "32px" : "26px", color: farbe }}>{wert}</div>
      {unter && <div style={{ fontSize: 12, color: "var(--muted)" }}>{unter}</div>}
    </div>
  );
}

function IstFeld({ wert, onSetzen, platzhalter = "", einheit = "", label }) {
  const fmt = w => (w == null ? "" : Number(w).toLocaleString("de-DE", { maximumFractionDigits: einheit ? 1 : 2, minimumFractionDigits: einheit ? 0 : 2 }));
  const [t, setT] = useState(null);
  return <input className="vg-preis kb-zahl" style={{ width: 110 }} inputMode="decimal" placeholder={platzhalter} value={t ?? fmt(wert)} aria-label={label || `Ist ${einheit || "€"}`}
    onFocus={() => setT(fmt(wert))} onChange={e => setT(e.target.value)}
    onBlur={() => { const s = (t ?? "").trim(); setT(null); if (!s) { if (wert != null) onSetzen(null); return; } const v = zahlLesen(s); if (v != null && v !== wert) onSetzen(v); }}
    onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }} />;
}

// Wasserfall: Summen neutral, Beiträge grün/rot
const KURZ = { kalk: "Kalkulation", arbeit: "Arbeitskalk.", mengen: "Mengen", nachtraege: "Nachträge", leistung: "Leistung", prognose: "Prognose" };
function Bruecke({ daten }) {
  const B = 760, H = 240, unten = 40, oben = 16, links = 8;
  let lauf = 0;
  const balken = daten.map(x => {
    if (x.summe) { const b = { ...x, von: 0, bis: x.wert }; lauf = x.wert; return b; }
    const b = { ...x, von: lauf, bis: lauf + x.wert }; lauf += x.wert; return b;
  });
  const werte = balken.flatMap(b => [b.von, b.bis, 0]);
  const min = Math.min(...werte), max = Math.max(...werte);
  const spanne = max - min || 1;
  const y = v => oben + (max - v) / spanne * (H - oben - unten);
  const breite = (B - links * 2) / balken.length;
  return (
    <svg viewBox={`0 0 ${B} ${H}`} style={{ width: "100%", height: "auto" }} role="img" aria-label="Ergebnisbrücke von der Kalkulation zur Prognose">
      <line x1={0} x2={B} y1={y(0)} y2={y(0)} stroke="var(--border2)" />
      {balken.map((b, i) => {
        const x = links + i * breite + breite * 0.18, w = breite * 0.64;
        const y1 = y(Math.max(b.von, b.bis)), h = Math.max(1, Math.abs(y(b.von) - y(b.bis)));
        const farbe = b.summe ? "var(--text2)" : b.wert >= 0 ? "var(--green)" : "var(--red)";
        return (
          <g key={b.id}>
            <rect x={x} y={y1} width={w} height={h} rx={3} fill={farbe} opacity={b.summe ? 0.85 : 0.75} />
            {i < balken.length - 1 && <line x1={x + w} x2={x + breite} y1={y(b.bis)} y2={y(b.bis)} stroke="var(--border2)" strokeDasharray="3 3" />}
            <text x={x + w / 2} y={y1 - 6} textAnchor="middle" fontSize="12" fill="var(--text)" style={{ fontFamily: "var(--font-zahl)" }}>{b.summe ? euro(b.wert) : vorzeichen(b.wert)}</text>
            <text x={x + w / 2} y={H - 14} textAnchor="middle" fontSize="12" fill="var(--text2)">{KURZ[b.id] || b.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

function Verlauf({ daten }) {
  const B = 480, H = 240, l = 56, r = 12, o = 16, u = 32;
  const werte = daten.flatMap(d => [d.prognose, d.kalkuliert]);
  const min = Math.min(0, ...werte), max = Math.max(...werte, 1);
  const x = i => l + (daten.length === 1 ? (B - l - r) / 2 : i * (B - l - r) / (daten.length - 1));
  const y = v => o + (max - v) / (max - min || 1) * (H - o - u);
  const pfad = f => daten.map((d, i) => `${i ? "L" : "M"}${x(i)},${y(d[f])}`).join(" ");
  return (
    <svg viewBox={`0 0 ${B} ${H}`} style={{ width: "100%", height: "auto" }} role="img" aria-label="Verlauf der Ergebnisprognose">
      {[min, (min + max) / 2, max].map(v => <g key={v}><line x1={l} x2={B - r} y1={y(v)} y2={y(v)} stroke="var(--border)" /><text x={l - 6} y={y(v) + 4} textAnchor="end" fontSize="11" fill="var(--muted)" style={{ fontFamily: "var(--font-zahl)" }}>{Math.abs(max - min) >= 20000 ? `${Math.round(v / 1000).toLocaleString("de-DE")} T€` : euro(Math.round(v))}</text></g>)}
      <path d={pfad("kalkuliert")} fill="none" stroke="var(--muted)" strokeDasharray="4 4" />
      <path d={pfad("prognose")} fill="none" stroke="var(--text)" strokeWidth="2" />
      {daten.map((d, i) => <g key={d.monat}><circle cx={x(i)} cy={y(d.prognose)} r="3.5" fill="var(--text)" /><text x={x(i)} y={H - 10} textAnchor="middle" fontSize="11" fill="var(--text2)">{new Date(`${d.monat.slice(0, 7)}-15`).toLocaleDateString("de-DE", { month: "short" })}</text></g>)}
    </svg>
  );
}

function PositionenPrognose({ c, darf, einstellungen, onSetzen }) {
  const [alle, setAlle] = useState(false);
  const liste = c.positionen.filter(p => alle || p.mengeKum || p.vorgabe).sort((a, b) => Math.abs((b.mengePrognose - b.mengeLv) * b.up) - Math.abs((a.mengePrognose - a.mengeLv) * a.up)).slice(0, alle ? 500 : 30);
  const setzen = (p, v) => {
    const pm = { ...(einstellungen.prognoseMengen || {}) };
    if (v == null) delete pm[p.key]; else pm[p.key] = v;
    onSetzen(pm);
  };
  return (
    <section className="co-karte">
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <h2 style={{ flex: 1 }}>Mengenprognose je Position</h2>
        <label style={{ fontSize: 13, color: "var(--text2)", display: "flex", gap: 6 }}><input type="checkbox" checked={alle} onChange={e => setAlle(e.target.checked)} /> Alle Positionen</label>
      </div>
      <p className="co-text">Prognosemenge ist die größere aus LV und Aufmaß. Wo absehbar mehr oder weniger kommt, hier die erwartete Endmenge eintragen.</p>
      {!liste.length ? <div style={{ color: "var(--muted)", fontSize: 13 }}>Noch kein Aufmaß.</div> : (
        <table className="vg-spiegel">
          <thead><tr><th>OZ</th><th>Leistung</th><th className="r">LV</th><th className="r">Aufmaß</th><th className="r">Prognose</th><th className="r">Erlös Prognose</th><th className="r">Soll-Kosten</th><th className="r">Deckung</th></tr></thead>
          <tbody>{liste.map(p => (
            <tr key={p.key}>
              <td className="kb-zahl" style={{ color: "var(--text2)" }}>{p.nachtrag ? `N${p.nachtrag.nummer} ` : ""}{p.oz}</td><td>{p.kurztext}</td>
              <td className="r kb-zahl">{mengeText(p.mengeLv)} {p.einheit}</td><td className="r kb-zahl">{mengeText(p.mengeKum)}</td>
              <td className="r">{darf ? <IstFeld wert={p.mengePrognose} einheit={p.einheit || "ME"} label={`Prognosemenge ${p.oz}`} onSetzen={v => setzen(p, v)} /> : <span className="kb-zahl">{mengeText(p.mengePrognose)}</span>}{p.vorgabe && <span title="Von Hand" style={{ color: "var(--muted)" }}> ✎</span>}</td>
              <td className="r kb-zahl">{euro(p.erloesPrognose)}</td><td className="r kb-zahl">{euro(p.sollPrognose)}</td>
              <td className="r kb-zahl" style={{ color: p.db < 0 ? "var(--red)" : undefined }}>{euro(p.db)}</td>
            </tr>))}</tbody>
        </table>)}
    </section>
  );
}

function StammDialog({ faktor, sd, projekt, onSchliessen, onFertig }) {
  const [auswahl, setAuswahl] = useState(new Set());
  const [suche, setSuche] = useState("");
  const liste = (sd.stammpositionen || []).filter(s => !suche || String(s.bezeichnung || s.bez || "").toLowerCase().includes(suche.toLowerCase()));
  const f = String(Math.round(faktor * 1000) / 1000).replace(".", ",");
  return (
    <Dialog titel="Zeitansätze in Stammpositionen anpassen" breite={620} onSchliessen={onSchliessen}
      fuss={<><Knopf leise onClick={onSchliessen}>Abbrechen</Knopf><Knopf haupt disabled={!auswahl.size} onClick={() => {
        sd.onStammpositionenAendern(zeitansaetzeAnpassen(sd.stammpositionen, [...auswahl], faktor, sd.kalkulationspreise, { projekt: projekt.name }));
        onFertig(auswahl.size);
      }}>{auswahl.size} Stammpositionen × {f}</Knopf></>}>
      <div style={{ fontSize: 13, color: "var(--text2)" }}>Die Lohnstunden der gewählten Stammpositionen werden mit {f} multipliziert. Die Anpassung steht in der Historie der Stammposition und lässt sich nachvollziehen.</div>
      <input className="kb-eingabe" placeholder="Stammposition suchen" value={suche} onChange={e => setSuche(e.target.value)} />
      <div style={{ border: "1px solid var(--border)", borderRadius: 8, maxHeight: 320, overflowY: "auto" }}>
        {liste.map(s => <label key={s.id} className="vg-wahl"><input type="checkbox" checked={auswahl.has(s.id)} onChange={() => setAuswahl(a => { const n = new Set(a); if (n.has(s.id)) n.delete(s.id); else n.add(s.id); return n; })} />
          <span style={{ flex: 1 }}>{s.bezeichnung || s.bez}</span><span style={{ color: "var(--muted)" }}>{s.einheit}</span></label>)}
        {!liste.length && <div style={{ padding: 12, color: "var(--muted)", fontSize: 13 }}>Keine Stammpositionen.</div>}
      </div>
    </Dialog>
  );
}


// ── ARGE ───────────────────────────────────────────────────────────────────
export function ArgeKarte({ projekt, darf, c, monat, onAendern, onFehler }) {
  const [arge, setArge] = useState(() => ({ aktiv: false, partner: [], ...(projekt.arge || {}) }));
  const fehler = argePruefen(arge);
  const geaendert = JSON.stringify(arge) !== JSON.stringify({ aktiv: false, partner: [], ...(projekt.arge || {}) });
  const setP = (i, f) => setArge(a => ({ ...a, partner: a.partner.map((p, j) => (j === i ? { ...p, ...f } : (f.eigene ? { ...p, eigene: false } : f.federfuehrend ? { ...p, federfuehrend: false } : p))) }));
  const kennzahlen = { auftrag: c.erloes.prognose, leistung: c.erloes.kum, istKosten: c.kosten.istKum, ergebnisKalk: c.ergebnis.kalkuliert, ergebnisPrognose: c.ergebnis.prognose };
  const aufteilung = !fehler.length && arge.aktiv ? argeAufteilung(kennzahlen, arge) : [];
  const bericht = async () => {
    try { const { druckePDF } = await import("../lib/pdf.jsx"); await druckePDF(argeBerichtHtml(projekt, monatName(monat), kennzahlen, arge), `ARGE_${String(projekt.name).replace(/\W+/g, "_")}.pdf`); }
    catch (e) { onFehler(`Drucken fehlgeschlagen: ${e.message}`); }
  };
  return (
    <section className="co-karte">
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <h2 style={{ flex: 1 }}>ARGE</h2>
        <label style={{ fontSize: 14, display: "flex", gap: 6 }}><input type="checkbox" checked={!!arge.aktiv} disabled={!darf}
          onChange={e => setArge(a => ({ ...a, aktiv: e.target.checked, partner: a.partner.length ? a.partner : [neuerPartner({ name: "", quote: 50, eigene: true, federfuehrend: true }), neuerPartner({ quote: 50 })] }))} /> Projekt in einer Arbeitsgemeinschaft</label>
      </div>
      {arge.aktiv && <>
        <table className="vg-spiegel" style={{ marginTop: 8 }}>
          <thead><tr><th>Partner</th><th className="r">Quote %</th><th>Eigene Firma</th><th>Federführend</th>{aufteilung.length > 0 && <><th className="r">Anteil Auftrag</th><th className="r">Anteil Ergebnis Prognose</th></>}<th /></tr></thead>
          <tbody>{arge.partner.map((p, i) => (
            <tr key={p.id}>
              <td><input className="am-feld" value={p.name} disabled={!darf} placeholder={p.eigene ? "Eigene Firma" : "Partnerfirma"} onChange={e => setP(i, { name: e.target.value })} aria-label="Partner" /></td>
              <td className="r"><input className="vg-preis kb-zahl" style={{ width: 72 }} value={String(p.quote).replace(".", ",")} disabled={!darf} aria-label="Quote"
                onChange={e => { const v = zahlLesen(e.target.value); if (v != null) setP(i, { quote: v }); }} /></td>
              <td><input type="radio" name="eigene" checked={!!p.eigene} disabled={!darf} onChange={() => setP(i, { eigene: true })} aria-label="Eigene Firma" /></td>
              <td><input type="radio" name="ff" checked={!!p.federfuehrend} disabled={!darf} onChange={() => setP(i, { federfuehrend: true })} aria-label="Federführend" /></td>
              {aufteilung.length > 0 && <><td className="r kb-zahl">{euro(aufteilung[i].werte.auftrag)}</td><td className="r kb-zahl">{euro(aufteilung[i].werte.ergebnisPrognose)}</td></>}
              <td>{darf && arge.partner.length > 2 && <button className="kb-symbol" aria-label="Partner entfernen" onClick={() => setArge(a => ({ ...a, partner: a.partner.filter((_, j) => j !== i) }))}>×</button>}</td>
            </tr>))}</tbody>
        </table>
        {fehler.length > 0 && <div style={{ color: "var(--red)", fontSize: 13, marginTop: 8 }}>{fehler.join(" ")}</div>}
      </>}
      {darf && <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        {arge.aktiv && <Knopf leise onClick={() => setArge(a => ({ ...a, partner: [...a.partner, neuerPartner()] }))}>Partner</Knopf>}
        {geaendert && <Knopf haupt disabled={arge.aktiv && fehler.length > 0} onClick={() => onAendern({ arge })}>Speichern</Knopf>}
        {arge.aktiv && !fehler.length && !geaendert && <Knopf leise onClick={bericht}>ARGE-Bericht</Knopf>}
      </div>}
      <p className="co-text" style={{ marginTop: 12, marginBottom: 0 }}>Im Konzern zählt bei ARGE-Projekten wahlweise nur die eigene Quote. Die Aufteilung ist centgenau.</p>
    </section>
  );
}
