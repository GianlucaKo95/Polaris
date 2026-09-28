// ═══════════════════════════════════════════════════════════════════════
// Supabase Edge Function: KI-Firmenrecherche fürs Onboarding
// ═══════════════════════════════════════════════════════════════════════
//
// Anders als ki-proxy.ts (Key pro Firma) läuft dieser Aufruf, BEVOR eine
// Firma überhaupt existiert — es gibt also noch keinen firmenspezifischen
// Anthropic-Key. Nutzt deshalb einen Plattform-weiten Key (ANTHROPIC_API_KEY
// als Function-Secret), der NUR für diesen einen Onboarding-Schritt gilt.
//
// Absichtlich eng begrenzt, damit dieser Plattform-Key nicht zur
// allgemeinen KI-Nutzung "durchgereicht" wird:
//   - nur für authentifizierte Nutzer OHNE firma_id (also mitten im
//     Onboarding, noch vor der Firmenanlage) — danach übernimmt jede Firma
//     ihre eigenen KI-Kosten über ki-proxy mit dem eigenen Key.
//   - Anthropic-Websuche ist auf max_uses begrenzt.
//
// Nutzt Anthropics serverseitiges Websuche-Tool (web_search_20250305), NICHT
// nur das Sprachmodell allein — die KI erfindet damit keine Firmendaten,
// sondern liest sie aus echten Suchtreffern. Der System-Prompt verlangt
// explizit: nichts raten, unsichere/nicht auffindbare Felder leer (null)
// lassen, und bei Mehrdeutigkeit (mehrere Firmen mit ähnlichem Namen) das
// im Hinweistext offenlegen statt eine davon einfach auszuwählen. Die
// Quellen-URLs gehen mit in die Antwort, damit der Admin (Human in the
// Loop) jeden Fund selbst nachprüfen kann, bevor irgendetwas gespeichert wird.
//
// SETUP (einmalig, nicht über diese Function automatisierbar):
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-... --project-ref <ref>
//   supabase functions deploy firma-recherche
//
// ENDPOINT: https://<supabase-project>.supabase.co/functions/v1/firma-recherche
// Erwartet: Authorization: Bearer <User-JWT>, Body { name: string, ort?: string }
// Antwort:  { firma: {...}, quellen: string[], hinweis: string }
// ═══════════════════════════════════════════════════════════════════════

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const GEWERKE_KEYS = [
  "rohbau", "elektro", "sanitaer", "heizung", "estrich", "innenausbau",
  "fliesen", "tiefbau", "dach", "pv", "maler", "schreiner", "abbruch",
  "vermessung", "garten",
];

function fehlerJSON(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return fehlerJSON("Method not allowed", 405);
  }

  const authHeader = req.headers.get("Authorization") || "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  if (!jwt) return fehlerJSON("Nicht angemeldet.", 401);

  let name: string, ort: string;
  try {
    const body = await req.json();
    name = typeof body.name === "string" ? body.name.trim() : "";
    ort  = typeof body.ort === "string" ? body.ort.trim() : "";
    if (!name) throw new Error("name fehlt");
  } catch {
    return fehlerJSON("Ungültiger JSON-Body (erwartet: { name, ort? }).", 400);
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: userData, error: userError } = await admin.auth.getUser(jwt);
  if (userError || !userData?.user) {
    return fehlerJSON("Sitzung ungültig oder abgelaufen.", 401);
  }

  // Gate: nur für Nutzer OHNE Firma — verhindert, dass der Plattform-Key
  // für laufenden Betrieb (statt nur einmalig beim Onboarding) mitbenutzt wird.
  const { data: profil } = await admin
    .from("profile")
    .select("firma_id")
    .eq("id", userData.user.id)
    .maybeSingle();
  if (profil?.firma_id) {
    return fehlerJSON("Firmenrecherche ist nur beim erstmaligen Einrichten verfügbar.", 403);
  }

  const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
  if (!ANTHROPIC_API_KEY) {
    return fehlerJSON("Firmenrecherche ist serverseitig noch nicht eingerichtet (ANTHROPIC_API_KEY fehlt).", 501);
  }

  const systemPrompt = `Du recherchierst öffentlich zugängliche Basisdaten zu einem deutschen Bauunternehmen anhand von Name und Ort. Nutze das Websuche-Werkzeug, um echte Treffer zu finden (z.B. offizielle Webseite, Handelsregister-Auszüge, Branchenverzeichnisse, Impressum).

KRITISCHE REGELN — unbedingt einhalten:
1. Erfinde NIEMALS einen Wert. Jedes Feld basiert ausschließlich auf tatsächlich gefundenen Suchergebnissen.
2. Ist ein Feld nicht mit ausreichender Sicherheit auffindbar, setze es auf null. Ein leeres/null-Feld ist immer besser als eine Vermutung.
3. Findest du mehrere unterschiedliche Unternehmen mit ähnlichem Namen (auch in anderen Orten), wähle NICHT automatisch eines aus — beschreibe die Mehrdeutigkeit im Feld "hinweis" und lasse betroffene Felder null.
4. "steuernummer" ist in aller Regel NICHT öffentlich auffindbar — lasse dieses Feld so gut wie immer null, rate hier nie.
5. "gewerke" NUR aus dieser festen Liste wählen, nur wenn die Quelle das Gewerk klar nennt: ${GEWERKE_KEYS.join(", ")}.
6. Antworte ausschließlich mit einem einzigen JSON-Objekt, keine Erklärung davor oder danach, kein Markdown-Codeblock.

Antwortformat (exakt diese Struktur):
{
  "firma": {
    "name": "korrekter/vollständiger Firmenname oder der eingegebene Name unverändert",
    "adresse": "Straße + Hausnummer" | null,
    "plz": "Postleitzahl" | null,
    "ort": "Ort" | null,
    "telefon": "Telefonnummer" | null,
    "email": "E-Mail-Adresse" | null,
    "geschaeftsfuehrer": "Name" | null,
    "steuernummer": null,
    "gewerke": ["rohbau", ...],
    "webseite": "https://..." | null
  },
  "quellen": ["https://... tatsächlich konsultierte URLs ..."],
  "hinweis": "Kurzer Klartext: was wurde sicher gefunden, was blieb offen/unsicher, und warum. Leer lassen (\\"\\") nur wenn alles eindeutig war."
}`;

  const userPrompt = `Firma: "${name}"${ort ? `\nOrt: "${ort}"` : ""}`;

  try {
    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-opus-5",
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }],
      }),
    });

    const responseText = await upstream.text();
    if (!upstream.ok) {
      return fehlerJSON(`Anthropic-Anfrage fehlgeschlagen (${upstream.status}): ${responseText.slice(0, 300)}`, upstream.status);
    }

    const data = JSON.parse(responseText);

    if (data.stop_reason === "refusal") {
      return fehlerJSON("Die Recherche wurde vom KI-Sicherheitsfilter abgelehnt. Bitte Firmendaten manuell eintragen.", 422);
    }

    // Bei Websuche-Tools enthält "content" mehrere Blöcke (server_tool_use,
    // web_search_tool_result, text, …) — das Ergebnis-JSON steht im LETZTEN
    // Text-Block, nachdem alle Suchen abgeschlossen sind.
    const textBloecke = (data.content || []).filter((b: any) => b.type === "text");
    const letzterText = textBloecke[textBloecke.length - 1]?.text;
    if (!letzterText) {
      return fehlerJSON("Keine verwertbare Antwort erhalten.", 502);
    }

    let ergebnis;
    try {
      const jsonMatch = letzterText.match(/\{[\s\S]*\}/);
      ergebnis = JSON.parse(jsonMatch ? jsonMatch[0] : letzterText);
    } catch {
      return fehlerJSON("Antwort der KI konnte nicht gelesen werden.", 502);
    }

    // Serverseitige Nachkontrolle: nur bekannte Gewerke-Keys durchlassen,
    // nie ungeprüft, was das Modell zurückgibt.
    if (Array.isArray(ergebnis?.firma?.gewerke)) {
      ergebnis.firma.gewerke = ergebnis.firma.gewerke.filter((g: string) => GEWERKE_KEYS.includes(g));
    }

    return new Response(JSON.stringify({
      firma: ergebnis?.firma || {},
      quellen: Array.isArray(ergebnis?.quellen) ? ergebnis.quellen : [],
      hinweis: typeof ergebnis?.hinweis === "string" ? ergebnis.hinweis : "",
    }), {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (err) {
    return fehlerJSON(`Verbindung zu Anthropic fehlgeschlagen: ${err}`, 502);
  }
});
