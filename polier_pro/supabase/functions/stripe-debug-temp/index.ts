// Temporäre Function — legt die zwei plan-spezifischen Customer-Portal-
// Konfigurationen fürs LIVE-Konto an (gleiches Muster wie im Sandbox).
// Wird danach wieder entschärft/entfernt.

import Stripe from "npm:stripe@17.4.0";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-12-18.acacia" });

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), { status, headers: { "Content-Type": "application/json" } });
}

const STARTER_PRICE         = "price_1UPI922NDq8Z1rRrmQZELyDc";
const PRO_PRICE             = "price_1UPI972NDq8Z1rRreu16uuyz";
const STARTER_OVERAGE_PRICE = "price_1UPI972NDq8Z1rRrIdJwEfHe";
const PRO_OVERAGE_PRICE     = "price_1UPI952NDq8Z1rRr2nC2VADo";

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const createConfigs = url.searchParams.get("create_configs") === "1";

  try {
    if (createConfigs) {
      // Produkt-IDs automatisch aus den Price-IDs auflösen, statt sie
      // manuell im Dashboard nachschlagen zu müssen.
      const [starterPrice, proPrice, starterOveragePrice, proOveragePrice] = await Promise.all([
        stripe.prices.retrieve(STARTER_PRICE),
        stripe.prices.retrieve(PRO_PRICE),
        stripe.prices.retrieve(STARTER_OVERAGE_PRICE),
        stripe.prices.retrieve(PRO_OVERAGE_PRICE),
      ]);
      const starterProduct = starterPrice.product as string;
      const proProduct = proPrice.product as string;
      const starterOverageProduct = starterOveragePrice.product as string;
      const proOverageProduct = proOveragePrice.product as string;

      const current = await stripe.billingPortal.configurations.list({
        limit: 10,
        expand: ["data.features.subscription_update.products"],
      } as never);
      // deno-lint-ignore no-explicit-any
      const base = (current.data.find(c => c.is_default) ?? current.data[0]) as any;
      if (!base) return json({ error: "Keine Basis-Konfiguration gefunden — bitte erst Customer Portal settings einmal speichern." }, 400);

      const businessProfile: Record<string, string> = {};
      for (const [k, v] of Object.entries(base.business_profile ?? {})) {
        if (typeof v === "string" && v !== "") businessProfile[k] = v;
      }

      function productsFor(overagePrice: string, overageProduct: string) {
        return [
          { product: starterProduct, prices: [STARTER_PRICE], adjustable_quantity: { enabled: false } },
          { product: proProduct, prices: [PRO_PRICE], adjustable_quantity: { enabled: false } },
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
        business_profile: businessProfile,
        features: {
          ...sharedFeatures,
          subscription_update: {
            enabled: true,
            default_allowed_updates: ["price", "quantity"],
            products: productsFor(STARTER_OVERAGE_PRICE, starterOverageProduct),
          },
        },
      } as never);

      const proConfig = await stripe.billingPortal.configurations.create({
        business_profile: businessProfile,
        features: {
          ...sharedFeatures,
          subscription_update: {
            enabled: true,
            default_allowed_updates: ["price", "quantity"],
            products: productsFor(PRO_OVERAGE_PRICE, proOverageProduct),
          },
        },
      } as never);

      return json({
        starter_config_id: starterConfig.id,
        pro_config_id: proConfig.id,
        resolved_products: { starterProduct, proProduct, starterOverageProduct, proOverageProduct },
      });
    }

    return json({ error: "Kein Parameter übergeben." }, 400);
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});
