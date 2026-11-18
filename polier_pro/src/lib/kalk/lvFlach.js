// Brücke zwischen dem neuen LV-Baum (lvBaum.js) und dem bisherigen flachen
// Positionsformat, das GAEB-Importe (gaeb90.js, gaebXml.js), GAEB-Exporte
// (gaebX84.js, gaeb90Schreiben) und die alte Tabelle angebote verwenden.
//
// Flaches Format alt: Titel als Kopfzeile "── Rohbau / Mauerwerk ──" (ganzer
// Pfad), danach Positionen { oz, bez, langtext, menge, einheit, ep, rabatt,
// art, stlk, kalk, … }. Bedarfs-/Alternativpositionen aus Importen tragen die
// Art als Präfix im Text ("[Bedarfsposition] …"), siehe lib/lv.js.
//
// Flaches Format GAEB-Parser: { typ: "position"|"unterposition"|"hinweis",
// titelPfad: "T01: Rohbau / T0102: Mauerwerk", oz, bez, menge, einheit, ep, stlk }.

import { positionsart } from "../lv.js";
import { baumIndex, neueId, rundeMenge, rundeCent } from "./lvBaum.js";

const ART_PRAEFIX = /^\[(Bedarfsposition[^\]]*|Alternativposition[^\]]*|Zulage[^\]]*|Grundposition|Leitposition)\]\s*/;
const KURZ_MAX = 70;
const ART_SCHLUESSEL = new Set(["normal", "zulage", "bedarf_mit", "bedarf", "alternativ", "pauschal"]);

// Der GAEB-XML-Parser liefert in p.art ein Label ("Bedarfsposition"), alte
// Positionen den Schlüssel ("bedarf") — beides auf den Schlüssel bringen.
function artVon(p) {
  if (ART_SCHLUESSEL.has(p?.art)) return p.art;
  return positionsart({ bez: p?.bez });
}

// Text in Kurz- und Langtext teilen: erste Zeile (gekürzt) als Kurztext,
// der vollständige Text als Langtext, wenn er mehr enthält.
export function texteTeilen(text) {
  const t = String(text || "").replace(/\r\n?/g, "\n").trim();
  if (!t) return { kurztext: "", langtext: "" };
  const ersteZeile = t.split("\n")[0].trim();
  let kurz = ersteZeile;
  if (kurz.length > KURZ_MAX) {
    const schnitt = kurz.lastIndexOf(" ", KURZ_MAX);
    kurz = kurz.slice(0, schnitt > 30 ? schnitt : KURZ_MAX).replace(/[,;:\s]+$/, "") + " …";
  }
  return { kurztext: kurz, langtext: kurz === t ? "" : t };
}

// "T0102: Mauerwerk" → { label: "Mauerwerk", oz: "0102" }
function titelAusGaeb(teil) {
  const m = String(teil || "").match(/^T([\w.]*):\s*(.*)$/);
  return m ? { label: m[2].trim() || `Titel ${m[1]}`, oz: m[1] } : { label: String(teil || "").trim(), oz: "" };
}

// Titel-OZ aus den Positionen darunter: hat eine Position genau so viele
// OZ-Teile wie Titelebenen + 1 ("01.02.0010" unter zwei Titeln), bekommen
// ihre Titel die Präfixe ("01", "01.02"). Sonst (GAEB 90 "0101.10") bleibt
// die OZ aus dem Titelsatz.
function titelOzNachziehen(knoten) {
  const nachId = new Map(knoten.map(k => [k.id, k]));
  const gesetzt = new Set();
  for (const k of knoten) {
    if (k.typ !== "position" || !k.oz) continue;
    const kette = [];
    for (let t = nachId.get(k.parent_id); t; t = nachId.get(t.parent_id)) kette.unshift(t);
    const teile = String(k.oz).split(".").filter(Boolean);
    if (!kette.length || teile.length !== kette.length + 1) continue;
    kette.forEach((t, i) => {
      if (gesetzt.has(t.id)) return;
      t.oz = teile.slice(0, i + 1).join(".");
      gesetzt.add(t.id);
    });
  }
}

// Einheitliche Zwischenform → Knotenliste. eintraege: [{ pfad: [label | { label, oz }…], typ,
// oz, text, langtext?, menge, einheit, ep, rabatt, art, stlk, extra }]
export function flachZuKnoten(eintraege) {
  const knoten = [];
  const titelNachPfad = new Map();
  const sortJeParent = new Map();
  const naechsterSort = parent => {
    const s = (sortJeParent.get(parent) || 0) + 1024;
    sortJeParent.set(parent, s);
    return s;
  };

  const titelFuer = pfad => {
    let parent = null;
    for (let ebene = 0; ebene < pfad.length; ebene++) {
      const teil = typeof pfad[ebene] === "object" ? pfad[ebene] : { label: pfad[ebene], oz: "" };
      const schluessel = pfad.slice(0, ebene + 1).map(x => (typeof x === "object" ? `${x.oz}|${x.label}` : x)).join("\u0000");
      let t = titelNachPfad.get(schluessel);
      if (!t) {
        t = {
          id: neueId(), parent_id: parent, sort: naechsterSort(parent), typ: "titel",
          oz: teil.oz || "", art: "normal",
          kurztext: teil.label || `Titel ${ebene + 1}`, langtext: "",
          menge: 0, einheit: "", ep: 0, rabatt: 0, stlk: null, extra: {},
        };
        titelNachPfad.set(schluessel, t);
        knoten.push(t);
      }
      parent = t.id;
    }
    return parent;
  };

  for (const e of eintraege) {
    const parent = titelFuer(e.pfad || []);
    if (e.typ === "hinweis") {
      const text = String(e.text || "").trim();
      if (!text) continue;
      const { kurztext, langtext } = texteTeilen(text);
      knoten.push({
        id: neueId(), parent_id: parent, sort: naechsterSort(parent), typ: "hinweis",
        oz: "", art: "normal", kurztext, langtext, menge: 0, einheit: "", ep: 0, rabatt: 0, stlk: null, extra: e.extra || {},
      });
      continue;
    }
    const geteilt = e.langtext ? { kurztext: String(e.text || "").trim(), langtext: String(e.langtext).trim() } : texteTeilen(e.text);
    knoten.push({
      id: neueId(), parent_id: parent, sort: naechsterSort(parent), typ: "position",
      oz: e.oz || "", art: e.art || "normal",
      kurztext: geteilt.kurztext, langtext: geteilt.langtext,
      menge: rundeMenge(e.menge), einheit: String(e.einheit || "").trim(),
      ep: rundeCent(e.ep), rabatt: Number(e.rabatt) || 0, stlk: e.stlk || null,
      extra: e.extra || {},
    });
  }
  titelOzNachziehen(knoten);
  return knoten;
}

// GAEB-Parser-Ergebnis ({ positionen }) → Knoten
export function gaebZuKnoten(parsed) {
  const eintraege = (parsed?.positionen || []).map(p => {
    const pfad = p.titelPfad ? p.titelPfad.split(" / ").map(titelAusGaeb).filter(t => t.label || t.oz) : [];
    if (p.typ === "hinweis") return { pfad, typ: "hinweis", text: p.bez };
    const art = artVon(p);
    return {
      pfad, typ: "position", oz: p.oz || "", text: String(p.bez || "").replace(ART_PRAEFIX, ""),
      menge: p.menge, einheit: p.einheit, ep: p.ep, rabatt: 0, art, stlk: p.stlk,
      extra: p.typ === "unterposition" ? { unterposition: true } : {},
    };
  });
  return flachZuKnoten(eintraege);
}

// Alte Angebotspositionen (angebote.positionen) → Knoten
export function altePositionenZuKnoten(positionen) {
  let pfad = [];
  const eintraege = [];
  for (const p of positionen || []) {
    const bez = String(p?.bez || "");
    if (bez.startsWith("──")) {
      pfad = bez.replace(/^──\s*/, "").replace(/\s*──$/, "").split(" / ").map(s => s.trim()).filter(Boolean);
      continue;
    }
    const istHinweis = !p.oz && !(Number(p.menge) > 0) && !(Number(p.ep) > 0) && !p.kalk;
    if (istHinweis) { if (bez.trim()) eintraege.push({ pfad, typ: "hinweis", text: bez }); continue; }
    const extra = {};
    if (p.id != null) extra.alteId = p.id;
    if (p.kalk) extra.altKalk = p.kalk;
    if (bez.startsWith("↳ ")) extra.unterposition = true;
    for (const f of ["aufmass", "eigeneMenge", "kiKalkulation", "copilot", "stammpositionId", "nachtragGrund"]) {
      if (p[f] !== undefined) extra[f] = p[f];
    }
    eintraege.push({
      pfad, typ: "position", oz: p.oz || "",
      text: bez.replace(/^↳\s*/, "").replace(ART_PRAEFIX, ""), langtext: p.langtext || "",
      menge: p.menge, einheit: p.einheit, ep: p.ep, rabatt: p.rabatt, art: artVon(p), stlk: p.stlk, extra,
    });
  }
  return flachZuKnoten(eintraege);
}

// Knoten → altes flaches Format, z. B. für gaebX84Schreiben und gaeb90Schreiben.
// Titelkopfzeilen tragen den ganzen Pfad, Positionen ihre OZ.
export function knotenZuFlach(knoten) {
  const index = baumIndex(knoten);
  const aus = [];
  const lauf = (parent, pfad) => {
    let kopfGeschrieben = false;
    const kopf = () => {
      if (kopfGeschrieben || !pfad.length) return;
      aus.push({ id: `kopf-${aus.length}`, bez: `── ${pfad.join(" / ")} ──`, einheit: "", menge: 0, ep: 0, rabatt: 0 });
      kopfGeschrieben = true;
    };
    for (const k of index.kinderVon(parent)) {
      if (k.typ === "titel") {
        lauf(k.id, [...pfad, k.kurztext || k.oz || "Titel"]);
        kopfGeschrieben = false; // nach einem Untertitel Kopf erneut setzen
        continue;
      }
      kopf();
      if (k.typ === "hinweis") {
        aus.push({ id: k.id, bez: [k.kurztext, k.langtext].filter(Boolean).join("\n"), einheit: "", menge: 0, ep: 0, rabatt: 0 });
        continue;
      }
      aus.push({
        id: k.id, oz: k.oz || undefined, bez: k.kurztext, langtext: k.langtext || "",
        menge: Number(k.menge) || 0, einheit: k.einheit || "", ep: Number(k.ep) || 0, rabatt: Number(k.rabatt) || 0,
        art: k.art === "pauschal" ? "normal" : k.art, ...(k.stlk ? { stlk: k.stlk } : {}),
      });
    }
  };
  lauf(null, []);
  return aus;
}
