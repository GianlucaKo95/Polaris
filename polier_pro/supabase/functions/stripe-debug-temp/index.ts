// Temporäre Diagnose-Function — wird nach der Fehlersuche wieder gelöscht.
// Zeigt die tatsächliche Stripe-Portal-Konfiguration und den aktuellen
// Subscription-Zustand, um zu klären, warum "Plan ändern" im Customer
// Portal nicht angeboten wird, obwohl die Dashboard-Einstellungen korrekt
// aussehen.

import Stripe from "npm:stripe@17.4.0";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-12-18.acacia" });

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), { status, headers: { "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const subscriptionId = url.searchParams.get("subscription_id") ?? "";

  try {
    const configs = await stripe.billingPortal.configurations.list({
      limit: 10,
      expand: ["data.features.subscription_update.products"],
    } as never);
    let subscription = null;
    if (subscriptionId) {
      subscription = await stripe.subscriptions.retrieve(subscriptionId);
    }

    return json({
      configurations: configs.data.map(c => ({
        id: c.id,
        is_default: c.is_default,
        active: c.active,
        updated: c.updated,
        subscription_update: c.features?.subscription_update,
        subscription_update_products: c.features?.subscription_update?.products,
        subscription_cancel: c.features?.subscription_cancel,
      })),
      subscription: subscription ? {
        id: subscription.id,
        status: subscription.status,
        items: subscription.items.data.map(i => ({
          id: i.id,
          price_id: i.price.id,
          quantity: i.quantity,
        })),
      } : null,
    });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});
