import { useState, useEffect } from "react";
import { FlaskConical, CloudRain, Clock3, Users, TriangleAlert, CircleCheckBig, ArrowRightLeft } from "lucide-react";
import { terminprognose, alsTag, tageAddieren } from "../lib/terminkette.js";
import { sbClientMitToken } from "../lib/supabase.js";
import { Label, inputStyle } from "../components/Label.jsx";

// Rein deterministische "Was-wäre-wenn"-Berechnung — keine KI beteiligt.
// Alle drei Szenarien verändern nur eine In-Memory-Kopie der Aufgaben
// (nichts wird gespeichert) und rechnen dieselbe Terminketten-Engine wie
// der Zeitplan-Tab.
//
// "Mitarbeiter verschieben" nimmt an, dass sich die Dauer offener Aufgaben
// einer Kolonne umgekehrt proportional zu ihrer Mannstärke verhält (doppelt
// so viele Leute → halbe Zeit) — eine bewusst einfache, transparente
// Näherung, keine Baustellenlogistik-Simulation. Zuordnung Aufgabe→Kolonne
// läuft über aufgabe.zustaendig === kolonne.name, da kolonne_id an Aufgaben
// im UI nirgends gesetzt wird (siehe AufgabenFormular).
//
// Drei bewusste Ausnahmen von der reinen Skalierung (siehe Chat-Diskussion):
// - Betonage-Aufgaben (typ === "beton") werden NICHT skaliert. Ihre Dauer
//   ist meist von der Aushärtezeit dominiert (7–28 Tage, wetterabhängig),
//   nicht von der Mannstärke — mehr Leute gießen den Beton schneller ein,
//   härten lassen ihn aber nicht schneller aus.
// - mindest_mitarbeiter an einer Aufgabe blockiert die Simulation, wenn die
//   verbleibende Mannstärke der abgebenden Kolonne darunter fällt, statt
//   stillschweigend eine unrealistisch kurze Dauer zu berechnen.
// - maximal_mitarbeiter deckelt die für die Skalierung einer Aufgabe
//   angesetzte Mannstärke (Platz-/Werkzeugbeschränkung, Koordinations-
//   aufwand) — eine Aufstockung über dieses Maximum hinaus wirkt sich auf
//   die Dauer dieser Aufgabe nicht mehr aus.
export function SimulationView({ aufgaben = [], kolonnen = [], projekt, projekte = [], session }) {
  const [modus, setModus] = useState("verzoegern"); // verzoegern | wetter | personal
  const offeneAufgaben = aufgaben.filter(a => a.status !== "abgeschlossen");

  const [aufgabeId, setAufgabeId] = useState(offeneAufgaben[0]?.id ?? "");
  const [zusatzTage, setZusatzTage] = useState(3);

  const [wetterStart, setWetterStart] = useState(() => new Date().toISOString().slice(0, 10));
  const [wetterTage,  setWetterTage]  = useState(3);

  const andereProjekte = projekte.filter(p => p.id !== projekt?.id);
  const [andereProjektId, setAndereProjektId] = useState(andereProjekte[0]?.id ?? "");
  const [andereDaten,     setAndereDaten]     = useState(null); // { aufgaben, kolonnen } der anderen Baustelle
  const [andereLaden,     setAndereLaden]     = useState(false);
  const [andereFehler,    setAndereFehler]    = useState("");
  const [quelleKolonne,   setQuelleKolonne]   = useState("");
  const [zielKolonne,     setZielKolonne]     = useState(kolonnen[0]?.name ?? "");
  const [anzahlMitarbeiter, setAnzahlMitarbeiter] = useState(2);

  const [ergebnis, setErgebnis] = useState(null);
  const [ergebnisFehler, setErgebnisFehler] = useState("");

  // Lädt automatisch neu, sobald sich andereProjektId ändert — auch beim
  // allerersten Render mit dem von useState vorbelegten Default (z.B. bei
  // genau einer anderen Baustelle). Vorher hing das Laden ausschließlich am
  // onChange-Handler des <select>: der von useState() vorausgewählte Wert
  // löste beim Mount kein onChange aus, "Von Kolonne" blieb leer, und
  // "Simulieren" war dauerhaft deaktiviert (disabled hängt an !andereDaten)
  // — ohne jede Fehlermeldung. Admins mit genau zwei Baustellen (der
  // Normalfall) konnten "Mitarbeiter verschieben" dadurch nie benutzen.
  useEffect(() => {
    setAndereDaten(null);
    setQuelleKolonne("");
    setAndereFehler("");
    if (!andereProjektId || !session?.access_token) return;
    let abgebrochen = false;
    setAndereLaden(true);
    const client = sbClientMitToken(session);
    Promise.all([
      client.from("aufgaben").select("*").eq("projekt_id", andereProjektId),
      client.from("kolonnen").select("*").eq("projekt_id", andereProjektId),
    ]).then(([aRes, kRes]) => {
      if (abgebrochen) return;
      if (aRes.error || kRes.error) {
        setAndereFehler("Baustelle konnte nicht geladen werden: " + (aRes.error?.message || kRes.error?.message));
        return;
      }
      setAndereDaten({ aufgaben: aRes.data || [], kolonnen: kRes.data || [] });
      setQuelleKolonne(kRes.data?.[0]?.name ?? "");
    }).catch(e => {
      if (!abgebrochen) setAndereFehler("Baustelle konnte nicht geladen werden: " + e.message);
    }).finally(() => {
      if (!abgebrochen) setAndereLaden(false);
    });
    return () => { abgebrochen = true; };
  }, [andereProjektId, session?.access_token]);

  function skaliereDauer(aufgabenListe, kolonneName, altAnzahl, neuAnzahl) {
    if (altAnzahl <= 0) return aufgabenListe;
    return aufgabenListe.map(a => {
      if (a.zustaendig !== kolonneName || a.status === "abgeschlossen") return a;
      if (a.typ === "beton") return a; // Aushärtezeit ist mannstärke-unabhängig
      // Maximalbesetzung deckelt, wie viel Mannstärke für DIESE Aufgabe
      // überhaupt etwas bringt — unabhängig von der tatsächlichen
      // Kolonnengröße davor/danach.
      const effAlt = a.maximal_mitarbeiter ? Math.min(altAnzahl, a.maximal_mitarbeiter) : altAnzahl;
      const effNeu = a.maximal_mitarbeiter ? Math.min(neuAnzahl, a.maximal_mitarbeiter) : neuAnzahl;
      if (effAlt <= 0) return a;
      const faktor = effAlt / Math.max(effNeu, 0.5);
      return { ...a, dauer_tage: Math.max(0.5, (a.dauer_tage && a.dauer_tage > 0 ? a.dauer_tage : 1) * faktor) };
    });
  }

  // Blockiert die Simulation, statt eine Kolonne unter die für eine ihrer
  // Aufgaben hinterlegte Mindestbesetzung fallen zu lassen.
  function mindestbesetzungVerletzt(aufgabenListe, kolonneName, neuAnzahl) {
    return aufgabenListe.find(a => a.zustaendig === kolonneName && a.status !== "abgeschlossen"
      && a.mindest_mitarbeiter > neuAnzahl) || null;
  }

  function simulieren() {
    setErgebnisFehler("");

    if (modus === "personal") {
      const quelle = andereDaten?.kolonnen.find(k => k.name === quelleKolonne);
      const ziel = kolonnen.find(k => k.name === zielKolonne);
      const n = Number(anzahlMitarbeiter);
      if (!quelle || !ziel) { setErgebnisFehler("Bitte Quell- und Ziel-Kolonne wählen."); return; }
      const quelleAlt = quelle.mitarbeiter?.length || 0;
      const zielAlt = ziel.mitarbeiter?.length || 0;
      if (n < 1 || n >= quelleAlt) {
        setErgebnisFehler(`"${quelle.name}" hat nur ${quelleAlt} Mann — es können höchstens ${Math.max(quelleAlt - 1, 0)} verschoben werden.`);
        return;
      }
      const blockiert = mindestbesetzungVerletzt(andereDaten.aufgaben, quelle.name, quelleAlt - n);
      if (blockiert) {
        setErgebnisFehler(`"${blockiert.titel}" braucht mindestens ${blockiert.mindest_mitarbeiter} Personen — "${quelle.name}" hätte danach nur noch ${quelleAlt - n}.`);
        return;
      }

      const zielBasis = terminprognose(aufgaben);
      const zielSimAufgaben = skaliereDauer(aufgaben, ziel.name, zielAlt, zielAlt + n);
      const zielSim = terminprognose(zielSimAufgaben);

      const quelleBasis = terminprognose(andereDaten.aufgaben);
      const quelleSimAufgaben = skaliereDauer(andereDaten.aufgaben, quelle.name, quelleAlt, quelleAlt - n);
      const quelleSim = terminprognose(quelleSimAufgaben);

      setErgebnis({
        modus: "personal",
        ziel: { name: projekt?.name || "Diese Baustelle", basis: zielBasis, sim: zielSim,
          delta: Math.round((zielSim.projektEnde - zielBasis.projektEnde) / 86400000) },
        quelle: { name: andereProjekte.find(p => p.id === andereProjektId)?.name || "Andere Baustelle",
          basis: quelleBasis, sim: quelleSim,
          delta: Math.round((quelleSim.projektEnde - quelleBasis.projektEnde) / 86400000) },
      });
      return;
    }

    const basis = terminprognose(aufgaben);
    let simAufgaben = aufgaben;
    let betroffen = [];

    if (modus === "verzoegern") {
      const a = aufgaben.find(x => x.id === Number(aufgabeId));
      if (!a) return;
      simAufgaben = aufgaben.map(x => x.id === a.id
        ? { ...x, dauer_tage: (x.dauer_tage && x.dauer_tage > 0 ? x.dauer_tage : 1) + Number(zusatzTage) }
        : x);
      betroffen = [a.titel];
    } else {
      const start = alsTag(wetterStart);
      const ende = tageAddieren(start, Number(wetterTage) - 1);
      simAufgaben = aufgaben.map(x => {
        if (x.typ !== "beton" || x.status === "abgeschlossen") return x;
        // Gegen das von der Terminketten-Engine TATSÄCHLICH berechnete
        // Zeitfenster prüfen (startFrueh/endeFrueh), nicht gegen faellig_am:
        // eine überfällige Aufgabe (z.B. weil eine Vorgänger-Aufgabe noch
        // "in Arbeit" ist) hat ein veraltetes faellig_am in der Vergangenheit,
        // während ihr echter, von der Engine berechneter Betonage-Zeitraum
        // mitten im simulierten Regenfenster liegen kann — mit faellig_am
        // als Filter wurde genau dieser Fall silently übersehen.
        const geplant = basis.proAufgabe.get(x.id);
        if (!geplant || geplant.endeFrueh < start || geplant.startFrueh > ende) return x;
        betroffen.push(x.titel);
        return { ...x, dauer_tage: (x.dauer_tage && x.dauer_tage > 0 ? x.dauer_tage : 1) + Number(wetterTage) };
      });
    }

    const sim = terminprognose(simAufgaben);
    const deltaTage = Math.round((sim.projektEnde - basis.projektEnde) / 86400000);
    setErgebnis({ modus, basis, sim, deltaTage, betroffen });
  }

  return (
    <div>
      <div style={{ color:"var(--text)", fontWeight:700, marginBottom:9,
        display:"flex", alignItems:"center", gap:7 }}><FlaskConical size={16} color="var(--yellow)" /> Baustellen-Simulation</div>
      <div style={{ color:"var(--muted)", fontSize:12, marginBottom:14, lineHeight:1.5 }}>
        Rechnet Szenarien mit der echten Terminketten-Logik durch (dieselbe wie im Zeitplan) —
        keine KI-Schätzung, nur eine Was-wäre-wenn-Berechnung. Es wird nichts gespeichert.
      </div>

      <div style={{ display:"flex", gap:6, marginBottom:14, flexWrap:"wrap" }}>
        {[["verzoegern","Aufgabe verzögert sich"],["wetter","Regen-Tage"],["personal","Mitarbeiter verschieben"]].map(([k,l]) => (
          <button key={k} onClick={() => { setModus(k); setErgebnis(null); setErgebnisFehler(""); }}
            style={{ flex:"1 1 auto", minWidth:110, background: modus===k ? "var(--ink)" : "var(--surface)",
              color: modus===k ? "#fff" : "var(--muted)",
              border:`1px solid ${modus===k ? "var(--ink)" : "var(--border)"}`,
              padding:"9px 6px", cursor:"pointer", fontSize:12, fontWeight: modus===k ? 700 : 500,
              fontFamily:"inherit" }}>{l}</button>
        ))}
      </div>

      {modus === "verzoegern" && (
        <div style={{ marginBottom:14 }}>
          {offeneAufgaben.length === 0 ? (
            <div style={{ color:"var(--muted)", fontSize:12.5 }}>Keine offenen Aufgaben zum Simulieren vorhanden.</div>
          ) : (
            <>
              <div style={{ marginBottom:9 }}>
                <Label>Aufgabe</Label>
                <select value={aufgabeId} onChange={e => setAufgabeId(e.target.value)}
                  style={{ ...inputStyle(), padding:"11px 12px" }}>
                  {offeneAufgaben.map(a => <option key={a.id} value={a.id}>{a.titel}</option>)}
                </select>
              </div>
              <div>
                <Label>Zusätzliche Verzögerung (Tage)</Label>
                <input type="number" min="1" value={zusatzTage} onChange={e => setZusatzTage(e.target.value)} style={inputStyle()} />
              </div>
            </>
          )}
        </div>
      )}

      {modus === "wetter" && (
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:14 }}>
          <div>
            <Label>Regen ab</Label>
            <input type="date" value={wetterStart} onChange={e => setWetterStart(e.target.value)}
              style={inputStyle()} />
          </div>
          <div>
            <Label>Anzahl Tage</Label>
            <input type="number" min="1" value={wetterTage} onChange={e => setWetterTage(e.target.value)} style={inputStyle()} />
          </div>
          <div style={{ gridColumn:"1 / -1", color:"var(--muted)", fontSize:11 }}>
            Betrifft alle offenen Betonage-Aufgaben, deren von der Terminkette berechneter
            Zeitraum sich mit diesem Fenster überschneidet (auch bei überfälligem Fälligkeitsdatum).
          </div>
        </div>
      )}

      {modus === "personal" && (
        <div style={{ marginBottom:14 }}>
          {andereProjekte.length === 0 ? (
            <div style={{ color:"var(--muted)", fontSize:12.5 }}>Keine weitere Baustelle vorhanden, von der Mitarbeiter kommen könnten.</div>
          ) : kolonnen.length === 0 ? (
            <div style={{ color:"var(--muted)", fontSize:12.5 }}>Diese Baustelle hat noch keine Kolonne, die Mitarbeiter aufnehmen könnte.</div>
          ) : (
            <>
              <div style={{ color:"var(--muted)", fontSize:10.5, marginBottom:10, lineHeight:1.4 }}>
                Nimmt an, dass sich die Dauer offener Aufgaben umgekehrt proportional zur Mannstärke
                der zuständigen Kolonne verhält — eine grobe, transparente Näherung. Betonage-Aufgaben
                werden davon ausgenommen (Aushärtezeit ist mannstärke-unabhängig), eine hinterlegte
                Maximalbesetzung deckelt den Effekt einer Aufstockung, und eine Kolonne fällt nie unter
                die für eine Aufgabe hinterlegte Mindestbesetzung.
              </div>
              <div style={{ marginBottom:9 }}>
                <Label>Von Baustelle</Label>
                <select value={andereProjektId} onChange={e => setAndereProjektId(e.target.value)}
                  style={{ ...inputStyle(), padding:"11px 12px" }}>
                  {andereProjekte.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>

              {andereLaden && <div style={{ color:"var(--muted)", fontSize:12, marginBottom:9 }}>Lädt…</div>}
              {andereFehler && <div style={{ color:"var(--red)", fontSize:12, marginBottom:9 }}>{andereFehler}</div>}

              {andereDaten && (
                <>
                  {andereDaten.kolonnen.length === 0 ? (
                    <div style={{ color:"var(--muted)", fontSize:12.5, marginBottom:9 }}>Diese Baustelle hat keine Kolonnen.</div>
                  ) : (
                    <div style={{ marginBottom:9 }}>
                      <Label>Von Kolonne</Label>
                      <select value={quelleKolonne} onChange={e => setQuelleKolonne(e.target.value)}
                        style={{ ...inputStyle(), padding:"11px 12px" }}>
                        {andereDaten.kolonnen.map(k => (
                          <option key={k.id} value={k.name}>{k.name} ({k.mitarbeiter?.length || 0} Mann)</option>
                        ))}
                      </select>
                    </div>
                  )}
                </>
              )}

              <div style={{ marginBottom:9 }}>
                <Label>Nach Kolonne (hier)</Label>
                <select value={zielKolonne} onChange={e => setZielKolonne(e.target.value)}
                  style={{ ...inputStyle(), padding:"11px 12px" }}>
                  {kolonnen.map(k => (
                    <option key={k.id} value={k.name}>{k.name} ({k.mitarbeiter?.length || 0} Mann)</option>
                  ))}
                </select>
              </div>

              <div>
                <Label>Anzahl Mitarbeiter</Label>
                <input type="number" min="1" value={anzahlMitarbeiter} onChange={e => setAnzahlMitarbeiter(e.target.value)} style={inputStyle()} />
              </div>
            </>
          )}
        </div>
      )}

      {ergebnisFehler && (
        <div style={{ background:"var(--rbg)", color:"var(--red)", padding:"9px 12px", borderRadius:8,
          fontSize:12.5, marginBottom:12, display:"flex", alignItems:"center", gap:7 }}>
          <TriangleAlert size={14} />{ergebnisFehler}
        </div>
      )}

      <button onClick={simulieren}
        disabled={
          (modus === "verzoegern" && offeneAufgaben.length === 0) ||
          (modus === "personal" && (!andereDaten || !quelleKolonne || !zielKolonne))
        }
        style={{ width:"100%", background:"var(--yellow)", color:"#1a1200", border:"none",
          padding:14, fontWeight:800, fontSize:14, cursor:"pointer", fontFamily:"inherit",
          display:"flex", alignItems:"center", justifyContent:"center", gap:8, marginBottom:16,
          opacity: ((modus === "verzoegern" && offeneAufgaben.length === 0) ||
            (modus === "personal" && (!andereDaten || !quelleKolonne || !zielKolonne))) ? 0.5 : 1 }}>
        {modus === "wetter" ? <CloudRain size={16} /> : modus === "personal" ? <ArrowRightLeft size={16} /> : <Clock3 size={16} />} Simulieren
      </button>

      {ergebnis?.modus === "personal" && (
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {[ergebnis.ziel, ergebnis.quelle].map((seite, i) => (
            <div key={i} style={{ background:"var(--surface)", border:"1px solid var(--border)", padding:14 }}>
              <div style={{ color:"var(--text)", fontWeight:700, fontSize:13, marginBottom:8,
                display:"flex", alignItems:"center", gap:6 }}><Users size={13} />{seite.name}</div>
              <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, marginBottom:4 }}>
                <span style={{ color:"var(--muted)" }}>Ohne Simulation</span>
                <span style={{ color:"var(--text)", fontWeight:600 }}>{seite.basis.projektEnde.toLocaleDateString("de-DE")}</span>
              </div>
              <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, marginBottom:8 }}>
                <span style={{ color:"var(--muted)" }}>Mit Simulation</span>
                <span style={{ color:"var(--text)", fontWeight:600 }}>{seite.sim.projektEnde.toLocaleDateString("de-DE")}</span>
              </div>
              <div style={{ color: seite.delta > 0 ? "var(--red)" : seite.delta < 0 ? "var(--green)" : "var(--muted)",
                fontWeight:700, fontSize:12.5 }}>
                {seite.delta === 0 ? "Termin bleibt unverändert"
                  : seite.delta > 0 ? `+${seite.delta} Tag${seite.delta===1?"":"e"} langsamer`
                  : `${Math.abs(seite.delta)} Tag${Math.abs(seite.delta)===1?"":"e"} schneller`}
              </div>
            </div>
          ))}
        </div>
      )}

      {ergebnis && ergebnis.modus !== "personal" && (
        <div style={{ background:"var(--surface)", border:"1px solid var(--border)", padding:14 }}>
          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8, fontSize:12.5 }}>
            <span style={{ color:"var(--muted)" }}>Ohne Simulation</span>
            <span style={{ color:"var(--text)", fontWeight:700 }}>{ergebnis.basis.projektEnde.toLocaleDateString("de-DE")}</span>
          </div>
          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:12, fontSize:12.5 }}>
            <span style={{ color:"var(--muted)" }}>Mit Simulation</span>
            <span style={{ color:"var(--text)", fontWeight:700 }}>{ergebnis.sim.projektEnde.toLocaleDateString("de-DE")}</span>
          </div>

          <div style={{ background: ergebnis.deltaTage > 0 ? "var(--rbg)" : "var(--gbg)", borderRadius:8,
            padding:"10px 12px", display:"flex", alignItems:"center", gap:8 }}>
            {ergebnis.deltaTage > 0
              ? <TriangleAlert size={16} color="var(--red)" />
              : <CircleCheckBig size={16} color="var(--green)" />}
            <div style={{ color: ergebnis.deltaTage > 0 ? "var(--red)" : "var(--green)", fontWeight:700, fontSize:13 }}>
              {ergebnis.deltaTage > 0
                ? `Gesamttermin verschiebt sich um ${ergebnis.deltaTage} Tag${ergebnis.deltaTage===1?"":"e"}`
                : "Gesamttermin bleibt unverändert"}
            </div>
          </div>

          {ergebnis.betroffen.length > 0 && (
            <div style={{ marginTop:10, fontSize:11.5, color:"var(--muted)" }}>
              Betroffene Aufgabe{ergebnis.betroffen.length===1?"":"n"}: {ergebnis.betroffen.join(", ")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
