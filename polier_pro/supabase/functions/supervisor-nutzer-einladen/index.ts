// ═══════════════════════════════════════════════════════════════════════
// Supabase Edge Function: Supervisor legt Admin-Konto für neue Kundenfirma an
// ═══════════════════════════════════════════════════════════════════════
//
// Löst "ich muss das immer über Supabase machen" — bisher musste für eine
// komplett neue Kundenfirma das allererste Auth-Konto manuell im Supabase-
// Dashboard angelegt werden, weil ohne existierendes Konto niemand sich
// einloggen kann, um eine normale Einladung (einladungen-Tabelle, siehe
// EinladungGenerieren.jsx) zu generieren — die setzt ja bereits eine
// bestehende Firma UND einen eingeloggten Administrator voraus.
//
// Diese Function erledigt genau diesen einen fehlenden Schritt: ruft
// admin.auth.admin.inviteUserByEmail() auf (braucht SERVICE_ROLE_KEY, nie
// im Frontend), was ein neues Auth-Konto anlegt UND eine Einladungs-E-Mail
// mit Passwort-Setzen-Link verschickt. Ab dort läuft alles über bereits
// bestehende App-Logik weiter, ohne jede Zusatzarbeit:
//   1. Link enthält #access_token=...&type=invite — von useAuth.js bereits
//      geparst (inviteToken/inviteType), App.jsx zeigt PasswortSetzenScreen.
//   2. Nach Passwort setzen: Session vorhanden, aber noch kein profile-
//      Datensatz → App.jsx zeigt OnboardingFlow (onboardingDone = false).
//   3. Im Onboarding abgeschlossen: firma_registrieren()-RPC legt Firma UND
//      profile (rolle='administrator') für genau diesen Nutzer an.
// Diese Function muss also NUR das Auth-Konto erzeugen, keine eigene
// Firma-/Profil-Anlage duplizieren.
//
// Autorisierung: NICHT öffentlich wie kundenportal-mangel-push — der
// Aufrufer muss eine echte, gültige Nutzer-Session mitbringen UND
// profile.ist_supervisor = true haben (siehe Migration
// supervisor_flag_guard_trigger — dieses Flag ist selbst über die
// Anwendung nicht änderbar, nur per direktem SQL durch den Betreiber).
//
// ─── Deployment (einmalig) ──────────────────────────────────────────────
//   supabase functions deploy supervisor-nutzer-einladen
//   (nutzt SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY, in jeder Edge Function
//   automatisch vorhanden — kein zusätzliches Secret nötig.)

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

  const { data: profil } = await admin
    .from("profile").select("ist_supervisor").eq("id", userData.user.id).maybeSingle();
  if (!profil?.ist_supervisor) return json({ error: "Nicht berechtigt." }, 403);

  let email: string, redirectTo: string | undefined;
  try {
    const body = await req.json();
    email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    redirectTo = typeof body.redirectTo === "string" ? body.redirectTo : undefined;
    if (!email || !email.includes("@")) throw new Error("ungültige E-Mail");
  } catch {
    return json({ error: "Ungültige E-Mail-Adresse." }, 400);
  }

  const { data, error } = await admin.auth.admin.inviteUserByEmail(
    email, redirectTo ? { redirectTo } : undefined
  );
  if (error) {
    // Supabase meldet einen bereits existierenden Nutzer als generischen
    // Fehler — hier verständlicher umformuliert, da das der mit Abstand
    // häufigste Fehlerfall sein dürfte (Tippfehler/Doppel-Einladung).
    const message = /already.*registered|already exists/i.test(error.message || "")
      ? "Für diese E-Mail-Adresse existiert bereits ein Konto."
      : (error.message || "Einladung konnte nicht gesendet werden.");
    return json({ error: message }, 400);
  }

  return json({ ok: true, userId: data.user?.id });
});
