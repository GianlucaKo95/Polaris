import { useCallback, useEffect, useState } from "react";
import { sbClientMitToken } from "../lib/supabase.js";

// Zeilen einer firmenbezogenen Tabelle laden, speichern und löschen
// (Regieberichte, Planung, Sicherheiten …). Optional auf eine Spalte
// gefiltert (z. B. projekt_id). Ohne Anmeldung liegen die Daten im
// localStorage, damit sich die Ansicht im Demo-Modus ausprobieren lässt.
export function useFirmaTabelle(session, firmaId, tabelle, { filter = null, sortierung = "id" } = {}) {
  const [zeilen, setZeilen] = useState([]);
  const [fehler, setFehler] = useState(null);
  const online = !!session?.access_token && !!firmaId;
  const demoKey = `polaris.${tabelle}.demo`;
  const passt = z => !filter || String(z[filter.spalte]) === String(filter.wert);
  const demoAlle = () => { try { return JSON.parse(localStorage.getItem(demoKey) || "[]"); } catch { return []; } };
  const demoSetzen = l => { try { localStorage.setItem(demoKey, JSON.stringify(l)); } catch { /* voll */ } };
  const filterSchluessel = filter ? `${filter.spalte}=${filter.wert}` : "";

  const laden = useCallback(async () => {
    if (filter && filter.wert == null) { setZeilen([]); return; }
    if (!online) { setZeilen(demoAlle().filter(passt)); return; }
    let q = sbClientMitToken(session).from(tabelle).select("*").order(sortierung);
    if (filter) q = q.eq(filter.spalte, filter.wert);
    const { data, error } = await q;
    if (error) setFehler(/does not exist|schema cache/i.test(error.message)
      ? `Die Tabelle ${tabelle} fehlt noch: supabase-kalkulation.sql im SQL-Editor ausführen` : error.message);
    else { setFehler(null); setZeilen(data || []); }
  }, [online, session?.access_token, firmaId, tabelle, filterSchluessel]);

  useEffect(() => { laden(); }, [laden]);

  const speichern = useCallback(async zeile => {
    if (!online) {
      const z = { ...zeile, id: zeile.id ?? Date.now() };
      demoSetzen(demoAlle().filter(x => x.id !== z.id).concat(z));
      setZeilen(l => l.filter(x => x.id !== z.id).concat(z));
      return z;
    }
    const { id, created_at, ...felder } = zeile;
    const q = sbClientMitToken(session).from(tabelle);
    const { data, error } = id
      ? await q.update(felder).eq("id", id).select().single()
      : await q.insert({ ...felder, firma_id: firmaId }).select().single();
    if (error) { setFehler(error.message); return null; }
    setFehler(null);
    setZeilen(l => l.filter(x => x.id !== data.id).concat(data));
    return data;
  }, [online, session?.access_token, firmaId, tabelle]);

  const loeschen = useCallback(async id => {
    if (!online) { demoSetzen(demoAlle().filter(x => x.id !== id)); setZeilen(l => l.filter(x => x.id !== id)); return true; }
    const { error } = await sbClientMitToken(session).from(tabelle).delete().eq("id", id);
    if (error) { setFehler(error.message); return false; }
    setZeilen(l => l.filter(x => x.id !== id));
    return true;
  }, [online, session?.access_token, tabelle]);

  return { zeilen, fehler, laden, speichern, loeschen };
}
