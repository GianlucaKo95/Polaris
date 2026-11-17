import { useEffect, useState } from "react";
import { useIstDesktop } from "../hooks/useIstDesktop.js";
import { UnterschriftPad } from "../components/UnterschriftPad.jsx";
import { regieSummen, freigabeSperre, freigabeEntscheiden, werktageDazu } from "../lib/regie.js";
import { sbRegieFreigabeDaten, sbRegieFreigabeEntscheiden } from "../lib/supabase.js";

// Öffentliche Seite für den Auftraggeber: Regiebericht prüfen und
// unterschreiben oder beanstanden, ohne Konto. Erreicht über ?regie=<token>
// (siehe App.jsx). Daten kommen nur über die Funktion regie_freigabe_daten,
// die genau diesen einen Bericht ohne interne Felder herausgibt.

const eur = n => (n || 0).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
const zahlFmt = n => (Number(n) || 0).toLocaleString("de-DE", { maximumFractionDigits: 2 });
const datumDe = s => s ? new Date(`${String(s).slice(0, 10)}T12:00:00`).toLocaleDateString("de-DE") : "–";
const zahl = { fontFamily: "var(--font-zahl)", fontVariantNumeric: "tabular-nums" };
const feld = { boxSizing: "border-box", width: "100%", height: 40, padding: "0 12px", background: "var(--surface)", color: "var(--text)",
  border: "1px solid var(--border2)", borderRadius: 8, fontFamily: "inherit", fontSize: 15 };
const knopf = (haupt = false) => ({ height: 40, padding: "0 18px", borderRadius: 8, fontFamily: "inherit", fontSize: 15, cursor: "pointer",
  fontWeight: haupt ? 500 : 400, border: haupt ? "none" : "1px solid var(--border2)",
  background: haupt ? "var(--text)" : "var(--surface)", color: haupt ? "var(--surface)" : "var(--text)" });
const th = { textAlign: "left", fontWeight: 400, color: "var(--text2)", fontSize: 13, padding: "8px 8px", borderBottom: "1px solid var(--border2)" };
const td = { padding: "8px 8px", borderBottom: "1px solid var(--border)" };

// Im Demo-Modus liegen die Berichte im localStorage dieses Browsers
const DEMO_KEY = "polaris.regieberichte.demo";
function demoLesen(token) {
  try {
    const b = JSON.parse(localStorage.getItem(DEMO_KEY) || "[]").find(x => x.freigabe_token === token);
    return b ? { bericht: b, projekt: { name: "Demo-Baustelle" }, firma: { name: "Demo GmbH" }, einst: { materialZuschlag: 0, fristWerktage: 6 } } : null;
  } catch { return null; }
}
function demoSchreiben(bericht) {
  try {
    const alle = JSON.parse(localStorage.getItem(DEMO_KEY) || "[]");
    localStorage.setItem(DEMO_KEY, JSON.stringify(alle.map(x => x.id === bericht.id ? bericht : x)));
  } catch { /* voll */ }
}

function Tabelle({ titel, kopf, zeilen }) {
  if (!zeilen.length) return null;
  return (
    <section style={{ marginTop: 24 }}>
      <h2 style={{ fontSize: 15, fontWeight: 500, margin: "0 0 4px" }}>{titel}</h2>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead><tr>{kopf.map((k, i) => <th key={k} style={{ ...th, textAlign: i >= kopf.length - 3 ? "right" : "left" }}>{k}</th>)}</tr></thead>
          <tbody>{zeilen.map((z, i) => (
            <tr key={i}>{z.map((w, j) => <td key={j} style={{ ...td, ...(j >= z.length - 3 ? { ...zahl, textAlign: "right", whiteSpace: "nowrap" } : {}) }}>{w}</td>)}</tr>
          ))}</tbody>
        </table>
      </div>
    </section>
  );
}

export function RegieFreigabeScreen({ token }) {
  useIstDesktop();
  const [daten, setDaten] = useState(null);
  const [fehler, setFehler] = useState(null);
  const [demo, setDemo] = useState(false);
  const [name, setName] = useState("");
  const [bild, setBild] = useState(null);
  const [grund, setGrund] = useState(null);
  const [senden, setSenden] = useState(false);
  const [meldung, setMeldung] = useState(null);
  const [fertig, setFertig] = useState(null);

  useEffect(() => {
    const d = demoLesen(token);
    if (d) { setDemo(true); setDaten(d); setName(d.bericht.angeordnet_von || ""); return; }
    sbRegieFreigabeDaten(token).then(r => {
      if (r.daten) { setDaten(r.daten); setName(r.daten.bericht?.angeordnet_von || ""); }
      else setFehler(r.fehler);
    });
  }, [token]);

  const rahmen = inhalt => (
    <div style={{ minHeight: "100dvh", background: "var(--bg)", color: "var(--text)" }}>
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "32px 24px 64px", boxSizing: "border-box" }}>{inhalt}</div>
    </div>
  );

  if (!daten && !fehler) return rahmen(<div style={{ color: "var(--text2)" }}>Regiebericht wird geladen</div>);
  if (!daten) return rahmen(
    <div style={{ paddingTop: "15vh" }}>
      <h1 style={{ fontSize: 22, fontWeight: 500, margin: "0 0 8px" }}>Link nicht gültig</h1>
      <p style={{ color: "var(--text2)", margin: 0, lineHeight: 1.5 }}>Der Link ist abgelaufen, wurde zurückgezogen oder der Bericht ist schon beantwortet. Bitte beim Bauleiter einen neuen Link anfordern</p>
    </div>
  );

  const { bericht: b, projekt, firma, einst = {} } = daten;
  const s = regieSummen(b, einst);
  const sperre = fertig ? null : freigabeSperre(b);
  const frist = b.eingereicht_am ? werktageDazu(b.eingereicht_am, einst.fristWerktage || 6) : null;

  async function entscheiden(entscheidung) {
    setMeldung(null);
    const eingabe = { entscheidung, name, bild, grund };
    // Dieselben Prüfungen wie in der Datenbank, damit Fehler sofort sichtbar sind
    const probe = freigabeEntscheiden(b, eingabe);
    if (probe.fehler) { setMeldung(probe.fehler); return; }
    setSenden(true);
    if (demo) { demoSchreiben(probe.bericht); setFertig(entscheidung); setSenden(false); return; }
    const r = await sbRegieFreigabeEntscheiden(token, eingabe);
    setSenden(false);
    if (r.fehler) setMeldung(r.fehler); else setFertig(entscheidung);
  }

  return rahmen(<>
    <div style={{ color: "var(--text2)", fontSize: 14 }}>{firma?.name}</div>
    <h1 style={{ fontSize: 26, fontWeight: 500, margin: "4px 0 0", letterSpacing: "-0.01em" }}>Regiebericht Nr. <span style={zahl}>{b.nummer}</span></h1>
    <div style={{ color: "var(--text2)", marginTop: 4 }}>Stundenlohnarbeiten nach § 15 VOB/B</div>

    <dl style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 16, margin: "24px 0 0",
      padding: "16px 0", borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)" }}>
      {[["Baustelle", [projekt?.name, projekt?.ort].filter(Boolean).join(", ")], ["Datum", datumDe(b.datum)],
        ["Angeordnet von", b.angeordnet_von || "–"], ["Rückgabe bis", frist ? datumDe(frist) : "–"]].map(([k, v]) => (
        <div key={k}><dt style={{ fontSize: 13, color: "var(--text2)" }}>{k}</dt><dd style={{ margin: "2px 0 0", ...(k === "Datum" || k === "Rückgabe bis" ? zahl : {}) }}>{v}</dd></div>
      ))}
    </dl>

    <section style={{ marginTop: 24 }}>
      <h2 style={{ fontSize: 15, fontWeight: 500, margin: "0 0 4px" }}>Ausgeführte Leistung</h2>
      <p style={{ margin: 0, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{b.beschreibung}</p>
    </section>

    <Tabelle titel="Personal" kopf={["Name", "Lohngruppe", "Stunden", "€/h", "Betrag"]}
      zeilen={(b.personal || []).map(p => [p.name || "–", p.lohngruppe, zahlFmt(p.stunden), eur(Number(p.satz)), eur((Number(p.stunden) || 0) * (Number(p.satz) || 0))])} />
    <Tabelle titel="Geräte" kopf={["Gerät", "Stunden", "€/h", "Betrag"]}
      zeilen={(b.geraete || []).map(g => [g.bezeichnung, zahlFmt(g.stunden), eur(Number(g.satz)), eur((Number(g.stunden) || 0) * (Number(g.satz) || 0))])} />
    <Tabelle titel="Material" kopf={["Material", "Menge", "€/ME", "Betrag"]}
      zeilen={(b.material || []).map(m => [m.bezeichnung, `${zahlFmt(m.menge)} ${m.einheit || ""}`, eur(Number(m.preis)), eur((Number(m.menge) || 0) * (Number(m.preis) || 0))])} />

    <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 24, fontSize: 14 }}>
      <tbody>
        {s.materialZuschlag > 0 && <tr><td style={{ padding: "4px 0", color: "var(--text2)" }}>Zuschlag Material {zahlFmt(einst.materialZuschlag)} %</td><td style={{ textAlign: "right", ...zahl }}>{eur(s.materialZuschlag)}</td></tr>}
        <tr style={{ borderTop: "1px solid var(--border2)" }}>
          <td style={{ padding: "10px 0 0", fontWeight: 500 }}>Summe netto <span style={{ ...zahl, color: "var(--text2)", fontWeight: 400 }}>· {zahlFmt(s.stunden)} Lohnstunden</span></td>
          <td style={{ padding: "10px 0 0", textAlign: "right", ...zahl, fontWeight: 500, fontSize: 18 }}>{eur(s.netto)}</td>
        </tr>
      </tbody>
    </table>

    <section style={{ marginTop: 32, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 24 }}>
      {fertig ? (<>
        <h2 style={{ fontSize: 18, fontWeight: 500, margin: 0 }}>{fertig === "unterschreiben" ? "Unterschrieben" : "Beanstandung gesendet"}</h2>
        <p style={{ color: "var(--text2)", margin: "8px 0 0", lineHeight: 1.5 }}>
          {fertig === "unterschreiben" ? `Danke. ${firma?.name || "Der Auftragnehmer"} sieht die Unterschrift sofort. Das Fenster kann geschlossen werden` : `Danke. ${firma?.name || "Der Auftragnehmer"} meldet sich zur Klärung`}
        </p>
      </>) : sperre ? (<>
        <h2 style={{ fontSize: 18, fontWeight: 500, margin: 0 }}>{sperre}</h2>
        {b.unterschrift && <p style={{ color: "var(--text2)", margin: "8px 0 0" }}>{b.unterschrift.name}, {new Date(b.unterschrift.am).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" })}</p>}
      </>) : (<>
        <h2 style={{ fontSize: 18, fontWeight: 500, margin: 0 }}>Bericht prüfen und unterschreiben</h2>
        <p style={{ color: "var(--text2)", margin: "8px 0 20px", lineHeight: 1.5, fontSize: 14 }}>
          Mit der Unterschrift bestätigen Sie Art und Umfang der aufgeführten Stundenlohnarbeiten. Ohne Rückgabe innerhalb von {einst.fristWerktage || 6} Werktagen nach Zugang gilt der Bericht als anerkannt (§ 15 Abs. 3 VOB/B)
        </p>
        <label style={{ display: "block", fontSize: 13, color: "var(--text2)", marginBottom: 4 }} htmlFor="regie-name">Ihr Name</label>
        <input id="regie-name" value={name} onChange={e => setName(e.target.value)} placeholder="Vor- und Nachname" autoComplete="name" style={{ ...feld, marginBottom: 16 }} />
        {grund === null ? (<>
          <UnterschriftPad label="Unterschrift" knopf={false} onAendern={setBild} />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
            <button onClick={() => entscheiden("unterschreiben")} disabled={senden} style={knopf(true)}>{senden ? "Wird gesendet" : "Unterschreiben"}</button>
            <button onClick={() => { setGrund(""); setMeldung(null); }} style={knopf()}>Beanstanden</button>
          </div>
        </>) : (<>
          <label style={{ display: "block", fontSize: 13, color: "var(--text2)", marginBottom: 4 }} htmlFor="regie-grund">Was stimmt nicht?</label>
          <textarea id="regie-grund" value={grund} onChange={e => setGrund(e.target.value)} rows={3} autoFocus
            placeholder="z. B. Am 12.11. waren nur zwei Facharbeiter vor Ort"
            style={{ ...feld, height: "auto", padding: "10px 12px", lineHeight: 1.45, resize: "vertical" }} />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
            <button onClick={() => entscheiden("beanstanden")} disabled={senden} style={knopf(true)}>{senden ? "Wird gesendet" : "Beanstandung senden"}</button>
            <button onClick={() => { setGrund(null); setMeldung(null); }} style={knopf()}>Zurück</button>
          </div>
        </>)}
        {meldung && <div role="alert" style={{ marginTop: 12, color: "var(--red)", fontSize: 14 }}>{meldung}</div>}
      </>)}
    </section>
  </>);
}
