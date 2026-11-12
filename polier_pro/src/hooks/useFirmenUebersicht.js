import { useCallback, useEffect, useState } from "react";
import { sbClientMitToken } from "../lib/supabase.js";

// Firmenweite Angebote, Rechnungen und Leistungsstände für die Desktop-
// Übersichten (Cockpit, Baustellen-Liste, Angebotsliste). Lädt einmal je
// Projektliste; neuLaden() nach Änderungen.
export function useFirmenUebersicht(session, projekte) {
  const [daten, setDaten] = useState({ angebote: [], rechnungen: [], baufortschritt: [] });
  const [laedt, setLaedt] = useState(true);
  const [fehler, setFehler] = useState("");
  const [zaehler, setZaehler] = useState(0);
  const ids = (projekte || []).map(p => p.id);
  const schluessel = ids.join(",");

  useEffect(() => {
    if (!session?.access_token || !ids.length) { setLaedt(false); return; }
    let aktiv = true;
    setLaedt(true);
    const c = sbClientMitToken(session);
    // Ältere Datenbanken ohne die Spalten aus supabase-kalkulation.sql
    // (interne_freigabe, nachtrag_zu): dann alle vorhandenen Spalten laden,
    // statt die ganze Angebotsliste als Fehler zu verwerfen.
    const angeboteLaden = () => c.from("angebote").select("id,projekt_id,titel,empfaenger,datum,status,positionen,rabatt,mwst,interne_freigabe,nachtrag_zu,created_at").in("projekt_id", ids)
      .then(r => r.error?.code === "42703" ? c.from("angebote").select("*").in("projekt_id", ids) : r);
    Promise.all([
      angeboteLaden(),
      c.from("rechnungen").select("*").in("projekt_id", ids),
      c.from("baufortschritt").select("*").in("projekt_id", ids),
    ]).then(([a, r, b]) => {
      if (!aktiv) return;
      setFehler(a.error ? "Angebote konnten nicht geladen werden." : "");
      setDaten({ angebote: a.data || [], rechnungen: r.data || [], baufortschritt: b.data || [] });
      setLaedt(false);
    }).catch(() => { if (aktiv) { setFehler("Verbindung fehlgeschlagen."); setLaedt(false); } });
    return () => { aktiv = false; };
  }, [session?.access_token, schluessel, zaehler]);

  const neuLaden = useCallback(() => setZaehler(z => z + 1), []);
  return { ...daten, laedt, fehler, neuLaden };
}
