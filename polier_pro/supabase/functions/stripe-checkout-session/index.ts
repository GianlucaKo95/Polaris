// ═══════════════════════════════════════════════════════════════════════
// Supabase Edge Function: Stripe-Checkout-Session für Plan-Upgrade starten
// ═══════════════════════════════════════════════════════════════════════
//
// Antwort auf "Alles automatisch... ich arbeite mit deutschen Firmen,
// deswegen alles anbieten was in Deutschland üblich ist" — Stripe Checkout
// deckt SEPA-Lastschrift, Kreditkarte und PayPal über eine einzige
// Integration ab. Der Administrator/Geschäftsführer wählt in der App
// Starter oder Pro, diese Function legt (falls noch nicht vorhanden) einen
// Stripe-Customer für die Firma an und erzeugt eine Checkout-Session dafür.
//
// NUR für den ERSTEN Abschluss (Trial → zahlender Kunde, oder nach
// Kündigung neu starten). Ein spätere Wechsel zwischen Starter/Pro,
// Anpassen der Baustellen-Overage-Menge, Zahlungsmittel ändern oder
// Kündigen läuft über das Stripe Customer Portal (siehe
// stripe-portal-session) — das ist der von Stripe empfohlene Weg für
// Änderungen an einem bereits bestehenden Abo, nicht noch eine Checkout-
// Session.
//
// Enterprise hat bewusst KEINEN Self-Service-Checkout (siehe
// RegistrierungScreen.jsx/PLAN_CONFIG) — individuelle Verträge laufen
// weiterhin über den Supervisor.
//
// Verknüpfung Stripe ↔ Firma: über firmen.stripe_customer_id (nicht über
// Metadata) — das macht die Webhook-Function robuster, siehe
// stripe-webhook/index.ts.
//
// ─── Setup (einmalig, in Stripe Dashboard + Supabase) ───────────────────
// 1. Stripe-Account anlegen, Produkte "Starter" und "Pro" mit jeweils
//    einer wiederkehrenden Monats-Price anlegen (59€/129€).
// 2. Für jeden Plan zusätzlich eine "Zusätzliche Baustelle"-Price anlegen
//    (19€ Starter-Overage, 15€ Pro-Overage), ebenfalls wiederkehrend,
//    pro Einheit (licensed, nicht metered).
// 3. Die vier Price-IDs sowie den Secret Key als Supabase Edge Function
//    Secrets hinterlegen:
//    STRIPE_SECRET_KEY, STRIPE_PRICE_STARTER, STRIPE_PRICE_PRO,
//    STRIPE_PRICE_STARTER_OVERAGE, STRIPE_PRICE_PRO_OVERAGE
// 4. supabase functions deploy stripe-checkout-session

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "npm:stripe@17.4.0";

const SUPABASE_URL     = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";

// Muss exakt zu PLAN_CONFIG in src/config/konstanten.js passen.
const PLAN_PRICE_ENV: Record<string, string> = {
  starter: "STRIPE_PRICE_STARTER",
  pro:     "STRIPE_PRICE_PRO",
};
const OVERAGE_PRICE_ENV: Record<string, string> = {
  starter: "STRIPE_PRICE_STARTER_OVERAGE",
  pro:     "STRIPE_PRICE_PRO_OVERAGE",
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

  let plan: string, returnUrl: string;
  try {
    const body = await req.json();
    plan = typeof body.plan === "string" ? body.plan : "";
    returnUrl = typeof body.returnUrl === "string" ? body.returnUrl : "";
  } catch {
    return json({ error: "Ungültige Anfrage." }, 400);
  }
  if (!PLAN_PRICE_ENV[plan]) {
    return json({ error: "Unbekannter Plan." }, 400);
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
    .from("firmen").select("id, name, email, stripe_customer_id").eq("id", profil.firma_id).maybeSingle();
  if (!firma) return json({ error: "Firma nicht gefunden." }, 404);

  const basePriceId    = Deno.env.get(PLAN_PRICE_ENV[plan]) ?? "";
  const overagePriceId = Deno.env.get(OVERAGE_PRICE_ENV[plan]) ?? "";
  if (!basePriceId || !overagePriceId) {
    return json({ error: "Stripe-Preise für diesen Plan sind serverseitig noch nicht konfiguriert." }, 500);
  }

  const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-12-18.acacia" });

  try {
    let customerId = firma.stripe_customer_id as string | null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        name: firma.name || undefined,
        email: firma.email || undefined,
        metadata: { firma_id: String(firma.id) },
      });
      customerId = customer.id;
      await admin.from("firmen").update({ stripe_customer_id: customerId }).eq("id", firma.id);
    }

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      // adjustable_quantity auf der Overage-Position: der Kunde kann die
      // Anzahl zusätzlicher Baustellen schon beim Checkout selbst wählen,
      // und später im Customer Portal jederzeit anpassen (siehe
      // stripe-webhook, das firmen.max_baustellen danach synchron hält).
      line_items: [
        { price: basePriceId, quantity: 1 },
        { price: overagePriceId, quantity: 0, adjustable_quantity: { enabled: true, minimum: 0, maximum: 100 } },
      ],
      success_url: returnUrl,
      cancel_url: returnUrl,
      locale: "de",
    });

    return json({ url: checkoutSession.url });
  } catch (err) {
    return json({ error: `Stripe-Anfrage fehlgeschlagen: ${err}` }, 502);
  }
});
