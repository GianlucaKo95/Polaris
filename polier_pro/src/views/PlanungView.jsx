import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { sbClientMitToken } from "../lib/supabase.js";
import {
  montag, plusTage, wochen, kolonnenRessourcen, geraeteRessourcen, kolonnenKonflikt, geraetKonflikt, zelle, zuweisen, besetzung,
  abwesenheitenNormalisieren,
} from "../lib/planung.js";

// Personal- und Geräteplanung: Kolonnen und Geräte als Zeilen, Kalender-
// wochen als Spalten, je Zelle die Baustelle in ihrer Farbe. Konflikte
// (Abwesenheit, Prüffrist, Werkstatt, anderer Standort) als Punkt in der
// Zelle und gesammelt unter dem Plan. Logik in lib/planung.js.

const heuteIso = () => new Date().toLocaleDateString("sv-SE");
const zahl = { fontFamily: "var(--font-zahl)", fontVariantNumeric: "tabular-nums" };
const SPALTEN = 10;
const knopf = { height: 32, padding: "0 10px", borderRadius: 8, fontFamily: "inherit", fontSize: 14, cursor: "pointer", display: "inline-flex",
  alignItems: "center", gap: 6, border: "1px solid var(--border2)", background: "var(--surface)", color: "var(--text)" };

export function PlanungView({ session, projekte = [], geraete = [], plan, darfPlanen = false }) {
  const heute = heuteIso();
  const [start, setStart] = useState(() => plusTage(montag(heuteIso()), -7));
  const [kolonnenAlle, setKolonnenAlle] = useState([]);
  const [abwesenheiten, setAbwesenheiten] = useState([]);
  const [menue, setMenue] = useState(null); // { ressource, woche, x, y }
  const [dauer, setDauer] = useState(1);
  const [ladeFehler, setLadeFehler] = useState(null);
  const rahmen = useRef(null);
  const { zeilen: planZeilen, speichern, loeschen, fehler } = plan;

  // Kolonnen aller Baustellen und Abwesenheiten laden (Demo: Kolonnen aus den Baustellen)
  useEffect(() => {
    const ids = projekte.map(p => p.id);
    if (!session?.access_token) {
      let demo = [];
      try { demo = JSON.parse(localStorage.getItem("polaris.kolonnen.demo") || "[]"); } catch { /* leer */ }
      setKolonnenAlle([...projekte.flatMap(p => p.kolonnen || []), ...demo]);
      try { setAbwesenheiten(JSON.parse(localStorage.getItem("polaris.abwesenheiten.demo") || "[]")); } catch { setAbwesenheiten([]); }
      return;
    }
    if (!ids.length) return;
    const c = sbClientMitToken(session);
    Promise.all([
      c.from("kolonnen").select("name,vorarbeiter,mitarbeiter,projekt_id").in("projekt_id", ids),
      c.from("abwesenheiten").select("von_datum,bis_datum,typ,status,mitarbeiter:profile!abwesenheiten_profile_id_fkey(vorname,nachname)")
        .gte("bis_datum", plusTage(montag(heuteIso()), -14)),
    ]).then(([k, a]) => {
      if (k.error) setLadeFehler(k.error.message);
      setKolonnenAlle(k.data || []);
      setAbwesenheiten(a.data || []); // ohne Leserecht (z. B. Bauleiter je nach RLS) einfach keine Abwesenheitshinweise
    });
  }, [session?.access_token, projekte.length]);

  useEffect(() => {
    if (!menue) return;
    const zu = e => { if (e.key === "Escape") setMenue(null); };
    const klick = e => { if (!e.target.closest?.("[data-planmenue]")) setMenue(null); };
    document.addEventListener("keydown", zu); document.addEventListener("mousedown", klick);
    return () => { document.removeEventListener("keydown", zu); document.removeEventListener("mousedown", klick); };
  }, [menue]);

  const ws = useMemo(() => wochen(start, SPALTEN), [start]);
  const kolonnen = useMemo(() => kolonnenRessourcen(kolonnenAlle), [kolonnenAlle]);
  const geraeteR = useMemo(() => geraeteRessourcen(geraete), [geraete]);
  const abw = useMemo(() => abwesenheitenNormalisieren(abwesenheiten), [abwesenheiten]);
  const aktiveProjekte = projekte.filter(p => !p.archiviert);
  const projekt = id => projekte.find(p => String(p.id) === String(id));
  const heuteMontag = montag(heute);

  const konfliktFuer = (r, w, z) => r.art === "kolonne"
    ? (z ? (k => k ? [k] : null)(kolonnenKonflikt(r, w, abw)) : null)
    : (z ? geraetKonflikt(r, w, z.projekt_id, heute) : null);

  const hinweise = [];
  for (const r of [...kolonnen, ...geraeteR]) for (const w of ws) {
    if (w.freitag < heute) continue;
    const z = zelle(planZeilen, r.schluessel, w.montag);
    const k = konfliktFuer(r, w, z);
    if (k) for (const x of k) hinweise.push({ w, r, z, ...x });
  }

  async function waehlen(projektId) {
    const { ressource, woche } = menue;
    const montage = Array.from({ length: projektId == null ? 1 : dauer }, (_, i) => plusTage(woche.montag, i * 7));
    const { speichern: s, loeschen: l } = zuweisen(planZeilen, ressource, projektId, montage);
    setMenue(null);
    for (const id of l) await loeschen(id);
    for (const z of s) await speichern(z);
  }

  const zeileKopf = r => (
    <div style={{ padding: "8px 12px 8px 16px", borderTop: "1px solid var(--border)", minWidth: 0, position: "sticky", left: 0, background: "var(--surface)", zIndex: 1 }}>
      <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {r.art === "geraet" && r.inventarnr && <span style={{ ...zahl, fontSize: 13, color: "var(--muted)", marginRight: 6 }}>{r.inventarnr}</span>}{r.name}
      </div>
      <div style={{ fontSize: 12, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {r.art === "kolonne" ? `${r.mitarbeiter.length} Personen${r.vorarbeiter ? ` · ${r.vorarbeiter}` : ""}`
          : r.geraet.status === "einsatz" ? `steht auf ${projekt(r.geraet.projekt_id)?.name || "Baustelle"}` : r.geraet.status === "werkstatt" ? "Werkstatt" : "Bauhof"}
      </div>
    </div>
  );

  // Aufeinanderfolgende Wochen mit derselben Baustelle als ein Balken über die Zellen
  const balken = (r, zeile) => {
    const laeufe = [];
    ws.forEach((w, i) => {
      const z = zelle(planZeilen, r.schluessel, w.montag);
      const letzter = laeufe.at(-1);
      if (z && letzter && String(letzter.projekt_id) === String(z.projekt_id) && letzter.ende === i - 1) letzter.ende = i;
      else if (z) laeufe.push({ projekt_id: z.projekt_id, anfang: i, ende: i });
    });
    return laeufe.map(l => {
      const p = projekt(l.projekt_id);
      const farbe = p?.farbe || "#8C8F96";
      return (
        <span key={r.schluessel + l.anfang} aria-hidden="true" style={{ gridRow: zeile, gridColumn: `${l.anfang + 2} / ${l.ende + 3}`, alignSelf: "stretch", margin: "5px 4px 4px 5px",
          display: "flex", alignItems: "center", padding: "0 8px 0 10px", borderRadius: 4, fontSize: 12, pointerEvents: "none", zIndex: 1, minWidth: 0,
          background: `color-mix(in srgb, ${farbe} 16%, var(--surface))`, boxShadow: `inset 3px 0 0 ${farbe}`, color: "var(--text)" }}>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p?.name || "Baustelle"}</span>
        </span>
      );
    });
  };

  const zellenAnsicht = (r, w, zeile, i) => {
    const z = zelle(planZeilen, r.schluessel, w.montag);
    const p = z && projekt(z.projekt_id);
    const k = konfliktFuer(r, w, z);
    const schwer = k?.some(x => x.schwer);
    const jetzt = w.montag === heuteMontag;
    const vorbei = w.freitag < heute;
    return (
      <button key={r.schluessel + w.montag} disabled={!darfPlanen || vorbei}
        onClick={e => {
          const a = e.currentTarget.getBoundingClientRect(), o = rahmen.current.getBoundingClientRect();
          setDauer(1); setMenue({ ressource: r, woche: w, x: Math.min(a.left - o.left, o.width - 272), y: a.bottom - o.top + 4 });
        }}
        title={[p?.name, ...(k || []).map(x => x.text)].filter(Boolean).join(" · ") || (darfPlanen && !vorbei ? "Baustelle zuweisen" : "")}
        aria-label={`${r.name}, KW ${w.kw}: ${p?.name || "frei"}${k ? ", " + k.map(x => x.text).join(", ") : ""}`}
        style={{ gridRow: zeile, gridColumn: i + 2, position: "relative", height: 48, margin: 0, padding: 4, border: "none", borderTop: "1px solid var(--border)", borderLeft: "1px solid var(--border)",
          background: jetzt ? "color-mix(in srgb, var(--text) 3%, var(--surface))" : "var(--surface)", cursor: darfPlanen && !vorbei ? "pointer" : "default",
          opacity: vorbei ? 0.55 : 1, fontFamily: "inherit", minWidth: 0 }}
        className={darfPlanen && !vorbei ? "plan-zelle" : undefined}>
        {k && <span aria-hidden="true" style={{ position: "absolute", top: 6, right: 6, width: 6, height: 6, borderRadius: 3, zIndex: 2, background: schwer ? "var(--red)" : "var(--akzent)" }} />}
      </button>
    );
  };

  const grid = { display: "grid", gridTemplateColumns: `220px repeat(${SPALTEN}, minmax(84px, 1fr))` };
  // Explizite Zeilennummern, damit die Balken über den Zellen in derselben Zeile liegen
  let zeileNr = 1;
  const ressourceZeile = r => { const z = ++zeileNr; return [
    <div key={"k" + r.schluessel} style={{ gridRow: z, gridColumn: 1 }}>{zeileKopf(r)}</div>,
    ...ws.map((w, i) => zellenAnsicht(r, w, z, i)),
    ...balken(r, z),
  ]; };
  const abschnittZeile = text => (
    <div style={{ gridRow: ++zeileNr, gridColumn: `1 / span ${SPALTEN + 1}`, padding: "16px 16px 8px", fontSize: 13, color: "var(--text2)", borderTop: "1px solid var(--border)", position: "sticky", left: 0 }}>{text}</div>
  );

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <button onClick={() => setStart(s => plusTage(s, -28))} style={knopf} aria-label="4 Wochen zurück"><ChevronLeft size={16} strokeWidth={1.5} /></button>
        <button onClick={() => setStart(plusTage(montag(heute), -7))} style={knopf}>Heute</button>
        <button onClick={() => setStart(s => plusTage(s, 28))} style={knopf} aria-label="4 Wochen vor"><ChevronRight size={16} strokeWidth={1.5} /></button>
        <span style={{ ...zahl, color: "var(--text2)", marginLeft: 8 }}>KW {ws[0].kw} – KW {ws.at(-1).kw} · {ws[0].jahr === ws.at(-1).jahr ? ws[0].jahr : `${ws[0].jahr}/${ws.at(-1).jahr}`}</span>
        {!darfPlanen && <span style={{ color: "var(--muted)", fontSize: 13, marginLeft: "auto" }}>Nur Ansicht. Planen dürfen Geschäftsführung und Bauleitung</span>}
      </div>
      {(fehler || ladeFehler) && <div role="alert" style={{ color: "var(--red)", background: "var(--rbg)", borderRadius: 8, padding: "8px 12px", marginBottom: 12, fontSize: 13 }}>{fehler || ladeFehler}</div>}

      <div ref={rahmen} style={{ position: "relative" }}>
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, overflowX: "auto" }}>
        <div style={{ ...grid, minWidth: 220 + SPALTEN * 84 }}>
          <div style={{ gridRow: 1, gridColumn: 1, position: "sticky", left: 0, background: "var(--surface)", zIndex: 2 }} />
          {ws.map((w, i) => (
            <div key={w.montag} style={{ gridRow: 1, gridColumn: i + 2, padding: "10px 8px", borderLeft: "1px solid var(--border)", fontSize: 13,
              color: w.montag === heuteMontag ? "var(--text)" : "var(--text2)", boxShadow: w.montag === heuteMontag ? "inset 0 2px 0 var(--akzent)" : undefined }}>
              <div style={{ ...zahl, fontWeight: w.montag === heuteMontag ? 500 : 400 }}>KW {w.kw}</div>
              <div style={{ ...zahl, fontSize: 12, color: "var(--muted)" }}>{w.montag.slice(8, 10)}.{w.montag.slice(5, 7)}.</div>
            </div>
          ))}

          {abschnittZeile(`Kolonnen · ${kolonnen.length}`)}
          {kolonnen.length === 0 && <div style={{ gridRow: ++zeileNr, gridColumn: `1 / span ${SPALTEN + 1}`, padding: "0 16px 12px", color: "var(--muted)" }}>Noch keine Kolonnen. Sie entstehen auf den Baustellen unter „Kolonnen“</div>}
          {kolonnen.map(ressourceZeile)}

          {abschnittZeile(`Geräte · ${geraeteR.length}`)}
          {geraeteR.length === 0 && <div style={{ gridRow: ++zeileNr, gridColumn: `1 / span ${SPALTEN + 1}`, padding: "0 16px 12px", color: "var(--muted)" }}>Noch keine Geräte. Sie kommen aus der Geräteverwaltung</div>}
          {geraeteR.map(ressourceZeile)}

          <div style={{ gridRow: ++zeileNr, gridColumn: 1, padding: "10px 16px", borderTop: "1px solid var(--border2)", fontSize: 13, color: "var(--text2)", position: "sticky", left: 0, background: "var(--surface)" }}>Baustellen mit Kolonne</div>
          {ws.map((w, i) => {
            const b = besetzung(planZeilen, w.montag);
            const mit = aktiveProjekte.filter(p => b[p.id]?.kolonnen > 0);
            const ohne = aktiveProjekte.filter(p => !(b[p.id]?.kolonnen > 0));
            return (
              <div key={w.montag} title={ohne.length ? `Ohne Kolonne: ${ohne.map(p => p.name).join(", ")}` : "Alle Baustellen besetzt"}
                style={{ gridRow: zeileNr, gridColumn: i + 2, padding: "10px 8px", borderTop: "1px solid var(--border2)", borderLeft: "1px solid var(--border)", ...zahl, fontSize: 13,
                  color: ohne.length && w.freitag >= heute ? "var(--text)" : "var(--muted)" }}>
                {mit.length} / {aktiveProjekte.length}
              </div>
            );
          })}
        </div>
      </div>

        {menue && (
          <div data-planmenue role="menu" style={{ position: "absolute", left: Math.max(8, menue.x), top: menue.y, width: 264, zIndex: 20, background: "var(--surface)",
            border: "1px solid var(--border2)", borderRadius: 10, boxShadow: "0 8px 24px rgba(22,24,29,0.12)", padding: 4, animation: "desk-auf 120ms ease-out" }}>
            <div style={{ padding: "8px 10px 4px", fontSize: 12, color: "var(--muted)" }}>{menue.ressource.name} · KW {menue.woche.kw}</div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 10px 8px", fontSize: 13, color: "var(--text2)" }}>
              für
              <select value={dauer} onChange={e => setDauer(Number(e.target.value))} style={{ height: 28, borderRadius: 6, border: "1px solid var(--border2)", background: "var(--surface)", color: "var(--text)", fontFamily: "inherit" }}>
                {[1, 2, 3, 4, 6, 8, 12].map(n => <option key={n} value={n}>{n} {n === 1 ? "Woche" : "Wochen"}</option>)}
              </select>
            </label>
            <div style={{ maxHeight: 280, overflowY: "auto" }}>
              {aktiveProjekte.map(p => (
                <button key={p.id} role="menuitem" className="desk-nav" onClick={() => waehlen(p.id)}
                  style={{ display: "flex", width: "100%", alignItems: "center", gap: 8, height: 32, padding: "0 10px", border: "none", background: "none", borderRadius: 6,
                    fontFamily: "inherit", fontSize: 14, color: "var(--text)", cursor: "pointer", textAlign: "left" }}>
                  <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 2, background: p.farbe || "#8C8F96", flexShrink: 0 }} />
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                </button>
              ))}
            </div>
            {zelle(planZeilen, menue.ressource.schluessel, menue.woche.montag) && (
              <button role="menuitem" className="desk-nav" onClick={() => waehlen(null)}
                style={{ display: "flex", width: "100%", alignItems: "center", height: 32, padding: "0 10px", border: "none", borderTop: "1px solid var(--border)", background: "none",
                  fontFamily: "inherit", fontSize: 14, color: "var(--text2)", cursor: "pointer" }}>Woche freigeben</button>
            )}
          </div>
        )}
      </div>

      <div style={{ marginTop: 24 }}>
        <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 8 }}>Hinweise</div>
        {hinweise.length === 0 ? (
          <div style={{ color: "var(--text2)" }}>Keine Konflikte im angezeigten Zeitraum</div>
        ) : (
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12 }}>
            {hinweise.map((h, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "72px minmax(0,1fr) minmax(0,1.4fr)", gap: 12, alignItems: "center", padding: "10px 16px",
                borderTop: i ? "1px solid var(--border)" : "none", fontSize: 14 }}>
                <span style={{ ...zahl, color: "var(--text2)" }}>KW {h.w.kw}</span>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.r.name}{h.z && <span style={{ color: "var(--muted)" }}> · {projekt(h.z.projekt_id)?.name}</span>}</span>
                <span style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--text2)" }}>
                  <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: 3, background: h.schwer ? "var(--red)" : "var(--akzent)", flexShrink: 0 }} />
                  {h.text}{h.namen && `: ${h.namen.join(", ")}`}{h.unsicher && " (beantragt)"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
