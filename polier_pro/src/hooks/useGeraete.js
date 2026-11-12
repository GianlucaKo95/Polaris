import { useCallback, useEffect, useState } from "react";
import { sbClientMitToken } from "../lib/supabase.js";

// Geräte der Firma laden und speichern. Ohne Anmeldung (Demo-Modus) liegen
// sie im localStorage, damit sich die Ansicht ausprobieren lässt.
const DEMO_KEY = "polaris.geraete.demo";
const demoLesen = () => { try { return JSON.parse(localStorage.getItem(DEMO_KEY) || "[]"); } catch { return []; } };
const demoSchreiben = l => { try { localStorage.setItem(DEMO_KEY, JSON.stringify(l)); } catch { /* voll oder gesperrt */ } };

export function useGeraete(session, firmaId) {
  const [geraete, setGeraete] = useState([]);
  const [laedt, setLaedt] = useState(false);
  const [fehler, setFehler] = useState(null);
  const online = !!session?.access_token && !!firmaId;

  const laden = useCallback(async () => {
    if (!online) { setGeraete(demoLesen()); return; }
    setLaedt(true);
    const { data, error } = await sbClientMitToken(session).from("geraete").select("*").order("bezeichnung");
    setLaedt(false);
    if (error) setFehler(/relation .* does not exist|schema cache/i.test(error.message)
      ? "Die Tabelle geraete fehlt noch: supabase-kalkulation.sql im SQL-Editor ausführen" : error.message);
    else { setFehler(null); setGeraete(data || []); }
  }, [online, session?.access_token, firmaId]);

  useEffect(() => { laden(); }, [laden]);

  // Speichert ein Gerät (neu oder geändert) und gibt die gespeicherte Fassung zurück.
  const speichern = useCallback(async geraet => {
    if (!online) {
      const g = { ...geraet, id: geraet.id ?? Date.now() };
      const liste = demoLesen().filter(x => x.id !== g.id).concat(g);
      demoSchreiben(liste); setGeraete(liste);
      return g;
    }
    const { id, created_at, ...felder } = geraet;
    const q = sbClientMitToken(session).from("geraete");
    const { data, error } = id
      ? await q.update(felder).eq("id", id).select().single()
      : await q.insert({ ...felder, firma_id: firmaId }).select().single();
    if (error) { setFehler(error.message); return null; }
    setFehler(null);
    setGeraete(l => l.filter(x => x.id !== data.id).concat(data));
    return data;
  }, [online, session?.access_token, firmaId]);

  const loeschen = useCallback(async id => {
    if (!online) { const l = demoLesen().filter(x => x.id !== id); demoSchreiben(l); setGeraete(l); return true; }
    const { error } = await sbClientMitToken(session).from("geraete").delete().eq("id", id);
    if (error) { setFehler(error.message); return false; }
    setGeraete(l => l.filter(x => x.id !== id));
    return true;
  }, [online, session?.access_token]);

  return { geraete, laedt, fehler, laden, speichern, loeschen };
}
