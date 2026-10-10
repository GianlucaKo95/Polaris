// ═══════════════════════════════════════════════════════════════════════
// Supabase Edge Function: Administrator setzt Passwort eines Mitarbeiters
// ═══════════════════════════════════════════════════════════════════════
//
// Für Benutzername-Konten (siehe einladung-benutzername-registrieren) gibt
// es kein echtes Postfach — die normale "Passwort vergessen"-Mail
// (LoginScreen.jsx, auth.passwortVergessen) kann also nicht ankommen. Der
// Administrator muss das Passwort deshalb direkt setzen können.
// admin.auth.admin.updateUserById() braucht den SERVICE_ROLE_KEY (nie im
// Frontend), daher diese Function statt eines direkten Client-Aufrufs.
//
// Autorisierung: Aufrufer muss eine gültige Session mit profile.rolle =
// 'administrator' mitbringen UND der Ziel-Nutzer muss zur selben Firma
// gehören — sonst könnte ein Administrator einer anderen Firma beliebige
// Passwörter in fremden Firmen setzen.
//
// ─── Deployment (einmalig) ──────────────────────────────────────────────
//   supabase functions deploy admin-passwort-zuruecksetzen

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL     = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

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

  const authHeader = req.headers.get("Authorization") || "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  if (!jwt) return json({ error: "Nicht angemeldet." }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: userData, error: userError } = await admin.auth.getUser(jwt);
  if (userError || !userData?.user) return json({ error: "Sitzung ungültig oder abgelaufen." }, 401);

  const { data: aufrufer } = await admin
    .from("profile").select("rolle, firma_id").eq("id", userData.user.id).maybeSingle();
  if (aufrufer?.rolle !== "administrator") return json({ error: "Nicht berechtigt." }, 403);

  let zielProfilId: string, neuesPasswort: string;
  try {
    const body = await req.json();
    zielProfilId  = typeof body.profilId === "string" ? body.profilId : "";
    neuesPasswort = typeof body.neuesPasswort === "string" ? body.neuesPasswort : "";
  } catch {
    return json({ error: "Ungültige Anfrage." }, 400);
  }
  if (!zielProfilId) return json({ error: "Kein Nutzer angegeben." }, 400);
  if (!neuesPasswort || neuesPasswort.length < 6) {
    return json({ error: "Passwort muss mindestens 6 Zeichen haben." }, 400);
  }

  const { data: zielProfil } = await admin
    .from("profile").select("firma_id").eq("id", zielProfilId).maybeSingle();
  if (!zielProfil || zielProfil.firma_id !== aufrufer.firma_id) {
    return json({ error: "Nicht berechtigt." }, 403);
  }

  const { error: updateError } = await admin.auth.admin.updateUserById(zielProfilId, {
    password: neuesPasswort,
  });
  if (updateError) {
    return json({ error: updateError.message || "Passwort konnte nicht gesetzt werden." }, 400);
  }

  return json({ ok: true });
});
