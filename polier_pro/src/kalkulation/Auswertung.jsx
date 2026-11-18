// Auswertungen eines Stands: Bedarf je Ressource und Vergleich mit einem
// anderen Stand (z. B. Angebot gegen Verhandlung).
import { useEffect, useMemo, useState } from "react";
import { KOSTENARTEN, KOSTENART_LABEL, ressourcenListe } from "../lib/kalk/rechenkern.js";
import { gpCent, summen } from "../lib/kalk/lvBaum.js";
import { STAND_LABEL, euro, menge, Meldung } from "./ui.jsx";

export function Auswertung({ speicher, stand, staende, knoten, ansaetze }) {
  const [ka, setKa] = useState("alle");
  const res = useMemo(() => ressourcenListe(knoten, ansaetze, stand.zuschlaege), [knoten, ansaetze, stand.zuschlaege]);
  const gefiltert = res.filter(r => ka === "alle" || r.kostenart === ka);
  const andere = staende.filter(s => s.id !== stand.id);
  const standard = (stand.basis_id && andere.find(s => s.id === stand.basis_id)) || andere.filter(s => s.art !== "nachtrag" && s.nummer < stand.nummer).at(-1) || andere.filter(s => s.art !== "nachtrag").at(-1) || andere.at(-1);
  const [vergleichId, setVergleichId] = useState(standard?.id || "");
  const [vergleichKnoten, setVergleichKnoten] = useState(null);
  const [fehler, setFehler] = useState(null);

  useEffect(() => {
    if (!vergleichId) { setVergleichKnoten(null); return; }
    let aktiv = true;
    speicher.knotenLaden(vergleichId).then(k => { if (aktiv) setVergleichKnoten(k); }).catch(e => setFehler(e.nutzerText || e.message));
    return () => { aktiv = false; };
  }, [speicher, vergleichId]);

  const vergleich = useMemo(() => {
    if (!vergleichKnoten) return null;
    const schluessel = k => k.oz || `${k.kurztext}|${k.einheit}`;
    const alt = new Map(vergleichKnoten.filter(k => k.typ === "position").map(k => [schluessel(k), k]));
    const zeilen = [];
    const gesehen = new Set();
    for (const k of knoten.filter(x => x.typ === "position")) {
      const s = schluessel(k);
      gesehen.add(s);
      const a = alt.get(s);
      const gpA = a ? gpCent(a) / 100 : 0, gpN = gpCent(k) / 100;
      if (!a || Number(a.ep) !== Number(k.ep) || Number(a.menge) !== Number(k.menge)) zeilen.push({ oz: k.oz, text: k.kurztext, epA: a?.ep, epN: k.ep, mA: a?.menge, mN: k.menge, diff: gpN - gpA, art: a ? "geändert" : "neu" });
    }
    for (const [s, a] of alt) if (!gesehen.has(s)) zeilen.push({ oz: a.oz, text: a.kurztext, epA: a.ep, mA: a.menge, diff: -gpCent(a) / 100, art: "entfallen" });
    zeilen.sort((x, y) => Math.abs(y.diff) - Math.abs(x.diff));
    return { zeilen, summeA: summen(vergleichKnoten).gesamt, summeN: summen(knoten).gesamt };
  }, [vergleichKnoten, knoten]);

  const vStand = staende.find(s => s.id === vergleichId);

  return (
    <div style={{ padding: 24, overflowY: "auto", display: "flex", flexDirection: "column", gap: 32 }}>
      <section>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8, flexWrap: "wrap" }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 500 }}>Bedarf je Ressource</h2>
          <select className="kb-eingabe" style={{ height: 32, width: 180 }} value={ka} onChange={e => setKa(e.target.value)} aria-label="Kostenart filtern">
            <option value="alle">Alle Kostenarten</option>
            {KOSTENARTEN.map(k => <option key={k} value={k}>{KOSTENART_LABEL[k]}</option>)}
          </select>
          <span style={{ color: "var(--text2)", fontSize: 13 }}>Mengen aus den Ansätzen aller Positionen, ohne Bedarfs- und Alternativpositionen</span>
        </div>
        {gefiltert.length ? (
          <table className="kb-tabelle" style={{ background: "var(--surface)" }}>
            <thead><tr><th>Kostenart</th><th>Ressource</th><th className="r">Menge</th><th>ME</th><th className="r">Ø Preis</th><th className="r">Kosten</th><th className="r">Positionen</th></tr></thead>
            <tbody>
              {gefiltert.map(r => (
                <tr key={r.schluessel} style={{ cursor: "default" }}>
                  <td style={{ color: "var(--text2)" }}>{KOSTENART_LABEL[r.kostenart]}</td><td>{r.bezeichnung || "ohne Bezeichnung"}</td>
                  <td className="r kb-zahl">{menge(r.menge)}</td><td>{r.einheit}</td><td className="r kb-zahl">{euro(r.preisMittel)}</td>
                  <td className="r kb-zahl">{euro(r.kosten)}</td><td className="r kb-zahl">{r.positionen}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <div style={{ color: "var(--muted)" }}>Noch keine Ansätze in diesem Stand.</div>}
      </section>

      <section>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8, flexWrap: "wrap" }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 500 }}>Vergleich mit Stand</h2>
          {andere.length ? (
            <select className="kb-eingabe" style={{ height: 32, width: 260 }} value={vergleichId} onChange={e => setVergleichId(e.target.value)} aria-label="Vergleichsstand">
              {andere.map(s => <option key={s.id} value={s.id}>{s.nummer} · {s.bezeichnung || STAND_LABEL[s.art]}</option>)}
            </select>
          ) : <span style={{ color: "var(--muted)" }}>Es gibt nur diesen Stand.</span>}
        </div>
        {fehler && <Meldung art="fehler">{fehler}</Meldung>}
        {vergleich && (
          <>
            <div className="kb-zahl" style={{ display: "flex", gap: 24, marginBottom: 12, fontSize: 14 }}>
              <span>Stand {vStand?.nummer}: {euro(vergleich.summeA)} €</span>
              <span>Stand {stand.nummer}: {euro(vergleich.summeN)} €</span>
              <span style={{ color: vergleich.summeN - vergleich.summeA < 0 ? "var(--red)" : "var(--green)" }}>Differenz {euro(vergleich.summeN - vergleich.summeA)} €</span>
            </div>
            {vergleich.zeilen.length ? (
              <table className="kb-tabelle" style={{ background: "var(--surface)" }}>
                <thead><tr><th>OZ</th><th>Position</th><th>Änderung</th><th className="r">Menge vorher</th><th className="r">Menge jetzt</th><th className="r">EP vorher</th><th className="r">EP jetzt</th><th className="r">Differenz GP</th></tr></thead>
                <tbody>
                  {vergleich.zeilen.slice(0, 300).map((z, i) => (
                    <tr key={i} style={{ cursor: "default" }}>
                      <td className="kb-zahl">{z.oz}</td><td>{z.text}</td><td style={{ color: "var(--text2)" }}>{z.art}</td>
                      <td className="r kb-zahl">{z.mA != null ? menge(z.mA) : ""}</td><td className="r kb-zahl">{z.mN != null ? menge(z.mN) : ""}</td>
                      <td className="r kb-zahl">{z.epA != null ? euro(z.epA) : ""}</td><td className="r kb-zahl">{z.epN != null ? euro(z.epN) : ""}</td>
                      <td className="r kb-zahl" style={{ color: z.diff < 0 ? "var(--red)" : undefined }}>{euro(z.diff)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <div style={{ color: "var(--muted)" }}>Keine Unterschiede bei Mengen und Preisen.</div>}
          </>
        )}
      </section>
    </div>
  );
}
