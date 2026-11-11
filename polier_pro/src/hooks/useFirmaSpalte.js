import { useEffect, useState } from "react";
import { sbClientMitToken } from "../lib/supabase.js";

// Optionale JSON-Spalte am Firmen-Datensatz (aus supabase-kalkulation.sql),
// getrennt geladen und gespeichert: fehlt die Spalte in einer Installation
// noch, fällt nur diese Funktion aus (status "fehlt") und es wird nie
// zurückgeschrieben — das Laden der übrigen Firma bleibt unberührt.
export function useFirmaSpalte(firmaId, session, spalte, standard = null) {
  const [wert, setWert] = useState(standard);
  const [status, setStatus] = useState(null); // null | "ok" | "fehlt"
  const [geladen, setGeladen] = useState(0);

  useEffect(() => {
    if (!firmaId || !session?.access_token) return;
    let aktiv = true;
    sbClientMitToken(session).from("firmen").select(spalte).eq("id", firmaId)
      .then(({ data, error }) => {
        if (!aktiv) return;
        if (error) { setStatus("fehlt"); return; }
        setWert(data?.[0]?.[spalte] ?? standard);
        setStatus("ok");
        setGeladen(n => n + 1);
      });
    return () => { aktiv = false; };
  }, [firmaId, session?.access_token, spalte]);

  // Speichern erst nach erfolgreichem Laden und nur bei echten Änderungen.
  const [letzterStand, setLetzterStand] = useState(null);
  useEffect(() => {
    if (status !== "ok" || !firmaId || !session?.access_token) return;
    const json = JSON.stringify(wert);
    if (letzterStand === null) { setLetzterStand(json); return; }
    if (json === letzterStand) return;
    setLetzterStand(json);
    sbClientMitToken(session).from("firmen").update({ [spalte]: wert }).eq("id", firmaId).then(() => {});
  }, [wert, status, geladen]);

  return [wert, setWert, status];
}
