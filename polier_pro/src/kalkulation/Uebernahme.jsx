// Übernahme der bisherigen Angebote in den Kalkulationsbereich, mit
// Summenprüfung je Angebot vor dem Start.
import { useEffect, useMemo, useState } from "react";
import { Knopf, Meldung, euro } from "./ui.jsx";
import { migrationsPlan, planZusammenfassung } from "../lib/kalk/migration.js";

export function Uebernahme({ speicher, alteAngebote, baustellen, onFertig, onAbbrechen }) {
  const [angebote, setAngebote] = useState(null);
  const [migriert, setMigriert] = useState(null);
  const [fehler, setFehler] = useState(null);
  const [fortschritt, setFortschritt] = useState(null);
  const [fertig, setFertig] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const liste = speicher.alteAngeboteLaden ? await speicher.alteAngeboteLaden() : (alteAngebote || []);
        setAngebote(liste);
        setMigriert(await speicher.bereitsMigriert());
      } catch (e) { setFehler(e.nutzerText || e.message); }
    })();
  }, [speicher, alteAngebote]);

  const plan = useMemo(() => (angebote && migriert ? migrationsPlan(angebote, baustellen, { bereitsMigriert: migriert }) : null), [angebote, migriert, baustellen]);
  const z = plan ? planZusammenfassung(plan) : null;
  const abweichungen = plan ? plan.flatMap(p => p.staende.filter(s => s.pruefung.abweichungCent !== 0 || s.pruefung.hinweise.length).map(s => ({ p, s }))) : [];

  const starten = async () => {
    setFehler(null);
    setFortschritt(0);
    try {
      const n = await speicher.planUebernehmen(plan, { onFortschritt: setFortschritt });
      setFertig(n);
    } catch (e) { setFehler(`${e.nutzerText || e.message} Bereits übernommene Angebote bleiben erhalten; ein neuer Start setzt mit den übrigen fort.`); setFortschritt(null); }
  };

  return (
    <div style={{ padding: "24px 32px", overflowY: "auto", height: "100%", boxSizing: "border-box", maxWidth: 1040 }}>
      <h1 style={{ margin: 0, fontSize: 28, lineHeight: "36px", fontWeight: 500 }}>Angebote übernehmen</h1>
      <div style={{ color: "var(--text2)", marginTop: 4, marginBottom: 24, maxWidth: 680 }}>
        Jede Baustelle wird ein Kalkulationsprojekt, jedes Angebot ein Stand darin. Versendete, beauftragte und abgelehnte Angebote werden gesperrt übernommen,
        Entwürfe bleiben bearbeitbar. Die bisherigen Angebote bleiben unverändert in Polaris.
      </div>
      {fehler && <div style={{ marginBottom: 16 }}><Meldung art="fehler">{fehler}</Meldung></div>}
      {!plan && !fehler && <div style={{ color: "var(--text2)" }}>Angebote werden geprüft …</div>}
      {plan && fertig == null && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12, marginBottom: 24 }}>
            {[["Projekte", z.projekte], ["Angebote und Nachträge", z.staende], ["Positionen", z.positionen], ["Mit Abweichung", z.mitAbweichung]].map(([l, w]) => (
              <div key={l} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 16 }}>
                <div style={{ fontSize: 13, color: "var(--text2)" }}>{l}</div>
                <div className="kb-zahl" style={{ fontSize: 24, marginTop: 4 }}>{w}</div>
              </div>
            ))}
          </div>
          {z.staende === 0 ? (
            <Meldung art="ok">Alle Angebote sind bereits übernommen.</Meldung>
          ) : (
            <>
              <h2 style={{ fontSize: 16, fontWeight: 500, margin: "0 0 8px" }}>Summenprüfung</h2>
              {abweichungen.length === 0 ? (
                <div style={{ color: "var(--text2)", marginBottom: 24 }}>Alle {z.staende} Summen stimmen centgenau mit den bisherigen Angeboten überein.</div>
              ) : (
                <>
                  <div style={{ color: "var(--text2)", marginBottom: 8, fontSize: 13 }}>
                    Neu wird jede Position auf Cent gerundet, wie in GAEB und Rechnung. Wo alte Angebote Preise mit mehr als zwei Nachkommastellen hatten, weicht die Summe deshalb ab.
                  </div>
                  <table className="kb-tabelle" style={{ marginBottom: 24, background: "var(--surface)" }}>
                    <thead><tr><th>Projekt</th><th>Angebot</th><th className="r">Bisher</th><th className="r">Neu</th><th className="r">Abweichung</th><th>Hinweis</th></tr></thead>
                    <tbody>
                      {abweichungen.slice(0, 50).map(({ p, s }) => (
                        <tr key={s.altes_angebot_id} style={{ cursor: "default" }}>
                          <td>{p.projekt.name}</td><td>{s.bezeichnung}</td>
                          <td className="r kb-zahl">{euro(s.pruefung.altCent / 100)}</td>
                          <td className="r kb-zahl">{euro(s.pruefung.neuCent / 100)}</td>
                          <td className="r kb-zahl" style={{ color: s.pruefung.abweichungCent ? "var(--akzent)" : undefined }}>{euro(s.pruefung.abweichungCent / 100)}</td>
                          <td style={{ color: "var(--text2)", fontSize: 13 }}>{s.pruefung.hinweise.slice(0, 2).join(" · ")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <Knopf haupt disabled={fortschritt != null} onClick={starten}>{z.staende} Angebote übernehmen</Knopf>
                <Knopf onClick={onAbbrechen} disabled={fortschritt != null}>Abbrechen</Knopf>
                {fortschritt != null && <span className="kb-zahl" style={{ color: "var(--text2)" }}>{fortschritt} von {z.staende} …</span>}
              </div>
            </>
          )}
        </>
      )}
      {fertig != null && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16, alignItems: "flex-start" }}>
          <Meldung art="ok">{fertig} Angebote übernommen.</Meldung>
          <Knopf haupt onClick={onFertig}>Zu den Projekten</Knopf>
        </div>
      )}
    </div>
  );
}
