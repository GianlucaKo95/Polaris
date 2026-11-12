import { useState } from "react";
import { ChevronDown, ChevronRight, Plus, Printer, RotateCcw, X } from "lucide-react";
import { mittellohnBerechnen } from "../lib/kalkulationsgrundlagen.js";
import {
  abweichungen, firmenpreiseNachziehen, preisSetzen, preisZuruecksetzen, mittellohnSetzen, projektpreisHinzufuegen,
  lieferantenangebotSetzen, lieferantWaehlen, bedarfJePreis,
} from "../lib/preisstand.js";
import { escapeHtml } from "../lib/utils.js";

// Preise dieses Angebots: Projektmittellohn, Zuschläge, Kalkulationspreise
// mit Lieferantenangeboten. Ab Annahme nur noch lesbar (Urkalkulation).
// Logik in lib/preisstand.js.

const datumDe = s => s ? new Date(`${String(s).slice(0, 10)}T12:00:00`).toLocaleDateString("de-DE") : "";
const eur = n => (Number(n) || 0).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const zahl = { fontFamily: "var(--font-zahl)", fontVariantNumeric: "tabular-nums" };
const feld = { boxSizing: "border-box", width: "100%", height: 32, padding: "0 8px", background: "var(--surface)", color: "var(--text)",
  border: "1px solid var(--border2)", borderRadius: 6, fontFamily: "inherit", fontSize: 14 };
const leise = { height: 28, padding: "0 6px", border: "none", background: "none", color: "var(--text2)", fontFamily: "inherit", fontSize: 13,
  cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4, borderRadius: 6 };
const knopf = { height: 32, padding: "0 12px", border: "1px solid var(--border2)", background: "var(--surface)", color: "var(--text)", fontFamily: "inherit",
  fontSize: 14, cursor: "pointer", borderRadius: 8, display: "inline-flex", alignItems: "center", gap: 6 };
const titel = { fontSize: 13, color: "var(--text2)", margin: "20px 0 8px" };
const KATEGORIEN = [["lohn", "Lohn"], ["material", "Material"], ["geraet", "Geräte"], ["sonstiges", "Sonstiges"]];
const ZUSCHLAEGE = [["zuschlagLohn", "Lohn"], ["zuschlagMaterial", "Material"], ["zuschlagGeraet", "Gerät"], ["zuschlagFremdleistung", "NU"]];

// Dezimalfeld mit Komma; übernimmt beim Verlassen
function Zahl({ wert, onWert, disabled, label, breite = "100%", rechts = true }) {
  const [text, setText] = useState(null);
  const anzeige = wert == null || wert === "" ? "" : Number(wert).toLocaleString("de-DE", { maximumFractionDigits: 3 });
  return (
    <input inputMode="decimal" aria-label={label} disabled={disabled} value={text ?? anzeige}
      onFocus={e => { setText(anzeige); requestAnimationFrame(() => e.target.select()); }}
      onChange={e => setText(e.target.value)}
      onBlur={() => { if (text !== null) { const n = Number(text.replace(/\./g, "").replace(",", ".")); if (Number.isFinite(n)) onWert(n); setText(null); } }}
      onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }}
      style={{ ...feld, ...zahl, width: breite, textAlign: rechts ? "right" : "left" }} />
  );
}

export function PreisstandPanel({ preisstand: ps, firmenpreise = [], firmenMittellohn = null, eingefroren = false, positionen = [], onAendern, onZuschlaegeAnwenden, projekt, eigeneFirma, angebotTitel }) {
  const [offen, setOffen] = useState(null);       // id des aufgeklappten Preises
  const [neu, setNeu] = useState(null);           // neuer Projektpreis
  const [ml, setMl] = useState(false);
  if (!ps) return null;
  const ab = abweichungen(ps, firmenpreise);
  const abNach = new Map(ab.map(x => [String(x.id), x]));
  const firmaGeaendert = ab.filter(x => x.art === "firma");
  const bedarf = { material: bedarfJePreis(positionen, "material"), lohn: bedarfJePreis(positionen, "lohn"), geraet: bedarfJePreis(positionen, "geraet") };
  const mlProjekt = ps.mittellohn ? mittellohnBerechnen(ps.mittellohn) : null;
  const mlFirma = firmenMittellohn ? mittellohnBerechnen(firmenMittellohn) : null;
  const zu = ps.zuschlaege || {};
  const gesperrt = eingefroren;

  function anfrageDrucken() {
    const zeilen = ps.kalkulationspreise.filter(k => k.kategorie === "material" && bedarf.material.get(String(k.id)) > 0);
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Preisanfrage</title><style>
      body{font:12px/1.45 "IBM Plex Sans",Arial,sans-serif;color:#16181D;margin:32px} h1{font-size:18px;font-weight:500;margin:0 0 4px}
      .meta{color:#4A4D55;margin-bottom:16px} table{width:100%;border-collapse:collapse} th{text-align:left;font-weight:400;color:#4A4D55;border-bottom:1px solid #C9CBD0;padding:6px}
      td{padding:8px 6px;border-bottom:1px solid #E4E5E1} .n{text-align:right;font-variant-numeric:tabular-nums} .leer{width:120px}
      @media print{body{margin:16mm}}</style></head><body>
      <h1>Preisanfrage</h1>
      <div class="meta">${escapeHtml(eigeneFirma?.name || "")} · Bauvorhaben ${escapeHtml(projekt?.name || "")}${projekt?.ort ? ", " + escapeHtml(projekt.ort) : ""} · ${escapeHtml(angebotTitel || "")} · ${new Date().toLocaleDateString("de-DE")}</div>
      <p>Bitte bieten Sie uns die folgenden Mengen frei Baustelle an, mit Lieferzeit und Gültigkeit Ihres Angebots.</p>
      <table><tr><th>Material</th><th class="n">Menge</th><th>Einheit</th><th class="n leer">Preis je Einheit</th><th class="n leer">Gesamt</th></tr>
      ${zeilen.map(k => `<tr><td>${escapeHtml(k.bezeichnung)}</td><td class="n">${(bedarf.material.get(String(k.id)) || 0).toLocaleString("de-DE", { maximumFractionDigits: 2 })}</td><td>${escapeHtml(k.einheit || "")}</td><td></td><td></td></tr>`).join("")}
      </table></body></html>`);
    w.document.close(); w.focus(); setTimeout(() => w.print(), 300);
  }

  const kopfText = gesperrt
    ? <>Urkalkulation, eingefroren{ps.eingefroren_am ? <> am <span style={zahl}>{datumDe(ps.eingefroren_am)}</span></> : " mit der Annahme"}. Firmenpreise wirken hier nicht mehr</>
    : ps.quelle === "hauptauftrag" ? <>Aus der Urkalkulation des Hauptauftrags übernommen am <span style={zahl}>{datumDe(ps.erstellt_am)}</span></>
    : ps.quelle === "nachtraeglich" ? <>Erst am <span style={zahl}>{datumDe(ps.erstellt_am)}</span> aus den Firmenpreisen festgehalten. Ältere Preisstände sind nicht bekannt</>
    : <>Von den Firmenpreisen kopiert am <span style={zahl}>{datumDe(ps.erstellt_am)}</span>. Änderungen hier gelten nur für dieses Angebot</>;

  return (
    <div>
      <div style={{ fontSize: 13, color: "var(--text2)", lineHeight: "20px" }}>{kopfText}</div>
      {!gesperrt && firmaGeaendert.length > 0 && (
        <div style={{ marginTop: 12, padding: "10px 12px", border: "1px solid var(--border2)", borderRadius: 8, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ flex: 1, minWidth: 180, fontSize: 13 }}>{firmaGeaendert.length} Firmenpreis{firmaGeaendert.length === 1 ? " hat" : "e haben"} sich seitdem geändert</span>
          <button onClick={() => onAendern(firmenpreiseNachziehen(ps, firmenpreise))} style={knopf}>Übernehmen</button>
        </div>
      )}

      {/* Mittellohn */}
      {mlProjekt && (
        <>
          <button onClick={() => setMl(o => !o)} style={{ ...leise, height: "auto", padding: 0, margin: "20px 0 8px", display: "flex", width: "100%", justifyContent: "space-between", alignItems: "baseline", gap: 8, textAlign: "left", fontSize: 13, color: "var(--text2)" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>{ml ? <ChevronDown size={16} strokeWidth={1.5} /> : <ChevronRight size={16} strokeWidth={1.5} />} Mittellohn dieses Projekts</span>
            <span style={{ ...zahl, color: "var(--text)", whiteSpace: "nowrap" }}>{eur(mlProjekt.kalkulationslohn)} €/h
              {mlFirma && Math.abs(mlFirma.kalkulationslohn - mlProjekt.kalkulationslohn) > 0.005 && <span style={{ color: "var(--muted)" }}> · Firma {eur(mlFirma.kalkulationslohn)}</span>}</span>
          </button>
          {ml && (
            <div>
              {(ps.mittellohn.lohngruppen || []).map((g, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 56px 88px", gap: 6, marginBottom: 6 }}>
                  <input value={g.bez} disabled={gesperrt} aria-label="Lohngruppe" onChange={e => onAendern(mittellohnSetzen(ps, { ...ps.mittellohn, lohngruppen: ps.mittellohn.lohngruppen.map((x, j) => j === i ? { ...x, bez: e.target.value } : x) }))} style={feld} />
                  <Zahl wert={g.anzahl} disabled={gesperrt} label={`${g.bez}: Anzahl`} onWert={n => onAendern(mittellohnSetzen(ps, { ...ps.mittellohn, lohngruppen: ps.mittellohn.lohngruppen.map((x, j) => j === i ? { ...x, anzahl: n } : x) }))} />
                  <Zahl wert={g.stundenlohn} disabled={gesperrt} label={`${g.bez}: Stundenlohn`} onWert={n => onAendern(mittellohnSetzen(ps, { ...ps.mittellohn, lohngruppen: ps.mittellohn.lohngruppen.map((x, j) => j === i ? { ...x, stundenlohn: n } : x) }))} />
                </div>
              ))}
              {[["zulagen", "Zulagen €/h"], ["sozialkostenProzent", "Lohngebundene Kosten %"], ["lohnnebenkosten", "Auslöse, Fahrgeld €/h"]].map(([k, l]) => (
                <div key={k} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 88px", gap: 6, marginBottom: 6, alignItems: "center" }}>
                  <span style={{ fontSize: 13, color: "var(--text2)" }}>{l}{firmenMittellohn && Number(firmenMittellohn[k]) !== Number(ps.mittellohn[k]) && <span style={{ ...zahl, color: "var(--muted)" }}> · Firma {String(firmenMittellohn[k] ?? 0).replace(".", ",")}</span>}</span>
                  <Zahl wert={ps.mittellohn[k]} disabled={gesperrt} label={l} onWert={n => onAendern(mittellohnSetzen(ps, { ...ps.mittellohn, [k]: n }))} />
                </div>
              ))}
              <div style={{ fontSize: 12, color: "var(--muted)" }}>Mittellohn {eur(mlProjekt.mittellohn)} € + lohngebundene {eur(mlProjekt.sozialkosten)} € + Lohnnebenkosten {eur(mlProjekt.lohnnebenkosten)} € = Kalkulationslohn</div>
            </div>
          )}
        </>
      )}

      {/* Zuschläge */}
      <div style={titel}>Zuschläge dieses Angebots</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 6 }}>
        {ZUSCHLAEGE.map(([k, l]) => (
          <label key={k}><span style={{ display: "block", fontSize: 12, color: "var(--muted)", marginBottom: 2 }}>{l} %</span>
            <Zahl wert={zu[k] ?? 0} disabled={gesperrt} label={`Zuschlag ${l}`} onWert={n => onAendern({ ...ps, zuschlaege: { ...zu, [k]: n } })} /></label>
        ))}
      </div>
      {!gesperrt && <button onClick={() => onZuschlaegeAnwenden(zu)} style={{ ...knopf, marginTop: 8 }}>Auf alle kalkulierten Positionen anwenden</button>}

      {/* Preise */}
      {KATEGORIEN.map(([kat, l]) => {
        const liste = ps.kalkulationspreise.filter(k => (k.kategorie || "sonstiges") === kat);
        if (!liste.length) return null;
        return (
          <div key={kat}>
            <div style={titel}>{l}</div>
            {liste.map(k => {
              const x = abNach.get(String(k.id));
              const b = bedarf[kat]?.get(String(k.id));
              const auf = offen === k.id;
              return (
                <div key={k.id} style={{ borderTop: "1px solid var(--border)", padding: "6px 0" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "20px minmax(0,1fr) 96px", gap: 6, alignItems: "center" }}>
                    <button onClick={() => setOffen(auf ? null : k.id)} aria-label="Details" style={{ ...leise, padding: 0, width: 20, justifyContent: "center" }}>
                      {auf ? <ChevronDown size={16} strokeWidth={1.5} /> : <ChevronRight size={16} strokeWidth={1.5} />}</button>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{k.bezeichnung}</div>
                      <div style={{ fontSize: 12, color: "var(--muted)" }}>
                        je {k.einheit}{b ? <> · Bedarf <span style={zahl}>{b.toLocaleString("de-DE", { maximumFractionDigits: 2 })}</span> {k.einheit}</> : ""}
                        {x?.art === "projekt" && <span style={{ color: "var(--akzent)", fontFamily: "inherit" }}> · {k.quelle?.art === "lieferant" ? k.quelle.name : k.quelle?.art === "mittellohn" ? "Projektmittellohn" : "Projektpreis"}, Firma {eur(x.firma)}</span>}
                        {x?.art === "firma" && <span style={{ fontFamily: "inherit" }}> · Firma jetzt {eur(x.firma)}</span>}
                        {x?.art === "neu" && <span style={{ fontFamily: "inherit" }}> · nur in diesem Angebot</span>}
                      </div>
                    </div>
                    <Zahl wert={k.preis} disabled={gesperrt || k.herkunft?.typ === "mittellohn"} label={`${k.bezeichnung}: Preis`} onWert={n => onAendern(preisSetzen(ps, k.id, n))} />
                  </div>
                  {auf && (
                    <div style={{ margin: "8px 0 4px 26px" }}>
                      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>Lieferantenangebote</div>
                      {(k.lieferantenangebote || []).map((la, i) => {
                        const gewaehlt = k.quelle?.art === "lieferant" && k.quelle.name === la.lieferant && Math.abs(Number(k.preis) - Number(la.preis)) < 0.005;
                        const setzeLa = t => onAendern(lieferantenangebotSetzen(ps, k.id, k.lieferantenangebote.map((y, j) => j === i ? { ...y, ...t } : y)));
                        return (
                          <div key={i} style={{ display: "grid", gridTemplateColumns: "20px minmax(0,1fr) 80px 20px", gap: 6, alignItems: "center", marginBottom: 4 }}>
                            <input type="radio" name={`la-${k.id}`} checked={gewaehlt} disabled={gesperrt || !Number(la.preis)} aria-label={`${la.lieferant} wählen`}
                              onChange={() => onAendern(lieferantWaehlen(ps, k.id, i, new Date().toLocaleDateString("sv-SE")))} />
                            <input value={la.lieferant} disabled={gesperrt} placeholder="Lieferant" aria-label="Lieferant" onChange={e => setzeLa({ lieferant: e.target.value })} style={feld} />
                            <Zahl wert={la.preis} disabled={gesperrt} label="Angebotspreis" onWert={n => setzeLa({ preis: n })} />
                            {!gesperrt && <button onClick={() => onAendern(lieferantenangebotSetzen(ps, k.id, k.lieferantenangebote.filter((_, j) => j !== i)))} aria-label="Angebot entfernen"
                              style={{ ...leise, padding: 0, width: 20, justifyContent: "center", color: "var(--muted)" }}><X size={14} strokeWidth={1.5} /></button>}
                          </div>
                        );
                      })}
                      {!gesperrt && (
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <button onClick={() => onAendern(lieferantenangebotSetzen(ps, k.id, [...(k.lieferantenangebote || []), { lieferant: "", preis: null }]))} style={leise}>
                            <Plus size={14} strokeWidth={1.5} /> Lieferantenangebot</button>
                          {x?.art === "projekt" && k.firmenpreis != null && <button onClick={() => onAendern(preisZuruecksetzen(ps, k.id, firmenpreise))} style={leise}>
                            <RotateCcw size={14} strokeWidth={1.5} /> Firmenpreis</button>}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}

      {!gesperrt && (
        <div style={{ marginTop: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
          {neu ? (
            <div style={{ width: "100%", display: "grid", gridTemplateColumns: "minmax(0,1fr) 96px", gap: 6 }}>
              <input value={neu.bezeichnung} placeholder="Bezeichnung, z. B. Beton C35/45 XC4" onChange={e => setNeu(n => ({ ...n, bezeichnung: e.target.value }))} style={{ ...feld, gridColumn: "1 / -1" }} aria-label="Bezeichnung" />
              <select value={neu.kategorie} onChange={e => setNeu(n => ({ ...n, kategorie: e.target.value }))} style={feld} aria-label="Kategorie">
                {KATEGORIEN.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
              <input value={neu.einheit} placeholder="Einheit" onChange={e => setNeu(n => ({ ...n, einheit: e.target.value }))} style={feld} aria-label="Einheit" />
              <Zahl wert={neu.preis} label="Preis" onWert={p => setNeu(n => ({ ...n, preis: p }))} />
              <div style={{ display: "flex", gap: 6 }}>
                <button disabled={!neu.bezeichnung.trim()} onClick={() => { onAendern(projektpreisHinzufuegen(ps, { ...neu, preis: Number(neu.preis) || 0 })); setNeu(null); }} style={knopf}>Hinzufügen</button>
                <button onClick={() => setNeu(null)} style={leise} aria-label="Abbrechen"><X size={14} strokeWidth={1.5} /></button>
              </div>
            </div>
          ) : (
            <button onClick={() => setNeu({ bezeichnung: "", kategorie: "material", einheit: "m³", preis: null })} style={leise}><Plus size={14} strokeWidth={1.5} /> Projektpreis</button>
          )}
          {bedarf.material.size > 0 && <button onClick={anfrageDrucken} style={leise}><Printer size={14} strokeWidth={1.5} /> Preisanfrage Material</button>}
        </div>
      )}
    </div>
  );
}
