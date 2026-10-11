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

const STARTER_PRICE         = "price_1UPFh0Rz7yITgYqTET5B9Tay";
const PRO_PRICE             = "price_1UPFhhRz7yITgYqTYoJ8C0T7";
const STARTER_OVERAGE_PRICE = "price_1UPFiiRz7yITgYqT6TFUnzTS";
const PRO_OVERAGE_PRICE     = "price_1UPFj8Rz7yITgYqTkrdgjBjK";
const STARTER_PRODUCT       = "prod_VQ5stxDCBU3kUL";
const PRO_PRODUCT           = "prod_VQ5tBBb1BdZA9o";
const STARTER_OVERAGE_PRODUCT = "prod_VQ5ujXGV8y1fNu";
const PRO_OVERAGE_PRODUCT     = "prod_VQ5ui9qjXG442C";

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const subscriptionId = url.searchParams.get("subscription_id") ?? "";
  const fix = url.searchParams.get("fix") === "1";
  const removeItem = url.searchParams.get("remove_item") ?? "";
  const createConfigs = url.searchParams.get("create_configs") === "1";

  try {
    if (createConfigs) {
      const current = await stripe.billingPortal.configurations.list({
        limit: 10,
        expand: ["data.features.subscription_update.products"],
      } as never);
      // deno-lint-ignore no-explicit-any
      const base = current.data.find(c => c.is_default) as any;

      function productsFor(overagePrice: string, overageProduct: string) {
        return [
          { product: STARTER_PRODUCT, prices: [STARTER_PRICE], adjustable_quantity: { enabled: false } },
          { product: PRO_PRODUCT, prices: [PRO_PRICE], adjustable_quantity: { enabled: false } },
          { product: overageProduct, prices: [overagePrice], adjustable_quantity: { enabled: true, minimum: 1, maximum: 100 } },
        ];
      }

      const sharedFeatures = {
        customer_update: base.features.customer_update,
        invoice_history: base.features.invoice_history,
        payment_method_update: base.features.payment_method_update,
        subscription_cancel: base.features.subscription_cancel,
      };

      const starterConfig = await stripe.billingPortal.configurations.create({
        business_profile: base.business_profile,
        features: {
          ...sharedFeatures,
          subscription_update: {
            enabled: true,
            default_allowed_updates: ["price", "quantity"],
            products: productsFor(STARTER_OVERAGE_PRICE, STARTER_OVERAGE_PRODUCT),
          },
        },
      } as never);

      const proConfig = await stripe.billingPortal.configurations.create({
        business_profile: base.business_profile,
        features: {
          ...sharedFeatures,
          subscription_update: {
            enabled: true,
            default_allowed_updates: ["price", "quantity"],
            products: productsFor(PRO_OVERAGE_PRICE, PRO_OVERAGE_PRODUCT),
          },
        },
      } as never);

      return json({ starter_config_id: starterConfig.id, pro_config_id: proConfig.id });
    }

    if (removeItem) {
      const deleted = await stripe.subscriptionItems.del(removeItem);
      return json({ deleted });
    }

    if (fix) {
      const current = await stripe.billingPortal.configurations.list({
        limit: 10,
        expand: ["data.features.subscription_update.products"],
      } as never);
      const config = current.data.find(c => c.is_default) ?? current.data[0];
      // deno-lint-ignore no-explicit-any
      const products = ((config.features?.subscription_update as any)?.products ?? []).map((p: any) => {
        const aq: Record<string, unknown> = { enabled: p.adjustable_quantity.enabled };
        if (p.adjustable_quantity.minimum != null) aq.minimum = p.adjustable_quantity.minimum;
        if (p.adjustable_quantity.maximum != null) aq.maximum = p.adjustable_quantity.maximum;
        if (p.prices.includes(STARTER_OVERAGE_PRICE) || p.prices.includes(PRO_OVERAGE_PRICE)) {
          aq.minimum = 0;
        }
        return { product: p.product, prices: p.prices, adjustable_quantity: aq };
      });
      const updated = await stripe.billingPortal.configurations.update(config.id, {
        features: { subscription_update: { products } },
      } as never);
      return json({ fixed: true, config_id: updated.id });
    }

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
