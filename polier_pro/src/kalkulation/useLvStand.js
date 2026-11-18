// Zustand eines Kalkulationsstands im Editor: LV-Knoten und Ansätze laden,
// Änderungen sofort anzeigen, im Hintergrund gebündelt speichern,
// Rückgängig/Wiederholen über beide Tabellen.
//
// Änderungspaket: { neu, aendern, loeschen } für LV-Knoten, optional
// { ansaetze: { neu, aendern, loeschen } }. Nach jeder Änderung werden die
// kalkulierten EP neu berechnet und im selben Paket mitgeschrieben, damit
// Rückgängig Ansatz und EP gemeinsam zurücknimmt.
import { useCallback, useEffect, useRef, useState } from "react";
import { aenderungenAnwenden, aenderungenUmkehren } from "../lib/kalk/lvBaum.js";
import { standBerechnen } from "../lib/kalk/rechenkern.js";
import { anmelden, abmelden } from "../lib/ungespeichert.js";

const VERZOEGERUNG = 700;
const leerTeil = ae => !ae || (!ae.neu?.length && !ae.aendern?.length && !ae.loeschen?.length);
const leer = ae => leerTeil(ae) && leerTeil(ae?.ansaetze);

function zusammenfassenTeil(liste) {
  const neu = new Map(), aendern = new Map(), loeschen = new Set();
  for (const ae of liste) {
    if (!ae) continue;
    for (const id of ae.loeschen || []) { if (neu.has(id)) neu.delete(id); else loeschen.add(id); aendern.delete(id); }
    for (const k of ae.neu || []) { loeschen.delete(k.id); neu.set(k.id, k); }
    for (const a of ae.aendern || []) {
      if (neu.has(a.id)) neu.set(a.id, { ...neu.get(a.id), ...a.felder });
      else aendern.set(a.id, { id: a.id, felder: { ...(aendern.get(a.id)?.felder || {}), ...a.felder } });
    }
  }
  return { neu: [...neu.values()], aendern: [...aendern.values()], loeschen: [...loeschen] };
}

export function zusammenfassen(liste) {
  return { ...zusammenfassenTeil(liste), ansaetze: zusammenfassenTeil(liste.map(x => x?.ansaetze)) };
}

// Ansätze gelöschter Knoten entfallen mit (in der Datenbank per Fremdschlüssel)
function ansaetzeBereinigen(ansaetze, knoten) {
  const ids = new Set(knoten.map(k => k.id));
  return ansaetze.filter(a => ids.has(a.knoten_id));
}

export function useLvStand(speicher, standId, { zuschlaege = null, gesperrt = false } = {}) {
  const [daten, setDaten] = useState(null); // { knoten, ansaetze }
  const [ladeFehler, setLadeFehler] = useState(null);
  const [status, setStatus] = useState("gespeichert");
  const [fehler, setFehler] = useState(null);
  const ref = useRef({ knoten: [], ansaetze: [] });
  const zRef = useRef(zuschlaege);
  zRef.current = zuschlaege;
  const sperre = useRef(gesperrt);
  sperre.current = gesperrt;
  const warteschlange = useRef([]);
  const timer = useRef(null);
  const laeuft = useRef(false);
  const verlauf = useRef({ zurueck: [], vor: [] });
  const ungespeichertId = useRef(null);
  const [, setTick] = useState(0);

  const laden = useCallback(async () => {
    setLadeFehler(null);
    try {
      const [knoten, ansaetze] = await Promise.all([speicher.knotenLaden(standId), speicher.ansaetzeLaden ? speicher.ansaetzeLaden(standId) : []]);
      ref.current = { knoten, ansaetze };
      setDaten(ref.current);
    } catch (e) { setLadeFehler(e.nutzerText || e.message); }
  }, [speicher, standId]);

  useEffect(() => { setDaten(null); verlauf.current = { zurueck: [], vor: [] }; laden(); }, [laden]);

  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    if (laeuft.current || !warteschlange.current.length) return;
    laeuft.current = true;
    const paket = zusammenfassen(warteschlange.current);
    warteschlange.current = [];
    setStatus("speichert");
    let ok = false;
    try {
      const { ansaetze, ...knotenTeil } = paket;
      if (!leerTeil(knotenTeil)) await speicher.knotenSpeichern(standId, knotenTeil, { aktuell: ref.current.knoten });
      if (!leerTeil(ansaetze) && speicher.ansaetzeSpeichern) {
        const geloeschteKnoten = new Set(knotenTeil.loeschen || []);
        const bereinigt = { ...ansaetze, neu: ansaetze.neu.filter(a => !geloeschteKnoten.has(a.knoten_id)) };
        await speicher.ansaetzeSpeichern(standId, bereinigt, { aktuell: ref.current.ansaetze });
      }
      ok = true;
      setFehler(null);
      setStatus(warteschlange.current.length ? "offen" : "gespeichert");
      if (!warteschlange.current.length && ungespeichertId.current) { abmelden(ungespeichertId.current); ungespeichertId.current = null; }
    } catch (e) {
      warteschlange.current = [paket, ...warteschlange.current];
      setFehler(e.nutzerText || e.message);
      setStatus("fehler");
    } finally {
      laeuft.current = false;
      if (ok && warteschlange.current.length) timer.current = setTimeout(() => flush(), VERZOEGERUNG);
    }
  }, [speicher, standId]);

  useEffect(() => () => { clearTimeout(timer.current); if (warteschlange.current.length) flush(); if (ungespeichertId.current) abmelden(ungespeichertId.current); }, [flush]);

  const einreihen = ae => {
    warteschlange.current.push(ae);
    setStatus("offen");
    if (!ungespeichertId.current) ungespeichertId.current = anmelden({ titel: "Kalkulation", speichern: () => flush() });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => flush(), VERZOEGERUNG);
  };

  // Paket anwenden; liefert das tatsächlich angewendete Paket (inkl. EP-Neuberechnung) und den Zustand davor
  const anwendenRoh = (ae, { epNeu = true } = {}) => {
    const vorher = ref.current;
    let knoten = aenderungenAnwenden(vorher.knoten, ae);
    const ansaetze = ansaetzeBereinigen(aenderungenAnwenden(vorher.ansaetze, ae.ansaetze || {}), knoten);
    let paket = ae;
    if (epNeu && !sperre.current) {
      const r = standBerechnen(knoten, ansaetze, zRef.current);
      if (r.epAenderungen.length) {
        knoten = aenderungenAnwenden(knoten, { aendern: r.epAenderungen });
        paket = { ...ae, aendern: [...(ae.aendern || []), ...r.epAenderungen] };
      }
    }
    ref.current = { knoten, ansaetze };
    setDaten(ref.current);
    einreihen(paket);
    return { paket, vorher };
  };

  const umkehrVon = (paket, vorher) => ({
    ...aenderungenUmkehren(vorher.knoten, paket),
    ansaetze: aenderungenUmkehren(vorher.ansaetze, paket.ansaetze || {}),
  });

  const anwenden = useCallback(ae => {
    if (leer(ae)) return;
    const { paket, vorher } = anwendenRoh(ae);
    verlauf.current.zurueck.push({ ae: paket, umkehr: umkehrVon(paket, vorher) });
    if (verlauf.current.zurueck.length > 200) verlauf.current.zurueck.shift();
    verlauf.current.vor = [];
    setTick(t => t + 1);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // EP nach geänderten Zuschlägen neu berechnen (ohne Rückgängig-Eintrag)
  const neuBerechnen = useCallback(z => {
    if (sperre.current) return 0;
    if (z !== undefined) zRef.current = z;
    const r = standBerechnen(ref.current.knoten, ref.current.ansaetze, zRef.current);
    if (r.epAenderungen.length) anwendenRoh({ aendern: r.epAenderungen }, { epNeu: false });
    return r.epAenderungen.length;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const rueckgaengig = useCallback(() => {
    const e = verlauf.current.zurueck.pop();
    if (!e) return false;
    anwendenRoh(e.umkehr, { epNeu: false });
    verlauf.current.vor.push(e);
    setTick(t => t + 1);
    return true;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const wiederholen = useCallback(() => {
    const e = verlauf.current.vor.pop();
    if (!e) return false;
    anwendenRoh(e.ae, { epNeu: false });
    verlauf.current.zurueck.push(e);
    setTick(t => t + 1);
    return true;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const importieren = useCallback(async (neueKnoten, anlass) => {
    await flush();
    await speicher.knotenImportieren(standId, neueKnoten, anlass);
    verlauf.current = { zurueck: [], vor: [] };
    await laden();
  }, [speicher, standId, flush, laden]);

  return {
    knoten: daten?.knoten || null, ansaetze: daten?.ansaetze || [], ladeFehler, status, fehler, laden,
    anwenden, neuBerechnen, rueckgaengig, wiederholen, importieren,
    erneutSpeichern: () => { setFehler(null); flush(); },
    kannZurueck: verlauf.current.zurueck.length > 0, kannVor: verlauf.current.vor.length > 0,
    speichernJetzt: flush,
  };
}
