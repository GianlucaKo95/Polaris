// Preisstand je Angebot (Projektpreise und Urkalkulation).
//
// Beim Anlegen eines Angebots werden die Kalkulationspreise, der Mittellohn
// und die Standard-Zuschläge der Firma in das Angebot kopiert
// (angebot.preisstand). Dort lassen sie sich für dieses Projekt ändern —
// Projektmittellohn, Lieferantenpreis für Beton, eigene W&G-Sätze —, ohne
// die Firmenpreise anzufassen. Ein Nachtrag übernimmt den Preisstand seines
// Hauptauftrags (Preisermittlung nach § 2 Abs. 5/6 VOB/B auf Basis der
// Urkalkulation).
//
// Sobald das Angebot angenommen ist, ist der Preisstand eingefroren: er ist
// die Urkalkulation. Spätere Änderungen der Firmenpreise wirken nicht mehr
// auf Aufschlüsselung, Soll-Ist oder EFB dieses Angebots.
//
// preisstand = {
//   erstellt_am, quelle: "firma" | "hauptauftrag" | "nachtraeglich",
//   eingefroren_am: null | iso,
//   kalkulationspreise: [{ id, kategorie, bezeichnung, einheit, preis,
//     firmenpreis,             // Firmenpreis zum Zeitpunkt der Kopie
//     quelle?: { art: "lieferant", name, datum } | { art: "projekt" },
//     lieferantenangebote?: [{ lieferant, preis, gueltig_bis, notiz }] }],
//   mittellohn: { lohngruppen, zulagen, sozialkostenProzent, lohnnebenkosten },
//   zuschlaege: { zuschlagLohn, zuschlagMaterial, zuschlagGeraet, zuschlagFremdleistung, … },
// }

import { mittellohnBerechnen } from "./kalkulationsgrundlagen.js";

const kopie = x => (x == null ? x : JSON.parse(JSON.stringify(x)));
const r2 = n => Math.round((Number(n) || 0) * 100) / 100;

export function preisstandAnlegen({ firmenpreise = [], grundlagen = null, zuschlaege = null, hauptauftrag = null, heute, nachtraeglich = false }) {
  if (hauptauftrag?.preisstand) {
    const p = kopie(hauptauftrag.preisstand);
    return { ...p, erstellt_am: heute, quelle: "hauptauftrag", hauptauftrag_id: hauptauftrag.id ?? null, eingefroren_am: null };
  }
  return {
    erstellt_am: heute, quelle: nachtraeglich ? "nachtraeglich" : "firma", eingefroren_am: null,
    kalkulationspreise: (firmenpreise || []).map(k => ({ ...kopie(k), firmenpreis: Number(k.preis) || 0 })),
    mittellohn: kopie(grundlagen?.mittellohn) || null,
    zuschlaege: kopie(zuschlaege) || null,
  };
}

export const istEingefroren = a => !!a?.preisstand?.eingefroren_am || a?.status === "angenommen" || a?.gesperrt === true;

// Preise, mit denen ein Angebot rechnet (überall: Editor, EFB, Soll-Ist, Cockpit).
export const preiseFuer = (angebot, firmenpreise) => angebot?.preisstand?.kalkulationspreise || firmenpreise || [];
export const zuschlaegeFuer = (angebot, firmenZuschlaege) =>
  angebot?.preisstand?.zuschlaege ? { ...(firmenZuschlaege || {}), ...angebot.preisstand.zuschlaege } : firmenZuschlaege;

export function einfrieren(preisstand, heute) {
  return preisstand && !preisstand.eingefroren_am ? { ...preisstand, eingefroren_am: heute } : preisstand;
}

export function preisSetzen(ps, id, preis, quelle = { art: "projekt" }) {
  return { ...ps, kalkulationspreise: ps.kalkulationspreise.map(k => String(k.id) === String(id) ? { ...k, preis: r2(preis), quelle } : k) };
}

export function preisZuruecksetzen(ps, id, firmenpreise) {
  const f = (firmenpreise || []).find(k => String(k.id) === String(id));
  return { ...ps, kalkulationspreise: ps.kalkulationspreise.map(k => String(k.id) === String(id)
    ? { ...k, preis: Number(f?.preis ?? k.firmenpreis) || 0, firmenpreis: Number(f?.preis ?? k.firmenpreis) || 0, quelle: undefined } : k) };
}

// Projektmittellohn ändern: der abgeleitete Kalkulationslohn (Eintrag mit
// herkunft "mittellohn") zieht mit.
export function mittellohnSetzen(ps, ml) {
  const kl = mittellohnBerechnen(ml).kalkulationslohn;
  return { ...ps, mittellohn: ml, kalkulationspreise: ps.kalkulationspreise.map(k => k.herkunft?.typ === "mittellohn"
    ? { ...k, preis: kl, quelle: Math.abs(kl - (Number(k.firmenpreis) || 0)) > 0.005 ? { art: "mittellohn" } : undefined } : k) };
}

export function projektpreisHinzufuegen(ps, eintrag) {
  const id = eintrag.id ?? `p${Date.now()}`;
  return { ...ps, kalkulationspreise: [...ps.kalkulationspreise, { ...eintrag, id, firmenpreis: null, quelle: { art: "projekt" } }] };
}

export function lieferantenangebotSetzen(ps, id, angebote) {
  return { ...ps, kalkulationspreise: ps.kalkulationspreise.map(k => String(k.id) === String(id) ? { ...k, lieferantenangebote: angebote } : k) };
}

// Gewähltes Lieferantenangebot wird zum Projektpreis.
export function lieferantWaehlen(ps, id, index, heute) {
  const k = ps.kalkulationspreise.find(x => String(x.id) === String(id));
  const l = k?.lieferantenangebote?.[index];
  if (!l) return ps;
  return preisSetzen(ps, id, Number(l.preis), { art: "lieferant", name: l.lieferant, datum: heute });
}

// Unterschiede zwischen Projekt- und Firmenpreisen.
//   projekt — im Angebot bewusst geändert (Lieferant, Projektmittellohn …)
//   firma   — Firmenpreis hat sich seit der Kopie geändert, Projekt noch alt
//   neu     — nur im Projekt angelegt
export function abweichungen(ps, firmenpreise) {
  const firma = new Map((firmenpreise || []).map(k => [String(k.id), Number(k.preis) || 0]));
  const out = [];
  for (const k of ps?.kalkulationspreise || []) {
    const fNeu = firma.get(String(k.id));
    if (k.firmenpreis == null || fNeu == null && k.quelle?.art === "projekt") { out.push({ id: k.id, art: "neu", eintrag: k }); continue; }
    const geaendertImProjekt = Math.abs((Number(k.preis) || 0) - (Number(k.firmenpreis) || 0)) > 0.005;
    if (geaendertImProjekt) out.push({ id: k.id, art: "projekt", eintrag: k, firma: fNeu ?? k.firmenpreis });
    else if (fNeu != null && Math.abs(fNeu - k.firmenpreis) > 0.005) out.push({ id: k.id, art: "firma", eintrag: k, firma: fNeu });
  }
  return out;
}

// Nicht im Projekt geänderte Preise auf den aktuellen Firmenstand bringen
// (nur solange nicht eingefroren). Neue Firmenpreise kommen dazu.
export function firmenpreiseNachziehen(ps, firmenpreise) {
  const vorhanden = new Set(ps.kalkulationspreise.map(k => String(k.id)));
  const nach = ps.kalkulationspreise.map(k => {
    const f = (firmenpreise || []).find(x => String(x.id) === String(k.id));
    if (!f) return k;
    const geaendert = Math.abs((Number(k.preis) || 0) - (Number(k.firmenpreis) || 0)) > 0.005;
    return geaendert ? { ...k, firmenpreis: Number(f.preis) || 0 } : { ...k, ...kopie(f), preis: Number(f.preis) || 0, firmenpreis: Number(f.preis) || 0, quelle: undefined,
      lieferantenangebote: k.lieferantenangebote };
  });
  for (const f of firmenpreise || []) if (!vorhanden.has(String(f.id))) nach.push({ ...kopie(f), firmenpreis: Number(f.preis) || 0 });
  return { ...ps, kalkulationspreise: nach };
}

// Bedarf je Kalkulationspreis aus den Positionskalkulationen (für die
// Lieferantenanfrage): Summe der Postenmengen über alle summenwirksamen
// Positionen.
export function bedarfJePreis(positionen, kategorie = "material") {
  const feld = { lohn: "lohnposten", material: "materialposten", geraet: "geraetPosten" }[kategorie];
  const m = new Map();
  for (const p of positionen || []) {
    if (!p?.kalk || p.art === "bedarf" || p.art === "alternativ") continue;
    for (const x of p.kalk[feld] || []) m.set(String(x.stammId), (m.get(String(x.stammId)) || 0) + (Number(x.menge) || 0));
  }
  return m;
}
