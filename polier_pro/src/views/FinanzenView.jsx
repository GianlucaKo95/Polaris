import { useEffect, useMemo, useRef, useState } from "react";
import { Landmark, Plus, ScanLine, Download, TriangleAlert, Loader2, X, BellRing, Banknote } from "lucide-react";
import { sbClientMitToken } from "../lib/supabase.js";
import { inputStyle } from "../components/Label.jsx";
import { druckePDF } from "../lib/pdf.jsx";
import { datevStapel, STANDARD_DATEV } from "../lib/datev.js";
import { ausgangsPosten, eingangsPosten, opUebersicht, mahnVorschlag, mahnungHtml, datevBuchungenFinanzen, altersklasse,
  ALTERSKLASSEN, RECHNUNG_ERFASSEN_TOOL, scanPlausibel, kostenJeBaustelle } from "../lib/fibu.js";

const eur = n => (n || 0).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
const de = iso => iso ? iso.split("-").reverse().join(".") : "—";
const heute = () => new Date().toISOString().slice(0, 10);
const LEER = { lieferant: "", rechnungsnr: "", datum: heute(), faellig_am: "", netto: "", ust_satz: 19, brutto: "", projekt_id: "",
  konto: "", bauleistung: false, freistellung: false, skonto_prozent: "", skonto_tage: "", notiz: "" };

function base64(datei) {
  return new Promise((ok, fehler) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(",")[1]); r.onerror = fehler; r.readAsDataURL(datei); });
}

// Finanz-Nebenbuch (lib/fibu.js): offene Posten, Eingangsrechnungen mit
// KI-Scan, Zahlungen, Mahnungen, DATEV-Buchungsstapel.
export function FinanzenView({ session, firmaId, projekte = [], eigeneFirma, datevEinstellungen }) {
  const [reiter, setReiter] = useState("op");
  const [ausgang, setAusgang] = useState([]);
  const [eingang, setEingang] = useState([]);
  const [status, setStatus] = useState(null); // null | ok | fehlt
  const [form, setForm] = useState(null);
  const [scan, setScan] = useState({ laeuft: false, hinweise: [] });
  const [meldung, setMeldung] = useState("");
  const [zeitraum, setZeitraum] = useState(() => { const d = new Date(); return { von: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`, bis: heute() }; });
  const scanRef = useRef(null);
  const client = () => sbClientMitToken(session);
  const projekt = id => projekte.find(p => String(p.id) === String(id));
  const tag = heute();

  async function laden() {
    const ids = projekte.map(p => p.id);
    const [{ data: r }, { data: e, error }] = await Promise.all([
      ids.length ? client().from("rechnungen").select("*").in("projekt_id", ids) : Promise.resolve({ data: [] }),
      client().from("eingangsrechnungen").select("*").order("datum", { ascending: false }),
    ]);
    setAusgang(r || []); setEingang(e || []); setStatus(error ? "fehlt" : "ok");
  }
  useEffect(() => { if (session?.access_token) laden(); }, [session?.access_token, projekte.length]);

  const posten = useMemo(() => [
    ...ausgang.map(r => ausgangsPosten(r, projekt(r.projekt_id))),
    ...eingang.map(e => eingangsPosten(e, projekt(e.projekt_id))),
  ], [ausgang, eingang, projekte]);
  const u = useMemo(() => opUebersicht(posten, tag), [posten, tag]);
  const offen = posten.filter(p => p.offen > 0.005 && !p.entwurf).sort((a, b) => a.faellig.localeCompare(b.faellig));

  async function zahlungErfassen(p) {
    const eingabe = window.prompt(`Zahlung zu ${p.nummer || p.partner} (offen ${eur(p.offen)}) — Betrag:`, String(p.offen).replace(".", ","));
    if (!eingabe) return;
    const betrag = Number(eingabe.replace(/\./g, "").replace(",", "."));
    if (!(betrag > 0)) return;
    const zahlungen = [...(p.quelle.zahlungen || []), { datum: tag, betrag }];
    const fertig = betrag >= p.offen - 0.005;
    const tabelle = p.art === "forderung" ? "rechnungen" : "eingangsrechnungen";
    const patch = { zahlungen, ...(fertig ? { status: "bezahlt" } : {}) };
    const { error } = await client().from(tabelle).update(patch).eq("id", p.id);
    if (error) { setMeldung(`Speichern fehlgeschlagen: ${error.message}`); return; }
    setMeldung(`✓ Zahlung ${eur(betrag)} erfasst`);
    laden();
  }

  async function mahnen(p, stufe) {
    await druckePDF(mahnungHtml(p, stufe, { eigeneFirma, heute: tag }), `${stufe.titel.replace(/\W+/g, "_")}_${p.nummer}.pdf`);
    const mahnungen = [...(p.quelle.mahnungen || []), { stufe: stufe.stufe, datum: tag }];
    const { error } = await client().from("rechnungen").update({ mahnungen }).eq("id", p.id);
    setMeldung(error ? `Mahnung erstellt, aber nicht vermerkt: ${error.message}` : `✓ ${stufe.titel} erstellt`);
    laden();
  }

  async function scannen(datei) {
    if (!datei) return;
    setScan({ laeuft: true, hinweise: [] });
    try {
      const { kiToolAufruf } = await import("../lib/ai.js");
      const block = datei.type === "application/pdf"
        ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: await base64(datei) } }
        : { type: "image", source: { type: "base64", media_type: datei.type || "image/jpeg", data: await base64(datei) } };
      const antwort = await kiToolAufruf({
        system: "Du liest deutsche Eingangsrechnungen aus. Rufe genau einmal rechnung_erfassen auf. Übernimm nur Werte, die auf dem Beleg stehen; Beträge als Zahl in Euro.",
        messages: [{ role: "user", content: [block, { type: "text", text: "Bitte die Rechnungsdaten erfassen." }] }],
        tools: [RECHNUNG_ERFASSEN_TOOL], maxTokens: 800,
      }, session);
      const d = antwort?.content?.find(b => b.type === "tool_use")?.input;
      if (!d) throw new Error("Die KI hat keine Rechnungsdaten geliefert.");
      const p = projekte.find(x => d.bauvorhaben && (x.name || "").toLowerCase().includes(String(d.bauvorhaben).toLowerCase().slice(0, 12)));
      setForm({ ...LEER, ...Object.fromEntries(Object.entries(d).filter(([k]) => k in LEER)), ust_satz: d.reverse_charge ? 0 : d.ust_satz ?? 19,
        projekt_id: p?.id || "", notiz: d.reverse_charge ? "§ 13b UStG (Reverse Charge)" : "" });
      setScan({ laeuft: false, hinweise: scanPlausibel(d) });
    } catch (e) {
      setScan({ laeuft: false, hinweise: [`Scan fehlgeschlagen: ${e.message}`] });
      setForm(f => f || { ...LEER });
    }
  }

  async function speichern() {
    const zahl = v => v === "" || v == null ? null : Number(String(v).replace(",", "."));
    const daten = { ...form, firma_id: firmaId, netto: zahl(form.netto), brutto: zahl(form.brutto), ust_satz: zahl(form.ust_satz) ?? 19,
      skonto_prozent: zahl(form.skonto_prozent), skonto_tage: zahl(form.skonto_tage), projekt_id: form.projekt_id || null,
      faellig_am: form.faellig_am || null, konto: form.konto || null };
    if (daten.brutto == null && daten.netto != null) daten.brutto = Math.round(daten.netto * (1 + daten.ust_satz / 100) * 100) / 100;
    if (daten.netto == null && daten.brutto != null) daten.netto = Math.round(daten.brutto / (1 + daten.ust_satz / 100) * 100) / 100;
    if (!daten.lieferant || !daten.datum || !(daten.brutto > 0)) { setMeldung("Lieferant, Datum und Betrag sind Pflicht."); return; }
    const { id, ...rest } = daten;
    const { error } = id ? await client().from("eingangsrechnungen").update(rest).eq("id", id) : await client().from("eingangsrechnungen").insert({ ...rest, status: "offen", zahlungen: [] });
    if (error) { setMeldung(`Speichern fehlgeschlagen: ${error.message}`); return; }
    setForm(null); setScan({ laeuft: false, hinweise: [] }); setMeldung("✓ Eingangsrechnung gespeichert"); laden();
  }

  function datevExport(art) {
    const e = { ...STANDARD_DATEV, ...(datevEinstellungen || {}) };
    const { von, bis } = zeitraum;
    let buchungen;
    if (art === "ausgang") {
      buchungen = posten.filter(p => p.art === "forderung" && !p.entwurf && p.datum >= von && p.datum <= bis)
        .map(p => ({ betrag: p.brutto, sh: "S", konto: e.debitorenkonto, gegenkonto: e.erloeskonto, datum: p.datum, beleg: p.nummer,
          text: `${p.quelle.typ === "schluss" ? "SR" : "AR"} ${p.partner}`, kost1: p.kostenstelle }));
    } else {
      buchungen = datevBuchungenFinanzen({ eingang: posten.filter(p => p.art === "verbindlichkeit"), ausgang: posten.filter(p => p.art === "forderung"), einstellungen: e, von, bis });
    }
    if (!buchungen.length) { setMeldung("Keine Buchungen im Zeitraum."); return; }
    const { text, dateiname, fehler } = datevStapel(buchungen, e, { bezeichnung: art === "ausgang" ? "Ausgangsrechnungen Polaris" : "Eingangsrechnungen und Zahlungen Polaris" });
    if (fehler.length) { setMeldung(fehler.join(" ") + " (Parameter › Lohn & Geräte › DATEV)"); return; }
    const url = URL.createObjectURL(new Blob(["﻿" + text], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = dateiname; a.click(); URL.revokeObjectURL(url);
    setMeldung(`✓ ${buchungen.length} Buchung(en) exportiert — vor der ersten Übergabe mit dem Steuerberater testen.`);
  }

  const karte = { background:"var(--surface)", border:"1.5px solid var(--border)", borderRadius:12, padding:12, marginBottom:12 };
  const knopf = (betont = false) => ({ background: betont ? "var(--yellow)" : "var(--surface2)", color: betont ? "#1a1200" : "var(--text)", border: betont ? "none" : "1px solid var(--border)",
    borderRadius:9, padding:"7px 10px", fontWeight:700, fontSize:12, cursor:"pointer", fontFamily:"inherit", display:"inline-flex", alignItems:"center", gap:5 });
  const f = (label, k, props = {}) => (
    <label style={{ fontSize:11, color:"var(--muted)" }}>{label}
      <input value={form[k] ?? ""} onChange={ev => setForm(x => ({ ...x, [k]: props.type === "checkbox" ? ev.target.checked : ev.target.value }))}
        checked={props.type === "checkbox" ? !!form[k] : undefined} {...props} style={props.type === "checkbox" ? { marginLeft:6 } : { ...inputStyle(), marginTop:3, padding:"7px 9px", fontSize:13 }} />
    </label>
  );
  const kosten = kostenJeBaustelle(eingang);

  return (
    <div>
      <div className="seiten-kopf" style={{ color:"var(--text)", fontWeight:700, fontSize:15, marginBottom:8, display:"flex", alignItems:"center", gap:7 }}>
        <Landmark size={16} /> Finanzen
      </div>
      {status === "fehlt" && (
        <div style={{ background:"var(--ybg)", color:"var(--ydark)", borderRadius:10, padding:"9px 12px", fontSize:12, marginBottom:10, display:"flex", gap:7 }}>
          <TriangleAlert size={14} style={{ flexShrink:0, marginTop:1 }} /> Tabelle eingangsrechnungen fehlt — bitte supabase-kalkulation.sql ausführen.
        </div>
      )}
      <div style={{ display:"flex", gap:6, marginBottom:12 }}>
        {[["op", "Offene Posten"], ["eingang", "Eingangsrechnungen"], ["datev", "DATEV"]].map(([k, l]) =>
          <button key={k} onClick={() => setReiter(k)} style={knopf(reiter === k)}>{l}</button>)}
      </div>
      {meldung && <div style={{ fontSize:12, marginBottom:8, color: meldung.startsWith("✓") ? "var(--green)" : "var(--ydark)" }}>{meldung}</div>}

      {reiter === "op" && (
        <>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:12 }}>
            <div style={karte}><div style={{ color:"var(--muted)", fontSize:11 }}>Forderungen offen</div><b style={{ fontSize:16 }}>{eur(u.forderungen)}</b>
              <div style={{ color:"var(--muted)", fontSize:11 }}>davon fällig ≤ 14 Tage: {eur(u.faellig14.forderung)}</div></div>
            <div style={karte}><div style={{ color:"var(--muted)", fontSize:11 }}>Verbindlichkeiten offen</div><b style={{ fontSize:16 }}>{eur(u.verbindlichkeiten)}</b>
              <div style={{ color:"var(--muted)", fontSize:11 }}>davon fällig ≤ 14 Tage: {eur(u.faellig14.verbindlichkeit)}</div></div>
          </div>
          <div style={karte}>
            <div style={{ fontWeight:700, fontSize:13, marginBottom:6 }}>Altersstruktur</div>
            {ALTERSKLASSEN.map(k => (
              <div key={k} style={{ display:"grid", gridTemplateColumns:"1.2fr 1fr 1fr", fontSize:12, padding:"3px 0", borderTop:"1px solid var(--border)" }}>
                <span>{k}</span><span style={{ textAlign:"right" }}>{eur(u.klassen[k].forderung)}</span><span style={{ textAlign:"right", color:"var(--muted)" }}>{eur(u.klassen[k].verbindlichkeit)}</span>
              </div>
            ))}
            <div style={{ color:"var(--muted)", fontSize:10.5, marginTop:3 }}>Spalten: Forderungen · Verbindlichkeiten</div>
          </div>
          {u.skontoChancen.length > 0 && (
            <div style={{ ...karte, background:"var(--gbg)" }}>
              <div style={{ fontWeight:700, fontSize:13, marginBottom:4 }}>Skonto nutzen</div>
              {u.skontoChancen.map(p => <div key={p.id} style={{ fontSize:12 }}>{p.partner} {p.nummer}: {eur(p.skontoBetrag)} bis {de(p.skontoBis)}</div>)}
            </div>
          )}
          {offen.map(p => {
            const m = mahnVorschlag(p, tag);
            const ueber = altersklasse(p, tag) !== "nicht fällig";
            return (
              <div key={`${p.art}${p.id}`} style={{ ...karte, padding:10 }}>
                <div style={{ display:"flex", justifyContent:"space-between", gap:8, fontSize:12.5 }}>
                  <b>{p.art === "forderung" ? "↗" : "↘"} {p.partner || "—"} · {p.nummer}</b>
                  <b style={{ color: ueber ? "var(--red)" : "var(--text)", whiteSpace:"nowrap" }}>{eur(p.offen)}</b>
                </div>
                <div style={{ color:"var(--muted)", fontSize:11.5, marginTop:2 }}>
                  vom {de(p.datum)} · fällig {de(p.faellig)}{p.kostenstelle ? ` · KST ${p.kostenstelle}` : ""}
                  {p.gezahlt ? ` · gezahlt ${eur(p.gezahlt)}` : ""}{p.mahnungen?.length ? ` · ${p.mahnungen.length} Mahnung(en)` : ""}
                </div>
                {p.bauabzug > 0 && <div style={{ color:"var(--ydark)", fontSize:11.5 }}>Ohne Freistellungsbescheinigung: {eur(p.bauabzug)} Bauabzugsteuer (§ 48 EStG) ans Finanzamt, nur {eur(p.betrag)} an den Subunternehmer.</div>}
                <div style={{ display:"flex", gap:6, marginTop:6 }}>
                  <button onClick={() => zahlungErfassen(p)} style={knopf()}><Banknote size={13} /> Zahlung</button>
                  {m && <button onClick={() => mahnen(p, m)} style={{ ...knopf(), color:"var(--red)" }}><BellRing size={13} /> {m.titel}</button>}
                </div>
              </div>
            );
          })}
        </>
      )}

      {reiter === "eingang" && (
        <>
          <div style={{ display:"flex", gap:6, marginBottom:10 }}>
            <button onClick={() => scanRef.current?.click()} disabled={scan.laeuft} style={knopf(true)}>
              {scan.laeuft ? <Loader2 size={13} style={{ animation:"polaris-spin 0.8s linear infinite" }} /> : <ScanLine size={13} />} Foto/PDF scannen
            </button>
            <input ref={scanRef} type="file" accept="image/*,application/pdf" capture="environment" style={{ display:"none" }} onChange={ev => { scannen(ev.target.files?.[0]); ev.target.value = ""; }} />
            <button onClick={() => { setForm({ ...LEER }); setScan({ laeuft: false, hinweise: [] }); }} style={knopf()}><Plus size={13} /> Manuell</button>
          </div>
          {form && (
            <div style={karte}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}><b style={{ fontSize:13 }}>Eingangsrechnung</b>
                <button onClick={() => setForm(null)} style={{ background:"none", border:"none", cursor:"pointer", color:"var(--muted)" }}><X size={15} /></button></div>
              {scan.hinweise.map(h => <div key={h} style={{ color:"var(--ydark)", fontSize:12, marginBottom:4 }}>⚠ {h}</div>)}
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                {f("Lieferant / Subunternehmer", "lieferant")}{f("Rechnungsnummer", "rechnungsnr")}
                {f("Rechnungsdatum", "datum", { type: "date" })}{f("Fällig am", "faellig_am", { type: "date" })}
                {f("Netto €", "netto", { inputMode: "decimal" })}{f("USt %", "ust_satz", { inputMode: "decimal" })}
                {f("Brutto €", "brutto", { inputMode: "decimal" })}
                <label style={{ fontSize:11, color:"var(--muted)" }}>Baustelle (Kostenstelle)
                  <select value={form.projekt_id || ""} onChange={ev => setForm(x => ({ ...x, projekt_id: ev.target.value }))} style={{ ...inputStyle(), marginTop:3, padding:"7px 9px", fontSize:13 }}>
                    <option value="">— Gemeinkosten —</option>
                    {projekte.map(p => <option key={p.id} value={p.id}>{p.projektnummer ? `${p.projektnummer} ` : ""}{p.name}</option>)}
                  </select></label>
                {f("Skonto %", "skonto_prozent", { inputMode: "decimal" })}{f("Skonto Tage", "skonto_tage", { inputMode: "numeric" })}
                {f("Aufwandskonto (leer = Standard)", "konto", { inputMode: "numeric" })}{f("Notiz", "notiz")}
              </div>
              <div style={{ display:"flex", gap:14, marginTop:8 }}>
                {f("Bauleistung (Subunternehmer)", "bauleistung", { type: "checkbox" })}
                {form.bauleistung && f("Freistellungsbescheinigung liegt vor", "freistellung", { type: "checkbox" })}
              </div>
              {Number(form.ust_satz) === 0 && <div style={{ color:"var(--muted)", fontSize:11, marginTop:6 }}>§ 13b UStG: Steuer schuldet Ihr Betrieb — eigenes Aufwandskonto mit dem Steuerberater abstimmen.</div>}
              <button onClick={speichern} style={{ ...knopf(true), marginTop:10, width:"100%", justifyContent:"center", padding:10 }}>Speichern</button>
            </div>
          )}
          {eingang.map(e => {
            const p = eingangsPosten(e, projekt(e.projekt_id));
            return (
              <div key={e.id} onClick={() => setForm({ ...LEER, ...e, projekt_id: e.projekt_id || "" })} style={{ ...karte, padding:10, cursor:"pointer" }}>
                <div style={{ display:"flex", justifyContent:"space-between", fontSize:12.5 }}><b>{e.lieferant} · {e.rechnungsnr}</b><b>{eur(p.brutto)}</b></div>
                <div style={{ color:"var(--muted)", fontSize:11.5 }}>{de(e.datum)} · {projekt(e.projekt_id)?.name || "Gemeinkosten"} · {p.offen > 0.005 ? `offen ${eur(p.offen)}` : "bezahlt"}</div>
              </div>
            );
          })}
          {Object.keys(kosten).length > 0 && (
            <div style={karte}>
              <div style={{ fontWeight:700, fontSize:13, marginBottom:4 }}>Fremdkosten je Baustelle (netto)</div>
              {Object.entries(kosten).map(([id, s]) => <div key={id} style={{ display:"flex", justifyContent:"space-between", fontSize:12 }}>
                <span>{projekt(id)?.name || "Gemeinkosten"}</span><b>{eur(s)}</b></div>)}
            </div>
          )}
        </>
      )}

      {reiter === "datev" && (
        <div style={karte}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:10 }}>
            <label style={{ fontSize:11, color:"var(--muted)" }}>von<input type="date" value={zeitraum.von} onChange={ev => setZeitraum(z => ({ ...z, von: ev.target.value }))} style={{ ...inputStyle(), marginTop:3 }} /></label>
            <label style={{ fontSize:11, color:"var(--muted)" }}>bis<input type="date" value={zeitraum.bis} onChange={ev => setZeitraum(z => ({ ...z, bis: ev.target.value }))} style={{ ...inputStyle(), marginTop:3 }} /></label>
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            <button onClick={() => datevExport("ausgang")} style={knopf(true)}><Download size={13} /> Ausgangsrechnungen aller Baustellen</button>
            <button onClick={() => datevExport("eingang")} style={knopf(true)}><Download size={13} /> Eingangsrechnungen und Zahlungen</button>
          </div>
          <div style={{ color:"var(--muted)", fontSize:11, marginTop:8, lineHeight:1.45 }}>
            DATEV-Buchungsstapel (EXTF) mit Baustelle als Kostenstelle (KOST1). Konten unter Parameter › Lohn & Geräte › DATEV. Die Finanzbuchhaltung selbst (Abschluss, UStVA) macht der Steuerberater.
          </div>
        </div>
      )}
    </div>
  );
}
