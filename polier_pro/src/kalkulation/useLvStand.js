// Zustand eines Kalkulationsstands im Editor: Knoten laden, Änderungen sofort
// anzeigen, im Hintergrund gebündelt speichern, Rückgängig/Wiederholen.
import { useCallback, useEffect, useRef, useState } from "react";
import { aenderungenAnwenden, aenderungenUmkehren } from "../lib/kalk/lvBaum.js";
import { anmelden, abmelden } from "../lib/ungespeichert.js";

const VERZOEGERUNG = 700;
const leer = ae => !ae || (!ae.neu?.length && !ae.aendern?.length && !ae.loeschen?.length);

// Mehrere Änderungspakete zu einem zusammenfassen (Reihenfolge bleibt erhalten)
function zusammenfassen(liste) {
  const neu = new Map(), aendern = new Map(), loeschen = new Set();
  for (const ae of liste) {
    for (const id of ae.loeschen || []) { if (neu.has(id)) neu.delete(id); else loeschen.add(id); aendern.delete(id); }
    for (const k of ae.neu || []) { loeschen.delete(k.id); neu.set(k.id, k); }
    for (const a of ae.aendern || []) {
      if (neu.has(a.id)) neu.set(a.id, { ...neu.get(a.id), ...a.felder });
      else aendern.set(a.id, { id: a.id, felder: { ...(aendern.get(a.id)?.felder || {}), ...a.felder } });
    }
  }
  return { neu: [...neu.values()], aendern: [...aendern.values()], loeschen: [...loeschen] };
}

export function useLvStand(speicher, standId) {
  const [knoten, setKnoten] = useState(null);
  const [ladeFehler, setLadeFehler] = useState(null);
  const [status, setStatus] = useState("gespeichert"); // gespeichert | offen | speichert | fehler
  const [fehler, setFehler] = useState(null);
  const knotenRef = useRef([]);
  const warteschlange = useRef([]);
  const timer = useRef(null);
  const laeuft = useRef(false);
  const verlauf = useRef({ zurueck: [], vor: [] });
  const ungespeichertId = useRef(null);
  const [, setVerlaufTick] = useState(0);

  const laden = useCallback(async () => {
    setLadeFehler(null);
    try {
      const k = await speicher.knotenLaden(standId);
      knotenRef.current = k;
      setKnoten(k);
    } catch (e) { setLadeFehler(e.nutzerText || e.message); }
  }, [speicher, standId]);

  useEffect(() => { setKnoten(null); verlauf.current = { zurueck: [], vor: [] }; laden(); }, [laden]);

  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    if (laeuft.current) return;
    if (!warteschlange.current.length) return;
    laeuft.current = true;
    const paket = zusammenfassen(warteschlange.current);
    warteschlange.current = [];
    setStatus("speichert");
    let ok = false;
    try {
      if (!leer(paket)) await speicher.knotenSpeichern(standId, paket, { aktuell: knotenRef.current });
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
    if (!ungespeichertId.current) ungespeichertId.current = anmelden({ titel: "LV-Änderungen", speichern: () => flush() });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => flush(), VERZOEGERUNG);
  };

  const anwendenRoh = ae => {
    const vorher = knotenRef.current;
    const nachher = aenderungenAnwenden(vorher, ae);
    knotenRef.current = nachher;
    setKnoten(nachher);
    einreihen(ae);
    return vorher;
  };

  const anwenden = useCallback(ae => {
    if (leer(ae)) return;
    const vorher = anwendenRoh(ae);
    verlauf.current.zurueck.push({ ae, umkehr: aenderungenUmkehren(vorher, ae) });
    if (verlauf.current.zurueck.length > 200) verlauf.current.zurueck.shift();
    verlauf.current.vor = [];
    setVerlaufTick(t => t + 1);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const rueckgaengig = useCallback(() => {
    const e = verlauf.current.zurueck.pop();
    if (!e) return false;
    anwendenRoh(e.umkehr);
    verlauf.current.vor.push(e);
    setVerlaufTick(t => t + 1);
    return true;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const wiederholen = useCallback(() => {
    const e = verlauf.current.vor.pop();
    if (!e) return false;
    anwendenRoh(e.ae);
    verlauf.current.zurueck.push(e);
    setVerlaufTick(t => t + 1);
    return true;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Import: direkt (ohne Rückgängig), damit auch große LVs in einem Aufruf landen
  const importieren = useCallback(async (neueKnoten, anlass) => {
    await flush();
    await speicher.knotenImportieren(standId, neueKnoten, anlass);
    verlauf.current = { zurueck: [], vor: [] };
    await laden();
  }, [speicher, standId, flush, laden]);

  return {
    knoten, ladeFehler, status, fehler, laden, anwenden, rueckgaengig, wiederholen, importieren,
    erneutSpeichern: () => { setFehler(null); flush(); },
    kannZurueck: verlauf.current.zurueck.length > 0, kannVor: verlauf.current.vor.length > 0,
    speichernJetzt: flush,
  };
}

export { zusammenfassen };
