// KI-Kalkulation auf dem Ansatzmodell (Phase 3).
//
// Grundsätze (gleich wie die bisherigen KI-Module):
// - Die KI nennt nie einen Preis. Sie wählt Referenzen und Mengen je Einheit;
//   Preise kommen aus den Stammdaten, früheren eigenen Kalkulationen oder dem
//   Einheitspreis-Katalog der Firma.
// - Jede Antwort wird gegen Katalog und Stammdaten geprüft; Ungültiges wird
//   als „offen“ mit Grund gemeldet, nie still repariert.
// - Jeder Vorschlag trägt Quelle, Sicherheit und Begründung und wird erst
//   nach Bestätigung übernommen.
//
// rufeKi(system, messages, tools, toolChoice) liefert die rohe Modellantwort
// (lib/ai.js kiToolAufruf); in Tests wird sie simuliert.

import { katalogBauen, katalogSuchen, katalogEintrag, QUELLEN_LABEL } from "../katalog.js";
import { WERKZEUG as VK_WERKZEUG, systemPrompt as vkSystemPrompt, bausteineText, blockText, vorschlagPruefen, bloecke, BLOCKGROESSE } from "../kiVorkalkulation.js";
import { PRUEF_WERKZEUG, pruefSystemPrompt, sortieren, SCHWERE_REIHENFOLGE } from "../kalkulationsPruefung.js";
import { lvPruefen } from "../lvRisiken.js";
import { baumIndex, neueId, rundeCent, rundeMenge, gpCent } from "./lvBaum.js";
import {
  KOSTENARTEN, KOSTENART_LABEL, MITTELLOHN_ID, standBerechnen, positionEk, epAusSaetzen, bausteinZuAnsaetze,
  kostenartAusKategorie, ansatzMenge, variablenVon, zuschlaegeNormalisieren,
} from "./rechenkern.js";

const kurz = (s, n) => { const t = String(s || "").replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n - 1) + "…" : t; };
const zahlDe = (n, st = 3) => (Number(n) || 0).toLocaleString("de-DE", { maximumFractionDigits: st });
const eur = n => (Number(n) || 0).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
const heute = () => new Date().toISOString().slice(0, 10);
const toolAntwort = (antwort, name) => (antwort?.content || []).find(b => b.type === "tool_use" && b.name === name)?.input || null;

// ── Katalog ───────────────────────────────────────────────────────────────

// Frühere eigene Kalkulationen: kalkulierte Positionen anderer Stände
// vergleiche: [{ projektName, standNummer, knoten, ansaetze }]
export function vergleichsEintraege(vergleiche) {
  const eintraege = [];
  const nachRef = new Map();
  for (const v of vergleiche || []) {
    const ans = new Map();
    for (const a of v.ansaetze || []) { if (!ans.has(a.knoten_id)) ans.set(a.knoten_id, []); ans.get(a.knoten_id).push(a); }
    for (const k of v.knoten || []) {
      const liste = ans.get(k.id);
      if (k.typ !== "position" || !liste?.length || k.extra?.epManuell || !String(k.kurztext || "").trim()) continue;
      const ref = `KP:${k.id}`;
      eintraege.push({ ref, quelle: "kalkulation", bez: k.kurztext, langtext: kurz(k.langtext, 300), gewerk: `${v.istWerte ? "Ist-Werte " : ""}${v.projektName || ""}`.trim(), einheit: k.einheit || "", ep: Number(k.ep) || 0 });
      nachRef.set(ref, { knoten: k, ansaetze: liste, herkunft: `${v.istWerte ? "Ist-Werte aus " : ""}${v.projektName || "Projekt"}, Stand ${v.standNummer ?? ""}`.trim() });
    }
  }
  return { eintraege, nachRef };
}

export function kalkKatalog(stammdaten = {}, vergleiche = []) {
  const basis = katalogBauen({
    stammpositionen: stammdaten.stammpositionen || [], einheitspreise: stammdaten.einheitspreise || [], lvVorlagen: stammdaten.lvVorlagen || [],
    kalkulationspreise: stammdaten.kalkulationspreise || [], standardZuschlaege: stammdaten.standardZuschlaege || null,
  });
  const v = vergleichsEintraege(vergleiche);
  return { katalog: [...v.eintraege, ...basis], vergleich: v.nachRef };
}

// ── Vorkalkulation ────────────────────────────────────────────────────────

export function zuVorkalkulieren(knoten, ansaetze, { alle = false, ids = null } = {}) {
  const mitAnsatz = new Set((ansaetze || []).map(a => a.knoten_id));
  return knoten.filter(k => k.typ === "position" && String(k.kurztext || k.langtext || "").trim()
    && (ids ? ids.includes(k.id) : (alle || (!mitAnsatz.has(k.id) && !(Number(k.ep) > 0)))));
}

export function vkPrompt(kontext) {
  return vkSystemPrompt(kontext).replace("Rufe am Ende genau einmal", `Kandidaten mit KP: sind frühere eigene Kalkulationen der Firma mit fertigen Ansätzen. Passen Leistung und Einheit, haben sie Vorrang vor allen anderen Kandidaten.
9. Rufe am Ende genau einmal`);
}

// Positionen in das Format, das kiVorkalkulation.blockText erwartet
const alsVkPosition = k => ({ id: k.id, oz: k.oz, bez: k.kurztext || kurz(k.langtext, 120), langtext: k.langtext, einheit: k.einheit, menge: k.menge });

export async function vorkalkulieren({ positionen, katalog, kalkulationspreise, kontext, rufeKi, onFortschritt, blockGroesse = BLOCKGROESSE }) {
  const ergebnis = new Map();
  const teile = bloecke(positionen, blockGroesse);
  for (let i = 0; i < teile.length; i++) {
    onFortschritt?.(i + 1, teile.length);
    const nummeriert = teile[i].map((k, j) => {
      const pos = alsVkPosition(k);
      return { nr: j + 1, pos, kandidaten: katalogSuchen(katalog, [pos.bez, kurz(pos.langtext, 160)].filter(Boolean).join(" "), { einheit: pos.einheit || null, max: 5 }) };
    });
    const antwort = await rufeKi(vkPrompt(kontext), [{ role: "user", content: `${bausteineText(kalkulationspreise)}\n\nPositionen:\n${blockText(nummeriert)}` }],
      [VK_WERKZEUG], { type: "tool", name: VK_WERKZEUG.name });
    const liste = toolAntwort(antwort, VK_WERKZEUG.name)?.positionen || [];
    for (const { nr, pos } of nummeriert) {
      const e = liste.find(x => Number(x?.nr) === nr);
      ergebnis.set(pos.id, e ? vorschlagPruefen(e, pos, { katalog, kalkulationspreise })
        : { art: "offen", sicherheit: "niedrig", begruendung: "Die KI hat zu dieser Position nichts geliefert", fehlt: [] });
    }
  }
  return ergebnis;
}

export function quelleText(v, vergleich) {
  if (v.art === "rezeptur") return "Neue Rezeptur aus Kostenbausteinen";
  if (v.art !== "katalog") return "–";
  if (v.eintrag?.quelle === "kalkulation") return `${QUELLEN_LABEL.kalkulation}: ${vergleich?.get(v.ref)?.herkunft || ""}`.trim();
  return `${QUELLEN_LABEL[v.eintrag?.quelle] || v.eintrag?.quelle}: ${kurz(v.eintrag?.bez, 60)}`;
}

// Vorschlag → Änderungspaket für useLvStand (Ansätze + Positionsfelder)
export function vorschlagZuAenderung(k, v, { stammdaten = {}, vergleich = new Map(), bestehendeAnsaetze = [], jetzt = heute() } = {}) {
  if (!v || v.art === "offen") return null;
  const ki = { quelle: v.art === "rezeptur" ? "rezeptur" : v.ref, sicherheit: v.sicherheit, begruendung: v.begruendung, am: jetzt, ...(v.fehlt?.length ? { fehlt: v.fehlt } : {}) };
  const loeschen = bestehendeAnsaetze.filter(a => a.knoten_id === k.id).map(a => a.id);
  let neu = [];
  let variablen = null;
  let ep = null;
  const preise = new Map((stammdaten.kalkulationspreise || []).map(p => [String(p.id), p]));

  if (v.art === "rezeptur") {
    let sort = 0;
    for (const z of v.rezeptur) {
      const p = preise.get(String(z.stammId));
      if (!p) continue;
      neu.push({ id: neueId(), knoten_id: k.id, sort: (sort += 1024), kostenart: kostenartAusKategorie(p.kategorie), ressource_id: String(p.id),
        bezeichnung: p.bezeichnung, einheit: p.einheit || "", menge_je_me: z.mengeJeEinheit, faktor: 1, preis: Number(p.preis) || 0, formel: null, kommentar: "KI-Vorschlag" });
    }
  } else if (v.eintrag?.quelle === "kalkulation") {
    const ref = vergleich.get(v.ref);
    if (!ref) return null;
    neu = ref.ansaetze.map(({ stand_id, firma_id, updated_at, updated_by, ...a }) => ({ ...a, id: neueId(), knoten_id: k.id, kommentar: a.kommentar || `aus ${ref.herkunft}` }));
    const rv = ref.knoten.extra?.variablen;
    if (rv && Object.keys(rv).length) variablen = { ...rv };
  } else if (v.eintrag?.quelle === "stammposition") {
    const sp = (stammdaten.stammpositionen || []).find(s => `SP:${s.id}` === v.ref);
    if (!sp) return null;
    const r = bausteinZuAnsaetze(sp, { knotenId: k.id, stammpositionen: stammdaten.stammpositionen, kalkulationspreise: stammdaten.kalkulationspreise });
    neu = r.ansaetze.map(a => ({ ...a, kommentar: a.kommentar || "KI-Vorschlag" }));
    if (r.variablen) variablen = { ...r.variablen, ...(v.variablen || {}) };
  } else {
    // Einheitspreis, Mutter-LV, Urkalkulation: fertiger EP ohne Aufschlüsselung
    ep = rundeCent(v.eintrag?.ep);
  }
  const extra = { ...(k.extra || {}), ki, ...(variablen ? { variablen: { ...variablen, ...(k.extra?.variablen || {}) } } : {}) };
  if (ep != null) delete extra.epManuell;
  const felder = { extra, ...(ep != null ? { ep } : {}) };
  return { aendern: [{ id: k.id, felder }], ansaetze: { neu, loeschen } };
}

// EP, den der Vorschlag ergäbe (Vorschau in der Prüfliste)
export function vorschauEp(k, v, z, saetze, kontext) {
  const ae = vorschlagZuAenderung(k, v, kontext);
  if (!ae) return null;
  if (!ae.ansaetze.neu.length) return ae.aendern[0].felder.ep ?? null;
  const kNeu = { ...k, ...ae.aendern[0].felder };
  return epAusSaetzen(positionEk(kNeu, ae.ansaetze.neu, z).ekJeMe, saetze);
}

// Viele angenommene Vorschläge zu einem Paket (ein Rückgängig-Schritt)
export function aenderungenBuendeln(liste) {
  const p = { aendern: [], ansaetze: { neu: [], loeschen: [] } };
  for (const ae of liste) {
    if (!ae) continue;
    p.aendern.push(...ae.aendern);
    p.ansaetze.neu.push(...ae.ansaetze.neu);
    p.ansaetze.loeschen.push(...ae.ansaetze.loeschen);
  }
  return p;
}

// ── Prüfung ───────────────────────────────────────────────────────────────

export function aufbauTextKalk(k, ans, z) {
  if (!ans?.length) return k.ep > 0 ? "kein Aufbau (EP als Festpreis)" : "kein Aufbau, kein Preis";
  const vars = variablenVon(k);
  return ans.map(a => {
    const m = ansatzMenge(a, vars);
    const name = a.ressource_id === MITTELLOHN_ID ? "Lohn (Mittellohn)" : a.bezeichnung || KOSTENART_LABEL[a.kostenart];
    return a.kostenart === "fremd" && !a.ressource_id ? `Nachunternehmer ${eur(m * (Number(a.preis) || 0))}` : `${zahlDe(m, 3)} ${a.ressource_id === MITTELLOHN_ID ? "h" : a.einheit || ""} ${name}`;
  }).join(" + ");
}

// Regeln ohne KI: was sicher auffällt
export function regelPruefungKalk(knoten, ansaetze, zRoh, { vergleiche = [] } = {}) {
  const z = zuschlaegeNormalisieren(zRoh);
  const r = standBerechnen(knoten, ansaetze, z);
  const befunde = [];
  const neu = (k, art, schwere, text, vorschlag) => befunde.push({ id: `regel:${k.id}:${befunde.length}`, posId: k.id, quelle: "regel", art, schwere, text, ...(vorschlag ? { vorschlag } : {}) });
  const ansNach = new Map();
  for (const a of ansaetze) { if (!ansNach.has(a.knoten_id)) ansNach.set(a.knoten_id, []); ansNach.get(a.knoten_id).push(a); }
  const vergleichEp = new Map();
  for (const v of vergleiche) for (const k of v.knoten || []) if (k.typ === "position" && k.ep > 0) {
    const s = `${String(k.kurztext).toLowerCase().trim()}|${k.einheit}`;
    if (!vergleichEp.has(s)) vergleichEp.set(s, []);
    vergleichEp.get(s).push(Number(k.ep));
  }
  if (z.modell === "saetze" && KOSTENARTEN.every(ka => !Number(z.saetze[ka])) && r.kalkuliertePositionen) {
    befunde.push({ id: "regel:zuschlaege", posId: null, quelle: "regel", art: "zuschlag", schwere: "hoch", text: "Alle Zuschlagssätze stehen auf 0 %: der EP deckt nur die Einzelkosten.", vorschlag: "Zuschläge im Reiter Zuschläge eintragen." });
  }
  if ([...ansaetze].some(a => a.ressource_id === MITTELLOHN_ID) && !(z.mittellohn > 0)) {
    befunde.push({ id: "regel:mittellohn", posId: null, quelle: "regel", art: "zeitansatz", schwere: "hoch", text: "Lohnansätze rechnen mit dem Mittellohn, der Mittellohn ist aber 0 €/h.", vorschlag: "Mittellohn im Reiter Zuschläge setzen." });
  }
  for (const k of knoten) {
    if (k.typ !== "position") continue;
    const ans = ansNach.get(k.id) || [];
    const e = r.je.get(k.id);
    const zaehlt = k.art !== "bedarf" && k.art !== "alternativ";
    if (!ans.length && !(Number(k.ep) > 0) && zaehlt && Number(k.menge) > 0) neu(k, "preis", "hoch", "Position ohne Preis und ohne Ansätze.", "Vorkalkulieren oder EP eintragen.");
    for (const f of e?.fehler || []) neu(k, "formel", "hoch", f.text, "Formel oder Variablen der Position prüfen.");
    for (const a of ans) {
      if (a.ressource_id !== MITTELLOHN_ID && !(Number(a.preis) > 0)) neu(k, "preis", "mittel", `Ansatz „${a.bezeichnung || KOSTENART_LABEL[a.kostenart]}“ ohne Preis.`);
      if (!(ansatzMenge(a, variablenVon(k)) > 0) && !e?.fehler?.length) neu(k, "menge", "mittel", `Ansatz „${a.bezeichnung || KOSTENART_LABEL[a.kostenart]}“ mit Menge 0.`);
    }
    if (e?.stundenJeMe > 50 && !/^(psch|pauschal|pau)$/i.test(String(k.einheit))) neu(k, "zeitansatz", "mittel", `${zahlDe(e.stundenJeMe, 2)} h je ${k.einheit}: ungewöhnlich hoch.`);
    if (k.extra?.epManuell && e && Math.abs(e.epKalk - Number(k.ep)) > Math.max(1, 0.1 * e.epKalk)) {
      neu(k, "manuell", "hinweis", `Manueller EP ${eur(k.ep)} weicht von der Kalkulation (${eur(e.epKalk)}) ab.`);
    }
    const vgl = vergleichEp.get(`${String(k.kurztext).toLowerCase().trim()}|${k.einheit}`);
    if (vgl?.length && Number(k.ep) > 0) {
      const mittel = vgl.reduce((s, x) => s + x, 0) / vgl.length;
      const abw = (Number(k.ep) - mittel) / mittel;
      if (Math.abs(abw) > 0.25) neu(k, "vergleich", "mittel", `EP ${eur(k.ep)} liegt ${Math.round(abw * 100)} % ${abw > 0 ? "über" : "unter"} früheren eigenen Kalkulationen (Ø ${eur(mittel)}, ${vgl.length}×).`);
    }
  }
  return sortieren(befunde);
}

export const PRUEF_BLOCK_KALK = 40;

export async function kiPruefenKalk({ knoten, ansaetze, z, kontext, rufeKi, onFortschritt }) {
  const index = baumIndex(knoten);
  const reihe = [];
  let nr = 0;
  const lauf = p => { for (const k of index.kinderVon(p)) { if (k.typ === "titel") { reihe.push({ titel: k }); lauf(k.id); } else if (k.typ === "position") reihe.push({ nr: ++nr, k }); } };
  lauf(null);
  const ansNach = new Map();
  for (const a of ansaetze) { if (!ansNach.has(a.knoten_id)) ansNach.set(a.knoten_id, []); ansNach.get(a.knoten_id).push(a); }
  const teile = [];
  let aktuell = [];
  for (const e of reihe) { aktuell.push(e); if (aktuell.filter(x => x.nr).length >= PRUEF_BLOCK_KALK) { teile.push(aktuell); aktuell = []; } }
  if (aktuell.some(x => x.nr)) teile.push(aktuell);
  const befunde = [], fehlend = [];
  for (let i = 0; i < teile.length; i++) {
    onFortschritt?.(i + 1, teile.length);
    const text = teile[i].map(e => e.titel ? `— ${e.titel.oz} ${e.titel.kurztext} —`
      : `#${e.nr}${e.k.oz ? ` | OZ ${e.k.oz}` : ""} | ${zahlDe(e.k.menge)} ${e.k.einheit || ""} | EP ${eur(e.k.ep)} | ${kurz(e.k.kurztext, 140)}`
        + (e.k.langtext ? `\n   Langtext: ${kurz(e.k.langtext, 450)}` : "") + `\n   Aufbau je ${e.k.einheit || "Einheit"}: ${aufbauTextKalk(e.k, ansNach.get(e.k.id), z)}`).join("\n");
    const antwort = await rufeKi(pruefSystemPrompt(kontext), [{ role: "user", content: `Positionen${teile.length > 1 ? ` (Teil ${i + 1} von ${teile.length})` : ""}:\n${text}` }],
      [PRUEF_WERKZEUG], { type: "tool", name: PRUEF_WERKZEUG.name });
    const inp = toolAntwort(antwort, PRUEF_WERKZEUG.name);
    for (const b of inp?.befunde || []) {
      const e = teile[i].find(x => x.nr === Number(b.nr));
      if (!e || !String(b.text || "").trim()) continue;
      befunde.push({ id: `ki:${e.k.id}:${befunde.length}`, posId: e.k.id, quelle: "ki", art: b.art || "sonstiges",
        schwere: SCHWERE_REIHENFOLGE[b.schwere] != null ? b.schwere : "hinweis", text: String(b.text).trim(), ...(b.vorschlag ? { vorschlag: String(b.vorschlag).trim() } : {}) });
    }
    for (const f of inp?.fehlende_leistungen || []) if (f?.text && !fehlend.some(x => x.text === f.text)) fehlend.push({ text: String(f.text).trim(), begruendung: String(f.begruendung || "").trim() });
  }
  return { befunde: sortieren(befunde), fehlend };
}

// ── LV-Risiken ────────────────────────────────────────────────────────────

export function risikoEingabe(knoten) {
  const index = baumIndex(knoten);
  const positionen = [];
  const vorbemerkungen = [];
  const lauf = (p, tiefe) => {
    for (const k of index.kinderVon(p)) {
      if (k.typ === "titel") { positionen.push({ id: k.id, bez: `── ${k.oz} ${k.kurztext} ──` }); lauf(k.id, tiefe + 1); continue; }
      if (k.typ === "hinweis") {
        const t = [k.kurztext, k.langtext].filter(Boolean).join("\n");
        if (tiefe === 0) vorbemerkungen.push(t); else positionen.push({ id: k.id, typ: "hinweis", bez: t });
        continue;
      }
      positionen.push({ id: k.id, oz: k.oz, bez: k.kurztext, langtext: k.langtext, menge: k.menge, einheit: k.einheit, bedarf: k.art === "bedarf" || k.art === "bedarf_mit", alternativ: k.art === "alternativ" });
    }
  };
  lauf(null, 0);
  return { positionen, vorbemerkungen: vorbemerkungen.join("\n\n") };
}

export async function risikenPruefen({ knoten, kontext, rufeKi, onFortschritt }) {
  const { positionen, vorbemerkungen } = risikoEingabe(knoten);
  return lvPruefen({ positionen, vorbemerkungen, kontext, rufeKi, onFortschritt });
}

// ── Befehle in Klartext ───────────────────────────────────────────────────

export const BEFEHL_KALK_WERKZEUG = {
  name: "kalkulation_aendern",
  description: "Gibt die Änderungen ab, die der Befehl an der Kalkulation verlangt.",
  input_schema: {
    type: "object",
    properties: {
      aenderungen: {
        type: "array",
        items: {
          type: "object",
          properties: {
            op: { type: "string", enum: ["ansatz_skalieren", "ressource_preis", "zuschlag_setzen", "mittellohn_setzen", "menge_setzen", "ep_setzen", "text_setzen", "nachlass_setzen"] },
            titel: { type: "string", description: "OZ eines Titels: nur Positionen darunter (z. B. \"03\")" },
            positionen: { type: "array", items: { type: "string" }, description: "OZ der betroffenen Positionen" },
            suchtext: { type: "string", description: "Nur Positionen, deren Text dies enthält (z. B. \"Beton\")" },
            kostenart: { type: "string", enum: KOSTENARTEN },
            ressource: { type: "string", description: "ressource_preis: Name der Ressource wie in der Liste" },
            wert: { type: "number", description: "ansatz_skalieren: Faktor (0,95 = −5 %); ressource_preis: neuer Preis in € (nur wenn genannt); zuschlag_setzen, nachlass_setzen: Prozent; mittellohn_setzen: €/h; menge_setzen: Menge; ep_setzen: EP in € (nur wenn genannt)" },
            kurztext: { type: "string" },
          },
          required: ["op"],
        },
      },
      rueckfrage: { type: "string", description: "Nur wenn der Befehl wirklich mehrdeutig ist" },
    },
    required: ["aenderungen"],
  },
};

export function befehlPromptKalk() {
  return `Du übersetzt Befehle eines Baukalkulators in Änderungen an seiner Kalkulation. Du rechnest nichts selbst aus: du nennst nur, was geändert werden soll; die Software rechnet.

Regeln:
1. Nur was der Befehl verlangt. Prozentangaben als Faktor (−5 % = 0,95) bei ansatz_skalieren, als Prozentzahl bei zuschlag_setzen und nachlass_setzen.
2. Eingrenzung über titel (OZ eines Titels), positionen (OZ-Liste), suchtext und kostenart. Ohne Eingrenzung gilt der Befehl für alle Positionen.
3. Preise und EP nur, wenn der Nutzer sie nennt. Keine erfundenen Zahlen.
4. Ist der Befehl mehrdeutig, liefere keine Änderung und stelle eine kurze rueckfrage.
5. Rufe genau einmal kalkulation_aendern auf.`;
}

export function befehlKontextKalk(knoten, ansaetze, zRoh, { maxPositionen = 400 } = {}) {
  const z = zuschlaegeNormalisieren(zRoh);
  const titel = knoten.filter(k => k.typ === "titel").map(k => `${k.oz} ${k.kurztext}`);
  const pos = knoten.filter(k => k.typ === "position");
  const ressourcen = [...new Set(ansaetze.map(a => (a.ressource_id === MITTELLOHN_ID ? "Mittellohn" : a.bezeichnung)).filter(Boolean))];
  return [
    `Zuschläge: ${z.modell === "endsumme" ? `über die Endsumme (AGK ${z.endsumme.agkProzent} %, W+G ${z.endsumme.wgProzent} %)` : KOSTENARTEN.map(ka => `${KOSTENART_LABEL[ka]} ${z.saetze[ka]} %`).join(", ")}; Mittellohn ${z.mittellohn} €/h`,
    titel.length ? `Titel:\n${titel.join("\n")}` : "Keine Titel",
    `Ressourcen in Ansätzen: ${ressourcen.join(", ") || "keine"}`,
    pos.length <= maxPositionen ? `Positionen (OZ | Text | Menge ME | EP):\n${pos.map(k => `${k.oz} | ${kurz(k.kurztext, 80)} | ${zahlDe(k.menge)} ${k.einheit} | ${eur(k.ep)}`).join("\n")}` : `${pos.length} Positionen (zu viele für eine Liste)`,
  ].join("\n\n");
}

function zielPositionen(knoten, op) {
  const index = baumIndex(knoten);
  let liste = knoten.filter(k => k.typ === "position");
  if (op.titel) {
    const t = knoten.find(k => k.typ === "titel" && k.oz === String(op.titel));
    if (!t) return { liste: [], fehler: `Titel ${op.titel} gibt es nicht` };
    const unter = new Set();
    const lauf = p => { for (const k of index.kinderVon(p)) { unter.add(k.id); lauf(k.id); } };
    lauf(t.id);
    liste = liste.filter(k => unter.has(k.id));
  }
  if (op.positionen?.length) {
    const oz = new Set(op.positionen.map(String));
    const fehlt = [...oz].filter(o => !liste.some(k => k.oz === o));
    liste = liste.filter(k => oz.has(k.oz));
    if (fehlt.length) return { liste, fehler: `OZ ${fehlt.join(", ")} gibt es nicht` };
  }
  if (op.suchtext) {
    const q = String(op.suchtext).toLowerCase();
    liste = liste.filter(k => `${k.kurztext} ${k.langtext}`.toLowerCase().includes(q));
  }
  return { liste, fehler: null };
}

// Änderungen deterministisch ausführen; liefert Paket, neue Zuschläge/Stand-Felder und Klartext
export function befehleKalkAnwenden(knoten, ansaetze, zRoh, aenderungen) {
  const z = zuschlaegeNormalisieren(zRoh);
  let zNeu = null;
  const stand = {};
  const paket = { aendern: [], ansaetze: { aendern: [] } };
  const protokoll = [], fehler = [];
  const ansNach = new Map();
  for (const a of ansaetze) { if (!ansNach.has(a.knoten_id)) ansNach.set(a.knoten_id, []); ansNach.get(a.knoten_id).push(a); }
  for (const op of aenderungen || []) {
    const wert = Number(op.wert);
    if (op.op === "zuschlag_setzen") {
      if (!Number.isFinite(wert)) { fehler.push("Zuschlag ohne Wert"); continue; }
      const basis = zNeu || z;
      if (basis.modell === "endsumme") {
        zNeu = { ...basis, endsumme: { ...basis.endsumme, wgProzent: wert } };
        protokoll.push(`Wagnis und Gewinn auf ${zahlDe(wert, 2)} %`);
      } else {
        const kas = op.kostenart ? [op.kostenart] : KOSTENARTEN;
        zNeu = { ...basis, saetze: { ...basis.saetze, ...Object.fromEntries(kas.map(ka => [ka, wert])) } };
        protokoll.push(`Zuschlag ${op.kostenart ? KOSTENART_LABEL[op.kostenart] : "alle Kostenarten"} auf ${zahlDe(wert, 2)} %`);
      }
      continue;
    }
    if (op.op === "mittellohn_setzen") {
      if (!(wert > 0)) { fehler.push("Mittellohn ohne gültigen Wert"); continue; }
      zNeu = { ...(zNeu || z), mittellohn: wert };
      protokoll.push(`Mittellohn auf ${eur(wert)}/h`);
      continue;
    }
    if (op.op === "nachlass_setzen") {
      if (!Number.isFinite(wert)) { fehler.push("Nachlass ohne Wert"); continue; }
      stand.nachlass = wert;
      protokoll.push(`Nachlass auf ${zahlDe(wert, 3)} %`);
      continue;
    }
    const { liste, fehler: f } = zielPositionen(knoten, op);
    if (f) { fehler.push(f); continue; }
    if (!liste.length) { fehler.push(`Keine Position passt zu „${op.suchtext || op.titel || (op.positionen || []).join(", ")}“`); continue; }
    if (op.op === "ansatz_skalieren") {
      if (!(wert > 0)) { fehler.push("Faktor fehlt"); continue; }
      let n = 0;
      for (const k of liste) for (const a of ansNach.get(k.id) || []) {
        if (op.kostenart && a.kostenart !== op.kostenart) continue;
        const bisher = paket.ansaetze.aendern.find(x => x.id === a.id);
        const faktor = (bisher?.felder.faktor ?? (a.faktor ?? 1)) * wert;
        if (bisher) bisher.felder.faktor = Math.round(faktor * 1e6) / 1e6; else paket.ansaetze.aendern.push({ id: a.id, felder: { faktor: Math.round(faktor * 1e6) / 1e6 } });
        n++;
      }
      protokoll.push(`${n} Ansätze${op.kostenart ? ` (${KOSTENART_LABEL[op.kostenart]})` : ""} in ${liste.length} Positionen × ${zahlDe(wert, 4)}`);
      continue;
    }
    if (op.op === "ressource_preis") {
      if (!(wert >= 0) || !op.ressource) { fehler.push("Ressource oder Preis fehlt"); continue; }
      const q = String(op.ressource).toLowerCase();
      let n = 0;
      for (const k of liste) for (const a of ansNach.get(k.id) || []) {
        if (a.ressource_id === MITTELLOHN_ID || !String(a.bezeichnung).toLowerCase().includes(q)) continue;
        paket.ansaetze.aendern.push({ id: a.id, felder: { preis: wert } });
        n++;
      }
      if (!n) fehler.push(`Keine Ansätze mit „${op.ressource}“`);
      else protokoll.push(`Preis „${op.ressource}“ in ${n} Ansätzen auf ${eur(wert)}`);
      continue;
    }
    if (op.op === "menge_setzen" || op.op === "ep_setzen") {
      if (!Number.isFinite(wert) || wert < 0) { fehler.push("Wert fehlt"); continue; }
      const feld = op.op === "menge_setzen" ? "menge" : "ep";
      for (const k of liste) {
        const felder = feld === "menge" ? { menge: rundeMenge(wert) } : { ep: rundeCent(wert), ...(ansNach.get(k.id)?.length ? { extra: { ...(k.extra || {}), epManuell: true } } : {}) };
        paket.aendern.push({ id: k.id, felder });
      }
      protokoll.push(`${feld === "menge" ? "Menge" : "EP"} von ${liste.map(k => k.oz || kurz(k.kurztext, 20)).join(", ")} auf ${feld === "menge" ? zahlDe(wert) : eur(wert)}`);
      continue;
    }
    if (op.op === "text_setzen") {
      if (!op.kurztext || liste.length !== 1) { fehler.push("Text nur für genau eine Position"); continue; }
      paket.aendern.push({ id: liste[0].id, felder: { kurztext: String(op.kurztext).trim() } });
      protokoll.push(`Kurztext ${liste[0].oz} geändert`);
      continue;
    }
    fehler.push(`Unbekannte Änderung ${op.op}`);
  }
  return { paket, zuschlaege: zNeu, stand, protokoll, fehler };
}

export async function befehlAuswertenKalk({ text, knoten, ansaetze, z, rufeKi }) {
  const antwort = await rufeKi(befehlPromptKalk(), [{ role: "user", content: `${befehlKontextKalk(knoten, ansaetze, z)}\n\nBefehl: ${text}` }],
    [BEFEHL_KALK_WERKZEUG], { type: "tool", name: BEFEHL_KALK_WERKZEUG.name });
  const inp = toolAntwort(antwort, BEFEHL_KALK_WERKZEUG.name);
  return { aenderungen: inp?.aenderungen || [], rueckfrage: inp?.rueckfrage ? String(inp.rueckfrage) : null };
}

// Netto vor/nach einer Befehlsvorschau
export function nettoNach(knoten, ansaetze, z, ergebnis) {
  const anw = (liste, ae) => {
    const m = new Map((ae?.aendern || []).map(x => [x.id, x.felder]));
    return liste.map(x => (m.has(x.id) ? { ...x, ...m.get(x.id) } : x));
  };
  const k2 = anw(knoten, ergebnis.paket);
  const a2 = anw(ansaetze, ergebnis.paket.ansaetze);
  const zz = ergebnis.zuschlaege || z;
  const r = standBerechnen(k2, a2, zz);
  const k3 = anw(k2, { aendern: r.epAenderungen });
  return k3.reduce((s, k) => s + (k.typ === "position" && k.art !== "bedarf" && k.art !== "alternativ" ? gpCent(k) : 0), 0) / 100;
}
