// Schlussblatt eines Stands: Mittellohn, Zuschläge (Sätze je Kostenart oder
// Endsumme nach EFB 222), Ergebnis, Zielpreis, Preisabgleich, Formblätter.
import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Printer, RefreshCw, Target } from "lucide-react";
import { Knopf, Feld, Meldung, euro, zahlLesen } from "./ui.jsx";
import { useStammdaten } from "./stammdaten.js";
import {
  KOSTENARTEN, KOSTENART_LABEL, standBerechnen, zuschlaegeNormalisieren, zuschlaegeFuerZiel, preisabgleich, efbAuswertung,
} from "../lib/kalk/rechenkern.js";
import { mittellohnBerechnen } from "../lib/kalkulationsgrundlagen.js";
import { efbHtml } from "../lib/efb.js";

const pz = x => (Number(x) || 0).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
const std = x => (Number(x) || 0).toLocaleString("de-DE", { maximumFractionDigits: 1 });

function ZahlEingabe({ wert, onWert, disabled, label, breite = 96 }) {
  const [t, setT] = useState(pz(wert));
  useEffect(() => { setT(pz(wert)); }, [wert]);
  return <input className="kb-eingabe kb-zahl" aria-label={label} value={t} disabled={disabled} style={{ textAlign: "right", width: breite, height: 32 }}
    onChange={e => setT(e.target.value)} onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }}
    onBlur={() => { const n = zahlLesen(t); if (n == null) setT(pz(wert)); else if (n !== Number(wert)) onWert(n); }} />;
}

export function Schlussblatt({ stand, projekt, knoten, ansaetze, gesperrt, onZuschlaege, anwenden, onFehler }) {
  const sd = useStammdaten();
  const z = useMemo(() => zuschlaegeNormalisieren(stand.zuschlaege), [stand.zuschlaege]);
  const r = useMemo(() => standBerechnen(knoten, ansaetze, z), [knoten, ansaetze, z]);
  const [ziel, setZiel] = useState("");
  const [vorschlag, setVorschlag] = useState(null);
  const abgleich = useMemo(() => preisabgleich(ansaetze, sd.kalkulationspreise), [ansaetze, sd.kalkulationspreise]);
  const mlStamm = sd.kalkulationsgrundlagen?.mittellohn ? mittellohnBerechnen(sd.kalkulationsgrundlagen.mittellohn) : null;

  const setze = teil => onZuschlaege({ ...z, ...teil });
  const setzeEs = teil => setze({ endsumme: { ...z.endsumme, ...teil } });
  const bgk = z.endsumme.bgk || [];

  const zielRechnen = () => {
    const n = zahlLesen(ziel);
    if (!(n > 0)) return;
    const v = zuschlaegeFuerZiel(knoten, ansaetze, z, n);
    if (!v) { onFehler("Für einen Zielpreis braucht es kalkulierte Positionen."); return; }
    setVorschlag({ ...v, ziel: n });
  };

  const formblaetter = async () => {
    const { druckePDF } = await import("../lib/pdf.jsx");
    const a = efbAuswertung(knoten, ansaetze, z);
    const html = efbHtml(a, {
      angebot: { titel: stand.bezeichnung || "Angebot", datum: new Date().toISOString().slice(0, 10) }, eigeneFirma: sd.eigeneFirma || {},
      projekt: { name: projekt.name, ort: projekt.ort }, aufteilung: sd.standardZuschlaege?.aufteilung,
      mittellohn: mlStamm && Math.abs(mlStamm.kalkulationslohn - z.mittellohn) < 0.01 ? mlStamm : null, endsumme: a.endsumme,
    });
    await druckePDF(html, `EFB_${projekt.name}_Stand${stand.nummer}.pdf`);
  };

  const zeile = (label, wert, stark, farbe) => (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--border)", fontWeight: stark ? 500 : 400 }}>
      <span style={{ color: stark ? "var(--text)" : "var(--text2)" }}>{label}</span><span className="kb-zahl" style={{ color: farbe }}>{wert}</span>
    </div>
  );

  return (
    <div style={{ padding: 24, overflowY: "auto", display: "grid", gridTemplateColumns: "minmax(360px, 520px) minmax(320px, 1fr)", gap: 32, alignItems: "start" }}>
      <section style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div>
          <h2 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 500 }}>Mittellohn</h2>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <ZahlEingabe label="Mittellohn €/h" wert={z.mittellohn} disabled={gesperrt} onWert={n => setze({ mittellohn: n })} breite={120} />
            <span style={{ color: "var(--text2)" }}>€/h (Kalkulationslohn für Lohnansätze „Mittellohn“)</span>
          </div>
          {mlStamm?.kalkulationslohn > 0 && !gesperrt && Math.abs(mlStamm.kalkulationslohn - z.mittellohn) > 0.004 && (
            <button className="kb-knopf leise klein" style={{ marginTop: 6 }} onClick={() => setze({ mittellohn: mlStamm.kalkulationslohn })}>
              Aus Stammdaten übernehmen: {euro(mlStamm.kalkulationslohn)} €/h
            </button>
          )}
        </div>

        <div>
          <h2 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 500 }}>Zuschläge</h2>
          <div role="radiogroup" style={{ display: "flex", gap: 4, padding: 2, background: "var(--surface2)", borderRadius: 8, width: "fit-content", marginBottom: 12 }}>
            {[["saetze", "Sätze je Kostenart"], ["endsumme", "Über die Endsumme (EFB 222)"]].map(([w, l]) => (
              <button key={w} role="radio" aria-checked={z.modell === w} disabled={gesperrt} onClick={() => setze({ modell: w })}
                style={{ height: 28, padding: "0 12px", border: "none", borderRadius: 6, font: "inherit", fontSize: 13, cursor: "pointer",
                  background: z.modell === w ? "var(--surface)" : "transparent", color: z.modell === w ? "var(--text)" : "var(--text2)", boxShadow: z.modell === w ? "0 0 0 1px var(--border)" : "none" }}>{l}</button>
            ))}
          </div>
          {z.modell === "saetze" ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "8px 12px", alignItems: "center" }}>
              {KOSTENARTEN.map(ka => (
                <FragmentZeile key={ka} label={KOSTENART_LABEL[ka]}>
                  <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <ZahlEingabe label={`Zuschlag ${KOSTENART_LABEL[ka]}`} wert={z.saetze[ka]} disabled={gesperrt} onWert={n => setze({ saetze: { ...z.saetze, [ka]: n } })} />%
                  </span>
                </FragmentZeile>
              ))}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ fontSize: 13, color: "var(--text2)" }}>Baustellengemeinkosten dieses Projekts</div>
              {bgk.map((b, i) => (
                <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input className="kb-eingabe" style={{ height: 32 }} defaultValue={b.bez} disabled={gesperrt} placeholder="z. B. Bauleitung, Container, Kran" aria-label="BGK Bezeichnung"
                    onBlur={e => { if (e.target.value !== b.bez) setzeEs({ bgk: bgk.map((x, j) => (j === i ? { ...x, bez: e.target.value } : x)) }); }} />
                  <ZahlEingabe label="BGK Betrag" wert={b.betrag} disabled={gesperrt} breite={120} onWert={n => setzeEs({ bgk: bgk.map((x, j) => (j === i ? { ...x, betrag: n } : x)) })} />
                  {!gesperrt && <button className="kb-symbol" aria-label="BGK löschen" onClick={() => setzeEs({ bgk: bgk.filter((_, j) => j !== i) })}><Trash2 size={14} /></button>}
                </div>
              ))}
              {!gesperrt && <div><Knopf klein leise Icon={Plus} onClick={() => setzeEs({ bgk: [...bgk, { bez: "", betrag: 0 }] })}>Baustellengemeinkosten</Knopf></div>}
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                <Feld label="AGK % (auf Herstellkosten)"><ZahlEingabe label="AGK" wert={z.endsumme.agkProzent} disabled={gesperrt} onWert={n => setzeEs({ agkProzent: n })} /></Feld>
                <Feld label="Wagnis und Gewinn %"><ZahlEingabe label="W+G" wert={z.endsumme.wgProzent} disabled={gesperrt} onWert={n => setzeEs({ wgProzent: n })} /></Feld>
                <Feld label="Umlage auf">
                  <select className="kb-eingabe" style={{ height: 32, width: 160 }} value={z.endsumme.umlageAuf} disabled={gesperrt} onChange={e => setzeEs({ umlageAuf: e.target.value })}>
                    <option value="lohn">nur Lohn</option><option value="alle">alle Kostenarten</option>
                  </select>
                </Feld>
              </div>
              {r.endsumme?.fehler && <Meldung>{r.endsumme.fehler}</Meldung>}
            </div>
          )}
        </div>

        {!gesperrt && (
          <div>
            <h2 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 500 }}>Zielpreis</h2>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input className="kb-eingabe kb-zahl" style={{ width: 160, height: 32, textAlign: "right" }} placeholder="Netto in €" value={ziel} aria-label="Zielpreis netto"
                onChange={e => { setZiel(e.target.value); setVorschlag(null); }} onKeyDown={e => { if (e.key === "Enter") zielRechnen(); }} />
              <Knopf klein Icon={Target} onClick={zielRechnen}>Zuschläge berechnen</Knopf>
            </div>
            {vorschlag && (
              <div style={{ marginTop: 10, padding: 12, border: "1px solid var(--border)", borderRadius: 8, background: "var(--surface)", fontSize: 13 }}>
                {vorschlag.zuschlaege.modell === "endsumme"
                  ? <>Wagnis und Gewinn {pz(z.endsumme.wgProzent)} % → <strong className="kb-zahl">{pz(vorschlag.zuschlaege.endsumme.wgProzent)} %</strong></>
                  : <>Sätze: {KOSTENARTEN.map(ka => `${KOSTENART_LABEL[ka]} ${pz(vorschlag.zuschlaege.saetze[ka])} %`).join(" · ")}</>}
                <div style={{ color: "var(--text2)", marginTop: 4 }}>
                  Ergibt {euro(vorschlag.ziel + vorschlag.abweichung)} € netto{vorschlag.abweichung ? `, ${euro(Math.abs(vorschlag.abweichung))} € ${vorschlag.abweichung > 0 ? "über" : "unter"} dem Ziel (EP sind auf Cent gerundet)` : ""}.
                  {vorschlag.zuschlaege.modell === "endsumme" && vorschlag.zuschlaege.endsumme.wgProzent < 0 && <span style={{ color: "var(--red)" }}> Wagnis und Gewinn negativ: unter den Kosten.</span>}
                </div>
                <div style={{ marginTop: 8 }}><Knopf klein haupt onClick={() => { onZuschlaege(vorschlag.zuschlaege); setVorschlag(null); }}>Übernehmen</Knopf></div>
              </div>
            )}
          </div>
        )}

        {abgleich.abweichungen.length > 0 && !gesperrt && (
          <div>
            <h2 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 500 }}>Preise</h2>
            <div style={{ fontSize: 13, color: "var(--text2)", marginBottom: 8 }}>{abgleich.abweichungen.length} Ansätze haben andere Preise als die Stammdaten.</div>
            <div style={{ maxHeight: 160, overflowY: "auto", fontSize: 13, marginBottom: 8 }}>
              {[...new Map(abgleich.abweichungen.map(a => [a.bezeichnung, a])).values()].slice(0, 30).map(a => (
                <div key={a.bezeichnung} style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
                  <span>{a.bezeichnung}</span><span className="kb-zahl">{euro(a.alt)} → {euro(a.neu)}</span>
                </div>
              ))}
            </div>
            <Knopf klein Icon={RefreshCw} onClick={() => anwenden({ ansaetze: { aendern: abgleich.aenderungen } })}>Preise aus Stammdaten übernehmen</Knopf>
          </div>
        )}
      </section>

      <section>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 500, flex: 1 }}>Ergebnis</h2>
          <Knopf klein Icon={Printer} onClick={() => formblaetter().catch(e => onFehler(e.message))}>Formblätter {z.modell === "endsumme" ? "222" : "221"} und 223</Knopf>
        </div>
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "8px 16px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto", gap: "6px 16px", fontSize: 13, padding: "6px 0 10px", borderBottom: "1px solid var(--border2)" }}>
            <span style={{ color: "var(--muted)" }}>Kostenart</span><span style={{ color: "var(--muted)", textAlign: "right" }}>Einzelkosten</span><span style={{ color: "var(--muted)", textAlign: "right" }}>Zuschlag</span><span style={{ color: "var(--muted)", textAlign: "right" }}>mit Zuschlag</span>
            {KOSTENARTEN.map(ka => (
              <FragmentZeile4 key={ka} label={KOSTENART_LABEL[ka]} a={euro(r.ekt[ka])} b={`${pz(r.saetze[ka])} %`} c={euro(r.ekt[ka] * (1 + (Number(r.saetze[ka]) || 0) / 100))} />
            ))}
          </div>
          {zeile("Einzelkosten der Teilleistungen", `${euro(r.ektSumme)} €`)}
          {r.endsumme && <>
            {zeile("Baustellengemeinkosten", `${euro(r.endsumme.bgk)} €`)}
            {zeile("Herstellkosten", `${euro(r.endsumme.hk)} €`)}
            {zeile(`Allgemeine Geschäftskosten ${pz(z.endsumme.agkProzent)} %`, `${euro(r.endsumme.agk)} €`)}
            {zeile(`Wagnis und Gewinn ${pz(z.endsumme.wgProzent)} %`, `${euro(r.endsumme.wg)} €`)}
            {zeile(`Umlage (${r.endsumme.umlageAuf === "alle" ? "auf alle Kostenarten" : "auf den Lohn"})`, r.endsumme.umlageSatz == null ? "–" : `${pz(r.endsumme.umlageSatz)} %`)}
          </>}
          {zeile(`Lohnstunden`, `${std(r.stunden)} h`)}
          {r.stunden > 0 && zeile("Ø Lohnkosten je Stunde", `${euro(r.mittellohnIst)} €/h`)}
          {zeile(`Kalkulierte Positionen (${r.kalkuliertePositionen})`, `${euro(r.gpKalkuliert)} €`)}
          {zeile(`Festpreise ohne Ansätze (${r.festpreisPositionen})`, `${euro(r.festpreise)} €`)}
          {Math.abs(r.rundungsdifferenz) >= 0.01 && zeile("Rundung der EP auf Cent", `${euro(r.rundungsdifferenz)} €`, false, "var(--muted)")}
          {zeile("Angebotssumme netto", `${euro(r.angebotssumme)} €`, true)}
          {zeile("Deckungsbeitrag kalkulierter Positionen", `${euro(r.deckung)} €`, false, r.deckung < 0 ? "var(--red)" : undefined)}
        </div>
        {r.fehler.length > 0 && <div style={{ marginTop: 12 }}><Meldung art="fehler">{r.fehler.length} Ansätze mit fehlerhafter Formel: {[...new Set(r.fehler.map(f => f.text))].slice(0, 3).join(" · ")}</Meldung></div>}
      </section>
    </div>
  );
}

function FragmentZeile({ label, children }) {
  return <><span style={{ color: "var(--text2)" }}>{label}</span>{children}</>;
}
function FragmentZeile4({ label, a, b, c }) {
  return <><span>{label}</span><span className="kb-zahl" style={{ textAlign: "right" }}>{a}</span><span className="kb-zahl" style={{ textAlign: "right", color: "var(--text2)" }}>{b}</span><span className="kb-zahl" style={{ textAlign: "right" }}>{c}</span></>;
}
