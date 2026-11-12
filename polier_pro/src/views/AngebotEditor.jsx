import { useState, useEffect, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { ClipboardList, X, CircleCheckBig, ChevronLeft, ChartColumn, FileText, Settings, Plus, Sparkles, TriangleAlert, Upload, Download } from "lucide-react";
import { AUFGABEN_TYPEN } from "../config/konstanten.js";
import { inputStyle, Label } from "../components/Label.jsx";
import { escapeHtml, layoutText } from "../lib/utils.js";
import { druckePDF } from "../lib/pdf.jsx";
import { DiktierFeld } from "../components/DiktierFeld.jsx";
import { Spinner } from "../components/Spinner.jsx";
import { KiAngebotAssistent } from "../components/KiAngebotAssistent.jsx";
import { NuPreisspiegel } from "../components/NuPreisspiegel.jsx";
import { positionMengeAendern, positionVariableAendern } from "../lib/stammpositionen.js";
import { katalogBauen, QUELLEN_LABEL } from "../lib/katalog.js";
import { angebotPruefen, vergleichswerteAusAngeboten, AMPEL_FARBE } from "../lib/plausibilitaet.js";
import { freigabePflicht } from "../lib/angebotRegeln.js";
import { mittellohnBerechnen } from "../lib/kalkulationsgrundlagen.js";
import { endsummeBerechnen, endsummeAnwenden, wgFuerZielsumme, LEERE_ENDSUMME } from "../lib/endsumme.js";
import { NACHTRAG_GRUENDE, NACHTRAG_STATUS, begruendungPrompt, mehrkostenanzeigeHtml } from "../lib/nachtrag.js";
import { kiText } from "../lib/ai.js";
import { terminplanAusAngebot } from "../lib/terminplan.js";
import { nettoSumme, istTitel, positionsart, inSumme, POSITIONSARTEN, ART_LABEL, titelName, titelSummen } from "../lib/lv.js";
import { erzeugeAngebotDocx } from "../lib/angebotVorlage.js";
import { DocxVorschauModal } from "../components/DocxVorschauModal.jsx";
import { AngebotFreigabe } from "../components/AngebotFreigabe.jsx";
import { AngebotNachweis } from "../components/AngebotNachweis.jsx";
import { sbAngebotFreigabeNachweisLaden } from "../lib/supabase.js";
import { parseGaeb90, gaeb90ZuPositionen, gaeb90DateiLesen, gaeb90Schreiben, gaeb90AlsWindows1252, parseGaeb90Preise, gaeb90PreiseZuPositionen, gaeb90PreiseEinspielen, gaeb90PreiseSchreiben } from "../lib/gaeb90.js";
import { parseGaebXml, gaebXmlDateiLesen } from "../lib/gaebXml.js";
import { leereKalkulation, kalkulationEp, kalkulationEinzelkosten, kalkulationZuschlagProzent, kalkulationGesamtkosten, kalkulationAufriss } from "../lib/kalkulation.js";
import { PositionKalkulation } from "../components/PositionKalkulation.jsx";
import { gaebX84Schreiben } from "../lib/gaebX84.js";
import { efbAuswerten, efbHtml } from "../lib/efb.js";
import { Co2Panel } from "../components/Co2Panel.jsx";
import { useIstDesktop } from "../hooks/useIstDesktop.js";
import { useUngespeichert } from "../hooks/useUngespeichert.js";
import { verlassenBestaetigen } from "../lib/ungespeichert.js";
import { PreisstandPanel } from "../components/PreisstandPanel.jsx";
import { preisstandAnlegen, preiseFuer, zuschlaegeFuer, istEingefroren, einfrieren } from "../lib/preisstand.js";
import { Menue } from "../components/Menue.jsx";
import { LvTabelle } from "../components/LvTabelle.jsx";
import { Kalkulationsaufriss } from "../components/Kalkulationsaufriss.jsx";
import { ExcelVorschauModal } from "../components/ExcelVorschauModal.jsx";

// aufgabe.m2 ist das einzige Mengenfeld im gesamten Aufgaben-Formular,
// seine Bedeutung hängt aber vom Aufgabentyp ab (siehe extraLabel in
// AufgabenFormular.jsx/SchnellErstellung.jsx): bei "beton" eine Fläche
// (m²), bei "bewehrung" eine Masse (t). Beim Import MUSS der Katalogeintrag
// deshalb zur tatsächlich erfassten Einheit passen, sonst entsteht ein
// Einheiten/Mengen-Mismatch: eine frühere Fassung bevorzugte hier für Beton
// den m³-Eintrag (branchenüblich wird Beton nach Volumen abgerechnet),
// ohne menge mit umzurechnen — aus "50 m²" wurde dadurch fälschlich
// "50 m³" zum m³-Preis, ein ca. 2,6-facher Aufpreis auf dem Angebot. Bis es
// ein eigenes Mengenfeld für Volumen gibt, ist m² die einzige Einheit, zu
// der die für Beton erfasste Menge passt — Bewehrung braucht hier keinen
// Eintrag, da der Katalog nur einen einzigen Bewehrung-Eintrag (t) kennt.
const BEVORZUGTE_EINHEIT = { beton: "m²" };
export function AngebotEditor({ angebot, onSave, onClose, aufgaben, einheitspreise, lvVorlagen, angebotVorlage, kalkulationspreise: firmenpreise = [], stammpositionen = [], standardZuschlaege: firmenZuschlaege = null, angebote = [], nachtragZu = null, rolle = null, angebotRegeln = null, kalkulationsgrundlagen = null, onTerminplanErzeugen = null, co2Faktoren = [], projekt, eigeneFirma, firmaId, profil, session }) {
  const istDesktop = useIstDesktop();
  // Preisstand je Angebot (lib/preisstand.js): beim ersten Öffnen aus den
  // Firmenpreisen bzw. aus der Urkalkulation des Hauptauftrags kopiert.
  const [a,         setARoh]      = useState(() => angebot.preisstand ? angebot : {
    ...angebot,
    preisstand: preisstandAnlegen({ firmenpreise, grundlagen: kalkulationsgrundlagen, zuschlaege: firmenZuschlaege, hauptauftrag: nachtragZu,
      heute: new Date().toLocaleDateString("sv-SE"), nachtraeglich: !!angebot.id && !nachtragZu }),
  });
  // Ab hier rechnet der ganze Editor mit den Preisen dieses Angebots
  const kalkulationspreise = preiseFuer(a, firmenpreise);
  const standardZuschlaege = zuschlaegeFuer(a, firmenZuschlaege);
  const preiseEingefroren = istEingefroren(a);
  const [ansicht,   setAnsicht]   = useState("positionen"); // positionen | einstellungen
  // Desktop: ausgewählte LV-Zeile und Inhalt des Seitenfelds (position | angebot)
  const [auswahlId, setAuswahlId] = useState(null);
  const [rechts,    setRechts]    = useState("angebot");
  const [vonVorlage,setVonVorlage]= useState(false);
  const [vonAufgabe,setVonAufgabe]= useState(false);
  const [vonKI,     setVonKI]     = useState(false);
  const [preisspiegelOffen, setPreisspiegelOffen] = useState(false);
  const [kiInfo,    setKiInfo]    = useState(null); // { annahmen, warnungen } nach KI-Übernahme
  const [gaebFehler, setGaebFehler] = useState("");
  const [gaebInfo,   setGaebInfo]   = useState(null); // { anzahl, warnungen }
  const gaebInputRef = useRef(null);
  const [gaebPreisFehler, setGaebPreisFehler] = useState("");
  const [gaebPreisInfo,   setGaebPreisInfo]   = useState(null); // { treffer, fehlend, neu, warnungen }
  const gaebPreisInputRef = useRef(null);
  const [gaebXmlFehler, setGaebXmlFehler] = useState("");
  const [gaebXmlInfo,   setGaebXmlInfo]   = useState(null); // { anzahl, warnungen }
  const gaebXmlInputRef = useRef(null);
  const [gaebPreisExportInfo, setGaebPreisExportInfo] = useState(null); // { anzahl, warnungen }
  const [kalkExportRows, setKalkExportRows] = useState(null);
  const [speichertLaedt, setSpeichertLaedt] = useState(false);
  const [wordLaedt, setWordLaedt] = useState(false);
  const [wordBlob,  setWordBlob]  = useState(null);

  // Entscheidungs-Nachweis (Name/Unterschrift/Hash/IP) einmal hier laden,
  // statt in AngebotNachweis.jsx selbst — exportPDF() unten braucht die
  // Unterschrift ebenfalls, um sie direkt ins Angebots-PDF einzubetten,
  // ein zweiter, unabhängiger Abruf dafür wäre dieselbe Anfrage doppelt.
  const [nachweis, setNachweis] = useState(null);
  useEffect(() => {
    let aktiv = true;
    if (!a.entschieden_am) { setNachweis(null); return; }
    sbAngebotFreigabeNachweisLaden(a.id, session).then(n => { if (aktiv) setNachweis(n); });
    return () => { aktiv = false; };
  }, [a.id, a.entschieden_am]);

  // Positions-Rabatt (pro Zeile) wirkt VOR dem Gesamt-Rabatt im
  // Einstellungen-Tab — beide sind unabhängig kombinierbar, ohne dass
  // eine Zeile den Überblick verliert: gpOf() ist die einzige Stelle, die
  // beide Zahlenwerte (Position + PDF/CSV/Summen-Banner) berechnet.
  const gpOf = p => (p.menge||0) * (p.ep||0) * (1 - (p.rabatt||0)/100);
  const netto   = nettoSumme(a.positionen); // ohne Bedarf ohne GB / Alternativen (lib/lv.js)
  const tSummen = titelSummen(a.positionen);
  const rabattBetrag = netto * (a.rabatt||0)/100;
  const nettoNachRabatt = netto - rabattBetrag;
  const mwstBetrag = nettoNachRabatt * (a.mwst||19)/100;
  const bruttoGesamt = nettoNachRabatt + mwstBetrag;

  // Nur bei ANNAHME gesperrt (angebot_freigabe_entscheiden_v2 setzt das) —
  // bei Ablehnung soll das Angebot bewusst weiter änderbar bleiben, z.B.
  // für eine Preisanpassung und erneutes Zusenden. Guards hier zusätzlich
  // zur RLS-Sperre (angebote_aendern/angebote_loeschen), damit ein Klick
  // nicht einfach still wirkungslos verpufft, sondern die UI es gar nicht
  // erst zulässt.
  const gesperrt = a.gesperrt === true;
  // Einziger Schreibweg für den Angebotsinhalt — ein gesperrtes (bereits
  // digital angenommenes) Angebot darf lokal gar nicht erst veränderbar
  // sein, egal über welches Feld/welche Funktion der Versuch kommt.
  const setA = updater => { if (!gesperrt) setARoh(updater); };

  // Preisstand ändern: alle kalkulierten Positionen rechnen ihren EP neu
  function preisstandAendern(ps) {
    if (preiseEingefroren) return;
    setA(x => ({ ...x, preisstand: ps, positionen: x.positionen.map(p => p.kalk ? { ...p, ep: kalkulationEp(p.kalk, ps.kalkulationspreise, p.menge) } : p) }));
  }
  function zuschlaegeAnwenden(z) {
    if (preiseEingefroren) return;
    setA(x => ({ ...x, positionen: x.positionen.map(p => {
      if (!p.kalk) return p;
      const kalk = { ...p.kalk, zuschlagLohn: z.zuschlagLohn ?? 0, zuschlagMaterial: z.zuschlagMaterial ?? 0, zuschlagGeraet: z.zuschlagGeraet ?? 0, zuschlagFremdleistung: z.zuschlagFremdleistung ?? 0 };
      return { ...p, kalk, ep: kalkulationEp(kalk, x.preisstand?.kalkulationspreise || firmenpreise, p.menge) };
    }) }));
  }

  function addPosition(pos) {
    const id = Date.now();
    setA(x => ({ ...x, positionen:[...x.positionen, { rabatt:0, ...pos, id }] }));
    return id;
  }

  function updatePos(id, key, val) {
    setA(x => ({ ...x, positionen:x.positionen.map(p => {
      if (p.id !== id) return p;
      // Aus einer Stammposition: Rezeptur für die neue Menge neu hochrechnen
      // (lib/stammpositionen.js), statt die Gesamtmengen einzufrieren.
      if (key === "menge") {
        const neu = positionMengeAendern(p, Number(val), stammpositionen, kalkulationspreise);
        if (neu) return neu;
      }
      const aktualisiert = { ...p, [key]:key==="menge"||key==="ep"||key==="rabatt" ? Number(val) : val };
      // Von Hand überschriebener Preis: Preisquelle ehrlich auf "manuell".
      if (key === "ep" && p.preisquelle) aktualisiert.preisquelle = { art: "manuell" };
      // Bei kalkulierten Positionen hängt der EP von der Menge ab (Gesamt-
      // kosten der Kalkulation / Menge) — bei Mengenänderung neu berechnen,
      // statt den alten EP stehen zu lassen.
      if (key === "menge" && p.kalk) aktualisiert.ep = kalkulationEp(p.kalk, kalkulationspreise, aktualisiert.menge);
      return aktualisiert;
    }) }));
  }

  // Plausibilitäts-Ampel (lib/plausibilitaet.js): EP je Position gegen die
  // eigenen Stammdaten und frühere Angebote der Baustelle.
  const vergleichsbasis = useMemo(() => [
    ...katalogBauen({ stammpositionen, einheitspreise, lvVorlagen, kalkulationspreise, standardZuschlaege }),
    ...vergleichswerteAusAngeboten(angebote, a.id),
  ], [stammpositionen, einheitspreise, lvVorlagen, kalkulationspreise, standardZuschlaege, angebote, a.id]);
  const pruefung = useMemo(() => angebotPruefen(a.positionen, vergleichsbasis), [a.positionen, vergleichsbasis]);

  function kiErgebnisUebernehmen(ergebnis) {
    const neuPos = ergebnis.positionen.map(p => ({ ...p, id: Date.now() + Math.random() }));
    setA(x => ({
      ...x,
      positionen: [...x.positionen, ...neuPos],
      titel: x.titel.startsWith("Angebot ") && ergebnis.titel ? ergebnis.titel : x.titel,
      empfaenger: x.empfaenger || ergebnis.empfaenger,
    }));
    setKiInfo({ annahmen: ergebnis.annahmen, warnungen: ergebnis.warnungen, anzahl: neuPos.length,
      ohnePreis: neuPos.filter(p => !(p.ep > 0)).length });
    setVonKI(false);
  }

  function removePos(id) {
    setA(x => ({ ...x, positionen:x.positionen.filter(p=>p.id!==id) }));
  }

  // Umschalten zwischen direktem EP und EP-Kalkulation (Lohn/Material/Gerät/
  // Fremdleistung + Zuschläge, siehe lib/kalkulation.js + PositionKalkulation.jsx).
  function kalkUmschalten(id) {
    setA(x => ({ ...x, positionen: x.positionen.map(p => {
      if (p.id !== id) return p;
      if (p.kalk) { const { kalk, ...rest } = p; return rest; }
      const kalk = leereKalkulation();
      return { ...p, kalk, ep: kalkulationEp(kalk, kalkulationspreise, p.menge) };
    }) }));
  }

  function kalkAendern(id, neueKalk) {
    setA(x => ({ ...x, positionen: x.positionen.map(p =>
      p.id===id ? { ...p, kalk: neueKalk, ep: kalkulationEp(neueKalk, kalkulationspreise, p.menge) } : p
    ) }));
  }

  function vorlageLaden(vorlage) {
    const neuPos = vorlage.positionen.map(p => {
      // p.ep_id: manuell über VorlageFormular.jsx angelegte Vorlagen
      // referenzieren einen Einheitspreise-Katalogeintrag. p.ep (direkt):
      // aus einem GAEB-Import als Mutter-LV gespeicherte Vorlagen
      // (AdminParameterView "Mutter-LV hochladen") tragen stattdessen schon
      // den fertigen Preis selbst — hat Vorrang, falls vorhanden.
      const ep = p.ep ?? einheitspreise.find(e=>e.id===p.ep_id)?.preis ?? 0;
      return { id:Date.now()+Math.random(), bez:p.bez,
        einheit:p.einheit, menge:0, ep };
    });
    setA(x => ({ ...x, positionen:[...x.positionen, ...neuPos] }));
    setVonVorlage(false);
  }

  function aufgabeImportieren(aufgabe) {
    const typ = aufgabe.typ;
    // Mehrere Katalogeinträge können zum selben Gewerk passen (z.B. Beton
    // mit m²- und m³-Einträgen) — ohne bevorzugte Einheit je Typ nahm
    // find() immer den ersten Treffer, unabhängig von dessen Einheit.
    const gewerkTreffer = einheitspreise.filter(e =>
      e.gewerk.toLowerCase().includes(typ) || typ.includes(e.gewerk.toLowerCase())
    );
    const bevorzugt = BEVORZUGTE_EINHEIT[typ];
    const ep = gewerkTreffer.find(e => e.einheit === bevorzugt) || gewerkTreffer[0];
    addPosition({
      bez:      aufgabe.titel,
      // Die Einheit des gefundenen Katalogeintrags übernehmen statt sie zu
      // verwerfen — vorher wurde hier unabhängig vom Gewerk immer "m²"
      // (bzw. "h" ohne m2-Wert) erzwungen, auch wenn der Katalog für genau
      // dieses Gewerk bereits die richtige Einheit kannte (z.B. "t" bei
      // Bewehrung).
      einheit:  ep?.einheit || (aufgabe.m2 ? "m²" : "h"),
      menge:    aufgabe.m2 || 0,
      ep:       ep?.preis || 0,
    });
    setVonAufgabe(false);
  }

  // GAEB90-LV (D81/D83/D85/D86) importieren — siehe lib/gaeb90.js. Läuft
  // komplett im Browser (kein Server-Roundtrip), fügt die erkannten
  // Positionen inkl. Titel-Gruppenkopfzeilen an die bestehende Liste an,
  // statt sie zu ersetzen (mehrere LV-Teile nacheinander importierbar).
  async function gaebImportieren(e) {
    const datei = e.target.files?.[0];
    if (!datei) return;
    setGaebFehler("");
    setGaebInfo(null);
    try {
      const text = await gaeb90DateiLesen(datei);
      const geparst = parseGaeb90(text);
      const neuePos = gaeb90ZuPositionen(geparst);
      if (neuePos.length === 0) {
        setGaebFehler("Keine Positionen erkannt — ist das eine GAEB90-Datei (.d81/.d83/.d85/.d86)?");
        return;
      }
      setA(x => ({ ...x, positionen: [...x.positionen, ...neuePos] }));
      setGaebInfo({ anzahl: neuePos.length, warnungen: geparst.warnungen });
    } catch (err) {
      setGaebFehler("Import fehlgeschlagen: " + (err?.message || err));
    } finally {
      e.target.value = "";
    }
  }

  // Bepreistes GAEB90 (D84/D86) einspielen — siehe lib/gaeb90.js. D84/D86
  // enthalten nur OZ+EP+GP, keinen Text, und sind als Preis-Overlay auf eine
  // bereits bekannte LV-Struktur gedacht: zuerst wird versucht, den EP
  // passender, schon vorhandener Positionen (über die beim Import mit-
  // geführte OZ) zu aktualisieren; nur wenn dabei keine einzige Position
  // trifft (z.B. weil noch gar kein LV importiert wurde), werden die
  // Preise stattdessen als eigenständige, nur notdürftig benannte neue
  // Positionen angehängt.
  async function gaebPreiseImportieren(e) {
    const datei = e.target.files?.[0];
    if (!datei) return;
    setGaebPreisFehler("");
    setGaebPreisInfo(null);
    try {
      const text = await gaeb90DateiLesen(datei);
      const geparst = parseGaeb90Preise(text);
      if (geparst.preise.length === 0) {
        setGaebPreisFehler("Keine Preise erkannt — ist das eine bepreiste GAEB90-Datei (.d84/.d86)?");
        return;
      }
      const merge = gaeb90PreiseEinspielen(a.positionen, geparst.preise);
      if (merge.treffer > 0) {
        setA(x => ({ ...x, positionen: merge.positionen }));
        setGaebPreisInfo({ treffer: merge.treffer, fehlend: merge.fehlend, neu: 0, warnungen: geparst.warnungen });
      } else {
        const neuePos = gaeb90PreiseZuPositionen(geparst);
        setA(x => ({ ...x, positionen: [...x.positionen, ...neuePos] }));
        setGaebPreisInfo({ treffer: 0, fehlend: 0, neu: neuePos.length, warnungen: geparst.warnungen });
      }
    } catch (err) {
      setGaebPreisFehler("Import fehlgeschlagen: " + (err?.message || err));
    } finally {
      e.target.value = "";
    }
  }

  // GAEB-DA-XML-Import (X83, DP=83) — XML-basiertes Nachfolgeformat von
  // GAEB90, liefert dasselbe Zwischenformat wie parseGaeb90() (siehe
  // lib/gaebXml.js), daher dieselbe Umwandlung über gaeb90ZuPositionen().
  // Die so importierten Positionen führen dieselbe Ordnungszahl wie ein
  // GAEB90-Import mit — ein anschließend hochgeladenes bepreistes D84/D86
  // (gaebPreiseImportieren() oben) spielt die Preise darüber ein.
  async function gaebXmlImportieren(e) {
    const datei = e.target.files?.[0];
    if (!datei) return;
    setGaebXmlFehler("");
    setGaebXmlInfo(null);
    try {
      const text = await gaebXmlDateiLesen(datei);
      const geparst = parseGaebXml(text);
      const neuePos = gaeb90ZuPositionen(geparst);
      if (neuePos.length === 0) {
        setGaebXmlFehler("Keine Positionen erkannt — ist das eine GAEB-DA-XML-Datei (.x83)?");
        return;
      }
      setA(x => ({ ...x, positionen: [...x.positionen, ...neuePos] }));
      setGaebXmlInfo({ anzahl: neuePos.length, warnungen: geparst.warnungen });
    } catch (err) {
      setGaebXmlFehler("Import fehlgeschlagen: " + (err?.message || err));
    } finally {
      e.target.value = "";
    }
  }

  // GAEB90-Export der unbepreisten Struktur (D81/D83-artig) — Umkehrung
  // von gaebImportieren(): nützlich um ein importiertes/bearbeitetes LV
  // wieder herauszugeben oder an einen Nachunternehmer weiterzureichen.
  // Bepreister Export (D84/D86 mit Einheitspreisen): siehe
  // gaebPreiseExportieren() unten.
  function gaebExportieren() {
    const text = gaeb90Schreiben(a.positionen, { projektTitel: a.titel });
    const blob = new Blob([gaeb90AlsWindows1252(text)], { type: "application/octet-stream" });
    const url  = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = ("Angebot_" + a.titel.replace(/ /g, "_") + ".d83");
    link.click(); URL.revokeObjectURL(url);
  }

  // Bepreister GAEB90-Export (D84) — für die Rückgabe eines automatisch aus
  // einer Ausschreibung generierten Angebots (siehe AngebotView.jsx
  // "Aus Ausschreibung generieren" + lib/mutterlv.js) an die ausschreibende
  // Stelle. Braucht pro Position eine Ordnungszahl im Format des X83-/D84-
  // Dialekts (siehe gaeb90PreiseSchreiben() in lib/gaeb90.js) — die liegt vor,
  // wenn die Positionen aus einem GAEB-XML-Import bzw. dem Mutter-LV-Abgleich
  // stammen; eine manuell angelegte Position wird mit Warnung übersprungen.
  function gaebPreiseExportieren() {
    const { text, warnungen } = gaeb90PreiseSchreiben(a.positionen, { projektTitel: a.titel });
    setGaebPreisExportInfo({ anzahl: a.positionen.length - warnungen.length, warnungen: warnungen.length });
    const blob = new Blob([gaeb90AlsWindows1252(text)], { type: "application/octet-stream" });
    const url  = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = ("Angebot_" + a.titel.replace(/ /g, "_") + ".d84");
    link.click(); URL.revokeObjectURL(url);
  }

  // GAEB-DA-XML-Angebotsabgabe (X84, lib/gaebX84.js) — heute der übliche
  // Rückgabeweg an öffentliche Auftraggeber und AVA-Programme. Anders als
  // D84 auch für eigene Angebote ohne Ausschreibung (automatische OZ).
  function gaebX84Exportieren() {
    const { text, warnungen, anzahl } = gaebX84Schreiben(a.positionen, {
      projektTitel: a.titel, datum: a.datum, bieter: eigeneFirma,
    });
    setGaebPreisExportInfo({ anzahl, warnungen: warnungen.length, format: "X84" });
    const blob = new Blob([text], { type: "application/xml" });
    const url  = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = ("Angebot_" + a.titel.replace(/ /g, "_") + ".x84");
    link.click(); URL.revokeObjectURL(url);
  }

  // EFB-Preisblätter 221 + 223 (lib/efb.js) als PDF.
  const [efbInfo, setEfbInfo] = useState(null); // { warnungen }
  async function efbExportieren() {
    const auswertung = efbAuswerten(a.positionen, kalkulationspreise);
    setEfbInfo({ warnungen: auswertung.warnungen });
    await druckePDF(efbHtml(auswertung, { angebot: a, eigeneFirma, projekt, aufteilung: standardZuschlaege?.aufteilung, mittellohn: mittellohnBerechnen(a.preisstand?.mittellohn || kalkulationsgrundlagen?.mittellohn),
      endsumme: a.endsumme ? endsummeBerechnen(a.positionen, a.endsumme, kalkulationspreise) : null }),
      "EFB_" + a.titel.replace(/ /g, "_") + ".pdf");
  }

  // Kalkulationsübersicht als Excel — zur eigenen internen Nachverfolgung
  // (nicht für die Ausschreibung bestimmt, siehe gaebPreiseExportieren()
  // dafür): je Position Einzelkosten/Zuschlag/Gesamtkosten aus der
  // Kalkulation (kalkulation.js/PositionKalkulation.jsx), damit der
  // tatsächlich kalkulierte Zuschlag auf jede Position nachvollziehbar
  // bleibt. Positionen ohne eigene Kalkulation (direkter EP) werden mit
  // angezeigt, aber ohne erfundene Kostenwerte — nur EP/GP sind dort bekannt.
  const KALK_EXPORT_SPALTEN = [
    { width: 36 }, { width: 10 }, { width: 10 }, { width: 16 },
    { width: 12 }, { width: 14 }, { width: 16 }, { width: 12 }, { width: 14 },
  ];
  function kalkZelle(value, extra) { return { value, ...extra }; }
  function kalkulationExportieren() {
    const kopf = ["Position", "Menge", "Einheit", "Einzelkosten (€)", "Zuschlag (%)", "Zuschlag (€)", "Gesamtkosten (€)", "EP (€)", "GP (€)"];
    const rows = [kopf.map(t => kalkZelle(t, { fontWeight: "bold", type: String }))];
    let summeGp = 0;

    for (const p of a.positionen) {
      if (!p.bez || p.bez.startsWith("──")) continue; // Gruppenkopfzeile, keine Kalkulationszeile
      const gp = (p.menge || 0) * (p.ep || 0) * (1 - (p.rabatt || 0) / 100);
      summeGp += gp;
      if (p.kalk) {
        const einzel = kalkulationEinzelkosten(p.kalk, kalkulationspreise);
        const gesamt = kalkulationGesamtkosten(p.kalk, kalkulationspreise);
        rows.push([
          kalkZelle(p.bez, { type: String }),
          kalkZelle(p.menge || 0, { type: Number }),
          kalkZelle(p.einheit || "", { type: String }),
          kalkZelle(Number(einzel.toFixed(2)), { type: Number }),
          kalkZelle(Number(kalkulationZuschlagProzent(p.kalk, kalkulationspreise).toFixed(1)), { type: Number }),
          kalkZelle(Number((gesamt - einzel).toFixed(2)), { type: Number }),
          kalkZelle(Number(gesamt.toFixed(2)), { type: Number }),
          kalkZelle(Number((p.ep || 0).toFixed(2)), { type: Number }),
          kalkZelle(Number(gp.toFixed(2)), { type: Number }),
        ]);
      } else {
        rows.push([
          kalkZelle(p.bez, { type: String }),
          kalkZelle(p.menge || 0, { type: Number }),
          kalkZelle(p.einheit || "", { type: String }),
          kalkZelle("keine Kalkulation hinterlegt", { type: String, columnSpan: 4 }),
          null, null, null,
          kalkZelle(Number((p.ep || 0).toFixed(2)), { type: Number }),
          kalkZelle(Number(gp.toFixed(2)), { type: Number }),
        ]);
      }
    }

    rows.push([
      kalkZelle("", { type: String }), kalkZelle("", { type: String }), kalkZelle("", { type: String }),
      kalkZelle("", { type: String }), kalkZelle("", { type: String }), kalkZelle("", { type: String }),
      kalkZelle("GESAMT (netto):", { fontWeight: "bold", type: String }),
      kalkZelle("", { type: String }),
      kalkZelle(Number(summeGp.toFixed(2)), { fontWeight: "bold", type: Number }),
    ]);
    setKalkExportRows(rows);
  }

  // ── Terminplan aus Kalkulation (lib/terminplan.js) ──
  const [tp, setTp] = useState({ kolonnenStaerke: 3, stundenProTag: 8, start: new Date().toISOString().slice(0, 10) });
  const [tpMeldung, setTpMeldung] = useState("");
  const tpVorschau = terminplanAusAngebot(a, kalkulationspreise, tp);
  async function terminplanAnlegen() {
    if (!onTerminplanErzeugen || !tpVorschau.length) return;
    setTpMeldung("Lege Vorgänge an …");
    const r = await onTerminplanErzeugen(tpVorschau);
    setTpMeldung(r.ok ? `✓ ${r.anzahl} Vorgänge im Bauablauf angelegt` : `Fehler nach ${r.anzahl} Vorgängen: ${r.fehler}`);
  }

  // ── Nachtrag (lib/nachtrag.js) ──
  const [nachtragKi, setNachtragKi] = useState(false);
  const [nachtragFehler, setNachtragFehler] = useState("");
  const nInfo = a.nachtrag_info || {};
  const setNInfo = aend => setA(x => ({ ...x, nachtrag_info: { ...(x.nachtrag_info || {}), ...aend } }));
  async function nachtragBegruendenKI() {
    setNachtragKi(true); setNachtragFehler("");
    try {
      const text = await kiText(begruendungPrompt({ nachtrag: a, auftrag: nachtragZu, projekt, info: nInfo }), session);
      if (text) setNInfo({ begruendung: text });
    } catch (e) { setNachtragFehler(e.message); }
    finally { setNachtragKi(false); }
  }
  async function mehrkostenanzeigeDrucken() {
    await druckePDF(mehrkostenanzeigeHtml({ nachtrag: a, auftrag: nachtragZu, projekt, eigeneFirma, info: nInfo, esc: escapeHtml }),
      "Mehrkostenanzeige_" + a.titel.replace(/ /g, "_") + ".pdf");
    if (!nInfo.angekuendigt_am) setNInfo({ angekuendigt_am: new Date().toISOString().slice(0, 10), status: nInfo.status && nInfo.status !== "entwurf" ? nInfo.status : "angekuendigt" });
  }

  // ── Interne Freigabe (Polier → Geschäftsführung) ──
  // Ein Polier darf Angebote erstellen, aber erst nach Freigabe durch GF
  // oder Administrator an den Kunden geben (Status/Kundenlink gesperrt).
  // Jede inhaltliche Änderung nach der Freigabe setzt sie zurück, damit
  // nie ein anderes Angebot rausgeht als das freigegebene.
  const istPolier = rolle === "polier";
  const darfFreigeben = rolle === "administrator" || rolle === "geschaeftsfuehrer";
  const freigabe = a.interne_freigabe || null;
  // Kompetenzgrenze (lib/angebotRegeln.js): unterhalb der Grenze und ohne
  // rote Positionen/Handpreise darf der Polier selbst versenden.
  const pflicht = freigabePflicht({ angebot: a, rolle, regeln: angebotRegeln, pruefung });
  const versandErlaubt = !istPolier || !pflicht.pflicht || freigabe?.status === "freigegeben";
  const freigabeInhalt = useRef(JSON.stringify([a.positionen, a.rabatt, a.mwst, a.titel]));
  useEffect(() => {
    const jetzt = JSON.stringify([a.positionen, a.rabatt, a.mwst, a.titel]);
    if (jetzt !== freigabeInhalt.current) {
      freigabeInhalt.current = jetzt;
      if (freigabe?.status === "freigegeben") setA(x => ({ ...x, interne_freigabe: { status: "geaendert", am: new Date().toISOString() } }));
    }
  }, [a.positionen, a.rabatt, a.mwst, a.titel]);
  const [zurueckNotiz, setZurueckNotiz] = useState("");

  async function freigabeSetzen(status, notiz = "") {
    const neu = { ...a, interne_freigabe: { status, von: profil ? [profil.vorname, profil.nachname].filter(Boolean).join(" ") : "", am: new Date().toISOString(), ...(notiz ? { notiz } : {}) } };
    setARoh(neu);
    setSpeichertLaedt(true);
    try { if (await onSave(neu)) alsGespeichertMerken(neu); } finally { setSpeichertLaedt(false); }
  }

  // Speichern ohne den Editor zu schließen (Zwischenspeichern). Gibt true bei
  // Erfolg zurück — der Verlassen-Dialog (lib/ungespeichert.js) nutzt das.
  async function speichernKlick() {
    if (gesperrt) return true;
    setSpeichertLaedt(true);
    setSpeicherFehler("");
    try {
      // Mit der Annahme wird der Preisstand zur Urkalkulation (die Datenbank hält ihn zusätzlich per Trigger fest)
      const stand = a.status === "angenommen" ? { ...a, preisstand: einfrieren(a.preisstand, new Date().toLocaleDateString("sv-SE")) } : a;
      const ok = await onSave(stand);
      if (ok) { alsGespeichertMerken(stand); return true; }
      setSpeicherFehler("Speichern fehlgeschlagen. Die Änderungen sind lokal gesichert, bitte erneut versuchen");
      return false;
    } catch {
      setSpeicherFehler("Speichern fehlgeschlagen. Die Änderungen sind lokal gesichert, bitte erneut versuchen");
      return false;
    } finally {
      setSpeichertLaedt(false);
    }
  }

  // ── Ungespeicherte Änderungen: Merker, lokale Sicherung, Rückfrage ──
  const entwurfKey = `polaris.angebotEntwurf.${angebot.id ?? "neu"}`;
  const basis = useRef(JSON.stringify(a));
  const [gespeichertAm, setGespeichertAm] = useState(null);
  const [speicherFehler, setSpeicherFehler] = useState("");
  const [lokalerEntwurf, setLokalerEntwurf] = useState(() => {
    try {
      const e = JSON.parse(localStorage.getItem(entwurfKey) || "null");
      return e?.a && JSON.stringify(e.a) !== basis.current ? e : null;
    } catch { return null; }
  });
  const aJson = useMemo(() => JSON.stringify(a), [a]);
  const geaendert = !gesperrt && aJson !== basis.current;
  function entwurfLoeschen() { try { localStorage.removeItem(entwurfKey); } catch { /* egal */ } }
  function alsGespeichertMerken(stand) { basis.current = JSON.stringify(stand); setARoh(stand); setGespeichertAm(new Date()); entwurfLoeschen(); }
  useEffect(() => {
    if (!geaendert || lokalerEntwurf) return undefined;
    const t = setTimeout(() => { try { localStorage.setItem(entwurfKey, JSON.stringify({ a, zeit: new Date().toISOString() })); } catch { /* Speicher voll */ } }, 1000);
    return () => clearTimeout(t);
  }, [aJson, geaendert, lokalerEntwurf]);
  useUngespeichert(geaendert, { titel: `Das Angebot „${a.titel || "ohne Titel"}“`, speichern: speichernKlick, verwerfen: entwurfLoeschen });
  useEffect(() => {
    const taste = e => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") { e.preventDefault(); speichernKlick(); } };
    window.addEventListener("keydown", taste);
    return () => window.removeEventListener("keydown", taste);
  });
  const schliessen = async () => { if (await verlassenBestaetigen()) onClose(); };
  const speicherStatus = speicherFehler ? <span role="alert" style={{ color:"var(--red)" }}>{speicherFehler}</span>
    : speichertLaedt ? "Speichert …"
    : geaendert ? <span style={{ display:"inline-flex", alignItems:"center", gap:6 }}><span aria-hidden="true" style={{ width:6, height:6, borderRadius:3, background:"var(--akzent)" }} />Nicht gespeichert</span>
    : gespeichertAm ? `Gespeichert ${gespeichertAm.toLocaleTimeString("de-DE", { hour:"2-digit", minute:"2-digit" })}` : null;

  function exportPDF() {
    // .filter(Boolean): eine leere eigeneFirma.strasse/.telefon ließ sonst
    // ein verwaistes " · 12345 Musterstadt" bzw. "Tel:  · email" mit
    // führendem Trenner stehen statt den fehlenden Teil wegzulassen.
    const firmaAdresszeile = [
      eigeneFirma?.strasse,
      [eigeneFirma?.plz, eigeneFirma?.ort].filter(Boolean).join(" "),
    ].filter(Boolean).join(" · ");
    const firmaKontaktzeile = [eigeneFirma?.telefon, eigeneFirma?.email].filter(Boolean).join(" · ");
    const html = `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"/>
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family:Arial,sans-serif; font-size:10.5pt; color:#1a1a1a; }
.page { width:210mm; padding:14mm 18mm; }
.header { display:flex; justify-content:space-between; align-items:flex-start;
  border-bottom:3px solid #F5C400; padding-bottom:12px; margin-bottom:16px; }
.logo-img { width:56px; height:56px; object-fit:contain; flex-shrink:0; }
.logo-mark { width:56px; height:56px; background:#F5C400; border-radius:50%;
  display:flex; align-items:center; justify-content:center; font-size:24px;
  color:#1a1a1a; flex-shrink:0; }
.firma-name { font-size:16pt; font-weight:900; letter-spacing:-0.5px; }
.firma-info { font-size:9pt; color:#666; margin-top:3px; line-height:1.5; }
.angebot-title { text-align:right; }
.angebot-title h1 { font-size:16pt; font-weight:900; }
.angebot-title .titel { font-size:11pt; font-weight:bold; margin-top:3px; }
.angebot-title .meta { font-size:9pt; color:#666; margin-top:3px; }
.betrag-banner { background:#1a1a1a; border-radius:12px; padding:14px 18px;
  margin-bottom:16px; display:flex; justify-content:space-between; align-items:center; }
.betrag-label { color:#999; font-size:9pt; }
.betrag-val { color:#F5C400; font-weight:900; font-size:22pt; margin-top:2px; line-height:1; }
.betrag-meta { text-align:right; }
.betrag-meta div { color:#ccc; font-size:9.5pt; margin-top:4px; }
.betrag-meta div:first-child { margin-top:0; }
.empfaenger { background:#f8f8f8; border-radius:6px; padding:12px 14px; margin-bottom:16px; }
.empfaenger-label { font-size:8pt; color:#888; margin-bottom:4px; }
.table { width:100%; border-collapse:collapse; margin-bottom:16px; }
.table th { background:#1a1a1a; color:#F5C400; padding:8px 10px;
  text-align:left; font-size:9pt; }
.table th:last-child, .table td:last-child { text-align:right; }
.table td { padding:8px 10px; border-bottom:1px solid #eee; font-size:10pt; }
.table tr:nth-child(even) td { background:#f8f8f8; }
.summen { margin-left:auto; width:260px; }
.summen-row { display:flex; justify-content:space-between;
  padding:5px 0; font-size:10pt; }
.summen-row.gesamt { border-top:2px solid #1a1a1a; margin-top:4px;
  padding-top:8px; font-weight:900; font-size:12pt; }
.summen-row.gesamt span:last-child { color:#F5C400; }
.footer-text { background:#f8f8f8; border-radius:6px; padding:10px 14px;
  font-size:9pt; color:#666; margin-top:16px; line-height:1.6; }
.sig-section { margin-top:18px; page-break-inside:avoid; }
.sig-title { font-size:10pt; font-weight:bold; color:#F5C400; text-transform:uppercase;
  letter-spacing:0.5px; border-left:3px solid #F5C400; padding-left:8px; margin-bottom:10px; }
.sig-banner { border-radius:10px; padding:12px 16px; }
.sig-banner.ok { background:#DCFCE7; color:#15803D; }
.sig-banner.nok { background:#FEE2E2; color:#B91C1C; }
.sig-banner .big { font-size:12pt; font-weight:900; }
.sig-banner .sub { font-size:9.5pt; margin-top:3px; }
.sig-img { max-width:240px; max-height:70px; margin-top:10px; display:block; }
.hash-badge { font-family:monospace; font-size:9pt; background:rgba(0,0,0,0.06); border-radius:6px;
  padding:5px 9px; display:inline-block; margin-top:8px; word-break:break-all; max-width:100%; }
.meta-row { font-size:8.5pt; margin-top:5px; opacity:0.8; word-break:break-all; }
.sig-grid { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
.sig-box { border:1.5px solid #ccc; border-radius:6px; height:60px; margin-top:4px; }
.sig-sub { font-size:9pt; color:#666; }
.footer { border-top:1px solid #ddd; margin-top:14px; padding-top:6px;
  font-size:7pt; color:#aaa; display:flex; justify-content:space-between; }
</style></head><body><div class="page">

<div class="header">
  <div style="display:flex;gap:14px;align-items:center;">
    ${eigeneFirma?.logo
      ? `<img class="logo-img" src="${eigeneFirma.logo}" alt="Logo"/>`
      : `<div class="logo-mark">★</div>`}
    <div>
      <div class="firma-name">${escapeHtml(eigeneFirma?.name)||"Polaris"}</div>
      <div class="firma-info">
        ${firmaAdresszeile ? `${escapeHtml(firmaAdresszeile)}<br>` : ""}
        ${firmaKontaktzeile ? `Tel: ${escapeHtml(firmaKontaktzeile)}<br>` : ""}
        ${eigeneFirma?.steuernummer ? "St-Nr: "+escapeHtml(eigeneFirma.steuernummer) : ""}
      </div>
    </div>
  </div>
  <div class="angebot-title">
    <h1>Angebot</h1>
    ${a.titel ? `<div class="titel">${escapeHtml(a.titel)}</div>` : ""}
    <div class="meta">Datum: ${new Date(a.datum).toLocaleDateString("de-DE")}</div>
    <div class="meta">Gültig bis: ${new Date(a.gueltig_bis).toLocaleDateString("de-DE")}</div>
    <div class="meta" style="font-weight:bold">Projekt: ${escapeHtml(projekt?.name)}</div>
    <div class="meta">${escapeHtml(projekt?.projektnummer)}</div>
  </div>
</div>

<!-- Angebotssumme sofort sichtbar — vorher stand der Gesamtbetrag nur
     klein unten nach der Positionstabelle, obwohl das für den Empfänger
     die mit Abstand wichtigste Zahl im ganzen Dokument ist. -->
<div class="betrag-banner">
  <div>
    <div class="betrag-label">Angebotssumme (brutto)</div>
    <div class="betrag-val">${bruttoGesamt.toLocaleString("de-DE",{minimumFractionDigits:2,maximumFractionDigits:2})} €</div>
  </div>
  <div class="betrag-meta">
    <div>${a.positionen.length} Position${a.positionen.length===1?"":"en"}</div>
    <div>Gültig bis ${new Date(a.gueltig_bis).toLocaleDateString("de-DE")}</div>
  </div>
</div>

<div class="empfaenger">
  <div class="empfaenger-label">ANGEBOT FÜR</div>
  <strong>${escapeHtml(a.empfaenger)||"—"}</strong>
</div>

<table class="table">
  <thead>
    <tr>
      <th style="width:5%">Pos.</th>
      <th style="width:38%">Bezeichnung</th>
      <th style="width:9%">Menge</th>
      <th style="width:9%">Einheit</th>
      <th style="width:13%">EP (€)</th>
      <th style="width:11%">Rabatt</th>
      <th style="width:15%">GP (€)</th>
    </tr>
  </thead>
  <tbody>
    ${a.positionen.map((p,i) => istTitel(p) ? `
    <tr><td colspan="6" style="background:#f3f3f3;font-weight:bold">${escapeHtml(titelName(p))}</td>
      <td style="background:#f3f3f3"><strong>${(tSummen[p.id]||0).toLocaleString("de-DE",{minimumFractionDigits:2,maximumFractionDigits:2})}</strong></td></tr>` : `
    <tr>
      <td>${a.positionen.slice(0, i + 1).filter(x => !istTitel(x)).length}</td>
      <td>${positionsart(p) !== "normal" ? `<em>[${ART_LABEL[positionsart(p)]}${inSumme(p) ? "" : ", nicht in Summe"}]</em> ` : ""}${escapeHtml(String(p.bez).replace(/^\[[^\]]+\]\s*/, ""))}${p.langtext ? `<div style="font-size:8.5pt;color:#555;margin-top:2px">${escapeHtml(p.langtext)}</div>` : ""}</td>
      <td>${(p.menge||0).toLocaleString("de-DE")}</td>
      <td>${escapeHtml(p.einheit)}</td>
      <td>${(p.ep||0).toLocaleString("de-DE",{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
      <td>${p.rabatt > 0 ? p.rabatt+"%" : "–"}</td>
      <td><strong>${gpOf(p).toLocaleString("de-DE",{minimumFractionDigits:2,maximumFractionDigits:2})}</strong></td>
    </tr>`).join("")}
  </tbody>
</table>

<div class="summen">
  <div class="summen-row"><span>Nettobetrag</span><span>${netto.toLocaleString("de-DE",{minimumFractionDigits:2,maximumFractionDigits:2})} €</span></div>
  ${a.rabatt > 0 ? `<div class="summen-row"><span>Rabatt ${a.rabatt}%</span><span>- ${rabattBetrag.toLocaleString("de-DE",{minimumFractionDigits:2,maximumFractionDigits:2})} €</span></div>` : ""}
  <div class="summen-row"><span>Netto nach Rabatt</span><span>${nettoNachRabatt.toLocaleString("de-DE",{minimumFractionDigits:2,maximumFractionDigits:2})} €</span></div>
  <div class="summen-row"><span>MwSt. ${a.mwst}%</span><span>${mwstBetrag.toLocaleString("de-DE",{minimumFractionDigits:2,maximumFractionDigits:2})} €</span></div>
  <div class="summen-row gesamt"><span>Gesamtbetrag</span><span>${bruttoGesamt.toLocaleString("de-DE",{minimumFractionDigits:2,maximumFractionDigits:2})} €</span></div>
</div>

<div class="footer-text">
  Dieses Angebot ist gültig bis ${new Date(a.gueltig_bis).toLocaleDateString("de-DE")}.
  Alle Preise verstehen sich zzgl. ${a.mwst}% MwSt.
  Zahlungsbedingungen: 14 Tage netto.
</div>

<div class="sig-section">
  <div class="sig-title">Annahme des Angebots</div>
  ${a.entschieden_am ? `
    <div class="sig-banner ${nachweis?.entscheidung !== "abgelehnt" ? "ok" : "nok"}">
      <div class="big">${nachweis?.entscheidung === "abgelehnt" ? "❌ Digital abgelehnt" : "✅ Digital angenommen"}</div>
      <div class="sub">${escapeHtml(a.entschieden_von)} · ${new Date(a.entschieden_am).toLocaleString("de-DE")}</div>
      ${nachweis?.ablehnungsgrund ? `<div class="meta-row" style="margin-top:8px;"><strong>Grund:</strong> ${escapeHtml(nachweis.ablehnungsgrund)}</div>` : ""}
      ${nachweis?.entschieden_signatur ? `<img class="sig-img" src="${nachweis.entschieden_signatur}" alt="Unterschrift"/>` : ""}
      ${nachweis?.entschieden_hash ? `<div class="hash-badge">DOC-${escapeHtml(nachweis.entschieden_hash)}</div>` : ""}
      ${nachweis?.entschieden_ip ? `<div class="meta-row">IP zum Zeitpunkt der Entscheidung: ${escapeHtml(nachweis.entschieden_ip)}</div>` : ""}
    </div>
  ` : `
    <div class="sig-grid">
      <div><div class="sig-sub">Ort, Datum</div><div class="sig-box"></div></div>
      <div><div class="sig-sub">Unterschrift Auftraggeber</div><div class="sig-box"></div></div>
    </div>
  `}
</div>

<div class="footer">
  <span>Erstellt mit Polaris · ${new Date().toLocaleString("de-DE")}</span>
  <span>${escapeHtml(eigeneFirma?.name)}</span>
</div>

</div></body></html>`;

    druckePDF(html, `Angebot_${a.titel || a.id}.pdf`);
  }

  function exportCSV() {
    const rows = [
      ["Pos.","Bezeichnung","Menge","Einheit","EP (€)","Rabatt (%)","GP (€)"],
      ...a.positionen.map((p,i) => [
        i+1, p.bez, p.menge||0, p.einheit,
        (p.ep||0).toFixed(2), p.rabatt||0, gpOf(p).toFixed(2)
      ]),
      ["","","","","","Netto:", netto.toFixed(2)],
      ["","","","","","MwSt "+a.mwst+"%:", mwstBetrag.toFixed(2)],
      ["","","","","","GESAMT:", bruttoGesamt.toFixed(2)],
    ];
    const csv = rows.map(r => r.map(v => '"'+v+'"').join(";")).join("\n");
    const blob = new Blob(["﻿"+csv], { type:"text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = ("Angebot_"+a.titel.replace(/ /g,"_")+".csv");
    link.click(); URL.revokeObjectURL(url);
  }

  async function exportWord() {
    if (wordLaedt) return;
    setWordLaedt(true);
    try {
      const neuerBlob = await erzeugeAngebotDocx({ angebot: a, projekt, eigeneFirma, angebotVorlage });
      setWordBlob(neuerBlob);
    } finally {
      setWordLaedt(false);
    }
  }

  if (preisspiegelOffen) {
    return <NuPreisspiegel positionen={a.positionen}
      zuschlagFremdleistung={standardZuschlaege?.zuschlagFremdleistung || 0}
      onUebernehmen={neu => { setA(x => ({ ...x, positionen: neu })); setPreisspiegelOffen(false); }}
      onClose={() => setPreisspiegelOffen(false)} />;
  }

  // ── KI-Angebot (Agent mit Stammdatenzugriff, lib/kiAngebotAgent.js) ──
  if (vonKI) {
    return <KiAngebotAssistent projekt={projekt} eigeneFirma={eigeneFirma}
      stammpositionen={stammpositionen} einheitspreise={einheitspreise} lvVorlagen={lvVorlagen}
      kalkulationspreise={kalkulationspreise} standardZuschlaege={standardZuschlaege} nachtragZu={nachtragZu} session={session}
      onUebernehmen={kiErgebnisUebernehmen} onClose={() => setVonKI(false)} />;
  }

  // ── LV-Vorlage Auswahl als eigener Screen ──
  // Als Portal gerendert — verschachtelt im normalen Baum bricht die
  // iOS-Standalone-PWA sonst denselben nested-position:fixed-Bug wie
  // beim Aufgabenformular.
  if (vonVorlage) {
    return createPortal(
      <div style={{ position:"fixed", top:0, left:0, right:0, bottom:0,
        background:"var(--bg)", zIndex:700, overflowY:"auto",
        WebkitOverflowScrolling:"touch" }}>
        <div style={{ background:"var(--surface)", padding:"10px 18px",
          paddingTop:"calc(14px + env(safe-area-inset-top))",
          borderBottom:"3px solid var(--yellow)", position:"sticky", top:0,
          display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div style={{ color:"var(--yellow)", fontWeight:700, fontSize:16,
            display:"flex", alignItems:"center", gap:8 }}>
            <ClipboardList size={15} /> LV-Vorlage laden
          </div>
          <button onClick={() => setVonVorlage(false)}
            style={{ background:"var(--surface2)", border:"1px solid var(--border)",
              color:"var(--text)", borderRadius:8, padding:"6px 14px",
              cursor:"pointer", fontFamily:"inherit", display:"flex" }}><X size={15} /></button>
        </div>
        <div style={{ padding:"14px 16px" }}>
          {lvVorlagen.length === 0 && (
            <div style={{ color:"var(--muted)", textAlign:"center", padding:17 }}>
              Keine Vorlagen vorhanden · Administrator anlegen lassen
            </div>
          )}
          {lvVorlagen.map(v => (
            <div key={v.id} onClick={() => vorlageLaden(v)}
              style={{ background:"var(--surface)", borderRadius:12,
                padding:"9px 14px", marginBottom:6, cursor:"pointer",
                border:"1.5px solid var(--border)" }}>
              <div style={{ color:"var(--text)", fontWeight:700 }}>{v.name}</div>
              <div style={{ color:"var(--muted)", fontSize:12, marginTop:3 }}>
                {v.positionen.length} Positionen · {v.gewerk}
              </div>
            </div>
          ))}
        </div>
      </div>,
      document.body
    );
  }

  // ── Aufgaben-Import als eigener Screen ──
  if (vonAufgabe) {
    return createPortal(
      <div style={{ position:"fixed", top:0, left:0, right:0, bottom:0,
        background:"var(--bg)", zIndex:700, overflowY:"auto",
        WebkitOverflowScrolling:"touch" }}>
        <div style={{ background:"var(--surface)", padding:"10px 18px",
          paddingTop:"calc(14px + env(safe-area-inset-top))",
          borderBottom:"3px solid var(--green)", position:"sticky", top:0,
          display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div style={{ color:"var(--green)", fontWeight:700, fontSize:16,
            display:"flex", alignItems:"center", gap:8 }}>
            <CircleCheckBig size={15} /> Aus Aufgaben importieren
          </div>
          <button onClick={() => setVonAufgabe(false)}
            style={{ background:"var(--surface2)", border:"1px solid var(--border)",
              color:"var(--text)", borderRadius:8, padding:"6px 14px",
              cursor:"pointer", fontFamily:"inherit", display:"flex" }}><X size={15} /></button>
        </div>
        <div style={{ padding:"14px 16px" }}>
          {aufgaben.length === 0 && (
            <div style={{ color:"var(--muted)", textAlign:"center", padding:17 }}>
              Keine Aufgaben vorhanden
            </div>
          )}
          {aufgaben.map(aufg => (
            <div key={aufg.id} onClick={() => aufgabeImportieren(aufg)}
              style={{ background:"var(--surface)", borderRadius:12,
                padding:"9px 14px", marginBottom:6, cursor:"pointer",
                border:"1.5px solid var(--border)",
                borderLeftWidth:4,
                borderLeftColor:AUFGABEN_TYPEN[aufg.typ]?.farbe||"var(--muted)" }}>
              <div style={{ color:"var(--text)", fontWeight:700 }}>
                {AUFGABEN_TYPEN[aufg.typ]?.icon} {aufg.titel}
              </div>
              <div style={{ color:"var(--muted)", fontSize:12, marginTop:3 }}>
                {aufg.m2 ? aufg.m2+" m²" : ""} · {AUFGABEN_TYPEN[aufg.typ]?.label}
              </div>
            </div>
          ))}
        </div>
      </div>,
      document.body
    );
  }

  // ── Desktop: Kopf mit Titel, Empfänger, Menüs und Summen ──
  const desktopKopf = f => {
    const aufriss = kalkulationAufriss(a.positionen.filter(p => !istTitel(p) && inSumme(p)), kalkulationspreise);
    const leer = a.positionen.length === 0;
    const zahl = { fontFamily:"var(--font-zahl)", fontVariantNumeric:"tabular-nums" };
    const summe = (label, wert, gross) => (
      <div style={{ textAlign:"right" }}>
        <div style={{ fontSize:13, color:"var(--text2)" }}>{label}</div>
        <div style={{ ...zahl, fontSize: gross ? 24 : 16, lineHeight: gross ? "32px" : "24px", fontWeight:500, marginTop:4, whiteSpace:"nowrap" }}>{f(wert)} €</div>
      </div>
    );
    return (
      <div style={{ marginBottom:24 }}>
        <button onClick={schliessen} className="desk-nav"
          style={{ display:"inline-flex", alignItems:"center", gap:4, height:28, padding:"0 8px 0 4px", marginLeft:-4,
            background:"none", border:"none", color:"var(--text2)", cursor:"pointer", fontFamily:"inherit", fontSize:13 }}>
          <ChevronLeft size={16} strokeWidth={1.5} /> Alle Angebote
        </button>
        <div style={{ display:"flex", alignItems:"flex-start", gap:16, marginTop:8 }}>
          <div style={{ flex:1, minWidth:0 }}>
            <input className="desk-feld" value={a.titel || ""} disabled={gesperrt} aria-label="Titel des Angebots" placeholder="Titel des Angebots"
              onChange={e => setA(x => ({ ...x, titel: e.target.value }))}
              style={{ fontSize:24, lineHeight:"32px", fontWeight:500, width:"100%", marginLeft:-6 }} />
            <div style={{ display:"flex", alignItems:"center", gap:8, color:"var(--text2)", marginTop:4 }}>
              <span>An</span>
              <input className="desk-feld" value={a.empfaenger || ""} disabled={gesperrt} aria-label="Empfänger" placeholder="Empfänger eintragen"
                onChange={e => setA(x => ({ ...x, empfaenger: e.target.value }))} size={Math.max(18, (a.empfaenger || "").length + 2)} style={{ maxWidth:420 }} />
              {a.datum && <span style={{ ...zahl, fontSize:13 }}>{new Date(a.datum).toLocaleDateString("de-DE")}</span>}
              {nachtragZu && <span>· Nachtrag</span>}
              {gesperrt && <span>· angenommen und gesperrt</span>}
              {speicherStatus && <span style={{ fontSize:13, marginLeft:8 }}>{speicherStatus}</span>}
            </div>
          </div>
          <div style={{ display:"flex", gap:8, flexShrink:0 }}>
            {!gesperrt && (
              <Menue label="Neu aus …" icon={Plus} eintraege={[
                { gruppe: "Leistungsverzeichnis" },
                { label: "KI-Assistent", aktion: () => setVonKI(true) },
                { label: "LV-Vorlage", aktion: () => setVonVorlage(true) },
                { label: "Aufgaben der Baustelle", aktion: () => setVonAufgabe(true) },
                { gruppe: "GAEB-Datei" },
                { label: "GAEB 90 einlesen", hinweis: "D81–D86", aktion: () => gaebInputRef.current?.click() },
                { label: "GAEB XML einlesen", hinweis: "X83–X86", aktion: () => gaebXmlInputRef.current?.click() },
                { label: "Preise einspielen", hinweis: "D84, D86", aktion: () => gaebPreisInputRef.current?.click() },
                !leer && { gruppe: "Nachunternehmer" },
                !leer && { label: "NU-Preisspiegel", aktion: () => setPreisspiegelOffen(true) },
              ]} />
            )}
            <Menue label="Exportieren" icon={Download} eintraege={[
              { gruppe: "Angebot" },
              { label: "PDF", aktion: exportPDF },
              { label: "Word", hinweis: wordLaedt ? "lädt …" : ".docx", disabled: wordLaedt, aktion: exportWord },
              { label: "Tabelle", hinweis: ".csv", aktion: exportCSV },
              { gruppe: "GAEB" },
              { label: "LV ohne Preise", hinweis: "D83", disabled: leer, aktion: gaebExportieren },
              { label: "Angebot mit Preisen", hinweis: "D84", disabled: leer, aktion: gaebPreiseExportieren },
              { label: "Angebot mit Preisen", hinweis: "X84", disabled: leer, aktion: gaebX84Exportieren },
              { gruppe: "Kalkulation" },
              { label: "Formblätter EFB 221/223", disabled: leer, aktion: efbExportieren },
              { label: "Kalkulation", hinweis: ".xlsx", disabled: leer, aktion: kalkulationExportieren },
            ]} />
            <button onClick={speichernKlick} disabled={speichertLaedt || gesperrt}
              style={{ height:36, padding:"0 16px", background: gesperrt ? "var(--surface2)" : "var(--text)", color: gesperrt ? "var(--muted)" : "var(--surface)",
                border:"none", borderRadius:8, fontFamily:"inherit", fontSize:14, fontWeight:500,
                cursor: (speichertLaedt || gesperrt) ? "default" : "pointer", display:"flex", alignItems:"center", gap:8 }}>
              {speichertLaedt && <Spinner size={14} />}{gesperrt ? "Gesperrt" : speichertLaedt ? "Speichert" : "Speichern"}
            </button>
          </div>
        </div>
        <div style={{ marginTop:20, background:"var(--surface)", border:"1px solid var(--border)", borderRadius:12, padding:"16px 20px",
          display:"grid", gridTemplateColumns:"minmax(0,1fr) auto", gap:"12px 48px", alignItems:"end" }}>
          <div>
            <div style={{ fontSize:13, color:"var(--text2)", marginBottom:8 }}>Kalkulationsaufriss</div>
            {aufriss.summe > 0
              ? <Kalkulationsaufriss aufriss={aufriss} kompakt />
              : <div style={{ color:"var(--muted)" }}>Noch keine bepreisten Positionen</div>}
          </div>
          <div style={{ display:"flex", gap:32 }}>
            {summe(a.rabatt > 0 ? `Netto nach ${a.rabatt} % Rabatt` : "Netto", nettoNachRabatt)}
            {summe(`MwSt. ${a.mwst || 19} %`, mwstBetrag)}
            {summe("Brutto", bruttoGesamt, true)}
          </div>
        </div>
        {efbInfo?.warnungen.length > 0 && (
          <div style={{ marginTop:12, background:"var(--ybg)", color:"var(--ydark)", borderRadius:8, padding:"8px 12px", fontSize:13 }}>
            EFB erstellt, {efbInfo.warnungen.length} Hinweis(e): {efbInfo.warnungen.slice(0, 3).join(" ")}{efbInfo.warnungen.length > 3 && " …"}
          </div>
        )}
      </div>
    );
  };

  // ── Desktop: Seitenfeld mit den Reitern Position und Angebot ──
  const seitenfeldKopf = () => (
    <div role="tablist" style={{ display:"flex", gap:24, borderBottom:"1px solid var(--border)", margin:"0 -20px 16px", padding:"0 20px",
      position:"sticky", top:0, background:"var(--surface)", zIndex:2 }}>
      {[["position", "Position"], ["preise", "Preise"], ["angebot", "Angebot"]].map(([k, l]) => (
        <button key={k} role="tab" aria-selected={rechts === k} className="desk-reiter" onClick={() => setRechts(k)}
          style={{ height:44, padding:0, background:"none", border:"none", borderRadius:0, borderBottom:`2px solid ${rechts === k ? "var(--text)" : "transparent"}`,
            marginBottom:-1, color: rechts === k ? "var(--text)" : "var(--text2)", fontFamily:"inherit", fontSize:14,
            fontWeight: rechts === k ? 500 : 400, cursor:"pointer" }}>{l}</button>
      ))}
    </div>
  );

  const seitenfeldPosition = () => {
    const i = a.positionen.findIndex(p => p.id === auswahlId);
    const pos = a.positionen[i];
    if (!pos) return (
      <div style={{ color:"var(--text2)", padding:"8px 0", lineHeight:"20px" }}>
        Eine Zeile im Leistungsverzeichnis anklicken, um Langtext, Kalkulation und Preisaufriss zu bearbeiten
      </div>
    );
    if (istTitel(pos)) return positionsKarte(pos, i, true);
    const aufriss = kalkulationAufriss([pos], kalkulationspreise);
    return (
      <>
        {pos.kalk && aufriss.summe > 0 && (
          <div style={{ marginBottom:16 }}>
            <div style={{ fontSize:13, color:"var(--text2)", marginBottom:8 }}>Preisaufriss je {pos.einheit}</div>
            <Kalkulationsaufriss aufriss={aufriss} teiler={pos.menge || 1} einheit={pos.einheit} />
          </div>
        )}
        {!pos.kalk && (
          <div style={{ fontSize:13, color:"var(--text2)", marginBottom:12, lineHeight:"20px" }}>
            Einheitspreis direkt eingegeben. Mit „Kalkulieren“ wird er in Lohn, Material, Gerät und Zuschläge aufgeschlüsselt
          </div>
        )}
        {positionsKarte(pos, i, true)}
      </>
    );
  };

  const preisePanel = (
    <PreisstandPanel preisstand={a.preisstand} firmenpreise={firmenpreise} firmenMittellohn={kalkulationsgrundlagen?.mittellohn}
      eingefroren={preiseEingefroren} positionen={a.positionen} onAendern={preisstandAendern} onZuschlaegeAnwenden={zuschlaegeAnwenden}
      projekt={projekt} eigeneFirma={eigeneFirma} angebotTitel={a.titel} />
  );

  // Eine LV-Zeile als Karte: auf dem Handy die Liste, auf dem Desktop das
  // Seitenfeld der ausgewählten Tabellenzeile (imPanel).
  const positionsKarte = (pos, i, imPanel = false) => istTitel(pos) ? (
              <div key={pos.id} style={{ background:"var(--surface2)", borderRadius:10, padding:"8px 12px", marginBottom:6,
                border:"1.5px solid var(--border)", display:"flex", alignItems:"center", gap:8 }}>
                <input value={titelName(pos)} disabled={gesperrt}
                  onChange={e => updatePos(pos.id, "bez", `── ${e.target.value} ──`)}
                  style={{ ...inputStyle(), flex:1, fontWeight:800, fontSize:13, padding:"7px 9px" }} />
                <div style={{ color:"var(--text)", fontWeight:800, fontSize:13, whiteSpace:"nowrap" }}>
                  {(tSummen[pos.id] || 0).toLocaleString("de-DE", { minimumFractionDigits:2, maximumFractionDigits:2 })} €
                </div>
                {!gesperrt && (
                  <button onClick={() => removePos(pos.id)} style={{ background:"var(--rbg)", color:"var(--red)", border:"none",
                    borderRadius:6, padding:"4px 8px", cursor:"pointer", display:"flex" }}><X size={12} /></button>
                )}
              </div>
            ) : (
              <div key={pos.id} style={imPanel ? {} : { background:"var(--surface)", borderRadius:12,
                padding:"9px 14px", marginBottom:6,
                border:"1.5px solid var(--border)" }}>
                <div style={{ display:"flex", justifyContent:"space-between",
                  alignItems:"center", marginBottom:6 }}>
                  <div style={{ color:"var(--muted)", fontSize:11, fontWeight:700,
                    display:"flex", alignItems:"center", gap:6 }}>
                    {pruefung.jePosition[pos.id] && (
                      <span title={pruefung.jePosition[pos.id].text}
                        style={{ width:9, height:9, borderRadius:"50%", display:"inline-block",
                          background: AMPEL_FARBE[pruefung.jePosition[pos.id].ampel] }} />
                    )}
                    Pos. {pos.oz || a.positionen.slice(0, i + 1).filter(x => !istTitel(x)).length}
                    {pos.preisquelle && (
                      <span style={{ fontWeight:400 }}>· {QUELLEN_LABEL[pos.preisquelle.art] || pos.preisquelle.art}</span>
                    )}
                  </div>
                  {!gesperrt && (
                    <button onClick={() => removePos(pos.id)}
                      style={{ background:"var(--rbg)", color:"var(--red)",
                        border:"none", borderRadius:6, padding:"2px 8px",
                        cursor:"pointer", fontSize:11, fontFamily:"inherit", display:"flex" }}><X size={12} /></button>
                  )}
                </div>
                <input value={pos.bez} disabled={gesperrt}
                  onChange={e=>updatePos(pos.id,"bez",e.target.value)}
                  placeholder="Kurztext"
                  style={{ ...inputStyle(), marginBottom:6, fontSize:13 }} />
                <textarea value={pos.langtext || ""} disabled={gesperrt} rows={pos.langtext ? 3 : 1}
                  onChange={e=>updatePos(pos.id,"langtext",e.target.value)}
                  placeholder="Langtext (optional)"
                  style={{ ...inputStyle(), marginBottom:6, fontSize:12, resize:"vertical" }} />
                <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:8 }}>
                  <select value={positionsart(pos)} disabled={gesperrt}
                    onChange={e=>updatePos(pos.id,"art",e.target.value)}
                    style={{ ...inputStyle(), padding:"6px 8px", fontSize:12, width:"auto" }}>
                    {POSITIONSARTEN.map(([k,l]) => <option key={k} value={k}>{l}</option>)}
                  </select>
                  {!inSumme(pos) && <span style={{ color:"var(--muted)", fontSize:11 }}>nicht in der Angebotssumme</span>}
                </div>
                {/* Im Desktop-Seitenfeld stehen Menge, Einheit und EP schon in der Tabellenzeile */}
                {!imPanel && <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:6 }}>
                  <div>
                    <div style={{ color:"var(--muted)", fontSize:10,
                      marginBottom:3 }}>Menge</div>
                    <input type="number" value={pos.menge||""} disabled={gesperrt}
                      onChange={e=>updatePos(pos.id,"menge",e.target.value)}
                      style={{ ...inputStyle(), padding:"8px 10px", fontSize:12 }} />
                  </div>
                  <div>
                    <div style={{ color:"var(--muted)", fontSize:10, marginBottom:3 }}>Einheit</div>
                    <select value={pos.einheit} disabled={gesperrt}
                      onChange={e=>updatePos(pos.id,"einheit",e.target.value)}
                      style={{ ...inputStyle(), padding:"8px 10px", fontSize:12 }}>
                      {["m²","m³","m","t","h","Stk","pau"].map(u=><option key={u}>{u}</option>)}
                    </select>
                  </div>
                  <div>
                    <div style={{ color:"var(--muted)", fontSize:10, marginBottom:3 }}>
                      EP (€/{pos.einheit}){pos.kalk && " · kalkuliert"}
                    </div>
                    <input type="number" value={pos.ep||""} disabled={gesperrt || !!pos.kalk}
                      onChange={e=>updatePos(pos.id,"ep",e.target.value)}
                      style={{ ...inputStyle(), padding:"8px 10px", fontSize:12 }} />
                  </div>
                </div>}
                <div style={{ display:"flex", gap:10, alignItems:"flex-end", marginTop:6 }}>
                  <div style={{ width:"33%", minWidth:90 }}>
                    <div style={{ color:"var(--muted)", fontSize:10, marginBottom:3 }}>Rabatt (%)</div>
                    <input type="number" value={pos.rabatt||""} disabled={gesperrt}
                      onChange={e=>updatePos(pos.id,"rabatt",e.target.value)}
                      placeholder="0" min="0" max="100"
                      style={{ ...inputStyle(), padding:"8px 10px", fontSize:12 }} />
                  </div>
                  {!gesperrt && (
                    <button onClick={() => kalkUmschalten(pos.id)}
                      style={imPanel ? { background:"var(--surface)", color:"var(--text)", border:"1px solid var(--border2)", borderRadius:8, height:36, padding:"0 12px", cursor:"pointer", fontSize:14, fontFamily:"inherit", whiteSpace:"nowrap" } : { background: pos.kalk ? "var(--ybg)" : "var(--surface2)",
                        color: pos.kalk ? "var(--ydark)" : "var(--muted)",
                        border:`1px solid ${pos.kalk ? "var(--yellow)" : "var(--border)"}`,
                        borderRadius:8, padding:"8px 10px", cursor:"pointer",
                        fontSize:11.5, fontWeight:700, fontFamily:"inherit" }}>
                      {pos.kalk ? "Kalkulation aus" : "Kalkulieren"}
                    </button>
                  )}
                </div>
                {pos.stammpositionId && (stammpositionen.find(s => s.id === pos.stammpositionId)?.variablen || []).length > 0 && (
                  <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginTop:6 }}>
                    {stammpositionen.find(s => s.id === pos.stammpositionId).variablen.map(v => (
                      <div key={v.name} style={{ minWidth:110 }}>
                        <div style={{ color:"var(--muted)", fontSize:10, marginBottom:3 }}>{v.bez || v.name}</div>
                        <input type="number" step="0.01" disabled={gesperrt}
                          value={pos.variablen?.[v.name] ?? v.standard ?? ""}
                          onChange={e => setA(x => ({ ...x, positionen: x.positionen.map(p => p.id === pos.id
                            ? positionVariableAendern(p, v.name, e.target.value, stammpositionen, kalkulationspreise) : p) }))}
                          style={{ ...inputStyle(), padding:"7px 9px", fontSize:12 }} />
                      </div>
                    ))}
                  </div>
                )}
                {pos.kalk && (
                  <PositionKalkulation kalk={pos.kalk} stammdaten={kalkulationspreise}
                    menge={pos.menge} gesperrt={gesperrt}
                    onChange={neueKalk => kalkAendern(pos.id, neueKalk)} />
                )}
                <div style={{ textAlign:"right", marginTop:6,
                  color: inSumme(pos) ? "var(--yellow)" : "var(--muted)", fontWeight:800, fontSize:14 }}>
                  {pos.rabatt > 0 && (
                    <span style={{ color:"var(--muted)", fontWeight:600, fontSize:12, marginRight:7,
                      textDecoration:"line-through" }}>
                      {((pos.menge||0)*(pos.ep||0)).toLocaleString("de-DE",{minimumFractionDigits:2,maximumFractionDigits:2})} €
                    </span>
                  )}
                  {gpOf(pos).toLocaleString("de-DE", {minimumFractionDigits:2,maximumFractionDigits:2})} €
                </div>
                {(pruefung.jePosition[pos.id]?.ampel === "rot" || pruefung.jePosition[pos.id]?.ampel === "gelb" || pos.ki?.herleitung || pos.ki?.hinweis) && (
                  <div style={{ marginTop:5, fontSize:11.5, lineHeight:1.45 }}>
                    {(pruefung.jePosition[pos.id]?.ampel === "rot" || pruefung.jePosition[pos.id]?.ampel === "gelb") && (
                      <div style={{ color: AMPEL_FARBE[pruefung.jePosition[pos.id].ampel] === "var(--yellow)" ? "var(--ydark)" : AMPEL_FARBE[pruefung.jePosition[pos.id].ampel] }}>
                        {pruefung.jePosition[pos.id].text}
                      </div>
                    )}
                    {pos.ki?.herleitung && <div style={{ color:"var(--muted)" }}>Menge (KI): {pos.ki.herleitung}</div>}
                    {pos.ki?.hinweis && <div style={{ color:"var(--ydark)" }}>{pos.ki.hinweis}</div>}
                  </div>
                )}
              </div>
            );

  return (
    <div>
      {/* Header (Handy) — auf dem Desktop steht der Kopf im Inhalt */}
      {!istDesktop && (
      <div style={{ background:"var(--surface)", padding:"10px 16px",
        paddingTop:"calc(14px + env(safe-area-inset-top))",
        borderBottom:"1px solid var(--border)", position:"sticky", top:0,
        zIndex:10, display:"flex", justifyContent:"space-between",
        alignItems:"center" }}>
        <button onClick={schliessen}
          style={{ background:"var(--surface2)", border:"1.5px solid var(--border)",
            color:"var(--text)", borderRadius:10, padding:"7px 14px",
            cursor:"pointer", fontFamily:"inherit", display:"flex" }}><ChevronLeft size={16} /></button>
        <div style={{ color:"var(--text)", fontWeight:700, fontSize:14,
          flex:1, textAlign:"center", margin:"0 10px" }}>{a.titel}</div>
        <div style={{ display:"flex", gap:6 }}>
          <button onClick={exportCSV}
            style={{ background:"var(--surface2)", color:"var(--text)",
              border:"1.5px solid var(--border)", borderRadius:8,
              padding:"6px 10px", cursor:"pointer", fontSize:12,
              fontFamily:"inherit", display:"flex", alignItems:"center", gap:5 }}><ChartColumn size={12} /> CSV</button>
          <button onClick={exportWord} disabled={wordLaedt}
            style={{ background:"var(--surface2)", color:"var(--text)",
              border:"1.5px solid var(--border)", borderRadius:8,
              padding:"6px 10px", cursor: wordLaedt ? "default" : "pointer", fontSize:12,
              fontFamily:"inherit", display:"flex", alignItems:"center", gap:5 }}>
            {wordLaedt ? <Spinner size={12} /> : <FileText size={12} />} Word
          </button>
          <button onClick={exportPDF}
            style={{ background:"var(--yellow)", color:"#1a1200", border:"none",
              borderRadius:8, padding:"6px 12px", fontWeight:700,
              cursor:"pointer", fontSize:12, fontFamily:"inherit",
              display:"flex", alignItems:"center", gap:5 }}><FileText size={12} /> PDF</button>
        </div>
      </div>
      )}

      <div style={istDesktop ? { padding:"0 0 48px" } : { padding:"16px 14px 100px" }}>
        {lokalerEntwurf && !gesperrt && (
          <div role="status" style={{ display:"flex", alignItems:"center", gap:12, flexWrap:"wrap", background:"var(--surface)", border:"1px solid var(--akzent)",
            borderRadius:12, padding:"12px 16px", marginBottom:16 }}>
            <span style={{ flex:1, minWidth:220 }}>
              Ungespeicherter Stand vom {new Date(lokalerEntwurf.zeit).toLocaleString("de-DE", { dateStyle:"short", timeStyle:"short" })} gefunden, zum Beispiel nach einem Absturz oder geschlossenen Tab
            </span>
            <button onClick={() => { setARoh(lokalerEntwurf.a); setLokalerEntwurf(null); }}
              style={{ height:32, padding:"0 12px", borderRadius:8, border:"none", background:"var(--text)", color:"var(--surface)", fontFamily:"inherit", fontSize:14, cursor:"pointer" }}>Wiederherstellen</button>
            <button onClick={() => { entwurfLoeschen(); setLokalerEntwurf(null); }}
              style={{ height:32, padding:"0 12px", borderRadius:8, border:"1px solid var(--border2)", background:"var(--surface)", color:"var(--text)", fontFamily:"inherit", fontSize:14, cursor:"pointer" }}>Verwerfen</button>
          </div>
        )}
        {/* Summen-Banner */}
        {(() => {
          const f = n => n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
          // Desktop: ruhige Summenzeile im Werkplan-Stil; Handy: dunkles Banner wie bisher
          const d = istDesktop;
          if (d) return desktopKopf(f);
          return (
            <div style={d ? { background:"var(--surface)", border:"1px solid var(--border)", borderRadius:12, padding:"16px 20px",
                marginBottom:16, display:"flex", justifyContent:"space-between", alignItems:"flex-end", gap:24 }
              : { background:"#1a1a1a", borderRadius:14, padding:"10px 18px", marginBottom:12, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div>
                <div style={{ color: d ? "var(--text2)" : "#888", fontSize: d ? 13 : 11 }}>Angebotssumme (brutto)</div>
                <div style={d ? { color:"var(--text)", fontFamily:"var(--font-zahl)", fontWeight:500, fontSize:28, lineHeight:"36px", marginTop:4, fontVariantNumeric:"tabular-nums" }
                  : { color:"#F5C400", fontWeight:900, fontSize:26, marginTop:2 }}>{f(bruttoGesamt)} €</div>
              </div>
              <div style={{ textAlign:"right" }}>
                <div style={{ color: d ? "var(--text2)" : "#888", fontSize: d ? 13 : 11 }}>Netto</div>
                <div style={{ color: d ? "var(--text)" : "#fff", fontWeight: d ? 500 : 700, fontSize: d ? 16 : 14, fontFamily: d ? "var(--font-zahl)" : undefined }}>{f(netto)} €</div>
                <div style={{ color: d ? "var(--text2)" : "#888", fontSize: d ? 13 : 11, marginTop:2 }}>MwSt. {f(mwstBetrag)} €</div>
              </div>
            </div>
          );
        })()}

        {gesperrt && (
          <div style={{ background:"var(--gbg)", border:"1.5px solid var(--green)", borderRadius:10,
            padding:"9px 14px", marginBottom:10, color:"var(--green)", fontSize:12.5, fontWeight:600,
            display:"flex", alignItems:"center", gap:7 }}>
            {layoutText("🔒 Digital angenommen und gesperrt — keine Änderungen mehr möglich.")}
          </div>
        )}

        {/* Tab-Toggle — auf dem Desktop stehen Positionen und Einstellungen nebeneinander */}
        <div style={{ display: istDesktop ? "none" : "flex", gap:6, marginBottom:10 }}>
          {[["positionen",ClipboardList,"Positionen"],["einstellungen",Settings,"Einstellungen"]].map(([k,Icon,l]) => (
            <button key={k} onClick={() => setAnsicht(k)}
              style={{ flex:1, background: ansicht===k ? "var(--yellow)" : "var(--surface2)",
                color: ansicht===k ? "#1a1200" : "var(--muted)",
                border:`1.5px solid ${ansicht===k ? "var(--yellow)" : "var(--border)"}`,
                borderRadius:10, padding:9, fontWeight: ansicht===k ? 700 : 400,
                cursor:"pointer", fontSize:12, fontFamily:"inherit",
                display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}><Icon size={13} /> {l}</button>
          ))}
        </div>

        <div style={istDesktop ? { display:"flex", gap:24, alignItems:"flex-start" } : undefined}>
        {/* POSITIONEN */}
        {(istDesktop || ansicht === "positionen") && (
          <div style={istDesktop ? { flex:"2 1 0", minWidth:0 } : undefined}>
            {/* Import-Buttons */}
            {!gesperrt && !istDesktop && <div className="angebot-werkzeuge" style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:9 }}>
              <button onClick={() => setVonKI(true)}
                style={{ background:"var(--ybg)", color:"var(--ydark)",
                  border:"1.5px solid var(--yellow)", borderRadius:10, padding:"9px 0",
                  cursor:"pointer", fontSize:12, fontWeight:700,
                  fontFamily:"inherit",
                  display:"flex", alignItems:"center", justifyContent:"center", gap:5 }}><Sparkles size={12} /> Per KI</button>
              <button onClick={() => setVonVorlage(true)}
                style={{ background:"var(--bbg)", color:"var(--blue)",
                  border:"1.5px solid var(--blue)", borderRadius:10, padding:"9px 0",
                  cursor:"pointer", fontSize:12, fontWeight:700,
                  fontFamily:"inherit",
                  display:"flex", alignItems:"center", justifyContent:"center", gap:5 }}><ClipboardList size={12} /> Aus Vorlage</button>
              <button onClick={() => setVonAufgabe(true)}
                style={{ background:"var(--gbg)", color:"var(--green)",
                  border:"1.5px solid var(--green)", borderRadius:10, padding:"9px 0",
                  cursor:"pointer", fontSize:12, fontWeight:700,
                  fontFamily:"inherit",
                  display:"flex", alignItems:"center", justifyContent:"center", gap:5 }}><CircleCheckBig size={12} /> Aus Aufgaben</button>
              <button onClick={() => addPosition({ bez:"", einheit:"m²", menge:0, ep:0 })}
                style={{ background:"var(--surface2)", color:"var(--text)",
                  border:"1.5px solid var(--border)", borderRadius:10, padding:"9px 0",
                  cursor:"pointer", fontSize:12, fontFamily:"inherit",
                  display:"flex", alignItems:"center", justifyContent:"center", gap:5 }}><Plus size={12} /> Manuell</button>
              <button onClick={() => gaebInputRef.current?.click()}
                style={{ gridColumn:"1 / -1", background:"var(--surface2)", color:"var(--text)",
                  border:"1.5px solid var(--border)", borderRadius:10, padding:"9px 0",
                  cursor:"pointer", fontSize:12, fontWeight:700, fontFamily:"inherit",
                  display:"flex", alignItems:"center", justifyContent:"center", gap:5 }}>
                <Upload size={12} /> GAEB-LV importieren (D81/D83/D85/D86)
              </button>
              <button onClick={() => gaebXmlInputRef.current?.click()}
                style={{ gridColumn:"1 / -1", background:"var(--surface2)", color:"var(--text)",
                  border:"1.5px solid var(--border)", borderRadius:10, padding:"9px 0",
                  cursor:"pointer", fontSize:12, fontWeight:700, fontFamily:"inherit",
                  display:"flex", alignItems:"center", justifyContent:"center", gap:5 }}>
                <Upload size={12} /> GAEB-XML importieren (X83/X84/X86)
              </button>
              <button onClick={() => gaebPreisInputRef.current?.click()}
                style={{ gridColumn:"1 / -1", background:"var(--surface2)", color:"var(--text)",
                  border:"1.5px solid var(--border)", borderRadius:10, padding:"9px 0",
                  cursor:"pointer", fontSize:12, fontWeight:700, fontFamily:"inherit",
                  display:"flex", alignItems:"center", justifyContent:"center", gap:5 }}>
                <Upload size={12} /> GAEB-Preise einspielen (D84/D86)
              </button>
              {a.positionen.length > 0 && (
                <button onClick={gaebExportieren}
                  style={{ gridColumn:"1 / -1", background:"var(--surface2)", color:"var(--text)",
                    border:"1.5px solid var(--border)", borderRadius:10, padding:"9px 0",
                    cursor:"pointer", fontSize:12, fontWeight:700, fontFamily:"inherit",
                    display:"flex", alignItems:"center", justifyContent:"center", gap:5 }}>
                  <ChartColumn size={12} /> GAEB-LV exportieren (unbepreist)
                </button>
              )}
              {a.positionen.length > 0 && (
                <button onClick={gaebPreiseExportieren}
                  style={{ gridColumn:"1 / -1", background:"var(--surface2)", color:"var(--text)",
                    border:"1.5px solid var(--border)", borderRadius:10, padding:"9px 0",
                    cursor:"pointer", fontSize:12, fontWeight:700, fontFamily:"inherit",
                    display:"flex", alignItems:"center", justifyContent:"center", gap:5 }}>
                  <ChartColumn size={12} /> GAEB-Angebot exportieren (D84, bepreist)
                </button>
              )}
              {a.positionen.length > 0 && !gesperrt && (
                <button onClick={() => setPreisspiegelOffen(true)}
                  style={{ gridColumn:"1 / -1", background:"var(--surface2)", color:"var(--text)",
                    border:"1.5px solid var(--border)", borderRadius:10, padding:"9px 0",
                    cursor:"pointer", fontSize:12, fontWeight:700, fontFamily:"inherit",
                    display:"flex", alignItems:"center", justifyContent:"center", gap:5 }}>
                  <ChartColumn size={12} /> NU-Preisspiegel
                </button>
              )}
              {a.positionen.length > 0 && (
                <button onClick={gaebX84Exportieren}
                  style={{ background:"var(--surface2)", color:"var(--text)",
                    border:"1.5px solid var(--border)", borderRadius:10, padding:"9px 0",
                    cursor:"pointer", fontSize:12, fontWeight:700, fontFamily:"inherit",
                    display:"flex", alignItems:"center", justifyContent:"center", gap:5 }}>
                  <ChartColumn size={12} /> GAEB X84
                </button>
              )}
              {a.positionen.length > 0 && (
                <button onClick={efbExportieren}
                  style={{ background:"var(--surface2)", color:"var(--text)",
                    border:"1.5px solid var(--border)", borderRadius:10, padding:"9px 0",
                    cursor:"pointer", fontSize:12, fontWeight:700, fontFamily:"inherit",
                    display:"flex", alignItems:"center", justifyContent:"center", gap:5 }}>
                  <FileText size={12} /> EFB 221/223
                </button>
              )}
              {efbInfo?.warnungen.length > 0 && (
                <div style={{ gridColumn:"1 / -1", background:"var(--ybg)", color:"var(--ydark)", borderRadius:10,
                  padding:"8px 12px", fontSize:12, lineHeight:1.4 }}>
                  EFB erstellt — {efbInfo.warnungen.length} Hinweis(e): {efbInfo.warnungen.slice(0, 3).join(" ")}
                  {efbInfo.warnungen.length > 3 && " …"}
                </div>
              )}
              {a.positionen.length > 0 && (
                <button onClick={kalkulationExportieren}
                  style={{ gridColumn:"1 / -1", background:"var(--surface2)", color:"var(--text)",
                    border:"1.5px solid var(--border)", borderRadius:10, padding:"9px 0",
                    cursor:"pointer", fontSize:12, fontWeight:700, fontFamily:"inherit",
                    display:"flex", alignItems:"center", justifyContent:"center", gap:5 }}>
                  <ChartColumn size={12} /> Kalkulation als Excel exportieren
                </button>
              )}
            </div>}
            <input ref={gaebInputRef} type="file" onChange={gaebImportieren}
              accept=".d81,.d83,.d85,.d86,.D81,.D83,.D85,.D86,.p81,.p83,.p85,.p86"
              style={{ display:"none" }} />
            <input ref={gaebXmlInputRef} type="file" onChange={gaebXmlImportieren}
              accept=".x83,.X83,.x84,.X84,.x86,.X86"
              style={{ display:"none" }} />
            <input ref={gaebPreisInputRef} type="file" onChange={gaebPreiseImportieren}
              accept=".d84,.d86,.D84,.D86,.p84,.p86"
              style={{ display:"none" }} />
            {gaebPreisExportInfo && (
              <div style={{ background: gaebPreisExportInfo.warnungen > 0 ? "var(--ybg)" : "var(--gbg)",
                color: gaebPreisExportInfo.warnungen > 0 ? "var(--ydark)" : "var(--green)", borderRadius:10,
                padding:"8px 12px", marginBottom:9, fontSize:12 }}>
                ✓ {gaebPreisExportInfo.anzahl} Position(en) als bepreiste GAEB-Datei exportiert
                {gaebPreisExportInfo.warnungen > 0 && <> — {gaebPreisExportInfo.warnungen} ohne Ordnungszahl übersprungen</>}.
              </div>
            )}
            {gaebFehler && (
              <div style={{ background:"var(--rbg)", color:"var(--red)", borderRadius:10,
                padding:"8px 12px", marginBottom:9, fontSize:12 }}>{gaebFehler}</div>
            )}
            {gaebInfo && (
              <div style={{ background:"var(--gbg)", color:"var(--green)", borderRadius:10,
                padding:"8px 12px", marginBottom:9, fontSize:12 }}>
                ✓ {gaebInfo.anzahl} Positionen aus GAEB-Datei importiert — Preise und ggf. Gruppenkopfzeilen bitte prüfen.
                {gaebInfo.warnungen.length > 0 && (
                  <div style={{ marginTop:4, color:"var(--muted)" }}>
                    {gaebInfo.warnungen.length} Zeile(n) nicht erkannt, als Rohtext übernommen.
                  </div>
                )}
              </div>
            )}
            {gaebXmlFehler && (
              <div style={{ background:"var(--rbg)", color:"var(--red)", borderRadius:10,
                padding:"8px 12px", marginBottom:9, fontSize:12 }}>{gaebXmlFehler}</div>
            )}
            {gaebXmlInfo && (
              <div style={{ background:"var(--gbg)", color:"var(--green)", borderRadius:10,
                padding:"8px 12px", marginBottom:9, fontSize:12 }}>
                ✓ {gaebXmlInfo.anzahl} Positionen aus GAEB-XML-Datei importiert — Preise und ggf. Gruppenkopfzeilen bitte prüfen.
                {gaebXmlInfo.warnungen.length > 0 && (
                  <div style={{ marginTop:4, color:"var(--muted)" }}>
                    {gaebXmlInfo.warnungen.length} Position(en) ohne erkannten Text.
                  </div>
                )}
              </div>
            )}
            {gaebPreisFehler && (
              <div style={{ background:"var(--rbg)", color:"var(--red)", borderRadius:10,
                padding:"8px 12px", marginBottom:9, fontSize:12 }}>{gaebPreisFehler}</div>
            )}
            {gaebPreisInfo && (
              <div style={{ background:"var(--gbg)", color:"var(--green)", borderRadius:10,
                padding:"8px 12px", marginBottom:9, fontSize:12 }}>
                {gaebPreisInfo.treffer > 0
                  ? <>✓ {gaebPreisInfo.treffer} Einheitspreise eingespielt{gaebPreisInfo.fehlend > 0 && <> — {gaebPreisInfo.fehlend} Ordnungszahl(en) aus der Preisdatei ohne passende Position gefunden</>}.</>
                  : <>✓ {gaebPreisInfo.neu} Positionen als eigenständiger Preisimport angelegt (keine passende Ordnungszahl in der bestehenden Liste gefunden) — Bezeichnung bitte nachtragen.</>}
                {gaebPreisInfo.warnungen.length > 0 && (
                  <div style={{ marginTop:4, color:"var(--muted)" }}>
                    {gaebPreisInfo.warnungen.length} Zeile(n) nicht erkannt.
                  </div>
                )}
              </div>
            )}

            {kiInfo && (
              <div style={{ background:"var(--surface2)", border:"1px solid var(--border)", borderRadius:10,
                padding:"8px 12px", marginBottom:9, fontSize:12, color:"var(--text)" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <div style={{ fontWeight:700 }}>
                    ✓ {kiInfo.anzahl} Positionen von der KI übernommen
                    {kiInfo.ohnePreis > 0 && <span style={{ color:"var(--red)" }}> · {kiInfo.ohnePreis} ohne Preis</span>}
                  </div>
                  <button onClick={() => setKiInfo(null)} style={{ background:"none", border:"none",
                    color:"var(--muted)", cursor:"pointer", display:"flex" }}><X size={13} /></button>
                </div>
                {kiInfo.annahmen?.length > 0 && (
                  <div style={{ marginTop:5, color:"var(--muted)" }}>
                    Annahmen: {kiInfo.annahmen.join(" · ")}
                  </div>
                )}
              </div>
            )}
            {(pruefung.zaehler.rot > 0 || pruefung.zaehler.gelb > 0) && (
              <div style={{ background: pruefung.zaehler.rot > 0 ? "var(--rbg)" : "var(--ybg)",
                color: pruefung.zaehler.rot > 0 ? "var(--red)" : "var(--ydark)", borderRadius:10,
                padding:"8px 12px", marginBottom:9, fontSize:12, display:"flex", alignItems:"center", gap:6 }}>
                <TriangleAlert size={13} />
                Preisprüfung: {pruefung.zaehler.rot > 0 && <>{pruefung.zaehler.rot} rot</>}
                {pruefung.zaehler.rot > 0 && pruefung.zaehler.gelb > 0 && " · "}
                {pruefung.zaehler.gelb > 0 && <>{pruefung.zaehler.gelb} gelb</>} — Positionen vor dem Versand prüfen.
              </div>
            )}

            {istDesktop ? (
              <div style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:12, overflow:"clip" }}>
                {a.positionen.length > 0 ? (
                  <LvTabelle positionen={a.positionen} pruefung={pruefung} tSummen={tSummen} gpOf={gpOf}
                    auswahlId={auswahlId} onAuswahl={id => { setAuswahlId(id); setRechts("position"); }}
                    updatePos={updatePos} gesperrt={gesperrt} />
                ) : (
                  <div style={{ padding:"32px 20px", color:"var(--text2)" }}>
                    Noch keine Positionen. Über „Neu aus …“ ein LV aus GAEB, Vorlage, Aufgaben oder per KI anlegen, oder eine Position von Hand hinzufügen
                  </div>
                )}
                {!gesperrt && (
                  <div style={{ display:"flex", gap:8, padding:"12px 16px", borderTop:"1px solid var(--border)" }}>
                    {[["Position", { bez:"", einheit:"m²", menge:0, ep:0 }], ["Titel", { bez:"── Neuer Titel ──", einheit:"", menge:0, ep:0 }]].map(([l, neu]) => (
                      <button key={l} className="desk-nav" onClick={() => { setAuswahlId(addPosition(neu)); setRechts("position"); }}
                        style={{ display:"flex", alignItems:"center", gap:6, height:32, padding:"0 10px", background:"none", border:"none",
                          color:"var(--text2)", cursor:"pointer", fontFamily:"inherit", fontSize:14 }}>
                        <Plus size={16} strokeWidth={1.5} /> {l}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (<>
            {!gesperrt && (
              <div style={{ display:"flex", gap:6, marginBottom:8 }}>
                <button onClick={() => addPosition({ bez:"── Neuer Titel ──", einheit:"", menge:0, ep:0 })}
                  style={{ flex:1, background:"var(--surface2)", color:"var(--text)", border:"1.5px solid var(--border)", borderRadius:10,
                    padding:"8px 0", cursor:"pointer", fontSize:12, fontWeight:700, fontFamily:"inherit" }}>+ Titel</button>
                <button onClick={() => addPosition({ bez:"", einheit:"m²", menge:0, ep:0 })}
                  style={{ flex:1, background:"var(--surface2)", color:"var(--text)", border:"1.5px solid var(--border)", borderRadius:10,
                    padding:"8px 0", cursor:"pointer", fontSize:12, fontWeight:700, fontFamily:"inherit" }}>+ Position</button>
              </div>
            )}

            {/* Positionen */}
            {a.positionen.length === 0 && (
              <div style={{ textAlign:"center", padding:"23px 20px", color:"var(--muted)",
                fontSize:13 }}>
                Noch keine Positionen · Aus Vorlage oder Aufgaben importieren
              </div>
            )}
            {a.positionen.map((pos, i) => positionsKarte(pos, i))}
            </>)}
          </div>
        )}

        {/* EINSTELLUNGEN */}
        {(istDesktop || ansicht === "einstellungen") && (
          <div style={istDesktop ? { flex:"0 0 360px", position:"sticky", top:16, maxHeight:"calc(100vh - 32px)", overflowY:"auto", boxSizing:"border-box", background:"var(--surface)", border:"1px solid var(--border)", borderRadius:12, padding:"0 20px 20px" } : undefined}>
            {istDesktop && seitenfeldKopf()}
            {istDesktop && rechts === "position" && seitenfeldPosition()}
            {istDesktop && rechts === "preise" && preisePanel}
            <div style={istDesktop && rechts !== "angebot" ? { display:"none" } : undefined}>
            {!istDesktop && (
              <details style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:12, padding:"10px 12px", marginBottom:12 }}>
                <summary style={{ cursor:"pointer", fontWeight:600 }}>Preise dieses Angebots</summary>
                <div style={{ marginTop:8 }}>{preisePanel}</div>
              </details>
            )}
            {(istDesktop ? [] : [
              ["Titel","titel","Angebot Bodenplatte"],
              ["Empfänger","empfaenger","Auftraggeber GmbH"],
            ]).map(([l,k,ph]) => (
              <div key={k} style={{ marginBottom:9 }}>
                <Label>{l}</Label>
                <input value={a[k]||""} disabled={gesperrt}
                  onChange={e=>setA(x=>({...x,[k]:e.target.value}))}
                  placeholder={ph} style={inputStyle()} />
              </div>
            ))}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:9 }}>
              <div>
                <Label>Angebotsdatum</Label>
                <input type="date" value={a.datum} disabled={gesperrt}
                  onChange={e=>setA(x=>({...x,datum:e.target.value}))}
                  style={inputStyle()} />
              </div>
              <div>
                <Label>Gültig bis</Label>
                <input type="date" value={a.gueltig_bis} disabled={gesperrt}
                  onChange={e=>setA(x=>({...x,gueltig_bis:e.target.value}))}
                  style={inputStyle()} />
              </div>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:9 }}>
              <div>
                <Label>Rabatt (%)</Label>
                <input type="number" value={a.rabatt||0} disabled={gesperrt}
                  onChange={e=>setA(x=>({...x,rabatt:Number(e.target.value)}))}
                  style={inputStyle()} min="0" max="100" />
              </div>
              <div>
                <Label>MwSt (%)</Label>
                <select value={a.mwst||19} disabled={gesperrt}
                  onChange={e=>setA(x=>({...x,mwst:Number(e.target.value)}))}
                  style={{ ...inputStyle(), padding:"11px 12px" }}>
                  <option value={19}>19% (Standard)</option>
                  <option value={7}>7% (ermäßigt)</option>
                  <option value={0}>0% (steuerbefreit)</option>
                </select>
              </div>
            </div>
            <div style={{ marginBottom:9 }}>
              <Label>Status</Label>
              <select value={a.status} disabled={gesperrt || !versandErlaubt}
                onChange={e=>setA(x=>({...x,status:e.target.value}))}
                style={{ ...inputStyle(), padding:"11px 12px" }}>
                {[["entwurf","Entwurf"],["versendet","Versendet"],
                  ["angenommen","Angenommen"],["abgelehnt","Abgelehnt"]
                ].map(([k,l])=><option key={k} value={k}>{l}</option>)}
              </select>
              {a.entschieden_am && (
                <div style={{ color:"var(--muted)", fontSize:11.5, marginTop:6 }}>
                  Online {a.status === "angenommen" ? "angenommen" : "abgelehnt"} am{" "}
                  {new Date(a.entschieden_am).toLocaleDateString("de-DE")} von {a.entschieden_von}
                  {!gesperrt && " — bei einer Preisanpassung und erneutem Versand Status ggf. zurücksetzen."}
                </div>
              )}
            </div>

            <Co2Panel positionen={a.positionen} kalkulationspreise={kalkulationspreise} eigeneFaktoren={co2Faktoren} />

            {onTerminplanErzeugen && tpVorschau.length > 0 && (
              <div style={{ background:"var(--surface2)", border:"1px solid var(--border)", borderRadius:12, padding:"10px 12px", marginBottom:12 }}>
                <div style={{ color:"var(--muted)", fontSize:11, fontWeight:700, textTransform:"uppercase", marginBottom:6 }}>Terminplan aus Kalkulation</div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1.4fr", gap:6, marginBottom:8 }}>
                  <div><div style={{ color:"var(--muted)", fontSize:10, marginBottom:3 }}>Kolonne (Pers.)</div>
                    <input type="number" min="1" value={tp.kolonnenStaerke} onChange={e => setTp(x => ({ ...x, kolonnenStaerke: Number(e.target.value) || 1 }))} style={{ ...inputStyle(), padding:"7px 9px", fontSize:12 }} /></div>
                  <div><div style={{ color:"var(--muted)", fontSize:10, marginBottom:3 }}>Std./Tag</div>
                    <input type="number" min="1" value={tp.stundenProTag} onChange={e => setTp(x => ({ ...x, stundenProTag: Number(e.target.value) || 8 }))} style={{ ...inputStyle(), padding:"7px 9px", fontSize:12 }} /></div>
                  <div><div style={{ color:"var(--muted)", fontSize:10, marginBottom:3 }}>Beginn</div>
                    <input type="date" value={tp.start} onChange={e => setTp(x => ({ ...x, start: e.target.value }))} style={{ ...inputStyle(), padding:"7px 9px", fontSize:12 }} /></div>
                </div>
                {tpVorschau.map((v, i) => (
                  <div key={i} style={{ fontSize:12, color:"var(--text)", marginBottom:3 }}>
                    {v.titel}: {v.soll_stunden.toLocaleString("de-DE")} h → <b>{v.dauer_tage} AT</b>
                    <span style={{ color:"var(--muted)" }}> ({new Date(v.beginn).toLocaleDateString("de-DE")} – {new Date(v.faellig_am).toLocaleDateString("de-DE")})</span>
                  </div>
                ))}
                <button onClick={terminplanAnlegen} disabled={!!tpMeldung && !tpMeldung.startsWith("Fehler")}
                  style={{ width:"100%", marginTop:8, background:"var(--surface)", border:"1.5px solid var(--border)", color:"var(--text)",
                    borderRadius:10, padding:9, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>
                  {tpMeldung || "Als Vorgänge in den Bauablauf übernehmen"}
                </button>
              </div>
            )}

            {(a.nachtrag_zu || nachtragZu) && (
              <div style={{ background:"var(--surface2)", border:"1px solid var(--border)", borderRadius:12, padding:"10px 12px", marginBottom:12 }}>
                <div style={{ color:"var(--muted)", fontSize:11, fontWeight:700, textTransform:"uppercase", marginBottom:6 }}>
                  Nachtrag{nachtragZu ? ` zu „${nachtragZu.titel}“` : ""}
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6, marginBottom:6 }}>
                  <select value={nInfo.grund || ""} disabled={gesperrt} onChange={e => setNInfo({ grund: e.target.value })} style={{ ...inputStyle(), padding:"7px 9px", fontSize:12 }}>
                    <option value="">Grund wählen …</option>
                    {NACHTRAG_GRUENDE.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </select>
                  <select value={nInfo.status || "entwurf"} disabled={gesperrt} onChange={e => setNInfo({ status: e.target.value })} style={{ ...inputStyle(), padding:"7px 9px", fontSize:12 }}>
                    {NACHTRAG_STATUS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </select>
                </div>
                {nInfo.grund === "zusaetzlich" && !nInfo.angekuendigt_am && (
                  <div style={{ color:"var(--red)", fontSize:11.5, marginBottom:6, lineHeight:1.4 }}>
                    Zusätzliche Leistung: Mehrkosten VOR Ausführung schriftlich ankündigen (§ 2 Abs. 6 VOB/B), sonst droht der Verlust des Vergütungsanspruchs.
                  </div>
                )}
                <div style={{ color:"var(--muted)", fontSize:10, marginBottom:3 }}>Angekündigt am</div>
                <input type="date" value={nInfo.angekuendigt_am || ""} disabled={gesperrt} onChange={e => setNInfo({ angekuendigt_am: e.target.value })}
                  style={{ ...inputStyle(), padding:"7px 9px", fontSize:12, marginBottom:6 }} />
                <textarea value={nInfo.beschreibung || ""} disabled={gesperrt} rows={2} placeholder="Sachverhalt: Was ist anders als vereinbart, wer hat es angeordnet, seit wann?"
                  onChange={e => setNInfo({ beschreibung: e.target.value })} style={{ ...inputStyle(), fontSize:12, marginBottom:6, resize:"vertical" }} />
                <textarea value={nInfo.begruendung || ""} disabled={gesperrt} rows={5} placeholder="Begründung an den Auftraggeber"
                  onChange={e => setNInfo({ begruendung: e.target.value })} style={{ ...inputStyle(), fontSize:12, marginBottom:6, resize:"vertical" }} />
                {nachtragFehler && <div style={{ color:"var(--red)", fontSize:11.5, marginBottom:6 }}>{nachtragFehler}</div>}
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6 }}>
                  <button onClick={nachtragBegruendenKI} disabled={nachtragKi || gesperrt || !nInfo.grund}
                    style={{ background:"var(--surface)", border:"1.5px solid var(--border)", color:"var(--text)", borderRadius:10, padding:9,
                      fontWeight:700, fontSize:12, cursor:"pointer", fontFamily:"inherit" }}>{nachtragKi ? "KI schreibt …" : "Begründung per KI"}</button>
                  <button onClick={mehrkostenanzeigeDrucken} disabled={!nInfo.grund}
                    style={{ background:"var(--surface)", border:"1.5px solid var(--border)", color:"var(--text)", borderRadius:10, padding:9,
                      fontWeight:700, fontSize:12, cursor:"pointer", fontFamily:"inherit" }}>{nInfo.grund === "behinderung" ? "Behinderungsanzeige (PDF)" : "Mehrkostenanzeige (PDF)"}</button>
                </div>
              </div>
            )}

            {/* Kalkulationsverfahren: Zuschlagskalkulation (Standard, Sätze
                je Position) oder Endsumme (lib/endsumme.js, EFB 222). */}
            {!gesperrt && !preiseEingefroren && (() => {
              const es = a.endsumme;
              const erg = es ? endsummeBerechnen(a.positionen, es, kalkulationspreise) : null;
              const setEs = aend => setA(x => ({ ...x, endsumme: { ...(x.endsumme || LEERE_ENDSUMME), ...aend } }));
              const eur = n => (n || 0).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
              return (
                <div style={{ background:"var(--surface2)", border:"1px solid var(--border)", borderRadius:12, padding:"10px 12px", marginBottom:12 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <div style={{ color:"var(--muted)", fontSize:11, fontWeight:700, textTransform:"uppercase" }}>Kalkulation über die Endsumme</div>
                    <label style={{ fontSize:12, display:"flex", alignItems:"center", gap:5, cursor:"pointer" }}>
                      <input type="checkbox" checked={!!es} onChange={e => setA(x => ({ ...x, endsumme: e.target.checked ? { ...LEERE_ENDSUMME } : null }))} /> aktiv
                    </label>
                  </div>
                  {es && <>
                    <div style={{ color:"var(--muted)", fontSize:11.5, margin:"6px 0 8px", lineHeight:1.4 }}>
                      Baustellengemeinkosten dieses Projekts kalkulieren, AGK und Wagnis &amp; Gewinn festlegen — die Umlage wird auf die kalkulierten Positionen verteilt.
                    </div>
                    {(es.bgk || []).map((b, i) => (
                      <div key={i} style={{ display:"grid", gridTemplateColumns:"1fr 100px 24px", gap:5, marginBottom:5 }}>
                        <input value={b.bez} placeholder="z.B. Bauleitung, Container, Kran" onChange={e => setEs({ bgk: es.bgk.map((x, j) => j === i ? { ...x, bez: e.target.value } : x) })}
                          style={{ ...inputStyle(), padding:"7px 9px", fontSize:12 }} />
                        <input type="number" value={b.betrag || ""} placeholder="€" onChange={e => setEs({ bgk: es.bgk.map((x, j) => j === i ? { ...x, betrag: Number(e.target.value) } : x) })}
                          style={{ ...inputStyle(), padding:"7px 9px", fontSize:12 }} />
                        <button onClick={() => setEs({ bgk: es.bgk.filter((_, j) => j !== i) })}
                          style={{ background:"var(--rbg)", color:"var(--red)", border:"none", borderRadius:6, cursor:"pointer" }}><X size={12} /></button>
                      </div>
                    ))}
                    <button onClick={() => setEs({ bgk: [...(es.bgk || []), { bez: "", betrag: 0 }] })}
                      style={{ background:"var(--surface)", border:"1px solid var(--border)", color:"var(--text)", borderRadius:6, padding:"4px 10px",
                        cursor:"pointer", fontSize:11.5, fontFamily:"inherit", display:"flex", alignItems:"center", gap:3, marginBottom:8 }}>
                      <Plus size={11} /> BGK-Posten
                    </button>
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:6 }}>
                      <div><div style={{ color:"var(--muted)", fontSize:10, marginBottom:3 }}>AGK %</div>
                        <input type="number" value={es.agkProzent || ""} onChange={e => setEs({ agkProzent: Number(e.target.value) })} style={{ ...inputStyle(), padding:"7px 9px", fontSize:12 }} /></div>
                      <div><div style={{ color:"var(--muted)", fontSize:10, marginBottom:3 }}>W&amp;G %</div>
                        <input type="number" value={es.wgProzent || ""} onChange={e => setEs({ wgProzent: Number(e.target.value) })} style={{ ...inputStyle(), padding:"7px 9px", fontSize:12 }} /></div>
                      <div><div style={{ color:"var(--muted)", fontSize:10, marginBottom:3 }}>Umlage auf</div>
                        <select value={es.umlageAuf} onChange={e => setEs({ umlageAuf: e.target.value })} style={{ ...inputStyle(), padding:"7px 9px", fontSize:12 }}>
                          <option value="lohn">Lohn</option><option value="alle">alle Kosten</option>
                        </select></div>
                    </div>
                    {/* Schlussblatt: Zielsumme vorgeben → W&G-Satz rückrechnen (lib/endsumme.js) */}
                    {(() => {
                      const z = es.zielsumme ? wgFuerZielsumme(a.positionen, es, kalkulationspreise, es.zielsumme) : null;
                      return (
                        <div style={{ marginTop:8 }}>
                          <div style={{ color:"var(--muted)", fontSize:10, marginBottom:3 }}>Zielsumme netto (optional)</div>
                          <div style={{ display:"grid", gridTemplateColumns:"1fr auto", gap:6 }}>
                            <input type="number" value={es.zielsumme || ""} placeholder="z. B. 485000" onChange={e => setEs({ zielsumme: Number(e.target.value) || null })}
                              style={{ ...inputStyle(), padding:"7px 9px", fontSize:12 }} aria-label="Zielsumme netto" />
                            <button disabled={!z} onClick={() => setEs({ wgProzent: z.wgProzent })}
                              style={{ background:"var(--surface)", border:"1px solid var(--border)", color:"var(--text)", borderRadius:6, padding:"0 10px", cursor:"pointer", fontSize:12, fontFamily:"inherit" }}>
                              W&amp;G daraus</button>
                          </div>
                          {z && (
                            <div style={{ fontSize:12, marginTop:4, color: z.hinweis ? "var(--red)" : "var(--muted)" }}>
                              ergibt W&amp;G {z.wgProzent.toLocaleString("de-DE", { maximumFractionDigits: 2 })} %{z.hinweis && ` · ${z.hinweis}`} · Selbstkosten {z.selbstkosten.toLocaleString("de-DE", { maximumFractionDigits: 0 })} €
                            </div>
                          )}
                        </div>
                      );
                    })()}
                    {erg && (
                      <div style={{ fontSize:12, marginTop:8, lineHeight:1.6, color:"var(--text)" }}>
                        EKT {eur(erg.ektSumme)} € + BGK {eur(erg.bgk)} € = HK {eur(erg.hk)} € · AGK {eur(erg.agk)} € · W&amp;G {eur(erg.wg)} €
                        <div><b>Angebotssumme {eur(erg.gesamt)} €</b>{erg.umlageSatz != null && <> · Umlage {erg.umlageSatz.toLocaleString("de-DE", { maximumFractionDigits: 2 })} % auf {es.umlageAuf === "alle" ? "alle Kosten" : "Lohn"}</>}</div>
                        {erg.fehler && <div style={{ color:"var(--red)" }}>{erg.fehler}</div>}
                      </div>
                    )}
                    <button onClick={() => setA(x => ({ ...x, positionen: endsummeAnwenden(x.positionen, x.endsumme, kalkulationspreise) }))}
                      disabled={!erg || erg.umlageSatz == null}
                      style={{ width:"100%", marginTop:8, background:"var(--yellow)", color:"#1a1200", border:"none", borderRadius:10, padding:10,
                        fontWeight:800, cursor:"pointer", fontFamily:"inherit" }}>Umlage auf die Positionen anwenden</button>
                  </>}
                </div>
              );
            })()}

            <AngebotNachweis angebot={a} nachweis={nachweis} />

            {(istPolier || darfFreigeben) && !gesperrt && (
              <div style={{ background:"var(--surface2)", border:"1px solid var(--border)", borderRadius:12,
                padding:"10px 12px", marginBottom:12 }}>
                <div style={{ color:"var(--muted)", fontSize:11, fontWeight:700, textTransform:"uppercase", marginBottom:6 }}>
                  Interne Freigabe
                </div>
                <div style={{ fontSize:12.5, color:"var(--text)", marginBottom:8 }}>
                  {!freigabe?.status && istPolier && !pflicht.pflicht && (
                    <span style={{ color:"var(--green)" }}>✓ Innerhalb deiner Kompetenzgrenze{pflicht.grenze ? ` (bis ${pflicht.grenze.toLocaleString("de-DE")} € netto)` : ""} — du kannst selbst versenden.</span>
                  )}
                  {!freigabe?.status && istPolier && pflicht.pflicht && (
                    <>Freigabe durch die Geschäftsführung nötig:
                      {pflicht.gruende.map((g, i) => <div key={i} style={{ color:"var(--ydark)", marginTop:3 }}>• {g}</div>)}
                    </>
                  )}
                  {!freigabe?.status && !istPolier && "Keine Freigabe angefragt."}
                  {freigabe?.status === "angefragt" && "⏳ Freigabe angefragt."}
                  {freigabe?.status === "freigegeben" && `✔ Freigegeben von ${freigabe.von || "GF"} am ${new Date(freigabe.am).toLocaleDateString("de-DE")}.`}
                  {freigabe?.status === "zurueckgewiesen" && `↩ Zurückgewiesen${freigabe.notiz ? `: ${freigabe.notiz}` : ""}.`}
                  {freigabe?.status === "geaendert" && "Nach der Freigabe geändert — bitte erneut freigeben lassen."}
                </div>
                {istPolier && pflicht.pflicht && freigabe?.status !== "angefragt" && freigabe?.status !== "freigegeben" && (
                  <button onClick={() => freigabeSetzen("angefragt")} disabled={speichertLaedt || !a.positionen.length}
                    style={{ width:"100%", background:"var(--yellow)", color:"#1a1200", border:"none", borderRadius:10,
                      padding:11, fontWeight:800, cursor:"pointer", fontFamily:"inherit" }}>
                    Zur Freigabe an die Geschäftsführung
                  </button>
                )}
                {darfFreigeben && freigabe?.status !== "freigegeben" && (
                  <div style={{ display:"grid", gap:6 }}>
                    <button onClick={() => freigabeSetzen("freigegeben")} disabled={speichertLaedt}
                      style={{ background:"var(--green)", color:"#fff", border:"none", borderRadius:10, padding:11,
                        fontWeight:800, cursor:"pointer", fontFamily:"inherit" }}>Freigeben</button>
                    {freigabe?.status === "angefragt" && <>
                      <input value={zurueckNotiz} onChange={e => setZurueckNotiz(e.target.value)}
                        placeholder="Begründung für Rückgabe" style={inputStyle()} />
                      <button onClick={() => { freigabeSetzen("zurueckgewiesen", zurueckNotiz); setZurueckNotiz(""); }} disabled={speichertLaedt}
                        style={{ background:"var(--rbg)", color:"var(--red)", border:"1px solid var(--red)", borderRadius:10, padding:10,
                          fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>Zurück an den Polier</button>
                    </>}
                  </div>
                )}
              </div>
            )}

            {firmaId && versandErlaubt && <AngebotFreigabe angebotId={a.id} firmaId={firmaId} profil={profil} session={session} />}

            <button onClick={speichernKlick} disabled={speichertLaedt || gesperrt}
              style={{ width:"100%", background: gesperrt ? "var(--surface2)" : "var(--yellow)",
                color: gesperrt ? "var(--muted)" : "#1a1200",
                border:"none", borderRadius:12, padding:14, fontWeight:800,
                cursor: (speichertLaedt || gesperrt) ? "default" : "pointer", fontSize:14, fontFamily:"inherit",
                display:"flex", alignItems:"center", justifyContent:"center", gap:7 }}>
              {gesperrt ? "Gesperrt" : speichertLaedt ? <><Spinner size={14} /> Speichert…</> : "Angebot speichern"}
            </button>
            {speicherStatus && <div style={{ fontSize:13, color:"var(--text2)", marginTop:8, textAlign:"center" }}>{speicherStatus}</div>}
            </div>
          </div>
        )}
        </div>
      </div>

      <DocxVorschauModal blob={wordBlob} dateiname={("Angebot_"+a.titel.replace(/ /g,"_")+".docx")} eigeneFirma={eigeneFirma} onClose={() => setWordBlob(null)} />
      <ExcelVorschauModal rows={kalkExportRows} columns={KALK_EXPORT_SPALTEN}
        dateiname={("Kalkulation_"+a.titel.replace(/ /g,"_")+".xlsx")}
        eigeneFirma={eigeneFirma} onClose={() => setKalkExportRows(null)} />

    </div>
  );
}
