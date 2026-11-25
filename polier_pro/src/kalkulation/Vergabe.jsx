// Vergabe (Phase 4): Pakete für Nachunternehmer und Lieferanten, Anfragen,
// Bieterpreise (manuell, GAEB, PDF/Mail per KI), Preisspiegel gegen das
// Budget aus der Kalkulation, Vergabe mit Begründung, NU-Auftrag und
// Übernahme der Preise in die Kalkulation. Logik: lib/kalk/vergabe.js.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2, Upload, Mail, Download, Printer, Sparkles, Check, AlertTriangle, ArrowDownToLine, Pencil } from "lucide-react";
import { useStammdaten } from "./stammdaten.js";
import { useLvStand } from "./useLvStand.js";
import { Knopf, Feld, Dialog, Meldung, Leer, euro, menge as mengeText, datum, zahlLesen } from "./ui.jsx";
import { zuschlaegeNormalisieren, KOSTENART_LABEL } from "../lib/kalk/rechenkern.js";
import { zeilen as lvZeilen } from "../lib/kalk/lvBaum.js";
import {
  zeilenNu, zeilenLieferant, ressourcenFuerAnfrage, neueVergabe, neuerBieter, preisspiegel, vergabeVorschlag, vergeben, vergabeUebersicht,
  preiseZuordnen, d84ZuPositionen, zeilenFuerKi, kiErgebnisZuBieter, lieferantErgebnisZuBieter, inKalkulationUebernehmen, anfrageGaeb, auftragGaeb,
  auftragHtml, preisspiegelHtml, anfrageZeilen, budgetSumme, VERGABE_STATUS, VERGABE_STATUS_LABEL, BIETER_STATUS_LABEL, STANDARD_BEDINGUNGEN, LIEFER_BEDINGUNGEN,
} from "../lib/kalk/vergabe.js";
import { anfrageText, paketeVorschlagen } from "../lib/anfragen.js";

const STATUS_FARBE = { entwurf: "var(--muted)", angefragt: "var(--blue)", ausgewertet: "var(--akzent)", vergeben: "var(--green)", aufgehoben: "var(--muted)" };
const dateiName = s => String(s || "Vergabe").replace(/[^\wäöüÄÖÜß.-]+/g, "_").slice(0, 60);
function herunterladen(name, inhalt, typ = "application/xml") {
  const url = URL.createObjectURL(new Blob([inhalt], { type: typ }));
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const prozentText = x => (x == null ? "" : `${x > 0 ? "+" : x < 0 ? "−" : "±"}${Math.abs(x * 100).toLocaleString("de-DE", { maximumFractionDigits: 1 })} %`);

export function VergabeBereich({ speicher, projekt, stand, darf, kiAktiv, onFehler }) {
  const sd = useStammdaten();
  const zuschlaege = useMemo(() => zuschlaegeNormalisieren(stand.zuschlaege), [stand.zuschlaege]);
  const lv = useLvStand(speicher, stand.id, { zuschlaege, gesperrt: stand.gesperrt || !darf });
  const [vergaben, setVergaben] = useState(null);
  const [aktivId, setAktivId] = useState(null);
  const [neu, setNeu] = useState(false);
  const timer = useRef({});

  const laden = useCallback(async () => {
    try {
      const l = await speicher.vergabenLaden(projekt.id);
      setVergaben(l);
      setAktivId(id => (id && l.some(v => v.id === id) ? id : l[0]?.id || null));
    } catch (e) { setVergaben([]); onFehler(e.nutzerText || e.message); }
  }, [speicher, projekt.id, onFehler]);
  useEffect(() => { laden(); }, [laden]);

  // Änderungen sofort anzeigen, verzögert speichern (Preiseingabe)
  const aendern = useCallback((v, { sofort = false } = {}) => {
    setVergaben(l => l.map(x => (x.id === v.id ? v : x)));
    clearTimeout(timer.current[v.id]);
    const sichern = async () => {
      try { await speicher.vergabeSpeichern(projekt.id, v); }
      catch (e) { onFehler(e.nutzerText || e.message); }
    };
    if (sofort) return sichern();
    timer.current[v.id] = setTimeout(sichern, 600);
  }, [speicher, projekt.id, onFehler]);

  const anlegen = async liste => {
    try {
      let zuletzt = null;
      for (const v of liste) zuletzt = await speicher.vergabeSpeichern(projekt.id, { ...v, nummer: null });
      await laden();
      if (zuletzt) setAktivId(zuletzt.id);
      setNeu(false);
    } catch (e) { onFehler(e.nutzerText || e.message); }
  };

  const loeschen = async v => {
    if (!window.confirm(`Vergabepaket „${v.titel}“ löschen?`)) return;
    try { await speicher.vergabeLoeschen(v.id); await laden(); } catch (e) { onFehler(e.nutzerText || e.message); }
  };

  if (!vergaben || !lv.knoten) return <div style={{ padding: 24, color: "var(--text2)" }}>Lädt …</div>;
  const ue = vergabeUebersicht(vergaben);
  const aktiv = vergaben.find(v => v.id === aktivId) || null;

  return (
    <div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: "280px 1fr" }}>
      <aside style={{ borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column", minHeight: 0, background: "var(--surface)" }}>
        <div style={{ padding: 16, borderBottom: "1px solid var(--border)", display: "grid", gap: 4, fontSize: 13 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "var(--text2)" }}>Budget vergeben</span><span className="kb-zahl">{euro(ue.budgetVergeben)}</span></div>
          <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "var(--text2)" }}>Vergeben zu</span><span className="kb-zahl">{euro(ue.vergeben)}</span></div>
          <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 500 }}><span>Vergabeergebnis</span>
            <span className="kb-zahl" style={{ color: ue.ergebnis < 0 ? "var(--red)" : ue.ergebnis > 0 ? "var(--green)" : undefined }}>{euro(ue.ergebnis)}</span></div>
          <div style={{ color: "var(--muted)", fontSize: 12 }}>{ue.vergebenAnzahl} von {ue.anzahl} Paketen vergeben</div>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: 8 }}>
          {vergaben.map(v => (
            <button key={v.id} onClick={() => setAktivId(v.id)} className="vg-paket" aria-current={v.id === aktivId}>
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: 4, background: STATUS_FARBE[v.status], flex: "none" }} />
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.titel || "Ohne Titel"}</span>
                <span className="kb-zahl" style={{ color: "var(--muted)", fontSize: 12 }}>{v.art === "nu" ? "NU" : "Lief."}</span>
              </span>
              <span style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--text2)", paddingLeft: 16 }}>
                <span>{VERGABE_STATUS_LABEL[v.status]}</span>
                <span className="kb-zahl">{euro(v.status === "vergeben" ? v.vergabe_summe : v.budget_summe ?? budgetSumme(v.zeilen))}</span>
              </span>
            </button>
          ))}
          {!vergaben.length && <div style={{ color: "var(--muted)", fontSize: 13, padding: 8 }}>Noch keine Vergabepakete.</div>}
        </div>
        {darf && <div style={{ padding: 12, borderTop: "1px solid var(--border)" }}><Knopf Icon={Plus} onClick={() => setNeu(true)} style={{ width: "100%" }}>Neues Paket</Knopf></div>}
      </aside>
      <main style={{ minWidth: 0, minHeight: 0, overflow: "auto" }}>
        {aktiv
          ? <PaketDetail key={aktiv.id} v={aktiv} speicher={speicher} projekt={projekt} stand={stand} lv={lv} darf={darf} kiAktiv={kiAktiv} sd={sd}
              onAendern={aendern} onLoeschen={() => loeschen(aktiv)} onFehler={onFehler} />
          : <div style={{ padding: 24 }}><Leer titel="Vergabe" text="Positionen an Nachunternehmer oder Material an Lieferanten anfragen, Angebote im Preisspiegel gegen das Budget der Kalkulation werten und vergeben.">
              {darf && <Knopf haupt Icon={Plus} onClick={() => setNeu(true)}>Erstes Paket anlegen</Knopf>}</Leer></div>}
      </main>
      {neu && <NeuDialog lv={lv} stand={stand} zuschlaege={zuschlaege} sd={sd} kiAktiv={kiAktiv} onAnlegen={anlegen} onSchliessen={() => setNeu(false)} onFehler={onFehler} />}
    </div>
  );
}

// ── Neues Paket ────────────────────────────────────────────────────────────
function NeuDialog({ lv, stand, zuschlaege, sd, kiAktiv, onAnlegen, onSchliessen, onFehler }) {
  const [art, setArt] = useState("nu");
  const [titel, setTitel] = useState("");
  const [auswahl, setAuswahl] = useState(new Set());
  const [ki, setKi] = useState(null); // null | "laeuft" | [pakete]
  const ressourcen = useMemo(() => ressourcenFuerAnfrage(lv.knoten, lv.ansaetze, zuschlaege), [lv.knoten, lv.ansaetze, zuschlaege]);
  const baum = useMemo(() => lvZeilen(lv.knoten).filter(z => z.k.typ !== "hinweis"), [lv.knoten]);
  const umschalten = id => setAuswahl(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const paketBauen = (a, t, ids) => {
    const zeilen = a === "nu" ? zeilenNu(lv.knoten, lv.ansaetze, zuschlaege, ids) : zeilenLieferant(lv.knoten, lv.ansaetze, zuschlaege, ids);
    return neueVergabe({ art: a, titel: t, zeilen, standId: stand.id });
  };

  const kiVorschlag = async () => {
    setKi("laeuft");
    try {
      const positionen = baum.map(({ k }) => (k.typ === "titel" ? { id: k.id, bez: `── ${k.kurztext} ──` }
        : { id: k.id, oz: k.oz, bez: k.kurztext, langtext: k.langtext, menge: k.menge, einheit: k.einheit,
            kalk: { fremdleistung: lv.ansaetze.some(a => a.knoten_id === k.id && a.kostenart === "fremd") ? 1 : 0 } }));
      const materialBedarf = new Map(ressourcen.filter(r => r.ressource_id && r.kostenart === "material").map(r => [String(r.ressource_id), r.menge]));
      const pakete = await paketeVorschlagen({ positionen, materialBedarf, kalkulationspreise: sd.kalkulationspreise, gewerkeFirma: sd.eigeneFirma?.gewerke || [], rufeKi: sd.rufeKi });
      setKi(pakete.map(p => ({ ...p, an: true })));
    } catch (e) { setKi(null); onFehler(`KI-Vorschlag fehlgeschlagen: ${e.message}`); }
  };

  const kiAnlegen = () => onAnlegen(ki.filter(p => p.an).map(p => paketBauen(p.art, p.name, p.art === "nu" ? p.positionIds : p.bausteinIds.map(id => `r:${id}`))).filter(v => v.zeilen.length));

  if (Array.isArray(ki)) {
    return (
      <Dialog titel="Pakete aus KI-Vorschlag" onSchliessen={onSchliessen} breite={640}
        fuss={<><Knopf leise onClick={() => setKi(null)}>Zurück</Knopf><Knopf haupt disabled={!ki.some(p => p.an)} onClick={kiAnlegen}>{ki.filter(p => p.an).length === 1 ? "1 Paket" : `${ki.filter(p => p.an).length} Pakete`} anlegen</Knopf></>}>
        {!ki.length && <Meldung>Die KI hat keine sinnvollen Pakete gefunden.</Meldung>}
        {ki.map((p, i) => (
          <label key={p.id} style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 14 }}>
            <input type="checkbox" checked={p.an} onChange={() => setKi(l => l.map((x, j) => (j === i ? { ...x, an: !x.an } : x)))} style={{ marginTop: 3 }} />
            <span><b style={{ fontWeight: 500 }}>{p.name}</b> <span style={{ color: "var(--muted)" }}>{p.art === "nu" ? `NU · ${p.positionIds.length} Positionen` : `Lieferant · ${p.bausteinIds.length} Stoffe`}</span>
              <div style={{ color: "var(--text2)", fontSize: 13 }}>{p.begruendung}</div></span>
          </label>
        ))}
      </Dialog>
    );
  }

  return (
    <Dialog titel="Neues Vergabepaket" onSchliessen={onSchliessen} breite={680}
      fuss={<>
        {kiAktiv && sd.rufeKi && <Knopf leise Icon={Sparkles} disabled={ki === "laeuft"} onClick={kiVorschlag} style={{ marginRight: "auto" }}>{ki === "laeuft" ? "KI schnürt Pakete …" : "Pakete von der KI vorschlagen"}</Knopf>}
        <Knopf leise onClick={onSchliessen}>Abbrechen</Knopf>
        <Knopf haupt disabled={!titel.trim() || !auswahl.size} onClick={() => onAnlegen([paketBauen(art, titel.trim(), [...auswahl])])}>Anlegen</Knopf>
      </>}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 200px", gap: 12 }}>
        <Feld label="Titel"><input className="kb-eingabe" value={titel} onChange={e => setTitel(e.target.value)} placeholder={art === "nu" ? "z. B. Abdichtung" : "z. B. Transportbeton"} /></Feld>
        <Feld label="Art">
          <select className="kb-eingabe" value={art} onChange={e => { setArt(e.target.value); setAuswahl(new Set()); }}>
            <option value="nu">Nachunternehmer</option><option value="lieferant">Lieferant</option>
          </select>
        </Feld>
      </div>
      <div style={{ fontSize: 13, color: "var(--text2)" }}>{art === "nu" ? "Titel oder einzelne Positionen wählen. Das Budget je Position sind die Einzelkosten der Kalkulation." : "Stoffe und Geräte aus den Ansätzen wählen. Budget ist der kalkulierte Preis, die Menge der Gesamtbedarf."}</div>
      <div style={{ border: "1px solid var(--border)", borderRadius: 8, maxHeight: 340, overflowY: "auto" }}>
        {art === "nu" ? baum.map(({ k, tiefe }) => (
          <label key={k.id} className="vg-wahl" style={{ paddingLeft: 12 + tiefe * 16, fontWeight: k.typ === "titel" ? 500 : 400 }}>
            <input type="checkbox" checked={auswahl.has(k.id)} onChange={() => umschalten(k.id)} />
            <span className="kb-zahl" style={{ color: "var(--muted)", width: 72, flex: "none" }}>{k.oz}</span>
            <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{k.kurztext}</span>
            {k.typ === "position" && <span className="kb-zahl" style={{ color: "var(--text2)" }}>{mengeText(k.menge)} {k.einheit}</span>}
          </label>
        )) : ressourcen.map(r => (
          <label key={r.schluessel} className="vg-wahl">
            <input type="checkbox" checked={auswahl.has(r.schluessel)} onChange={() => umschalten(r.schluessel)} />
            <span style={{ color: "var(--muted)", width: 96, flex: "none" }}>{KOSTENART_LABEL[r.kostenart]}</span>
            <span style={{ flex: 1, minWidth: 0 }}>{r.bezeichnung}</span>
            <span className="kb-zahl" style={{ color: "var(--text2)" }}>{mengeText(r.menge)} {r.einheit}</span>
          </label>
        ))}
        {art === "lieferant" && !ressourcen.length && <div style={{ padding: 12, color: "var(--muted)", fontSize: 13 }}>Keine Stoffe oder Geräte in den Ansätzen.</div>}
      </div>
    </Dialog>
  );
}

// ── Paket ──────────────────────────────────────────────────────────────────
const preisText = (w, nk = 2) => (w == null ? "" : Number(w).toLocaleString("de-DE", { minimumFractionDigits: nk, maximumFractionDigits: Math.max(nk, 4) }));
function PreisZelle({ wert, onSetzen, disabled, klasse, nk = 2 }) {
  const [text, setText] = useState(preisText(wert, nk));
  useEffect(() => { setText(preisText(wert, nk)); }, [wert, nk]);
  const fertig = () => {
    const t = text.trim();
    if (!t) { if (wert != null) onSetzen(null); return; }
    const n = zahlLesen(t);
    if (n == null || n < 0) { setText(preisText(wert, nk)); return; }
    if (n !== wert) onSetzen(n);
  };
  return <input className={`vg-preis kb-zahl ${klasse || ""}`} value={text} disabled={disabled} inputMode="decimal" aria-label="Einheitspreis"
    onChange={e => setText(e.target.value)} onBlur={fertig} onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }} />;
}

function PaketDetail({ v, speicher, projekt, stand, lv, darf, kiAktiv, sd, onAendern, onLoeschen, onFehler }) {
  const [bieterDialog, setBieterDialog] = useState(null); // bieter | "neu"
  const [import_, setImport] = useState(null);           // { bieterId?, laeuft, mail }
  const [meldung, setMeldung] = useState(null);
  const datei = useRef(null);
  const ps = useMemo(() => preisspiegel(v), [v]);
  const vorschlag = useMemo(() => vergabeVorschlag(v), [v]);
  const vergebenAn = v.bieter.find(b => b.id === v.vergeben_an);
  const offen = darf && v.status !== "vergeben" && v.status !== "aufgehoben";
  const gewertet = ps.bieter.filter(b => b.gewertet);
  const g = (b, f) => (b.gewertet ? f(b) : "—");
  const firma = sd.eigeneFirma || {};

  const setze = felder => onAendern({ ...v, ...felder });
  const bieterSetzen = (id, felder, opt) => onAendern({ ...v, bieter: v.bieter.map(b => (b.id === id ? { ...b, ...felder } : b)), ...(v.status === "angefragt" && felder.preise ? { status: "ausgewertet" } : {}) }, opt);
  const preisSetzen = (b, key, n) => {
    const preise = { ...b.preise };
    if (n == null) delete preise[key]; else preise[key] = n;
    bieterSetzen(b.id, { preise, status: Object.keys(preise).length && b.status !== "abgesagt" ? "abgegeben" : b.status });
  };

  const paketKnoten = async () => (v.stand_id === stand.id || !v.stand_id ? lv.knoten : speicher.knotenLaden(v.stand_id));

  const anfrageX83 = async () => {
    try {
      const r = anfrageGaeb(v, await paketKnoten(), { projektTitel: projekt.name });
      herunterladen(`${dateiName(projekt.name)}_${dateiName(v.titel)}.X83`, r.text);
    } catch (e) { onFehler(e.message); }
  };

  const anfrageMail = b => {
    const { betreff, text } = anfrageText({ name: v.titel, art: v.art }, anfrageZeilen(v), { projekt: { name: projekt.name, ort: projekt.ort }, firma, abgabe: v.frist });
    window.open(`mailto:${encodeURIComponent(b.email || "")}?subject=${encodeURIComponent(betreff)}&body=${encodeURIComponent(text)}`);
    onAendern({ ...v, status: v.status === "entwurf" ? "angefragt" : v.status, bieter: v.bieter.map(x => (x.id === b.id && x.status === "offen" ? { ...x, status: "angefragt" } : x)) }, { sofort: true });
  };

  const einlesen = async ({ file, mail }) => {
    const bieterId = import_?.bieterId;
    setImport(i => ({ ...i, laeuft: file?.name || "Mailtext" }));
    try {
      let felder;
      const name = file?.name || "";
      if (/\.x8[46]$/i.test(name)) {
        const { parseGaebXml, gaebXmlDateiLesen } = await import("../lib/gaebXml.js");
        const { gaeb90ZuPositionen } = await import("../lib/gaeb90.js");
        const pos = gaeb90ZuPositionen(parseGaebXml(await gaebXmlDateiLesen(file)));
        const r = preiseZuordnen(v.zeilen, pos);
        felder = { name: name.replace(/\.[^.]+$/, ""), preise: r.preise, hinweise: r.hinweise, quelle: "gaeb", status: "abgegeben" };
        setMeldung(`${r.zugeordnet} Preise aus ${name} zugeordnet${r.nichtZugeordnet ? `, ${r.nichtZugeordnet} Positionen der Datei passten nicht` : ""}.`);
      } else if (/\.[dp]8[46]$/i.test(name)) {
        const { gaeb90DateiLesen, parseGaeb90Preise } = await import("../lib/gaeb90.js");
        const text = await gaeb90DateiLesen(file);
        const r = preiseZuordnen(v.zeilen, d84ZuPositionen(parseGaeb90Preise(text)));
        const bieterName = (text.match(/^04(.{0,60})/m)?.[1] || "").trim();
        felder = { name: bieterName || name.replace(/\.[^.]+$/, ""), preise: r.preise, nurEp: r.nurEp, quelle: "gaeb", status: "abgegeben" };
        const n = Object.keys(r.nurEp).length;
        setMeldung(`${r.zugeordnet} Preise aus ${name} zugeordnet${n ? `. ${n} Positionen hat der Bieter nur mit Einheitspreis angeboten, ohne Gesamtbetrag; sie sind im Preisspiegel markiert` : ""}.`);
      } else {
        if (!sd.rufeKi || !kiAktiv) throw new Error("PDF, Fotos und Mailtext liest die KI. Sie ist für diese Gesellschaft nicht aktiv oder du bist nicht angemeldet.");
        const { anhangAusDatei } = await import("../lib/anhaenge.js");
        const anhang = file ? await anhangAusDatei(file) : null;
        if (v.art === "nu") {
          const { nuAngebotEinlesen } = await import("../lib/angebotEinlesen.js");
          const e = await nuAngebotEinlesen({ anhang, text: mail, positionen: zeilenFuerKi(v.zeilen), rufeKi: sd.rufeKi });
          felder = kiErgebnisZuBieter(v.zeilen, e);
          const teile = [`${Object.keys(felder.preise).length} Preise gelesen`];
          if (e.summe && !e.summe.ok) teile.push(`Achtung: Die Summe im Dokument (${euro(e.summe.angegeben)}) weicht von EP × Menge (${euro(e.summe.berechnet)}) ab. Bitte prüfen.`);
          if (e.nichtAngeboten?.length) teile.push(`Nicht angeboten: ${e.nichtAngeboten.join(", ")}`);
          setMeldung(teile.join(". "));
        } else {
          const { lieferantenangebotEinlesen } = await import("../lib/angebotEinlesen.js");
          const e = await lieferantenangebotEinlesen({ anhang, text: mail, kalkulationspreise: sd.kalkulationspreise, rufeKi: sd.rufeKi });
          felder = lieferantErgebnisZuBieter(v.zeilen, e);
          setMeldung(`${Object.keys(felder.preise).length} Preise gelesen. Stoffe ohne Stammdaten-Baustein ordnet die KI nicht zu.`);
        }
      }
      if (bieterId) {
        const b = v.bieter.find(x => x.id === bieterId);
        bieterSetzen(bieterId, { ...felder, name: b.name || felder.name, preise: { ...b.preise, ...felder.preise }, eingang: felder.eingang || new Date().toISOString().slice(0, 10) }, { sofort: true });
      } else {
        onAendern({ ...v, status: ["entwurf", "angefragt"].includes(v.status) ? "ausgewertet" : v.status,
          bieter: [...v.bieter, neuerBieter({ ...felder, eingang: felder.eingang || new Date().toISOString().slice(0, 10) })] }, { sofort: true });
      }
      setImport(null);
    } catch (e) { setImport(null); onFehler(e.nutzerText || e.message); }
    finally { if (datei.current) datei.current.value = ""; }
  };

  const vergebenAnBieter = id => {
    const b = v.bieter.find(x => x.id === id);
    const s = ps.bieter.find(x => x.id === id);
    if (!window.confirm(`„${v.titel}“ an ${b.name} vergeben (${euro(s?.netto)} netto)? Die Summe wird festgehalten.`)) return;
    onAendern(vergeben(v, id, { bedingungen: v.auftrag?.bedingungen || (v.art === "nu" ? STANDARD_BEDINGUNGEN : LIEFER_BEDINGUNGEN) }), { sofort: true });
  };

  const auftragDrucken = async () => {
    try {
      const { druckePDF } = await import("../lib/pdf.jsx");
      await druckePDF(auftragHtml(v, await paketKnoten(), { projekt, firma }), `${v.art === "nu" ? "Auftrag" : "Bestellung"}_${dateiName(v.titel)}_${dateiName(vergebenAn?.name)}.pdf`);
    } catch (e) { onFehler(`Drucken fehlgeschlagen: ${e.message}`); }
  };
  const spiegelDrucken = async () => {
    try { const { druckePDF } = await import("../lib/pdf.jsx"); await druckePDF(preisspiegelHtml(v, { projekt }), `Preisspiegel_${dateiName(v.titel)}.pdf`); }
    catch (e) { onFehler(`Drucken fehlgeschlagen: ${e.message}`); }
  };
  const auftragX86 = async () => {
    try { herunterladen(`Auftrag_${dateiName(v.titel)}.X86`, auftragGaeb(v, await paketKnoten(), { projektTitel: projekt.name }).text); }
    catch (e) { onFehler(e.message); }
  };
  const uebernehmen = () => {
    const { paket, anzahl } = inKalkulationUebernehmen(v, lv.knoten, lv.ansaetze);
    if (!anzahl) { onFehler("Keine passenden Positionen oder Ansätze im gewählten Stand gefunden."); return; }
    if (!window.confirm(`${anzahl} ${v.art === "nu" ? "Positionen bekommen den NU-Preis als Fremdleistung" : "Stoffe bekommen den Lieferantenpreis"} in Stand ${stand.nummer}. Die EP werden neu berechnet. Rückgängig im LV möglich.`)) return;
    lv.anwenden(paket);
    lv.speichernJetzt();
    setMeldung(`${anzahl} Preise in Stand ${stand.nummer} übernommen.`);
  };

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
        <Feld label="Titel"><input className="kb-eingabe" value={v.titel} disabled={!darf} onChange={e => setze({ titel: e.target.value })} style={{ width: 280 }} /></Feld>
        <Feld label="Status">
          <select className="kb-eingabe" value={v.status} disabled={!darf || v.status === "vergeben"} onChange={e => onAendern({ ...v, status: e.target.value }, { sofort: true })} style={{ width: 150 }}>
            {VERGABE_STATUS.filter(s => s !== "vergeben" || v.status === "vergeben").map(s => <option key={s} value={s}>{VERGABE_STATUS_LABEL[s]}</option>)}
          </select>
        </Feld>
        <Feld label="Angebotsfrist"><input type="date" className="kb-eingabe" value={v.frist || ""} disabled={!offen} onChange={e => setze({ frist: e.target.value || null })} style={{ width: 160 }} /></Feld>
        <div style={{ flex: 1 }} />
        {v.art === "nu" && <Knopf leise Icon={Download} onClick={anfrageX83} title="Leistungsverzeichnis des Pakets ohne Preise">GAEB X83</Knopf>}
        <Knopf leise Icon={Printer} onClick={spiegelDrucken} disabled={!gewertet.length}>Preisspiegel</Knopf>
        {darf && v.status !== "vergeben" && <Knopf leise gefahr Icon={Trash2} onClick={onLoeschen} aria-label="Paket löschen" />}
      </div>

      {meldung && <Meldung art="ok" onSchliessen={() => setMeldung(null)}>{meldung}</Meldung>}

      <section>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 500, flex: 1 }}>Bieter</h2>
          {offen && <>
            <Knopf klein leise Icon={Upload} onClick={() => setImport({ bieterId: null })}>Angebot einlesen</Knopf>
            <Knopf klein leise Icon={Plus} onClick={() => setBieterDialog("neu")}>Bieter</Knopf>
          </>}
        </div>
        {!v.zeilen.length && <Meldung art="fehler">Das Paket hat keine Zeilen.</Meldung>}
        {!v.bieter.length && <div style={{ color: "var(--muted)", fontSize: 13 }}>Bieter anlegen und anfragen, oder ein Angebot (GAEB X84/D84, PDF, Foto, Mailtext) direkt einlesen.</div>}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {v.bieter.map(b => {
            const s = ps.bieter.find(x => x.id === b.id);
            return (
              <div key={b.id} className="vg-bieter" data-gewinner={b.id === v.vergeben_an || undefined}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <b style={{ fontWeight: 500, flex: 1 }}>{b.name || "Ohne Name"}</b>
                  {b.id === v.vergeben_an && <Check size={14} color="var(--green)" aria-label="Vergeben" />}
                  {darf && <button className="kb-symbol" aria-label={`${b.name} bearbeiten`} onClick={() => setBieterDialog(b)}><Pencil size={13} /></button>}
                </div>
                <div style={{ fontSize: 12, color: "var(--text2)" }}>{BIETER_STATUS_LABEL[b.status]}{b.eingang ? ` · ${datum(b.eingang)}` : ""}{b.quelle === "ki" ? " · von KI gelesen" : b.quelle === "gaeb" ? " · GAEB" : ""}</div>
                {s?.gewertet && <div className="kb-zahl" style={{ fontSize: 13, marginTop: 2 }}>{euro(s.netto)} <span style={{ color: "var(--muted)" }}>Rang {s.rang}</span></div>}
                {offen && <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
                  <Knopf klein leise Icon={Mail} onClick={() => anfrageMail(b)} title={b.email ? `Anfrage an ${b.email}` : "Anfrage-Mail (keine Adresse hinterlegt)"}>Anfragen</Knopf>
                  <Knopf klein leise Icon={Upload} onClick={() => setImport({ bieterId: b.id })}>Angebot</Knopf>
                </div>}
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <h2 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 500 }}>Preisspiegel</h2>
        <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 8 }}>
          <table className="vg-spiegel">
            <thead><tr>
              <th style={{ width: 88 }}>{v.art === "nu" ? "OZ" : "Art"}</th><th style={{ minWidth: 220 }}>Leistung</th><th className="r">Menge</th><th className="r" title="Einzelkosten je Einheit aus der Kalkulation">Budget EP</th>
              {ps.bieter.map(b => <th key={b.id} className="r" style={{ minWidth: 112 }}>{b.name}</th>)}
            </tr></thead>
            <tbody>
              {ps.zeilen.map(z => (
                <tr key={z.key} style={{ opacity: z.inSumme === false ? 0.65 : 1 }}>
                  <td className="kb-zahl" style={{ color: "var(--text2)" }}>{v.art === "nu" ? z.oz : KOSTENART_LABEL[z.kostenart]}</td>
                  <td title={z.langtext || z.kurztext}>{z.kurztext}{z.inSumme === false && <span style={{ color: "var(--muted)" }}> · nicht in der Summe</span>}</td>
                  <td className="r kb-zahl">{mengeText(z.menge)} {z.einheit}</td>
                  <td className="r kb-zahl" style={{ color: "var(--text2)" }} title={z.budgetQuelle === "ep" ? "Keine Ansätze: Budget ist der EP der Position" : "Einzelkosten je Einheit aus der Kalkulation"}>{euro(z.budgetEp)}{z.budgetQuelle === "ep" ? "¹" : ""}</td>
                  {ps.bieter.map((pb, i) => {
                    const b = v.bieter.find(x => x.id === pb.id);
                    const p = z.preise[i];
                    const klasse = [i === z.minIndex && "min", z.ausreisser[i] && "ausreisser", z.spekulation[i] && "spekulation", b.nurEp?.[z.key] && "nur-ep"].filter(Boolean).join(" ");
                    return (
                      <td key={pb.id} className="r" title={[b.nurEp?.[z.key] && "Nur Einheitspreis, vom Bieter nicht in die Summe genommen", b.hinweise?.[z.key], z.budgetAbw[i] != null && `${prozentText(z.budgetAbw[i])} zum Budget`, z.ausreisser[i] && `${z.ausreisser[i] === "hoch" ? "Mehr" : "Weniger"} als 30 % vom Median`, z.spekulation[i] && "Unter der Hälfte des Medians"].filter(Boolean).join(" · ")}>
                        <PreisZelle wert={p} disabled={!offen} klasse={klasse} onSetzen={n => preisSetzen(b, z.key, n)} />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <FussZeile label="Summe netto" hinweis="Rechnerisch: Menge × Einheitspreis (VOB/A § 16c)" budget={euro(ps.budget)} werte={ps.bieter.map(b => g(b, x => euro(x.brutto)))} />
              {ps.bieter.some(b => b.nurEp?.length) && <FussZeile label="Summe laut Bieter" hinweis="Ohne Positionen, die der Bieter nur mit Einheitspreis angeboten hat" werte={ps.bieter.map(b => g(b, x => x.nurEp?.length ? <span style={{ color: "var(--akzent)" }}>{euro(x.bruttoLautBieter)}</span> : euro(x.brutto)))} />}
              <FussZeile label="Nachlass" werte={ps.bieter.map(b => {
                const bb = v.bieter.find(x => x.id === b.id);
                return offen ? <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><PreisZelle nk={0} wert={bb.nachlass || null} onSetzen={n => bieterSetzen(b.id, { nachlass: n || 0 })} /> %</span>
                  : `${mengeText(bb.nachlass)} %`;
              })} />
              <FussZeile label="Angebot nach Nachlass" stark werte={ps.bieter.map(b => g(b, x => euro(x.netto)))} />
              <FussZeile label="Wertung" hinweis="Fehlende Preise mit dem Höchstpreis der anderen aufgefüllt" werte={ps.bieter.map(b => g(b, x => <span title={x.aufgefuellt ? `davon aufgefüllt ${euro(x.aufgefuellt)}` : ""}>{euro(x.wertung)}{x.aufgefuellt ? " *" : ""}</span>))} />
              <FussZeile label="Zum Budget" werte={ps.bieter.map(b => g(b, x => <span style={{ color: x.gegenBudget > 0 ? "var(--red)" : "var(--green)" }}>{prozentText(x.gegenBudget)}</span>))} />
              <FussZeile label="Rang" werte={ps.bieter.map(b => b.rang ?? "—")} />
            </tfoot>
          </table>
        </div>
        {v.zeilen.some(z => z.budgetQuelle === "ep") && <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>¹ Position ohne Ansätze: Budget ist ihr Einheitspreis, nicht die Einzelkosten.</div>}
      </section>

      {v.status !== "vergeben" && gewertet.length > 0 && (
        <section className="vg-vorschlag">
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 500 }}>Vergabevorschlag: {v.bieter.find(b => b.id === vorschlag.bieterId)?.name}</h2>
          <ul style={{ margin: "8px 0 0", paddingLeft: 18, display: "grid", gap: 4 }}>
            {vorschlag.gruende.map(g => <li key={g}>{g}</li>)}
            {vorschlag.warnungen.map(w => <li key={w} style={{ color: "var(--red)", listStyle: "none", marginLeft: -18, display: "flex", gap: 6 }}><AlertTriangle size={14} style={{ flex: "none", marginTop: 3 }} />{w}</li>)}
          </ul>
          {darf && <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            <Knopf haupt onClick={() => vergebenAnBieter(vorschlag.bieterId)}>An {v.bieter.find(b => b.id === vorschlag.bieterId)?.name} vergeben</Knopf>
            {gewertet.filter(b => b.id !== vorschlag.bieterId).map(b => <Knopf key={b.id} leise onClick={() => vergebenAnBieter(b.id)}>An {b.name}</Knopf>)}
          </div>}
        </section>
      )}

      {v.status === "vergeben" && vergebenAn && (
        <section className="vg-vorschlag">
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 500 }}>Vergeben an {vergebenAn.name}</h2>
          <div style={{ color: "var(--text2)", fontSize: 13, marginTop: 4 }}>
            {v.auftrag?.nummer} · {datum(v.vergeben_am)} · <span className="kb-zahl">{euro(v.vergabe_summe)}</span> netto gegen Budget <span className="kb-zahl">{euro(v.budget_summe)}</span>
            {" "}(<span style={{ color: v.vergabe_summe > v.budget_summe ? "var(--red)" : "var(--green)" }}>{euro(v.budget_summe - v.vergabe_summe)} Vergabeergebnis</span>)
          </div>
          {darf && <Feld label="Ausführungszeitraum (erscheint im Auftrag)"><input className="kb-eingabe" value={v.auftrag?.ausfuehrung || ""} onChange={e => setze({ auftrag: { ...v.auftrag, ausfuehrung: e.target.value } })} placeholder="z. B. KW 14 bis KW 18" style={{ maxWidth: 360 }} /></Feld>}
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            <Knopf haupt Icon={Printer} onClick={auftragDrucken}>{v.art === "nu" ? "NU-Auftrag drucken" : "Bestellung drucken"}</Knopf>
            {v.art === "nu" && <Knopf leise Icon={Download} onClick={auftragX86}>GAEB X86</Knopf>}
            <Knopf leise Icon={ArrowDownToLine} disabled={stand.gesperrt || !darf} onClick={uebernehmen}
              title={stand.gesperrt ? "Der gewählte Stand ist gesperrt. Oben einen offenen Stand wählen, z. B. die Arbeitskalkulation." : ""}>In Stand {stand.nummer} übernehmen</Knopf>
            {darf && <Knopf leise onClick={() => window.confirm("Vergabe zurücknehmen? Der Auftrag gilt dann als nicht erteilt.") && onAendern({ ...v, status: "ausgewertet", vergeben_an: null, vergeben_am: null, vergabe_summe: null }, { sofort: true })}>Vergabe zurücknehmen</Knopf>}
          </div>
          {stand.gesperrt && <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>Übernahme nur in einen offenen Stand. Oben einen solchen wählen, z. B. die Arbeitskalkulation.</div>}
        </section>
      )}

      <input ref={datei} type="file" hidden accept=".x84,.x86,.d84,.d86,.p84,.pdf,.png,.jpg,.jpeg,.webp,.heic" onChange={e => e.target.files?.[0] && einlesen({ file: e.target.files[0] })} />
      {import_ && (
        <Dialog titel="Angebot einlesen" onSchliessen={() => !import_.laeuft && setImport(null)}
          fuss={<><Knopf leise disabled={!!import_.laeuft} onClick={() => setImport(null)}>Abbrechen</Knopf>
            <Knopf leise disabled={!!import_.laeuft || !import_.mail?.trim()} onClick={() => einlesen({ mail: import_.mail })}>Mailtext lesen</Knopf>
            <Knopf haupt Icon={Upload} disabled={!!import_.laeuft} onClick={() => datei.current?.click()}>Datei wählen</Knopf></>}>
          {import_.laeuft ? <Meldung>Liest {import_.laeuft} …</Meldung> : <>
            <div style={{ fontSize: 13, color: "var(--text2)" }}>GAEB X84/D84 wird direkt zugeordnet. PDF, Foto oder Mailtext liest die KI und ordnet die Preise {v.art === "nu" ? "den Positionen" : "den Stoffen"} zu; Vorbehalte und nicht angebotene Positionen werden ausgewiesen.</div>
            <Feld label="Mailtext (optional)"><textarea className="kb-eingabe" rows={6} value={import_.mail || ""} onChange={e => setImport(i => ({ ...i, mail: e.target.value }))} placeholder="Angebotstext hier einfügen" /></Feld>
          </>}
        </Dialog>
      )}
      {bieterDialog && <BieterDialog b={bieterDialog === "neu" ? neuerBieter() : bieterDialog} neu={bieterDialog === "neu"} onSchliessen={() => setBieterDialog(null)}
        onSpeichern={b => { onAendern({ ...v, bieter: bieterDialog === "neu" ? [...v.bieter, b] : v.bieter.map(x => (x.id === b.id ? b : x)) }, { sofort: true }); setBieterDialog(null); }}
        onEntfernen={bieterDialog !== "neu" && nichtVergebenAn(v, bieterDialog) ? () => { onAendern({ ...v, bieter: v.bieter.filter(x => x.id !== bieterDialog.id) }, { sofort: true }); setBieterDialog(null); } : null} />}
    </div>
  );
}
const nichtVergebenAn = (v, b) => v.vergeben_an !== b.id;

function FussZeile({ label, werte, budget = "", stark, hinweis }) {
  return (
    <tr className={stark ? "stark" : ""}>
      <td></td><td title={hinweis}>{label}</td><td></td><td className="r kb-zahl" style={{ color: "var(--text2)" }}>{budget}</td>
      {werte.map((w, i) => <td key={i} className="r kb-zahl">{w}</td>)}
    </tr>
  );
}

function BieterDialog({ b, neu, onSpeichern, onSchliessen, onEntfernen }) {
  const [f, setF] = useState({ ...b, vorbehalteText: (b.vorbehalte || []).join("\n") });
  return (
    <Dialog titel={neu ? "Bieter hinzufügen" : f.name || "Bieter"} onSchliessen={onSchliessen}
      fuss={<>{onEntfernen && <Knopf leise gefahr onClick={onEntfernen} style={{ marginRight: "auto" }}>Entfernen</Knopf>}
        <Knopf leise onClick={onSchliessen}>Abbrechen</Knopf>
        <Knopf haupt disabled={!f.name.trim()} onClick={() => { const { vorbehalteText, ...rest } = f; onSpeichern({ ...rest, name: f.name.trim(), vorbehalte: vorbehalteText.split("\n").map(s => s.trim()).filter(Boolean) }); }}>Speichern</Knopf></>}>
      <Feld label="Firma"><input className="kb-eingabe" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></Feld>
      <Feld label="E-Mail"><input type="email" className="kb-eingabe" value={f.email || ""} onChange={e => setF({ ...f, email: e.target.value })} /></Feld>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        <Feld label="Status"><select className="kb-eingabe" value={f.status} onChange={e => setF({ ...f, status: e.target.value })}>{Object.entries(BIETER_STATUS_LABEL).map(([w, l]) => <option key={w} value={w}>{l}</option>)}</select></Feld>
        <Feld label="Nachlass %"><input className="kb-eingabe kb-zahl" inputMode="decimal" value={String(f.nachlass ?? 0).replace(".", ",")} onChange={e => setF({ ...f, nachlass: zahlLesen(e.target.value) ?? 0 })} /></Feld>
        <Feld label="Skonto %"><input className="kb-eingabe kb-zahl" inputMode="decimal" value={String(f.skonto ?? 0).replace(".", ",")} onChange={e => setF({ ...f, skonto: zahlLesen(e.target.value) ?? 0 })} /></Feld>
      </div>
      <Feld label="Angebot vom"><input type="date" className="kb-eingabe" value={f.eingang || ""} onChange={e => setF({ ...f, eingang: e.target.value || null })} /></Feld>
      <Feld label="Vorbehalte, eine je Zeile"><textarea className="kb-eingabe" rows={3} value={f.vorbehalteText} onChange={e => setF({ ...f, vorbehalteText: e.target.value })} /></Feld>
    </Dialog>
  );
}
