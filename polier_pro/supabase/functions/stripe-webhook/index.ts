// ═══════════════════════════════════════════════════════════════════════
// Supabase Edge Function: Stripe-Webhook — hält firmen.plan/plan_status/
// max_baustellen automatisch synchron
// ═══════════════════════════════════════════════════════════════════════
//
// Das Gegenstück zu stripe-checkout-session/stripe-portal-session: Stripe
// ruft DIESE Function auf (nie der Browser), sobald sich am Abo etwas
// ändert — Zahlung erfolgreich, Plan gewechselt, Overage-Menge angepasst,
// Zahlung fehlgeschlagen, gekündigt. Ohne diesen Webhook müsste jemand
// nach jeder Zahlung händisch in der Supervisor-Oberfläche nachpflegen,
// genau das wollten wir mit "automatische Abrechnung" vermeiden.
//
// Verknüpfung Stripe ↔ Firma: AUSSCHLIESSLICH über
// firmen.stripe_customer_id (von stripe-checkout-session VOR dem
// eigentlichen Checkout gesetzt) — nicht über Metadata auf dem Event
// selbst. customer.* steht auf jedem relevanten Event-Typ
// (checkout.session, subscription, invoice) zuverlässig zur Verfügung,
// Metadata-Weitergabe zwischen Checkout → Subscription → Invoice ist das
// nicht immer gleich robust.
//
// Sicherheit: die Signaturprüfung (constructEventAsync, die Web-Crypto-
// Variante für Deno — die synchrone Node-Variante aus dem Stripe-SDK
// funktioniert hier nicht) stellt sicher, dass nur echte, von Stripe
// signierte Events etwas an firmen schreiben können. Ohne sie könnte
// jeder anonyme Aufrufer sich selbst z.B. plan_status='active' setzen.
//
// ─── Setup (einmalig) ────────────────────────────────────────────────────
// 1. supabase functions deploy stripe-webhook
// 2. In Stripe Dashboard → Developers → Webhooks: Endpoint auf
//    https://<project>.supabase.co/functions/v1/stripe-webhook anlegen,
//    Events: checkout.session.completed, customer.subscription.created,
//    customer.subscription.updated, customer.subscription.deleted,
//    invoice.paid, invoice.payment_failed.
// 3. Das von Stripe dabei angezeigte Signing Secret als
//    STRIPE_WEBHOOK_SECRET hinterlegen (Supabase Edge Function Secrets).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "npm:stripe@17.4.0";

const SUPABASE_URL         = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY     = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const STRIPE_SECRET_KEY    = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";

// Muss exakt zu PLAN_CONFIG.inklusiveBaustellen in
// src/config/konstanten.js passen — von dort nicht automatisch
// importierbar, da diese Function in einer separaten Deno-Runtime läuft.
const INKLUSIVE_BAUSTELLEN: Record<string, number> = { starter: 3, pro: 10 };

const PLAN_PRICE_ENV: Record<string, string> = {
  starter: "STRIPE_PRICE_STARTER",
  pro:     "STRIPE_PRICE_PRO",
};
const OVERAGE_PRICE_ENV: Record<string, string> = {
  starter: "STRIPE_PRICE_STARTER_OVERAGE",
  pro:     "STRIPE_PRICE_PRO_OVERAGE",
};

const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-12-18.acacia" });
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

// Liest Basis-Plan + alle Overage-Positionen aus den Subscription-
// Positionen heraus, indem die Price-IDs gegen die bekannten Env-
// Variablen verglichen werden — robuster als sich auf eine feste
// item-Reihenfolge zu verlassen (Stripe garantiert die nicht).
function subscriptionAnalysieren(subscription: Stripe.Subscription) {
  let plan: string | null = null;
  const overageItems: { itemId: string; plan: string; quantity: number }[] = [];
  for (const item of subscription.items.data) {
    const priceId = item.price.id;
    for (const [planKey, envName] of Object.entries(PLAN_PRICE_ENV)) {
      if (priceId === Deno.env.get(envName)) plan = planKey;
    }
    for (const [planKey, envName] of Object.entries(OVERAGE_PRICE_ENV)) {
      if (priceId === Deno.env.get(envName)) overageItems.push({ itemId: item.id, plan: planKey, quantity: item.quantity ?? 0 });
    }
  }
  return { plan, overageItems };
}

// Korrigiert eine zum aktuellen Basis-Plan nicht passende Overage-
// Position — kann entstehen, wenn ein Kunde über das Customer Portal
// zwischen Starter/Pro wechselt: Stripe tauscht dabei nur die Basis-
// Position aus, eine bereits vorhandene Overage-Position (anderer Preis
// für zusätzliche Baustellen je Plan, 19€ Starter / 15€ Pro) bleibt
// unverändert stehen. Ohne diese Korrektur könnte eine Starter-Firma
// nach einem Wechsel zu Pro und zurück auf dem günstigeren Pro-Preis
// "hängen bleiben" — oder eine Pro-Firma würde nach einem Downgrade auf
// Starter weiter zum günstigeren Pro-Preis abgerechnet. Schreibt direkt
// über die Stripe-API zurück, läuft also unabhängig davon, wie die
// Fehlzuordnung entstanden ist (Portal-Wechsel oder jeder andere Weg).
//
// Fehlt die Overage-Position komplett (Regelfall direkt nach dem ersten
// Checkout — stripe-checkout-session darf sie dort aus Stripe-
// Validierungsgründen nicht mitschicken, eine Checkout-Zeile mit
// quantity:0 lehnt Stripe grundsätzlich ab), wird sie hier mit Menge 0
// nachträglich angehängt. Die Subscription-Items-API erlaubt quantity:0
// (anders als Checkout-Zeilen) — erst dadurch taucht die Position im
// Customer Portal überhaupt als anpassbar auf, ohne dass der Kunde beim
// Checkout ungewollt gleich eine zusätzliche Baustelle mitbezahlt.
// Scheitert das Anlegen, wird es bewusst verschluckt statt den ganzen
// Webhook-Durchlauf (inkl. plan/plan_status-Sync) scheitern zu lassen —
// das nächste Subscription-Event versucht es erneut.
async function overagePositionKorrigieren(subscriptionId: string, plan: string, overageItems: { itemId: string; plan: string; quantity: number }[]): Promise<number> {
  const passend = overageItems.find(o => o.plan === plan);
  const unpassend = overageItems.filter(o => o.plan !== plan);
  let overageMenge = passend?.quantity ?? 0;

  for (const falsch of unpassend) {
    if (falsch.quantity === 0) {
      // Nichts zu übernehmen, aber die Position zeigt sonst dauerhaft auf
      // den falschen Preis — trotzdem auf den passenden umstellen.
      await stripe.subscriptionItems.update(falsch.itemId, { price: Deno.env.get(OVERAGE_PRICE_ENV[plan]) });
      continue;
    }
    if (passend) {
      // Menge in der passenden Position zusammenführen, die falsche
      // Position entfernen statt zwei Positionen für dieselbe Sache zu
      // behalten.
      overageMenge = passend.quantity + falsch.quantity;
      await stripe.subscriptionItems.update(passend.itemId, { quantity: overageMenge });
      await stripe.subscriptionItems.del(falsch.itemId);
    } else {
      // Keine passende Position vorhanden — die falsche direkt auf den
      // richtigen Preis ummappen, Menge bleibt erhalten.
      overageMenge = falsch.quantity;
      await stripe.subscriptionItems.update(falsch.itemId, { price: Deno.env.get(OVERAGE_PRICE_ENV[plan]), quantity: falsch.quantity });
    }
  }

  if (!passend && unpassend.length === 0) {
    try {
      await stripe.subscriptionItems.create({
        subscription: subscriptionId,
        price: Deno.env.get(OVERAGE_PRICE_ENV[plan]),
        quantity: 0,
      });
    } catch {
      // Verschluckt — siehe Kommentar oben.
    }
  }

  return overageMenge;
}

// 'trialing'/'incomplete' bewusst nicht auf 'cancelled' gemappt — ein
// fehlgeschlagener erster Zahlungsversuch (z.B. 3-D-Secure noch offen)
// soll die Firma nicht sofort aussperren, sondern als Kulanzfrist
// ('overdue') behandelt werden, siehe PLAN_STATUS_LABEL in
// SupervisorView.jsx.
function planStatusAusSubscription(status: Stripe.Subscription.Status): string {
  switch (status) {
    case "active":   return "active";
    case "canceled": return "cancelled";
    case "past_due":
    case "unpaid":
    case "incomplete":
    case "incomplete_expired":
      return "overdue";
    default: return "active";
  }
}

async function firmaUeberSubscriptionAktualisieren(subscription: Stripe.Subscription) {
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
  const { plan, overageItems } = subscriptionAnalysieren(subscription);

  const update: Record<string, unknown> = {
    stripe_subscription_id: subscription.id,
    plan_status: planStatusAusSubscription(subscription.status),
  };
  if (plan) {
    // overagePositionKorrigieren schreibt bei einer Fehlzuordnung selbst
    // über die Stripe-API zurück — das löst hier wiederum ein neues
    // customer.subscription.updated-Event aus, das dann bereits eine
    // konsistente Zuordnung vorfindet und ohne weitere Korrektur
    // terminiert (kein Endlosschleifen-Risiko).
    const overageMenge = await overagePositionKorrigieren(subscription.id, plan, overageItems);
    update.plan = plan;
    update.max_baustellen = INKLUSIVE_BAUSTELLEN[plan] + overageMenge;
  }

  await admin.from("firmen").update(update).eq("stripe_customer_id", customerId);
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const signature = req.headers.get("stripe-signature") || "";
  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    // constructEventAsync statt constructEvent — die synchrone Variante
    // braucht Node's crypto-Modul, das in der Deno-Edge-Runtime nicht zur
    // Verfügung steht.
    event = await stripe.webhooks.constructEventAsync(rawBody, signature, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return json({ error: `Signaturprüfung fehlgeschlagen: ${err}` }, 400);
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.subscription && typeof session.subscription === "string") {
          const subscription = await stripe.subscriptions.retrieve(session.subscription);
          await firmaUeberSubscriptionAktualisieren(subscription);
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        // Bewusst NICHT event.data.object direkt verwenden: Stripe
        // garantiert keine Zustellung in Entstehungsreihenfolge. Ein
        // "created"-Event mit Status "incomplete" (Zahlung noch nicht
        // verbucht) kann nach einem "updated"-Event mit Status "active"
        // ankommen und den korrekten Stand sonst wieder überschreiben —
        // genau das ist beim ersten Live-Test passiert (Zahlung bei
        // Stripe sofort erfolgreich, firmen.plan_status blieb trotzdem auf
        // "overdue" hängen). Ein frischer Abruf liefert immer den
        // aktuellen Stand, unabhängig von der Ankunftsreihenfolge.
        const subscriptionId = (event.data.object as Stripe.Subscription).id;
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        await firmaUeberSubscriptionAktualisieren(subscription);
        break;
      }
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
        await admin.from("firmen").update({ plan_status: "cancelled" }).eq("stripe_customer_id", customerId);
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
        if (customerId) {
          await admin.from("firmen")
            .update({ plan_status: "overdue" })
            .eq("stripe_customer_id", customerId)
            .neq("plan_status", "cancelled");
        }
        break;
      }
      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
        if (customerId) {
          // Nur aus einer Zahlungs-Kulanzfrist zurückholen, nie aus einem
          // bewusst gekündigten Abo (plan_status='cancelled') — eine
          // verspätet verbuchte alte Rechnung soll ein Abo nicht
          // versehentlich reaktivieren.
          await admin.from("firmen")
            .update({ plan_status: "active" })
            .eq("stripe_customer_id", customerId)
            .eq("plan_status", "overdue");
        }
        break;
      }
      default:
        break;
    }
  } catch (err) {
    return json({ error: `Verarbeitung fehlgeschlagen: ${err}` }, 500);
  }

  return json({ received: true });
});
