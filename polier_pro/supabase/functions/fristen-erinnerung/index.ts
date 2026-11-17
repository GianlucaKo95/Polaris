// Polaris – fristen-erinnerung
//
// Tägliche E-Mail an Geschäftsführung, Administration und Bauleitung mit
// fälligen Fristen, Bürgschaften, Geräteprüfungen und Regieberichten. Die
// Regeln stehen in src/lib/erinnerung.js und kommen gebündelt als logik.js
// mit (npm run funktionen) — Browser-Vorschau und Mail rechnen identisch.
//
// Zwei Aufrufe:
//   1. Täglicher Lauf (pg_cron, siehe supabase-kalkulation.sql Abschnitt 1.77)
//      mit Authorization: Bearer <SERVICE_ROLE_KEY>. Für jede Firma mit
//      firmen.erinnerung_einstellungen.aktiv = true: Punkte berechnen, nach
//      Rhythmus entscheiden, an alle Empfänger einzeln senden. erinnerung_log
//      (unique firma_id + tag) verhindert doppelte Mails an einem Tag und
//      merkt sich, welche Punkte schon gemeldet wurden.
//   2. Testmail aus der App ({ "test": true }) mit dem JWT eines Administrators
//      oder Geschäftsführers: geht nur an diese Person, ohne Rhythmus und Log.
//
// ─── Deployment (einmalig) ──────────────────────────────────────────────
//   supabase functions deploy fristen-erinnerung
//   supabase secrets set \
//     RESEND_API_KEY=<API-Key von resend.com, Domain dort verifiziert> \
//     ERINNERUNG_ABSENDER="Polaris <erinnerung@deine-domain.de>" \
//     APP_URL=https://polier.heimdns.de

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { erinnerungsPunkte, erinnerungPlanen, erinnerungBetreff, erinnerungHtml, ERINNERUNG_STANDARD } from "./logik.js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const ABSENDER = Deno.env.get("ERINNERUNG_ABSENDER") || "";
const APP_URL = Deno.env.get("APP_URL") || "";
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info" };
const antwort = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const heuteBerlin = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date());
const BUERO = ["administrator", "geschaeftsfuehrer", "bauleiter"];

async function sendeMail(an: string, betreff: string, html: string) {
  if (!RESEND_API_KEY || !ABSENDER) throw new Error("RESEND_API_KEY oder ERINNERUNG_ABSENDER fehlt");
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: ABSENDER, to: [an], subject: betreff, html }),
  });
  if (!r.ok) throw new Error(`Versand an ${an} fehlgeschlagen: ${r.status} ${await r.text()}`);
}

async function firmenDaten(firmaId: number) {
  const [projekte, fristen, sicherheiten, geraete, regie] = await Promise.all([
    supabase.from("projekte").select("*").eq("firma_id", firmaId),
    supabase.from("fristen").select("*").eq("firma_id", firmaId),
    supabase.from("sicherheiten").select("*").eq("firma_id", firmaId),
    supabase.from("geraete").select("*").eq("firma_id", firmaId),
    supabase.from("regieberichte").select("id,projekt_id,nummer,datum,status,eingereicht_am,beanstandung,abgerechnet_in").eq("firma_id", firmaId),
  ]);
  return {
    projekte: projekte.data || [], fristen: fristen.data || [], sicherheiten: sicherheiten.data || [],
    geraete: geraete.data || [], regieberichte: regie.data || [],
  };
}

// E-Mail-Adressen der Empfänger. Benutzernamen-Konten (…@firmaN.polaris.local)
// haben kein echtes Postfach und werden übersprungen.
async function empfaenger(firmaId: number, rollen: string[], nurProfil?: string) {
  let q = supabase.from("profile").select("id,vorname,rolle,aktiv,erinnerung_email").eq("firma_id", firmaId);
  if (nurProfil) q = q.eq("id", nurProfil);
  const { data } = await q;
  const liste: { id: string; email: string }[] = [];
  for (const p of data || []) {
    if (!nurProfil && (p.aktiv === false || p.erinnerung_email === false || !rollen.includes(p.rolle))) continue;
    const { data: u } = await supabase.auth.admin.getUserById(p.id);
    const email = u?.user?.email;
    if (email && !/\.polaris\.local$/i.test(email)) liste.push({ id: p.id, email });
  }
  return liste;
}

async function firmaBearbeiten(firma: { id: number; name: string; erinnerung_einstellungen: any; lohn_einstellungen: any; regie_einstellungen: any }, heute: string, test?: { profilId: string }) {
  const einst = { ...ERINNERUNG_STANDARD, ...(firma.erinnerung_einstellungen || {}) };
  const daten = await firmenDaten(firma.id);
  const punkte = erinnerungsPunkte({ ...daten, heute, vorlaufTage: einst.vorlaufTage, land: firma.lohn_einstellungen?.bundesland || "NW",
    fristWerktage: firma.regie_einstellungen?.fristWerktage || 6 });

  if (test) {
    const an = await empfaenger(firma.id, BUERO, test.profilId);
    if (!an.length) return { gesendet: 0, punkte: punkte.length, hinweis: "Für dein Konto ist keine echte E-Mail-Adresse hinterlegt" };
    const plan = { neu: punkte, weiter: [] };
    await sendeMail(an[0].email, `[Test] ${punkte.length ? erinnerungBetreff(plan) : "Polaris: nichts fällig"}`,
      erinnerungHtml({ firmaName: firma.name, ...plan, heute, appUrl: APP_URL, esc }));
    return { gesendet: 1, punkte: punkte.length };
  }

  const seit = new Date(Date.parse(heute) - 30 * 86400000).toISOString().slice(0, 10);
  const { data: log } = await supabase.from("erinnerung_log").select("schluessel").eq("firma_id", firma.id).gte("tag", seit);
  const gemeldet = (log || []).flatMap((l: { schluessel: string[] }) => l.schluessel || []);
  const plan = erinnerungPlanen({ punkte, gemeldet, heute, rhythmus: einst.rhythmus });
  if (!plan.senden) return { gesendet: 0, punkte: punkte.length };

  // Tag beanspruchen, bevor gesendet wird: ein zweiter Lauf am selben Tag scheitert hier am unique-Index
  const { error: belegt } = await supabase.from("erinnerung_log").insert({ firma_id: firma.id, tag: heute, schluessel: punkte.map(p => p.schluessel) });
  if (belegt) return { gesendet: 0, punkte: punkte.length, hinweis: "heute schon gesendet" };

  const an = await empfaenger(firma.id, einst.rollen);
  const betreff = erinnerungBetreff(plan);
  const html = erinnerungHtml({ firmaName: firma.name, ...plan, heute, appUrl: APP_URL, esc });
  let gesendet = 0;
  const fehler: string[] = [];
  for (const e of an) {
    try { await sendeMail(e.email, betreff, html); gesendet++; } catch (err) { fehler.push(String((err as Error).message)); }
  }
  await supabase.from("erinnerung_log").update({ empfaenger: gesendet, fehler: fehler.length ? fehler : null }).eq("firma_id", firma.id).eq("tag", heute);
  return { gesendet, punkte: punkte.length, fehler };
}

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const body = await req.json().catch(() => ({}));
  const heute = heuteBerlin();

  try {
    if (body?.test) {
      const { data: u, error } = await supabase.auth.getUser(token);
      if (error || !u?.user) return antwort({ fehler: "Nicht angemeldet" }, 401);
      const { data: p } = await supabase.from("profile").select("firma_id,rolle").eq("id", u.user.id).single();
      if (!p || !["administrator", "geschaeftsfuehrer"].includes(p.rolle)) return antwort({ fehler: "Nur Administration und Geschäftsführung" }, 403);
      const { data: f } = await supabase.from("firmen").select("id,name,erinnerung_einstellungen,lohn_einstellungen,regie_einstellungen").eq("id", p.firma_id).single();
      return antwort(await firmaBearbeiten(f, heute, { profilId: u.user.id }));
    }

    // Täglicher Lauf: nur mit dem Service-Role-Key, damit niemand von außen Mails auslösen kann
    if (token !== SERVICE_ROLE_KEY) return antwort({ fehler: "Nicht erlaubt" }, 401);
    const { data: firmen } = await supabase.from("firmen").select("id,name,erinnerung_einstellungen,lohn_einstellungen,regie_einstellungen")
      .filter("erinnerung_einstellungen->>aktiv", "eq", "true");
    const ergebnis: Record<string, unknown> = {};
    for (const f of firmen || []) {
      try { ergebnis[f.id] = await firmaBearbeiten(f, heute); } catch (err) { ergebnis[f.id] = { fehler: String((err as Error).message) }; }
    }
    return antwort({ heute, ergebnis });
  } catch (err) {
    return antwort({ fehler: String((err as Error).message) }, 500);
  }
});
