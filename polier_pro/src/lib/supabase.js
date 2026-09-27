import { createClient } from "@supabase/supabase-js";

export const SUPABASE_URL = import.meta.env?.VITE_SUPABASE_URL || "https://DEIN-PROJEKT.supabase.co";

export const SUPABASE_ANON_KEY = import.meta.env?.VITE_SUPABASE_ANON_KEY || "DEIN-ANON-KEY";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false, // wir verwalten die Session selbst in localStorage
                            // (Format "polaris-session"), siehe useAuth
    autoRefreshToken: false,
  },
});

export function parsePath(path) {
  const [table, queryString] = path.split("?");
  const params = new URLSearchParams(queryString || "");
  return { table, params };
}

// Ohne Zeitlimit blieb ein hängender Request (Netzwerkaussetzer o.ä.) für
// immer offen — der Aufrufer sah dann dauerhaft seinen "Lädt…"-Zustand,
// ohne Fehler und ohne dass der Button je wieder nutzbar wurde.
const SB_TIMEOUT_MS = 15000;

export async function sbFetch(path, opts = {}) {
  try {
    const { table, params } = parsePath(path);
    const authToken = opts.headers?.Authorization?.replace("Bearer ", "");
    const nutzeEchtenToken = !!authToken && authToken !== SUPABASE_ANON_KEY;

    // Client mit dem passenden Token für diesen einen Request authentifizieren.
    // setSession() ist hier bewusst nicht global, sondern pro Aufruf über
    // eine Kopfzeile — das entspricht dem bisherigen Verhalten, wo jeder
    // sbFetch-Call sein eigenes Bearer-Token mitbrachte.
    const client = nutzeEchtenToken
      ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
          auth: { persistSession: false, autoRefreshToken: false },
          global: { headers: { Authorization: `Bearer ${authToken}` } },
        })
      : supabase;

    const method = (opts.method || "GET").toUpperCase();
    let query = client.from(table);

    if (method === "GET") {
      query = query.select(params.get("select") || "*");
      for (const [key, value] of params.entries()) {
        if (key === "select") continue;
        if (key === "order") {
          const [col, dir] = value.split(".");
          query = query.order(col, { ascending: dir !== "desc" });
          continue;
        }
        if (key === "limit") { query = query.limit(Number(value)); continue; }
        // PostgREST-Operatoren: eq.X, gte.X, lte.X, neq.X
        const m = value.match(/^(eq|gte|lte|neq|gt|lt)\.(.*)$/);
        if (m) {
          const [, op, val] = m;
          query = query[op](key, val);
        }
      }
      const { data, error, status } = await query.abortSignal(AbortSignal.timeout(SB_TIMEOUT_MS));
      if (error) {
        if (status === 401 && nutzeEchtenToken) {
          window.dispatchEvent(new CustomEvent("polaris-auth-invalid"));
        }
        return null;
      }
      return data;
    }

    if (method === "POST") {
      const body = opts.body ? JSON.parse(opts.body) : {};
      const { data, error, status } = await query.insert(body).select().abortSignal(AbortSignal.timeout(SB_TIMEOUT_MS));
      if (error) {
        if (status === 401 && nutzeEchtenToken) {
          window.dispatchEvent(new CustomEvent("polaris-auth-invalid"));
        }
        return null;
      }
      return data;
    }

    if (method === "PATCH") {
      const body = opts.body ? JSON.parse(opts.body) : {};
      let updateQuery = query.update(body);
      for (const [key, value] of params.entries()) {
        const m = value.match(/^eq\.(.*)$/);
        if (m) updateQuery = updateQuery.eq(key, m[1]);
      }
      const { data, error, status } = await updateQuery.select().abortSignal(AbortSignal.timeout(SB_TIMEOUT_MS));
      if (error) {
        if (status === 401 && nutzeEchtenToken) {
          window.dispatchEvent(new CustomEvent("polaris-auth-invalid"));
        }
        return null;
      }
      return data;
    }

    if (method === "DELETE") {
      let delQuery = query.delete();
      for (const [key, value] of params.entries()) {
        const m = value.match(/^eq\.(.*)$/);
        if (m) delQuery = delQuery.eq(key, m[1]);
      }
      const { error, status } = await delQuery.abortSignal(AbortSignal.timeout(SB_TIMEOUT_MS));
      if (error) {
        if (status === 401 && nutzeEchtenToken) {
          window.dispatchEvent(new CustomEvent("polaris-auth-invalid"));
        }
        return null;
      }
      return [];
    }

    return null;
  } catch {
    return null;
  }
}

export function sbClientMitToken(session) {
  if (!session?.access_token) return supabase;
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${session.access_token}` } },
  });
}

export async function sbAufgabeSpeichern(a, projektId, session, istNeu) {
  if (!session?.access_token || !projektId) return null;
  const payload = {
    projekt_id:         projektId,
    titel:               a.titel || "",
    typ:                 a.typ || "allgemein",
    status:               a.status || "offen",
    prioritaet:          a.prioritaet || "mittel",
    faellig_am:          a.faellig_am || null,
    zustaendig:          a.zustaendig || "",
    soll_stunden:        a.soll_stunden ?? null,
    dauer_tage:          a.dauer_tage ?? null,
    mindest_mitarbeiter: a.mindest_mitarbeiter ?? null,
    maximal_mitarbeiter: a.maximal_mitarbeiter ?? null,
    abhaengig_von:       Array.isArray(a.abhaengig_von) ? a.abhaengig_von.filter(id => typeof id === "number" && id < 1e12) : [],
    beschreibung:        a.beschreibung || "",
    fotos:               a.fotos || [],
    ist_mangel:          !!a.ist_mangel,
    mangel_verursacher:  a.mangel_verursacher || "",
    plan_x:              a.plan_x ?? null,
    plan_y:              a.plan_y ?? null,
    plan_bild_url:       a.plan_bild_url || null,
    m2:                  a.m2 || 0,
    betonsorte:          a.betonsorte || "",
    festigkeit:          a.festigkeit ?? null,
    budget_pos:          a.budget_pos || "",
    kolonne_id:          typeof a.kolonne_id === "number" && a.kolonne_id < 1e12 ? a.kolonne_id : null,
  };
  try {
    const client = sbClientMitToken(session);
    const query = istNeu
      ? client.from("aufgaben").insert(payload).select()
      : client.from("aufgaben").update(payload).eq("id", a.id).select();
    const { data, error } = await query;
    if (error) return null;
    return data?.[0] || null;
  } catch { return null; }
}

export async function sbAufgabeLoeschen(id, session) {
  if (!session?.access_token) return false;
  try {
    const client = sbClientMitToken(session);
    const { error } = await client.from("aufgaben").delete().eq("id", id);
    return !error;
  } catch { return false; }
}

// Facharbeiter dürfen Aufgaben nicht direkt abschließen — diese beiden RPCs
// laufen serverseitig als SECURITY DEFINER und prüfen Rolle + Firma selbst,
// ganz ohne UPDATE-Grant auf die aufgaben-Tabelle für diese Rolle.
export async function sbAufgabeVorschlagen(id, session) {
  if (!session?.access_token) return false;
  try {
    const client = sbClientMitToken(session);
    const { error } = await client.rpc("aufgabe_vorschlagen_erledigt", { p_aufgabe_id: id });
    return !error;
  } catch { return false; }
}

export async function sbAufgabeVorschlagEntscheiden(id, akzeptiert, session) {
  if (!session?.access_token) return false;
  try {
    const client = sbClientMitToken(session);
    const { error } = await client.rpc("aufgabe_vorschlag_entscheiden", { p_aufgabe_id: id, p_akzeptiert: akzeptiert });
    return !error;
  } catch { return false; }
}

export async function sbKolonneSpeichern(k, projektId, session, istNeu) {
  if (!session?.access_token || !projektId) return null;
  const payload = {
    projekt_id:   projektId,
    name:         k.name || "",
    vorarbeiter:  k.vorarbeiter || "",
    mitarbeiter:  k.mitarbeiter || [],
  };
  try {
    const client = sbClientMitToken(session);
    const query = istNeu
      ? client.from("kolonnen").insert(payload).select()
      : client.from("kolonnen").update(payload).eq("id", k.id).select();
    const { data, error } = await query;
    if (error) return null;
    return data?.[0] || null;
  } catch { return null; }
}

export async function sbKolonneLoeschen(id, session) {
  if (!session?.access_token) return false;
  try {
    const client = sbClientMitToken(session);
    const { error } = await client.from("kolonnen").delete().eq("id", id);
    return !error;
  } catch { return false; }
}

export async function sbSubSpeichern(s, firmaId, session, istNeu) {
  if (!session?.access_token || !firmaId) return null;
  const payload = {
    firma_id:    firmaId,
    name:        s.name || "",
    kontakt:     s.kontakt || "",
    telefon:     s.telefon || "",
    email:       s.email || "",
    gewerke:     s.gewerke || [],
    stundensatz: s.stundensatz || 0,
    status:      s.status || "aktiv",
  };
  try {
    const client = sbClientMitToken(session);
    const query = istNeu
      ? client.from("subunternehmer").insert(payload).select()
      : client.from("subunternehmer").update(payload).eq("id", s.id).select();
    const { data, error } = await query;
    if (error) return null;
    return data?.[0] || null;
  } catch { return null; }
}

export async function sbSubLoeschen(id, session) {
  if (!session?.access_token) return false;
  try {
    const client = sbClientMitToken(session);
    const { error } = await client.from("subunternehmer").delete().eq("id", id);
    return !error;
  } catch { return false; }
}

export async function sbAngebotSpeichern(a, projektId, session, istNeu) {
  if (!session?.access_token || !projektId) return null;
  const payload = {
    projekt_id:  projektId,
    titel:       a.titel || "",
    empfaenger:  a.empfaenger || "",
    datum:       a.datum || new Date().toISOString().slice(0,10),
    gueltig_bis: a.gueltig_bis || null,
    positionen:  a.positionen || [],
    rabatt:      a.rabatt || 0,
    mwst:        a.mwst ?? 19,
    status:      a.status || "entwurf",
  };
  try {
    const client = sbClientMitToken(session);
    const query = istNeu
      ? client.from("angebote").insert(payload).select()
      : client.from("angebote").update(payload).eq("id", a.id).select();
    const { data, error } = await query;
    if (error) return null;
    return data?.[0] || null;
  } catch { return null; }
}

// Budget-Positionen + Stundensatz liegen (anders als Aufgaben/Kolonnen/
// Angebote) direkt als Spalten auf der projekte-Zeile, da es pro Baustelle
// nur je eine Liste bzw. einen Wert gibt — keine eigene Tabelle nötig.
export async function sbProjektKostenSpeichern(projektId, budgetPositionen, stundensatz, session) {
  if (!session?.access_token || !projektId) return false;
  try {
    const client = sbClientMitToken(session);
    const { error } = await client.from("projekte")
      .update({ budget_positionen: budgetPositionen, stundensatz })
      .eq("id", projektId);
    return !error;
  } catch { return false; }
}

// Einheitspreise + LV-Vorlagen sind Firmen-weite Konfiguration (nicht
// projektgebunden), deshalb auf der firmen-Zeile statt einer eigenen Tabelle.
export async function sbFirmaParameterSpeichern(firmaId, einheitspreise, lvVorlagen, session) {
  if (!session?.access_token || !firmaId) return false;
  try {
    const client = sbClientMitToken(session);
    const { error } = await client.from("firmen")
      .update({ einheitspreise, lv_vorlagen: lvVorlagen })
      .eq("id", firmaId);
    return !error;
  } catch { return false; }
}

export async function sbBerichtSpeichern(b, projektId, session) {
  if (!session?.access_token || !projektId) return null;
  const payload = {
    projekt_id:      projektId,
    datum:           b.datumRaw || new Date().toISOString().slice(0,10),
    wetter:          b.wetter || "",
    wetter_data:     b.wetterData || null,
    arbeiter:        b.arbeiter || 0,
    taetigkeit:      b.taetigkeit || "",
    besonderheiten:  b.besonderheiten || "",
    material:        b.material || "",
    maengel_anzahl:  b.maengel || 0,
    bilder:          b.bilder || [],
  };
  try {
    const client = sbClientMitToken(session);
    const { data, error } = await client.from("tagesberichte").insert(payload).select();
    if (error) return null;
    return data?.[0] || null;
  } catch { return null; }
}

// Schreibt den beim revisionssicheren Export berechneten Inhalts-Hash ins
// audit_log — vorher wurde er nur aufs PDF gedruckt, aber nie irgendwo
// gespeichert, sodass "revisionssicher" nicht wirklich nachprüfbar war.
// Absichtlich nur INSERT (siehe audit_log-RLS-Policies): ein nachträglich
// änderbares Audit-Log widerspräche dem Zweck.
export async function sbDokumentHashSpeichern({ firmaId, profilId, hash, berichtId, datum }, session) {
  if (!session?.access_token || !firmaId) return false;
  try {
    const client = sbClientMitToken(session);
    const { error } = await client.from("audit_log").insert({
      firma_id: firmaId,
      profil_id: profilId || null,
      aktion: "tagesbericht_export",
      objekt_typ: "tagesbericht",
      objekt_id: berichtId != null ? String(berichtId) : null,
      details: { hash, datum },
    });
    return !error;
  } catch { return false; }
}

export async function sbSignIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return { error: error.name, error_description: error.message, msg: error.message };
  }
  return {
    access_token:  data.session?.access_token,
    refresh_token: data.session?.refresh_token,
    expires_in:    data.session?.expires_in,
    user:          data.user,
  };
}

export async function sbSignOut(token) {
  // token-Parameter bleibt für Signatur-Kompatibilität erhalten, wird vom
  // offiziellen Client nicht gebraucht (nutzt intern die eigene Session).
  await supabase.auth.signOut();
}

export async function sbGetProfile(token, userId) {
  const client = sbClientMitToken({ access_token: token });
  // Explizit nach der eigenen id filtern statt sich allein auf RLS + limit(1)
  // zu verlassen: die "profile_eigenes"-Policy lässt Administrator/Bauleiter/
  // Polier-Rollen ALLE Profile sehen (nicht nur das eigene), damit sie in der
  // Nutzerverwaltung das Team einsehen können. Ohne dieses eq() lieferte
  // limit(1) ohne order() irgendeine für die Rolle sichtbare Zeile — in der
  // Praxis meist das zuerst angelegte Profil (den ursprünglichen Admin) —
  // wodurch neu eingeladene Bauleiter/Polier/Administrator-Nutzer nach dem
  // Login fälschlich im Konto des ursprünglichen Admins landeten.
  let query = client.from("profile").select("*");
  query = userId ? query.eq("id", userId) : query.limit(1);
  const { data, error } = await query;
  if (error) return null;
  return data?.[0] || null;
}
