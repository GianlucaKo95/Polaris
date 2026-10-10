// ═══════════════════════════════════════════════════════════════════════
// Supabase Edge Function: Einladung mit Benutzername (ohne E-Mail) einlösen
// ═══════════════════════════════════════════════════════════════════════
//
// Löst "Vorarbeiter und Facharbeiter bekommen keine Firmen-Mailadresse" —
// für eine Einladung mit zugangsart='benutzername' (siehe
// EinladungGenerieren.jsx) tippt der Mitarbeiter nur einen Benutzernamen
// statt einer E-Mail. Supabase Auth selbst kennt aber nur E-Mail/Telefon
// als Identität — deshalb legt diese Function im Hintergrund ein Konto
// mit einer synthetischen Adresse "<benutzername>@mitarbeiter.polier-pro.local"
// an. Dieser Domain-Teil MUSS exakt mit BENUTZERNAME_LOGIN_DOMAIN in
// src/config/konstanten.js übereinstimmen — dort baut useAuth.js beim
// Login dieselbe Adresse aus dem eingegebenen Benutzernamen zusammen.
//
// Warum eine eigene Function statt supabase.auth.signUp() im Client (wie
// beim normalen E-Mail-Pfad in EinladungScreen.jsx): signUp() verschickt
// bei aktivierter "Confirm email"-Einstellung einen Bestätigungslink an
// die angegebene Adresse — bei einer frei erfundenen .local-Domain kommt
// dort nie jemand heran, der Account bliebe für immer unbestätigt und
// damit unbenutzbar. admin.auth.admin.createUser({ email_confirm: true })
// braucht den SERVICE_ROLE_KEY (nie im Frontend) und markiert das Konto
// serverseitig sofort als bestätigt, ganz ohne E-Mail-Versand.
//
// Autorisierung: öffentlich (anon) aufrufbar wie kundenportal-mangel-push —
// zu diesem Zeitpunkt gibt es noch keine Session. Die eigentliche Prüfung
// (gültiges, nicht abgelaufenes Token mit zugangsart='benutzername')
// passiert serverseitig gegen die echte Tabelle, nicht nur im UI.
//
// ─── Deployment (einmalig) ──────────────────────────────────────────────
//   supabase functions deploy einladung-benutzername-registrieren

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL     = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

// Muss exakt mit BENUTZERNAME_LOGIN_DOMAIN in src/config/konstanten.js
// übereinstimmen — sonst löst useAuth.js beim Login eine andere Adresse
// auf, als hier beim Registrieren tatsächlich angelegt wurde.
const BENUTZERNAME_LOGIN_DOMAIN = "mitarbeiter.polier-pro.local";
const BENUTZERNAME_REGEX = /^[a-z0-9._-]+$/;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let token: string, benutzername: string, passwort: string;
  try {
    const body = await req.json();
    token        = typeof body.token === "string" ? body.token : "";
    benutzername = typeof body.benutzername === "string" ? body.benutzername.trim().toLowerCase() : "";
    passwort     = typeof body.passwort === "string" ? body.passwort : "";
  } catch {
    return json({ error: "Ungültige Anfrage." }, 400);
  }

  if (!token) return json({ error: "Kein Einladungs-Token übergeben." }, 400);
  if (benutzername.length < 3 || !BENUTZERNAME_REGEX.test(benutzername)) {
    return json({ error: "Benutzername muss mindestens 3 Zeichen haben und darf nur Buchstaben, Zahlen, Punkt, Unterstrich und Minus enthalten." }, 400);
  }
  if (!passwort || passwort.length < 6) {
    return json({ error: "Passwort muss mindestens 6 Zeichen haben." }, 400);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // Einladung serverseitig gegen die echte Tabelle prüfen, nicht nur im
  // UI — derselbe Gültigkeitscheck wie in einladung_pruefen_v2().
  const { data: einladung, error: einladungError } = await admin
    .from("einladungen")
    .select("id, zugangsart, aktiv, läuft_ab_at, max_nutzungen, nutzungen")
    .eq("token", token)
    .maybeSingle();

  if (einladungError || !einladung || !einladung.aktiv
      || new Date(einladung.läuft_ab_at) <= new Date()
      || (einladung.max_nutzungen != null && einladung.nutzungen >= einladung.max_nutzungen)) {
    return json({ error: "Diese Einladung ist ungültig oder abgelaufen." }, 400);
  }
  if (einladung.zugangsart !== "benutzername") {
    return json({ error: "Diese Einladung nutzt E-Mail, nicht Benutzername." }, 400);
  }

  const syntheticEmail = `${benutzername}@${BENUTZERNAME_LOGIN_DOMAIN}`;

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: syntheticEmail,
    password: passwort,
    email_confirm: true,
  });
  if (createError || !created?.user) {
    const message = /already.*registered|already exists/i.test(createError?.message || "")
      ? "Dieser Benutzername ist bereits vergeben."
      : (createError?.message || "Konto konnte nicht angelegt werden.");
    return json({ error: message }, 400);
  }

  const { data: result, error: rpcError } = await admin.rpc("einladung_einloesen_v2", {
    p_token: token, p_user_id: created.user.id, p_benutzername: benutzername,
  });

  if (rpcError || !result?.ok) {
    // Angelegtes Auth-Konto wieder entfernen statt einen verwaisten Account
    // ohne profile-Zeile zurückzulassen (z.B. Benutzername-Race zwischen
    // zwei gleichzeitigen Registrierungen).
    await admin.auth.admin.deleteUser(created.user.id).catch(() => {});
    return json({ error: result?.fehler || rpcError?.message || "Einladung konnte nicht eingelöst werden." }, 400);
  }

  return json({ ok: true, email: syntheticEmail });
});
