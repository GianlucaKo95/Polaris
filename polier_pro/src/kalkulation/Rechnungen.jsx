// Rechnungen an den Auftraggeber und Prüfung der NU-Rechnungen (Phase 5).
import { useMemo, useRef, useState } from "react";
import { Plus, Printer, Check, AlertTriangle, Upload, Trash2, Ban, Banknote } from "lucide-react";
import { Knopf, Feld, Dialog, Meldung, Leer, BetragFeld, euro, menge as mengeText, datum, zahlLesen } from "./ui.jsx";
import {
  abrechnungsZeilen, rechnungBerechnen, pruefbarkeit, rechnungHtml, rechnungsNummer, rechnungTitel, zaehltAlsVorherig, aufmassJePosition, schluessel,
  nuRechnungPruefen, nuRechnungEinlesen, pruefvermerkHtml, RECHNUNG_ART_LABEL, RECHNUNG_STATUS_LABEL,
} from "../lib/kalk/abrechnung.js";
import { ozNorm, rundeCent } from "../lib/kalk/lvBaum.js";

const heute = () => new Date().toISOString().slice(0, 10);
const dateiName = s => String(s || "Datei").replace(/[^\wäöüÄÖÜß.-]+/g, "_").slice(0, 60);
const STATUS_FARBE = { entwurf: "var(--muted)", gestellt: "var(--blue)", bezahlt: "var(--green)", storniert: "var(--muted)", eingegangen: "var(--akzent)", geprueft: "var(--blue)", freigegeben: "var(--green)", zurueckgewiesen: "var(--red)" };
const Punkt = ({ s, label }) => <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><span style={{ width: 8, height: 8, borderRadius: 4, background: STATUS_FARBE[s] }} />{label}</span>;

// ── Rechnungen an den Auftraggeber ─────────────────────────────────────────
export function RechnungenBereich({ speicher, projekt, auftrag, darf, sd, onFehler, d, setD, abrechenbar }) {
  const [aktivId, setAktivId] = useState(d.rechnungen.at(-1)?.id || null);
  const [zahlung, setZahlung] = useState(null);
  const timer = useRef(null);
  const firma = sd.eigeneFirma || {};
  const zeilen = useMemo(() => abrechnungsZeilen(abrechenbar, d.aufmass), [abrechenbar, d.aufmass]);
  const aktiv = d.rechnungen.find(r => r.id === aktivId) || null;
  const sortiert = [...d.rechnungen].sort((a, b) => a.lfd_nr - b.lfd_nr);

  // Entwurf live berechnen; gestellte Rechnungen zeigen ihre Momentaufnahme
  const ansicht = useMemo(() => {
    if (!aktiv) return null;
    if (aktiv.status !== "entwurf") return aktiv;
    const vorherige = d.rechnungen.filter(r => r.id !== aktiv.id && zaehltAlsVorherig(r));
    const b = rechnungBerechnen(zeilen, { nachlassProzent: Number(auftrag.nachlass) || 0, einbehaltProzent: aktiv.einbehalt_prozent, mwst: aktiv.mwst, umkehr: aktiv.steuerschuld_umkehr, vorherige });
    return { ...aktiv, ...b };
  }, [aktiv, zeilen, d.rechnungen, auftrag.nachlass]);
  const pb = useMemo(() => (ansicht ? pruefbarkeit(ansicht, { zeilen, aufmass: d.aufmass, firma, projekt, nachtraege: d.nachtraege }) : null), [ansicht, zeilen, d, firma, projekt]);

  const speichern = async (r, { sofort = true } = {}) => {
    setD(x => ({ ...x, rechnungen: x.rechnungen.map(y => (y.id === r.id ? r : y)) }));
    clearTimeout(timer.current);
    const los = async () => { try { await speicher.rechnungSpeichern(projekt.id, r); } catch (e) { onFehler(e.nutzerText || e.message); await neuLaden(); } };
    if (sofort) return los();
    timer.current = setTimeout(los, 600);
  };
  const neuLaden = async () => { const r = await speicher.rechnungenLaden(projekt.id); setD(x => ({ ...x, rechnungen: r })); };
  const anlegen = async art => {
    if (d.rechnungen.some(r => r.status === "entwurf")) { onFehler("Es gibt schon einen Rechnungsentwurf. Erst stellen oder löschen."); return; }
    const { lfd, nummer } = rechnungsNummer(projekt, d.rechnungen, art);
    const letzte = sortiert.filter(r => r.status !== "storniert").at(-1);
    const r = { id: crypto.randomUUID(), nummer, art, lfd_nr: Math.max(0, ...d.rechnungen.map(x => x.lfd_nr || 0)) + 1, datum: heute(), leistung_von: letzte?.leistung_bis || null,
      leistung_bis: heute(), status: "entwurf", positionen: [], summen: {}, netto: 0, brutto: 0, einbehalt_prozent: art === "schluss" ? 5 : letzte?.einbehalt_prozent ?? 0,
      mwst: 19, steuerschuld_umkehr: letzte?.steuerschuld_umkehr ?? false, notiz: "" };
    void lfd;
    try { const g = await speicher.rechnungSpeichern(projekt.id, r); setD(x => ({ ...x, rechnungen: [...x.rechnungen, g] })); setAktivId(g.id); }
    catch (e) { onFehler(e.nutzerText || e.message); }
  };
  const stellen = async () => {
    if (!pb.ok) return;
    if (!window.confirm(`${rechnungTitel(ansicht, d.rechnungen)} ${ansicht.nummer} über ${euro(ansicht.brutto)} stellen? Danach ist sie unveränderlich.`)) return;
    const { positionen, summen, netto, brutto } = ansicht;
    await speichern({ ...aktiv, positionen, summen, netto, brutto, status: "gestellt" });
  };
  const drucken = async () => {
    try {
      const { druckePDF } = await import("../lib/pdf.jsx");
      await druckePDF(rechnungHtml(ansicht, { projekt, firma, aufmass: d.aufmass, alle: d.rechnungen }), `${dateiName(ansicht.nummer)}.pdf`);
    } catch (e) { onFehler(`Drucken fehlgeschlagen: ${e.message}`); }
  };
  const offenGesamt = rundeCent(d.rechnungen.filter(r => r.status === "gestellt").reduce((s, r) => s + (Number(r.brutto) || 0) - (Number(r.bezahlt_betrag) || 0), 0));

  return (
    <div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: "minmax(360px, 440px) 1fr" }}>
      <aside style={{ borderRight: "1px solid var(--border)", padding: 16, overflow: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ fontSize: 13, color: "var(--text2)" }}>Offene Forderungen <span className="kb-zahl" style={{ color: "var(--text)" }}>{euro(offenGesamt)}</span></div>
        {darf && <div style={{ display: "flex", gap: 8 }}>
          <Knopf haupt Icon={Plus} onClick={() => anlegen("abschlag")}>Abschlagsrechnung</Knopf>
          <Knopf leise onClick={() => anlegen("schluss")}>Schlussrechnung</Knopf>
        </div>}
        {sortiert.map(r => (
          <button key={r.id} className="vg-paket" aria-current={r.id === aktivId} onClick={() => setAktivId(r.id)}>
            <span style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><span>{rechnungTitel(r, d.rechnungen)}</span><span className="kb-zahl">{r.status === "entwurf" ? "Entwurf" : euro(r.brutto)}</span></span>
            <span style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--text2)" }}><Punkt s={r.status} label={RECHNUNG_STATUS_LABEL[r.status]} /><span className="kb-zahl">{r.nummer} · {datum(r.datum)}</span></span>
          </button>
        ))}
        {!d.rechnungen.length && <div style={{ color: "var(--muted)", fontSize: 13 }}>Noch keine Rechnungen. Abgerechnet wird nach Aufmaß, kumuliert gegen die bisherigen Rechnungen.</div>}
      </aside>
      <main style={{ minWidth: 0, overflow: "auto", padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
        {!ansicht ? <Leer titel="Rechnung wählen oder anlegen" /> : <>
          <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div style={{ flex: 1 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 500 }}>{rechnungTitel(ansicht, d.rechnungen)}</h2>
              <div style={{ fontSize: 13, color: "var(--text2)" }}><Punkt s={ansicht.status} label={RECHNUNG_STATUS_LABEL[ansicht.status]} />{ansicht.bezahlt_am ? ` · bezahlt ${datum(ansicht.bezahlt_am)} (${euro(ansicht.bezahlt_betrag)})` : ""}</div>
            </div>
            <Knopf leise Icon={Printer} onClick={drucken}>{ansicht.status === "entwurf" ? "Vorschau" : "PDF"}</Knopf>
            {darf && ansicht.status === "entwurf" && <Knopf leise gefahr Icon={Trash2} aria-label="Entwurf löschen" onClick={async () => { try { await speicher.rechnungLoeschen(ansicht.id); setD(x => ({ ...x, rechnungen: x.rechnungen.filter(r => r.id !== ansicht.id) })); setAktivId(null); } catch (e) { onFehler(e.nutzerText || e.message); } }} />}
            {darf && ansicht.status === "gestellt" && <Knopf leise Icon={Banknote} onClick={() => setZahlung({ betrag: ansicht.brutto, am: heute() })}>Zahlung erfassen</Knopf>}
            {darf && ["gestellt", "bezahlt"].includes(ansicht.status) && <Knopf leise Icon={Ban} onClick={() => window.confirm("Rechnung stornieren? Sie zählt dann nicht mehr als bisherige Rechnung; die nächste rechnet wieder gegen die vorletzte.") && speichern({ ...aktiv, status: "storniert" })}>Stornieren</Knopf>}
          </div>
          {ansicht.status === "entwurf" && <div style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(110px, 1fr))", gap: 12, alignItems: "end" }}>
            <Feld label="Nummer"><input className="kb-eingabe" value={aktiv.nummer} disabled={!darf} onChange={e => speichern({ ...aktiv, nummer: e.target.value }, { sofort: false })} /></Feld>
            <Feld label="Art"><select className="kb-eingabe" value={aktiv.art} disabled={!darf} onChange={e => speichern({ ...aktiv, art: e.target.value })}>{Object.entries(RECHNUNG_ART_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Feld>
            <Feld label="Datum"><input type="date" className="kb-eingabe" value={aktiv.datum || ""} disabled={!darf} onChange={e => speichern({ ...aktiv, datum: e.target.value })} /></Feld>
            <Feld label="Leistung bis"><input type="date" className="kb-eingabe" value={aktiv.leistung_bis || ""} disabled={!darf} onChange={e => speichern({ ...aktiv, leistung_bis: e.target.value || null })} /></Feld>
            <Feld label="Einbehalt %"><input className="kb-eingabe kb-zahl" inputMode="decimal" value={String(aktiv.einbehalt_prozent ?? 0).replace(".", ",")} disabled={!darf}
              onChange={e => { const v = zahlLesen(e.target.value); if (v != null) speichern({ ...aktiv, einbehalt_prozent: v }, { sofort: false }); }} /></Feld>
            <Feld label="Umsatzsteuer"><select className="kb-eingabe" value={aktiv.steuerschuld_umkehr ? "13b" : String(aktiv.mwst)} disabled={!darf}
              onChange={e => speichern({ ...aktiv, steuerschuld_umkehr: e.target.value === "13b", mwst: e.target.value === "13b" ? aktiv.mwst : Number(e.target.value) })}>
              <option value="19">19 %</option><option value="7">7 %</option><option value="0">0 %</option><option value="13b">§ 13b (AG schuldet)</option></select></Feld>
          </div>}
          {ansicht.status === "entwurf" && pb && (
            <div className="vg-vorschlag" style={{ display: "grid", gap: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 500 }}>
                {pb.ok ? <><Check size={16} color="var(--green)" /> Prüfbar nach § 14 VOB/B</> : <><AlertTriangle size={16} color="var(--red)" /> Noch nicht prüfbar</>}
              </div>
              {pb.fehler.map(f => <div key={f} style={{ color: "var(--red)", fontSize: 13 }}>{f}</div>)}
              {pb.hinweise.map(f => <div key={f} style={{ color: "var(--text2)", fontSize: 13 }}>{f}</div>)}
              {darf && <div><Knopf haupt disabled={!pb.ok} onClick={stellen}>Rechnung stellen</Knopf></div>}
            </div>
          )}
          <table className="vg-spiegel">
            <thead><tr><th>OZ</th><th>Leistung</th><th className="r">Menge LV</th><th className="r">Menge kum.</th><th className="r">EP</th><th className="r">Betrag kum.</th><th className="r">davon neu</th></tr></thead>
            <tbody>{(ansicht.positionen || []).map(p => (
              <tr key={schluessel(p.standId, p.knotenId)}>
                <td className="kb-zahl" style={{ color: "var(--text2)" }}>{p.nachtrag ? `N${p.nachtrag.nummer} ` : ""}{p.oz}</td><td>{p.kurztext}</td>
                <td className="r kb-zahl">{mengeText(p.mengeLv)} {p.einheit}</td><td className="r kb-zahl">{mengeText(p.mengeKum)}</td>
                <td className="r kb-zahl">{euro(p.up)}</td><td className="r kb-zahl">{euro(p.betragKum)}</td><td className="r kb-zahl" style={{ color: "var(--text2)" }}>{euro(p.betragKum - p.betragVorher)}</td>
              </tr>))}</tbody>
          </table>
          <SummenBlock s={ansicht.summen || {}} />
        </>}
      </main>
      {zahlung && <Dialog titel="Zahlung erfassen" onSchliessen={() => setZahlung(null)}
        fuss={<><Knopf leise onClick={() => setZahlung(null)}>Abbrechen</Knopf><Knopf haupt onClick={async () => { await speichern({ ...aktiv, status: "bezahlt", bezahlt_am: zahlung.am, bezahlt_betrag: zahlung.betrag }); setZahlung(null); }}>Speichern</Knopf></>}>
        <Feld label="Eingegangen am"><input type="date" className="kb-eingabe" value={zahlung.am} onChange={e => setZahlung({ ...zahlung, am: e.target.value })} /></Feld>
        <Feld label="Betrag €" hinweis={zahlung.betrag < ansicht.brutto ? `${euro(ansicht.brutto - zahlung.betrag)} weniger als gefordert` : ""}><BetragFeld wert={zahlung.betrag} onSetzen={v => setZahlung({ ...zahlung, betrag: v ?? 0 })} /></Feld>
      </Dialog>}
    </div>
  );
}

function SummenBlock({ s }) {
  const z = (l, w, stark) => <tr className={stark ? "stark" : ""}><td>{l}</td><td className="r kb-zahl">{w}</td></tr>;
  return (
    <table className="vg-spiegel" style={{ width: "auto", minWidth: 380, marginLeft: "auto" }}>
      <tbody>
        {z("Leistung kumuliert netto", euro(s.leistung))}
        {s.nachlass ? z(`− Nachlass ${mengeText(s.nachlassProzent)} %`, `−${euro(s.nachlass)}`) : null}
        {s.einbehalt ? z(`− Einbehalt ${mengeText(s.einbehaltProzent)} %`, `−${euro(s.einbehalt)}`) : null}
        {(s.bisherListe || []).map(b => <tr key={b.nummer}><td>− {b.nummer}</td><td className="r kb-zahl">−{euro(b.netto)}</td></tr>)}
        {z("Rechnungsbetrag netto", euro(s.netto), true)}
        {s.umkehr ? z("Umsatzsteuer schuldet der Empfänger (§ 13b)", "") : z(`+ ${mengeText(s.mwst)} % USt`, euro(s.steuer))}
        {z("Rechnungsbetrag", euro(s.brutto), true)}
      </tbody>
    </table>
  );
}

// ── NU-Rechnungen prüfen ───────────────────────────────────────────────────
export function NuRechnungenBereich({ speicher, projekt, auftrag, darf, kiAktiv, sd, onFehler, d, setD }) {
  const vergeben = d.vergaben.filter(v => v.status === "vergeben");
  const [aktivId, setAktivId] = useState(d.nuRechnungen.at(-1)?.id || null);
  const [einlesen, setEinlesen] = useState(null);
  const [alle, setAlle] = useState(false);
  const datei = useRef(null);
  const timer = useRef(null);
  const aktiv = d.nuRechnungen.find(r => r.id === aktivId) || null;
  const v = aktiv ? d.vergaben.find(x => x.id === aktiv.vergabe_id) : null;

  // Eigenes Aufmaß je Paketzeile: über die Position im Auftragsstand (gleiche ID oder OZ)
  const eigeneMengen = useMemo(() => {
    if (!v || v.art !== "nu") return new Map();
    const jePos = aufmassJePosition(d.aufmass.filter(a => a.stand_id === auftrag.id));
    const knoten = d.knoten.get(auftrag.id) || [];
    const nachOz = new Map(knoten.filter(k => k.oz).map(k => [ozNorm(k.oz), k]));
    const m = new Map();
    for (const z of v.zeilen) {
      const k = knoten.find(x => x.id === z.knotenId) || (z.oz ? nachOz.get(ozNorm(z.oz)) : null);
      const a = k ? jePos.get(schluessel(auftrag.id, k.id)) : null;
      if (a) m.set(z.knotenId, a.menge);
    }
    return m;
  }, [v, d.aufmass, d.knoten, auftrag.id]);
  const ergebnis = useMemo(() => {
    if (!aktiv || !v) return null;
    try { return nuRechnungPruefen(v, aktiv, { eigeneMengen, vorherige: d.nuRechnungen.filter(r => r.vergabe_id === v.id), einbehaltProzent: aktiv.pruefung?.einbehaltProzent ?? (aktiv.art === "schluss" ? 5 : 0) }); }
    catch { return null; }
  }, [aktiv, v, eigeneMengen, d.nuRechnungen]);

  const speichern = async (r, { sofort = true } = {}) => {
    setD(x => ({ ...x, nuRechnungen: x.nuRechnungen.some(y => y.id === r.id) ? x.nuRechnungen.map(y => (y.id === r.id ? r : y)) : [...x.nuRechnungen, r] }));
    clearTimeout(timer.current);
    const los = async () => { try { await speicher.nuRechnungSpeichern(projekt.id, r); } catch (e) { onFehler(e.nutzerText || e.message); } };
    if (sofort) return los();
    timer.current = setTimeout(los, 600);
  };
  const neu = async (vergabeId, felder = {}) => {
    const vg = d.vergaben.find(x => x.id === vergabeId);
    const b = vg.bieter.find(x => x.id === vg.vergeben_an);
    const r = { id: crypto.randomUUID(), vergabe_id: vergabeId, nummer: "", art: "abschlag", datum: null, eingang: heute(), status: "eingegangen",
      positionen: vg.zeilen.map(z => ({ key: z.key, menge: 0, ep: Number(b.preise?.[z.key]) || 0 })), gefordert: null, geprueft: null, pruefung: {}, notiz: "", ...felder };
    await speichern(r);
    setAktivId(r.id);
    setAlle(!felder.positionen);
  };
  const kiLesen = async ({ file, text }) => {
    const vg = d.vergaben.find(x => x.id === einlesen.vergabeId);
    setEinlesen(e => ({ ...e, laeuft: true }));
    try {
      const { anhangAusDatei } = await import("../lib/anhaenge.js");
      const { dokumentInhalt } = await import("../lib/angebotEinlesen.js");
      const anhang = file ? await anhangAusDatei(file) : null;
      const e = await nuRechnungEinlesen({ anhang, text, v: vg, rufeKi: sd.rufeKi, dokumentInhalt });
      await neu(vg.id, { nummer: e.nummer, datum: e.datum, art: e.art, positionen: e.positionen, gefordert: e.gefordert, notiz: "Von der KI gelesen. Bitte Mengen und Preise mit dem Beleg vergleichen." });
      setEinlesen(null);
    } catch (err) { setEinlesen(null); onFehler(`Rechnung konnte nicht gelesen werden: ${err.message}`); }
    finally { if (datei.current) datei.current.value = ""; }
  };
  const posSetzen = (key, feld, wert) => speichern({ ...aktiv, positionen: aktiv.positionen.some(p => p.key === key) ? aktiv.positionen.map(p => (p.key === key ? { ...p, [feld]: wert } : p)) : [...aktiv.positionen, { key, menge: 0, ep: 0, [feld]: wert }] }, { sofort: false });
  const pruefungSpeichern = status => speichern({ ...aktiv, status, geprueft: ergebnis.summen.geprueft, pruefung: { ...aktiv.pruefung, summen: ergebnis.summen, befunde: ergebnis.befunde, am: heute() } });
  const vermerk = async () => {
    try { const { druckePDF } = await import("../lib/pdf.jsx"); await druckePDF(pruefvermerkHtml(v, aktiv, ergebnis, { projekt, firma: sd.eigeneFirma || {} }), `Pruefvermerk_${dateiName(aktiv.nummer || v.titel)}.pdf`); }
    catch (e) { onFehler(`Drucken fehlgeschlagen: ${e.message}`); }
  };

  if (!vergeben.length) return <div style={{ padding: 24 }}><Leer titel="Keine vergebenen Pakete" text="NU-Rechnungen prüfst du gegen vergebene Pakete aus dem Reiter Vergabe: Mengen gegen dein Aufmaß, Preise gegen den Auftrag." /></div>;
  const offenSumme = rundeCent(d.nuRechnungen.filter(r => r.status === "geprueft" || r.status === "freigegeben").reduce((s, r) => s + (Number(r.geprueft) || 0), 0));

  return (
    <div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: "minmax(320px, 400px) 1fr" }}>
      <aside style={{ borderRight: "1px solid var(--border)", padding: 16, overflow: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ fontSize: 13, color: "var(--text2)" }}>Geprüft, noch nicht bezahlt <span className="kb-zahl" style={{ color: "var(--text)" }}>{euro(offenSumme)}</span></div>
        {darf && <div style={{ display: "flex", gap: 8 }}>
          <Knopf haupt Icon={Plus} onClick={() => setEinlesen({ vergabeId: vergeben[0].id, mail: "", manuell: true })}>Rechnung erfassen</Knopf>
        </div>}
        {d.nuRechnungen.map(r => {
          const vg = d.vergaben.find(x => x.id === r.vergabe_id);
          return (
            <button key={r.id} className="vg-paket" aria-current={r.id === aktivId} onClick={() => setAktivId(r.id)}>
              <span style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><span>{vg?.bieter.find(b => b.id === vg.vergeben_an)?.name || "NU"} · {r.nummer || "ohne Nr."}</span><span className="kb-zahl">{r.geprueft != null ? euro(r.geprueft) : "—"}</span></span>
              <span style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--text2)" }}><Punkt s={r.status} label={{ eingegangen: "Eingegangen", geprueft: "Geprüft", freigegeben: "Freigegeben", bezahlt: "Bezahlt", zurueckgewiesen: "Zurückgewiesen" }[r.status]} /><span>{vg?.titel}</span></span>
            </button>
          );
        })}
      </aside>
      <main style={{ minWidth: 0, overflow: "auto", padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
        {!aktiv || !v ? <Leer titel="NU-Rechnung wählen oder erfassen" text="Rechnungen tippen oder als PDF, Foto oder Mailtext von der KI lesen lassen." /> : <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(120px, 1fr))", gap: 12, alignItems: "end" }}>
            <Feld label="Rechnungsnr. NU"><input className="kb-eingabe" value={aktiv.nummer} disabled={!darf} onChange={e => speichern({ ...aktiv, nummer: e.target.value }, { sofort: false })} /></Feld>
            <Feld label="Art"><select className="kb-eingabe" value={aktiv.art} disabled={!darf} onChange={e => speichern({ ...aktiv, art: e.target.value })}>{Object.entries(RECHNUNG_ART_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Feld>
            <Feld label="Rechnungsdatum"><input type="date" className="kb-eingabe" value={aktiv.datum || ""} disabled={!darf} onChange={e => speichern({ ...aktiv, datum: e.target.value || null })} /></Feld>
            <Feld label="Gefordert netto €"><BetragFeld wert={aktiv.gefordert} disabled={!darf} onSetzen={x => speichern({ ...aktiv, gefordert: x })} /></Feld>
            <Feld label="Einbehalt %"><input className="kb-eingabe kb-zahl" value={String(aktiv.pruefung?.einbehaltProzent ?? (aktiv.art === "schluss" ? 5 : 0)).replace(".", ",")} disabled={!darf}
              onChange={e => { const x = zahlLesen(e.target.value); if (x != null) speichern({ ...aktiv, pruefung: { ...aktiv.pruefung, einbehaltProzent: x } }, { sofort: false }); }} /></Feld>
          </div>
          {aktiv.notiz && <Meldung>{aktiv.notiz}</Meldung>}
          {ergebnis && <>
            <table className="vg-spiegel">
              <thead><tr><th>OZ</th><th>Leistung</th><th className="r">Menge NU kum.</th><th className="r">Eigenes Aufmaß</th><th className="r">EP NU</th><th className="r">EP Vertrag</th><th className="r">Betrag geprüft</th><th>Befund</th></tr></thead>
              <tbody>{v.zeilen.filter(z => alle || (aktiv.positionen.find(x => x.key === z.key)?.menge || 0) !== 0).map(z => {
                const p = aktiv.positionen.find(x => x.key === z.key) || { menge: 0, ep: 0 };
                const e = ergebnis.zeilen.find(x => x.key === z.key);
                const vertrag = v.bieter.find(b => b.id === v.vergeben_an)?.preise?.[z.key];
                return (
                  <tr key={z.key}>
                    <td className="kb-zahl" style={{ color: "var(--text2)" }}>{z.oz}</td><td>{z.kurztext}</td>
                    <td className="r"><Zahl wert={p.menge} disabled={!darf || aktiv.status !== "eingegangen"} onSetzen={x => posSetzen(z.key, "menge", x ?? 0)} /></td>
                    <td className="r kb-zahl" style={{ color: e?.mengeEigen == null ? "var(--muted)" : undefined }}>{e?.mengeEigen == null ? "—" : mengeText(e.mengeEigen)} {z.einheit}</td>
                    <td className="r"><Zahl wert={p.ep} geld disabled={!darf || aktiv.status !== "eingegangen"} onSetzen={x => posSetzen(z.key, "ep", x ?? 0)} /></td>
                    <td className="r kb-zahl" style={{ color: "var(--text2)" }}>{vertrag == null ? "—" : euro(vertrag)}</td>
                    <td className="r kb-zahl" style={{ fontWeight: e && e.betragGeprueft !== e.betragNu ? 500 : 400 }}>{e ? euro(e.betragGeprueft) : ""}</td>
                    <td style={{ fontSize: 12, color: "var(--red)", whiteSpace: "normal", minWidth: 200 }}>{e?.befunde.filter(b => !b.startsWith("Kein eigenes")).join("; ")}</td>
                  </tr>);
              })}</tbody>
            </table>
            <div style={{ display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 280, display: "grid", gap: 6 }}>
                {ergebnis.befunde.map(b => <div key={b} style={{ color: "var(--red)", fontSize: 13, display: "flex", gap: 6 }}><AlertTriangle size={14} style={{ flex: "none", marginTop: 2 }} />{b}</div>)}
                {ergebnis.summen.abgerechnetAnteil != null && <div style={{ fontSize: 13, color: "var(--text2)" }}>Auftrag zu {Math.round(ergebnis.summen.abgerechnetAnteil * 100)} % abgerechnet ({euro(v.vergabe_summe)} netto).</div>}
              </div>
              <table className="vg-spiegel" style={{ width: "auto", minWidth: 360 }}>
                <tbody>
                  <tr><td>Gefordert kumuliert</td><td className="r kb-zahl">{euro(ergebnis.summen.gefordertKum)}</td></tr>
                  <tr><td>Geprüft kumuliert</td><td className="r kb-zahl">{euro(ergebnis.summen.geprueftKum)}</td></tr>
                  {ergebnis.summen.nachlassProzent ? <tr><td>− Nachlass {mengeText(ergebnis.summen.nachlassProzent)} %</td><td className="r kb-zahl">−{euro(ergebnis.summen.geprueftKum - ergebnis.summen.nachNachlass)}</td></tr> : null}
                  {ergebnis.summen.einbehalt ? <tr><td>− Einbehalt {mengeText(ergebnis.summen.einbehaltProzent)} %</td><td className="r kb-zahl">−{euro(ergebnis.summen.einbehalt)}</td></tr> : null}
                  {ergebnis.summen.bisher ? <tr><td>− bisher geprüft</td><td className="r kb-zahl">−{euro(ergebnis.summen.bisher)}</td></tr> : null}
                  <tr className="stark"><td>Zur Zahlung netto</td><td className="r kb-zahl">{euro(ergebnis.summen.geprueft)}</td></tr>
                  {ergebnis.summen.differenz ? <tr><td>Kürzung gegenüber Forderung</td><td className="r kb-zahl" style={{ color: "var(--red)" }}>{euro(ergebnis.summen.differenz)}</td></tr> : null}
                </tbody>
              </table>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {darf && aktiv.status === "eingegangen" && <Knopf haupt Icon={Check} onClick={() => pruefungSpeichern("geprueft")}>Prüfung abschließen</Knopf>}
              {darf && aktiv.status === "geprueft" && <Knopf haupt onClick={() => speichern({ ...aktiv, status: "freigegeben" })}>Zur Zahlung freigeben</Knopf>}
              {darf && aktiv.status === "freigegeben" && <Knopf haupt Icon={Banknote} onClick={() => speichern({ ...aktiv, status: "bezahlt" })}>Als bezahlt markieren</Knopf>}
              {darf && ["geprueft", "freigegeben"].includes(aktiv.status) && <Knopf leise onClick={() => speichern({ ...aktiv, status: "eingegangen" })}>Prüfung wieder öffnen</Knopf>}
              {darf && aktiv.status === "eingegangen" && <Knopf leise onClick={() => speichern({ ...aktiv, status: "zurueckgewiesen" })}>Zurückweisen</Knopf>}
              <Knopf leise Icon={Printer} onClick={vermerk}>Prüfvermerk</Knopf>
              {darf && aktiv.status === "eingegangen" && <Knopf leise gefahr Icon={Trash2} aria-label="NU-Rechnung löschen" onClick={async () => { try { await speicher.nuRechnungLoeschen(aktiv.id); setD(x => ({ ...x, nuRechnungen: x.nuRechnungen.filter(r => r.id !== aktiv.id) })); setAktivId(null); } catch (e) { onFehler(e.nutzerText || e.message); } }} />}
            </div>
          </>}
        </>}
      </main>
      <input ref={datei} type="file" hidden accept=".pdf,.png,.jpg,.jpeg,.webp,.heic" onChange={e => e.target.files?.[0] && kiLesen({ file: e.target.files[0] })} />
      {einlesen && (
        <Dialog titel="NU-Rechnung erfassen" onSchliessen={() => !einlesen.laeuft && setEinlesen(null)}
          fuss={<><Knopf leise disabled={einlesen.laeuft} onClick={() => setEinlesen(null)}>Abbrechen</Knopf>
            <Knopf leise disabled={einlesen.laeuft} onClick={async () => { await neu(einlesen.vergabeId); setEinlesen(null); }}>Von Hand erfassen</Knopf>
            {kiAktiv && sd.rufeKi && <>
              <Knopf leise disabled={einlesen.laeuft || !einlesen.mail.trim()} onClick={() => kiLesen({ text: einlesen.mail })}>Mailtext lesen</Knopf>
              <Knopf haupt Icon={Upload} disabled={einlesen.laeuft} onClick={() => datei.current?.click()}>PDF oder Foto</Knopf></>}</>}>
          {einlesen.laeuft ? <Meldung>Die KI liest die Rechnung …</Meldung> : <>
            <Feld label="Paket"><select className="kb-eingabe" value={einlesen.vergabeId} onChange={e => setEinlesen({ ...einlesen, vergabeId: e.target.value })}>
              {vergeben.map(x => <option key={x.id} value={x.id}>{x.titel} · {x.bieter.find(b => b.id === x.vergeben_an)?.name}</option>)}</select></Feld>
            {kiAktiv && sd.rufeKi && <Feld label="Mailtext (optional)"><textarea className="kb-eingabe" rows={5} value={einlesen.mail} onChange={e => setEinlesen({ ...einlesen, mail: e.target.value })} /></Feld>}
            <div style={{ fontSize: 13, color: "var(--text2)" }}>Geprüft wird Position für Position: Menge gegen dein Aufmaß, Einheitspreis gegen den Auftrag, dazu Nachlass, Einbehalt und bisherige Zahlungen.</div>
          </>}
        </Dialog>
      )}
    </div>
  );
}

function Zahl({ wert, onSetzen, disabled, geld }) {
  const fmt = w => (w == null ? "" : Number(w).toLocaleString("de-DE", geld ? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : { maximumFractionDigits: 3 }));
  const [t, setT] = useState(null);
  return <input className="vg-preis kb-zahl" inputMode="decimal" value={t ?? fmt(wert)} disabled={disabled} onFocus={() => setT(fmt(wert))} onChange={e => setT(e.target.value)}
    onBlur={() => { const v = zahlLesen(t ?? ""); setT(null); if (v != null && v !== wert) onSetzen(v); }} onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }} />;
}
