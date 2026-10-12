// ═══════════════════════════════════════════════════════════════════════
// Supabase Edge Function: Link zum Stripe Customer Portal öffnen
// ═══════════════════════════════════════════════════════════════════════
//
// Für ALLES nach dem ersten Checkout (siehe stripe-checkout-session):
// Zahlungsmittel ändern, zwischen Starter/Pro wechseln, die Anzahl
// zusätzlicher Baustellen anpassen, kündigen. Das ist der von Stripe
// empfohlene, von Stripe selbst gehostete und gepflegte Weg dafür — eine
// eigene Verwaltungsoberfläche dafür nachzubauen wäre reine Dopplung.
//
// Welche Aktionen im Portal erlaubt sind (Plan wechseln zwischen genau
// Starter/Pro, Overage-Menge anpassbar, Kündigen erlaubt) wird NICHT hier
// im Code festgelegt, sondern einmalig im Stripe Dashboard unter
// Settings → Billing → Customer Portal konfiguriert.
//
// ─── Setup (einmalig) ────────────────────────────────────────────────────
//   supabase functions deploy stripe-portal-session
//   (nutzt STRIPE_SECRET_KEY, siehe stripe-checkout-session)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "npm:stripe@17.4.0";

const SUPABASE_URL      = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";

// Eine einzige, flache Produktliste im Customer Portal kann nicht danach
// unterscheiden, ob die Firma aktuell Starter oder Pro hat — eine
// Starter-Firma würde dort auch "Zusätzliche Baustelle (Pro)" angeboten
// bekommen (und umgekehrt), obwohl das gar nicht zum aktuellen Plan passt.
// Deshalb zwei separate Portal-Konfigurationen (je nur mit der zum Plan
// passenden Overage-Position), zwischen denen hier anhand von firmen.plan
// gewählt wird, statt die Standard-Konfiguration zu verwenden.
const PORTAL_CONFIG_ENV: Record<string, string> = {
  starter: "STRIPE_PORTAL_CONFIG_STARTER",
  pro:     "STRIPE_PORTAL_CONFIG_PRO",
};

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

  let returnUrl: string;
  try {
    const body = await req.json();
    returnUrl = typeof body.returnUrl === "string" ? body.returnUrl : "";
  } catch {
    return json({ error: "Ungültige Anfrage." }, 400);
  }
  if (!returnUrl) return json({ error: "Keine Rücksprung-URL übergeben." }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: userData, error: userError } = await admin.auth.getUser(jwt);
  if (userError || !userData?.user) return json({ error: "Sitzung ungültig oder abgelaufen." }, 401);

  const { data: profil } = await admin
    .from("profile").select("firma_id, rolle").eq("id", userData.user.id).maybeSingle();
  if (!profil?.firma_id || !["administrator", "geschaeftsfuehrer"].includes(profil.rolle)) {
    return json({ error: "Nicht berechtigt." }, 403);
  }

  const { data: firma } = await admin
    .from("firmen").select("stripe_customer_id, plan").eq("id", profil.firma_id).maybeSingle();
  if (!firma?.stripe_customer_id) {
    return json({ error: "Für diese Firma besteht noch kein Abo. Bitte zuerst einen Plan wählen." }, 400);
  }

  const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-12-18.acacia" });

  try {
    const configEnvName = PORTAL_CONFIG_ENV[firma.plan as string];
    const configuration = configEnvName ? Deno.env.get(configEnvName) : undefined;

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: firma.stripe_customer_id,
      return_url: returnUrl,
      locale: "de",
      // Fällt auf die Standard-Konfiguration zurück, falls firmen.plan
      // einen unerwarteten Wert hat oder das Secret noch fehlt — dann gilt
      // zumindest die zuletzt im Dashboard gespeicherte Konfiguration,
      // statt die ganze Portal-Session scheitern zu lassen.
      ...(configuration ? { configuration } : {}),
    });
    return json({ url: portalSession.url });
  } catch (err) {
    return json({ error: `Stripe-Anfrage fehlgeschlagen: ${err}` }, 502);
  }
});
