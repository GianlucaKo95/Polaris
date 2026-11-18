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
    // Unterbeschreibung einer Leitposition (GAEB 90 Satzart 24): eigener Text,
    // aber keine eigene OZ und kein eigener Preis — als Hinweis unter der Leitposition
    if (p.typ === "unterposition") {
      const nr = p.unterNr ? `Unterbeschreibung ${p.unterNr}` : "Unterbeschreibung";
      return { pfad, typ: "hinweis", text: `${nr}: ${p.bez || ""}`,
        extra: { unterbeschreibung: true, leitOz: p.leitOz || null, unterNr: p.unterNr || null, menge: Number(p.menge) || 0, einheit: p.einheit || "" } };
    }
    const art = artVon(p);
    return {
      pfad, typ: "position", oz: p.oz || "", text: String(p.bez || "").replace(ART_PRAEFIX, ""),
      menge: p.menge, einheit: p.einheit, ep: p.ep, rabatt: 0, art, stlk: p.stlk,
      extra: {},
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

// Knoten → altes flaches Format für gaebX84Schreiben (X83/X84).
//
// Der Schreiber leitet die GAEB-Gliederung aus den OZ-Teilen ab. Damit das
// auch für LVs aus GAEB 90 passt ("0101.10" unter den Titeln "01" und "0101"),
// wird je Position eine Export-OZ mit genau einem Teil je Titelebene gebildet
// ("01.01.10"). Positionen ohne Titel bekommen einen Titel "00 Allgemein"
// (oder "01 Leistungsverzeichnis", wenn das LV gar keine Titel hat).
// Unterbeschreibungen werden an den Langtext ihrer Leitposition angehängt.
export function knotenZuFlach(knoten) {
  const index = baumIndex(knoten);
  const hatTitel = knoten.some(k => k.typ === "titel");
  const aus = [];
  let letztePosition = null;

  const relativ = (kette, i) => {
    const t = kette[i];
    const vorher = i > 0 ? kette[i - 1].oz : "";
    let teil = String(t.oz || "");
    if (vorher && teil.startsWith(vorher) && teil.length > vorher.length) teil = teil.slice(vorher.length).replace(/^\./, "");
    else if (teil.includes(".")) teil = teil.split(".").at(-1);
    if (!teil) teil = String(index.kinderVon(t.parent_id ?? null).filter(x => x.typ === "titel").indexOf(t) + 1).padStart(2, "0");
    return teil;
  };

  const exportOz = (k, kette) => {
    if (!k.oz) return undefined;
    const teile = String(k.oz).split(".").filter(Boolean);
    if (kette.length && teile.length === kette.length + 1) return k.oz;
    const titelTeile = kette.length ? kette.map((_, i) => relativ(kette, i)) : [hatTitel ? "00" : "01"];
    let item = teile.length > 1 ? teile.at(-1) : String(k.oz);
    const letzter = kette.at(-1)?.oz;
    if (teile.length === 1 && letzter && item.startsWith(letzter) && item.length > letzter.length) item = item.slice(letzter.length);
    return [...titelTeile, item].join(".");
  };

  const lauf = (parent, kette) => {
    let kopfGeschrieben = false;
    const pfad = kette.length ? kette.map(t => t.kurztext || t.oz || "Titel") : [hatTitel ? "Allgemein" : "Leistungsverzeichnis"];
    const kopf = () => {
      if (kopfGeschrieben) return;
      aus.push({ id: `kopf-${aus.length}`, bez: `── ${pfad.join(" / ")} ──`, einheit: "", menge: 0, ep: 0, rabatt: 0 });
      kopfGeschrieben = true;
    };
    for (const k of index.kinderVon(parent)) {
      if (k.typ === "titel") {
        lauf(k.id, [...kette, k]);
        kopfGeschrieben = false; // nach einem Untertitel Kopf erneut setzen
        continue;
      }
      if (k.typ === "hinweis") {
        const text = [k.kurztext, k.langtext].filter(Boolean).join("\n");
        if (k.extra?.unterbeschreibung && letztePosition) {
          const m = Number(k.extra.menge) ? ` (${String(k.extra.menge).replace(".", ",")} ${k.extra.einheit || ""})`.replace(/ \)$/, ")") : "";
          letztePosition.langtext = [letztePosition.langtext, `${text}${m}`].filter(Boolean).join("\n");
          continue;
        }
        kopf();
        aus.push({ id: k.id, bez: text, einheit: "", menge: 0, ep: 0, rabatt: 0 });
        continue;
      }
      kopf();
      letztePosition = {
        id: k.id, oz: exportOz(k, kette), bez: k.kurztext, langtext: k.langtext || "",
        menge: Number(k.menge) || 0, einheit: k.einheit || "", ep: Number(k.ep) || 0, rabatt: Number(k.rabatt) || 0,
        art: k.art === "pauschal" ? "normal" : k.art, ...(k.stlk ? { stlk: k.stlk } : {}),
      };
      aus.push(letztePosition);
    }
  };
  lauf(null, []);
  return aus;
}
