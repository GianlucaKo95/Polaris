// ═══════════════════════════════════════════════════════════════════════
// Supabase Edge Function: Sofort-Push bei Kundenportal-Mangelmeldung
// ═══════════════════════════════════════════════════════════════════════
//
// send-push-reminders läuft nur alle 15 Minuten per Cron — für eine gerade
// vom Kunden gemeldete Mängel-Meldung wäre das zu träge. Diese Function wird
// deshalb direkt vom Client aufgerufen (KundenMangelMelden.jsx, im Anschluss
// an die erfolgreiche kundenportal_mangel_melden-RPC) und pusht sofort an
// Bauleiter/Polier/Administrator der Firma.
//
// Öffentlich erreichbar wie die RPC selbst (kein Login des Kunden) — der
// Supabase-Client sendet dafür automatisch den Anon-Key als Bearer-Token,
// der die Standard-JWT-Prüfung der Function Gateway besteht (verify_jwt
// bleibt deshalb true, genau wie bei den anderen Functions dieses Projekts).
// Die EIGENTLICHE Berechtigungsprüfung läuft hier wie bei der RPC über den
// Kundenportal-Token selbst: nur wer einen gültigen, aktiven Token kennt,
// kann überhaupt einen Push auslösen — und auch dann landet die Nachricht
// ausschließlich bei Personal derselben Firma, nie bei beliebigen Nutzern.
//
// Sendet sendeAnSubscriptions/sendeAnRollen aus send-push-reminders/index.ts
// bewusst dupliziert statt geteilt zu importieren — beide Functions sind wie
// ki-proxy/firma-recherche eigenständig deploybar, ein gemeinsames Modul
// wäre für diese ~20 Zeilen unnötige Kopplung.
//
// ─── Deployment (einmalig) ──────────────────────────────────────────────
//   supabase functions deploy kundenportal-mangel-push
//   (nutzt dieselben VAPID_*-Secrets wie send-push-reminders, kein
//   zusätzliches Secret nötig.)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const SUPABASE_URL      = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const VAPID_PUBLIC_KEY  = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const VAPID_SUBJECT     = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@example.com";

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

type PushSub = { id: number; endpoint: string; p256dh: string; auth_key: string };

// Rollen, die bei einer Kundenmeldung informiert werden — dieselbe Auswahl
// wie Eskalations-Stufe 2 (bauleiter) plus polier/administrator, die den
// Mangel operativ triagieren; vorarbeiter bewusst ausgenommen (eingeschränkte
// Bearbeitungsrechte, siehe nurLesen in AufgabenFormular.jsx).
const BENACHRICHTIGTE_ROLLEN = ["bauleiter", "polier", "administrator"];

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // Ohne konfigurierte VAPID-Keys ist Server-Push projektweit deaktiviert
  // (siehe src/lib/push.js) — die Mängelmeldung selbst ist zu diesem
  // Zeitpunkt bereits erfolgreich gespeichert, das hier ist rein additiv,
  // also ein stiller No-Op statt eines Fehlers.
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return json({ ok: true, versendet: 0 });

  let token: string, titel: string;
  try {
    const body = await req.json();
    token = typeof body.token === "string" ? body.token : "";
    titel = typeof body.titel === "string" ? body.titel.slice(0, 200) : "Neuer Mangel";
    if (!token) throw new Error("token fehlt");
  } catch {
    return json({ error: "Ungültiger JSON-Body (erwartet: { token, titel })." }, 400);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: freigabe } = await admin
    .from("kundenportal_freigaben")
    .select("projekt_id, firma_id")
    .eq("token", token).eq("aktiv", true)
    .maybeSingle();
  if (!freigabe) return json({ error: "Ungültiger oder abgelaufener Link." }, 404);

  const { data: projekt } = await admin
    .from("projekte").select("name").eq("id", freigabe.projekt_id).maybeSingle();

  const { data: profile } = await admin
    .from("profile").select("id")
    .eq("firma_id", freigabe.firma_id).in("rolle", BENACHRICHTIGTE_ROLLEN);
  const profilIds = (profile || []).map(p => p.id);
  if (!profilIds.length) return json({ ok: true, versendet: 0 });

  const { data: subs } = await admin
    .from("push_subscriptions").select("*").in("profil_id", profilIds);
  if (!subs?.length) return json({ ok: true, versendet: 0 });

  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

  const payload = JSON.stringify({
    title: "👤 Kunde hat einen Mangel gemeldet",
    body: `${projekt?.name || "Projekt"}: ${titel}`,
    tag: "kundenportal-mangel",
  });

  let versendet = 0;
  for (const sub of subs as PushSub[]) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } },
        payload
      );
      versendet++;
    } catch (err) {
      // 404/410 = Subscription beim Push-Dienst nicht mehr gültig (siehe
      // identische Behandlung in send-push-reminders/index.ts) — aufräumen
      // statt bei jedem künftigen Aufruf erneut zu scheitern.
      const status = (err as { statusCode?: number })?.statusCode;
      if (status === 404 || status === 410) {
        await admin.from("push_subscriptions").delete().eq("id", sub.id);
      }
    }
  }

  return json({ ok: true, versendet });
});
