// Kalkulationsdaten ohne Server: für den Demo-Modus (ohne Supabase-Anmeldung)
// und die Testumgebung. Verhält sich wie speicherSupabase.js inkl. der
// Datenbankregeln (gesperrte Stände unveränderlich, Summe beim Sperren
// eingefroren, Protokoll), damit die Oberfläche in beiden Fällen gleich
// reagiert. Persistenz optional über ein localStorage-ähnliches Objekt.

import { neueId, summen } from "./lvBaum.js";

const SCHLUESSEL = "polaris-kalkulation-demo";
const jetzt = () => new Date().toISOString();
const kopie = x => JSON.parse(JSON.stringify(x));

function leer() {
  return { gesellschaften: [{ id: "g-haupt", name: "Hauptgesellschaft", parent_id: null, kuerzel: "" }], projekte: [], staende: [], knoten: [], ansaetze: [], vergaben: [], protokoll: [] };
}

export function lokalSpeicher({ speicher = null, start = null, verzoegerung = 0 } = {}) {
  let d;
  try { d = speicher ? JSON.parse(speicher.getItem(SCHLUESSEL) || "null") : null; } catch { d = null; }
  if (!d) d = start ? { ...leer(), ...kopie(start) } : leer();
  if (!d.ansaetze) d.ansaetze = [];
  if (!d.vergaben) d.vergaben = [];
  const sichern = () => { try { speicher?.setItem(SCHLUESSEL, JSON.stringify(d)); } catch { /* voll */ } };
  const warte = () => (verzoegerung ? new Promise(r => setTimeout(r, verzoegerung)) : Promise.resolve());
  const fehler = text => { const e = new Error(text); e.nutzerText = text; throw e; };
  const protokoll = (tabelle, datensatz_id, kalk_projekt_id, stand_id, aktion, aenderung) =>
    d.protokoll.push({ id: d.protokoll.length + 1, tabelle, datensatz_id, kalk_projekt_id, stand_id, aktion, aenderung, user_id: "demo", zeit: jetzt() });
  const stand = id => d.staende.find(s => s.id === id) || fehler("Stand nicht gefunden");
  const offen = id => { if (stand(id).gesperrt) fehler("Der Stand ist gesperrt. Für Änderungen einen neuen Stand anlegen."); };
  const standSumme = id => summen(d.knoten.filter(k => k.stand_id === id)).gesamt;

  return {
    art: "lokal",

    async gesellschaftenLaden() { await warte(); return kopie(d.gesellschaften); },

    async projekteLaden() {
      await warte();
      return d.projekte.map(p => {
        const st = d.staende.filter(s => s.kalk_projekt_id === p.id);
        const akt = st.find(s => s.id === p.aktueller_stand) || st.at(-1);
        return { ...kopie(p), staende_anzahl: st.length, summe: akt ? (akt.gesperrt ? Number(akt.summe_netto) : standSumme(akt.id)) : 0,
          positionen: akt ? d.knoten.filter(k => k.stand_id === akt.id && k.typ === "position").length : 0 };
      }).sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
    },

    async projektAnlegen(felder) {
      await warte();
      const p = { id: neueId(), gesellschaft_id: d.gesellschaften[0].id, projekt_id: null, nummer: "", auftraggeber: "", ort: "",
        status: "anfrage", abgabe_am: null, verantwortlich: null, notiz: "", created_at: jetzt(), updated_at: jetzt(), ...felder };
      d.projekte.push(p);
      protokoll("kalk_projekte", p.id, p.id, null, "anlegen", { kurz: p.name });
      const s = { id: neueId(), kalk_projekt_id: p.id, art: "angebot", nummer: 1, bezeichnung: "Angebot", basis_id: null, gesperrt: false,
        freigabe_status: "offen", nachlass: 0, mwst: 19, summe_netto: null, altes_angebot_id: null, created_at: jetzt() };
      d.staende.push(s);
      p.aktueller_stand = s.id;
      sichern();
      return kopie(p);
    },

    async projektAendern(id, felder) {
      await warte();
      const p = d.projekte.find(x => x.id === id) || fehler("Projekt nicht gefunden");
      const diff = {};
      for (const [k, v] of Object.entries(felder)) if (p[k] !== v) diff[k] = [p[k] ?? null, v];
      Object.assign(p, felder, { updated_at: jetzt() });
      if (Object.keys(diff).length) protokoll("kalk_projekte", id, id, null, "aendern", diff);
      sichern();
      return kopie(p);
    },

    async projektLoeschen(id) {
      await warte();
      if (d.staende.some(s => s.kalk_projekt_id === id && s.gesperrt)) fehler("Ein Projekt mit gesperrten Ständen kann nicht gelöscht werden");
      const st = new Set(d.staende.filter(s => s.kalk_projekt_id === id).map(s => s.id));
      d.knoten = d.knoten.filter(k => !st.has(k.stand_id));
      d.ansaetze = d.ansaetze.filter(a => !st.has(a.stand_id));
      d.vergaben = d.vergaben.filter(v => v.kalk_projekt_id !== id);
      d.staende = d.staende.filter(s => !st.has(s.id));
      d.projekte = d.projekte.filter(p => p.id !== id);
      sichern();
    },

    async staendeLaden(projektId) {
      await warte();
      return d.staende.filter(s => s.kalk_projekt_id === projektId).sort((a, b) => a.nummer - b.nummer)
        .map(s => ({ ...kopie(s), summe: s.gesperrt ? Number(s.summe_netto) : standSumme(s.id) }));
    },

    async knotenLaden(standId) {
      await warte();
      return kopie(d.knoten.filter(k => k.stand_id === standId));
    },

    async knotenSpeichern(standId, { neu = [], aendern = [], loeschen = [] }) {
      await warte();
      offen(standId);
      const s = stand(standId);
      const weg = new Set(loeschen);
      for (const k of d.knoten) if (weg.has(k.id) && k.stand_id === standId) protokoll("lv_knoten", k.id, s.kalk_projekt_id, standId, "loeschen", { kurz: k.kurztext });
      d.knoten = d.knoten.filter(k => !(weg.has(k.id) && k.stand_id === standId));
      d.ansaetze = d.ansaetze.filter(a => !(weg.has(a.knoten_id) && a.stand_id === standId));
      for (const a of aendern) {
        const k = d.knoten.find(x => x.id === a.id && x.stand_id === standId);
        if (!k) continue;
        const diff = {};
        for (const [f, v] of Object.entries(a.felder)) if (k[f] !== v) diff[f] = [k[f], v];
        Object.assign(k, a.felder, { updated_at: jetzt() });
        if (Object.keys(diff).length) protokoll("lv_knoten", k.id, s.kalk_projekt_id, standId, "aendern", diff);
      }
      for (const k of neu) {
        if (weg.has(k.id)) continue;
        d.knoten.push({ ...kopie(k), stand_id: standId, updated_at: jetzt() });
        protokoll("lv_knoten", k.id, s.kalk_projekt_id, standId, "anlegen", { kurz: k.kurztext });
      }
      const p = d.projekte.find(x => x.id === s.kalk_projekt_id);
      if (p) p.updated_at = jetzt();
      sichern();
    },

    async knotenImportieren(standId, knoten, anlass = "Import") {
      await warte();
      offen(standId);
      const s = stand(standId);
      for (const k of knoten) d.knoten.push({ ...kopie(k), stand_id: standId, updated_at: jetzt() });
      protokoll("lv_knoten", standId, s.kalk_projekt_id, standId, "anlegen", { kurz: `${anlass}: ${knoten.length} Zeilen` });
      sichern();
      return knoten.length;
    },

    async ansaetzeLaden(standId) {
      await warte();
      return kopie(d.ansaetze.filter(a => a.stand_id === standId));
    },

    async ansaetzeSpeichern(standId, { neu = [], aendern = [], loeschen = [] }) {
      await warte();
      offen(standId);
      const s = stand(standId);
      const weg = new Set(loeschen);
      d.ansaetze = d.ansaetze.filter(a => !(weg.has(a.id) && a.stand_id === standId));
      for (const ae of aendern) {
        const a = d.ansaetze.find(x => x.id === ae.id && x.stand_id === standId);
        if (!a) continue;
        const diff = {};
        for (const [f, v] of Object.entries(ae.felder)) if (a[f] !== v) diff[f] = [a[f], v];
        Object.assign(a, ae.felder);
        if (Object.keys(diff).length) protokoll("kalk_ansaetze", a.id, s.kalk_projekt_id, standId, "aendern", diff);
      }
      for (const a of neu) if (!weg.has(a.id)) { d.ansaetze.push({ ...kopie(a), stand_id: standId }); protokoll("kalk_ansaetze", a.id, s.kalk_projekt_id, standId, "anlegen", { kurz: a.bezeichnung }); }
      sichern();
    },

    async standAendern(id, felder) {
      await warte();
      const s = stand(id);
      if (s.gesperrt && ("nachlass" in felder || "mwst" in felder || "zuschlaege" in felder)) fehler("Ein gesperrter Stand bleibt unverändert");
      Object.assign(s, felder);
      protokoll("kalk_staende", id, s.kalk_projekt_id, id, "aendern", Object.fromEntries(Object.entries(felder).map(([k, v]) => [k, [null, v]])));
      sichern();
      return kopie(s);
    },

    async standSperren(id) {
      await warte();
      const s = stand(id);
      if (s.gesperrt) return kopie(s);
      Object.assign(s, { gesperrt: true, gesperrt_am: jetzt(), gesperrt_von: "demo", summe_netto: standSumme(id) });
      protokoll("kalk_staende", id, s.kalk_projekt_id, id, "aendern", { gesperrt: [false, true] });
      sichern();
      return kopie(s);
    },

    async standKopieren(basisId, art, bezeichnung = "") {
      await warte();
      const b = stand(basisId);
      const nr = Math.max(0, ...d.staende.filter(s => s.kalk_projekt_id === b.kalk_projekt_id).map(s => s.nummer)) + 1;
      const s = { id: neueId(), kalk_projekt_id: b.kalk_projekt_id, art, nummer: nr, bezeichnung, basis_id: b.id, gesperrt: false,
        freigabe_status: "offen", nachlass: b.nachlass, mwst: b.mwst, zuschlaege: kopie(b.zuschlaege || {}), summe_netto: null, altes_angebot_id: null, created_at: jetzt() };
      d.staende.push(s);
      const map = new Map();
      const alt = d.knoten.filter(k => k.stand_id === basisId);
      for (const k of alt) map.set(k.id, neueId());
      for (const k of alt) d.knoten.push({ ...kopie(k), id: map.get(k.id), parent_id: k.parent_id ? map.get(k.parent_id) : null, stand_id: s.id });
      for (const a of d.ansaetze.filter(x => x.stand_id === basisId)) d.ansaetze.push({ ...kopie(a), id: neueId(), knoten_id: map.get(a.knoten_id), stand_id: s.id });
      const p = d.projekte.find(x => x.id === b.kalk_projekt_id);
      p.aktueller_stand = s.id;
      p.updated_at = jetzt();
      protokoll("kalk_staende", s.id, p.id, s.id, "anlegen", { kurz: `${bezeichnung || art} aus Stand ${b.nummer}` });
      sichern();
      return kopie(s);
    },

    // ── Vergaben (Phase 4) ──
    async vergabenLaden(projektId) {
      await warte();
      return kopie(d.vergaben.filter(v => v.kalk_projekt_id === projektId).sort((a, b) => a.nummer - b.nummer));
    },

    async vergabeSpeichern(projektId, v) {
      await warte();
      if (v.stand_id && !d.staende.some(s => s.id === v.stand_id && s.kalk_projekt_id === projektId)) fehler("Der Stand gehört nicht zu diesem Projekt");
      if (v.status === "vergeben" && !v.vergeben_an) fehler("Vergabe ohne Bieter");
      const alt = d.vergaben.find(x => x.id === v.id);
      const neu = { ...kopie(v), kalk_projekt_id: projektId, updated_at: jetzt() };
      if (alt) {
        const diff = {};
        for (const [k, w] of Object.entries(neu)) if (k !== "updated_at" && JSON.stringify(alt[k] ?? null) !== JSON.stringify(w ?? null)) diff[k] = [alt[k] ?? null, w];
        Object.assign(alt, neu);
        if (Object.keys(diff).length) protokoll("kalk_vergaben", v.id, projektId, v.stand_id, "aendern", diff);
      } else {
        neu.nummer = neu.nummer || Math.max(0, ...d.vergaben.filter(x => x.kalk_projekt_id === projektId).map(x => x.nummer)) + 1;
        neu.created_at = jetzt();
        d.vergaben.push(neu);
        protokoll("kalk_vergaben", v.id, projektId, v.stand_id, "anlegen", { kurz: v.titel });
      }
      sichern();
      return kopie(d.vergaben.find(x => x.id === v.id));
    },

    async vergabeLoeschen(id) {
      await warte();
      const v = d.vergaben.find(x => x.id === id);
      if (!v) return;
      d.vergaben = d.vergaben.filter(x => x.id !== id);
      protokoll("kalk_vergaben", id, v.kalk_projekt_id, v.stand_id, "loeschen", { kurz: v.titel });
      sichern();
    },

    async protokollLaden(projektId, { grenze = 200 } = {}) {
      await warte();
      return kopie(d.protokoll.filter(e => e.kalk_projekt_id === projektId).slice(-grenze).reverse());
    },

    async vergleichsKalkulationen({ ausserProjekt = null, grenze = 12 } = {}) {
      await warte();
      const aus = [];
      const projekte = new Set();
      for (const s of [...d.staende].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)) || b.nummer - a.nummer)) {
        if (s.kalk_projekt_id === ausserProjekt || projekte.has(s.kalk_projekt_id)) continue;
        const ansaetze = d.ansaetze.filter(a => a.stand_id === s.id);
        if (!ansaetze.length) continue;
        projekte.add(s.kalk_projekt_id);
        const ids = new Set(ansaetze.map(a => a.knoten_id));
        aus.push({ projektName: d.projekte.find(p => p.id === s.kalk_projekt_id)?.name || "", standNummer: s.nummer,
          knoten: kopie(d.knoten.filter(k => ids.has(k.id))), ansaetze: kopie(ansaetze) });
        if (aus.length >= grenze) break;
      }
      return aus;
    },

    // ── Gesellschaften und Rechte ──
    async gesellschaftSpeichern(g) {
      await warte();
      if (g.id) { const x = d.gesellschaften.find(y => y.id === g.id); Object.assign(x, g); sichern(); return kopie(x); }
      const neu = { id: neueId(), kuerzel: "", parent_id: null, aktiv: true, ...g };
      d.gesellschaften.push(neu);
      sichern();
      return kopie(neu);
    },
    async nutzerLaden() {
      await warte();
      return d.nutzer || [
        { id: "demo", vorname: "Demo", nachname: "Kalkulator", rolle: "administrator" },
        { id: "demo-bl", vorname: "Bea", nachname: "Bauleiterin", rolle: "bauleiter" },
        { id: "demo-po", vorname: "Paul", nachname: "Polier", rolle: "polier" },
      ];
    },
    async rechteLaden() { await warte(); return kopie(d.rechte || []); },
    async rechtSetzen(profilId, gesellschaftId, stufe) {
      await warte();
      d.rechte = (d.rechte || []).filter(r => !(r.profil_id === profilId && (r.gesellschaft_id || null) === (gesellschaftId || null)));
      if (stufe) d.rechte.push({ id: neueId(), profil_id: profilId, gesellschaft_id: gesellschaftId || null, stufe });
      sichern();
    },
    async meinRecht() { return 4; },

    // ── Migration ──
    async bereitsMigriert() {
      await warte();
      return new Set(d.staende.map(s => s.altes_angebot_id).filter(Boolean));
    },

    async planUebernehmen(plan, { onFortschritt } = {}) {
      let n = 0;
      for (const eintrag of plan) {
        let p = eintrag.projekt.projekt_id != null ? d.projekte.find(x => String(x.projekt_id) === String(eintrag.projekt.projekt_id)) : null;
        if (!p) {
          p = { id: neueId(), gesellschaft_id: d.gesellschaften[0].id, nummer: "", abgabe_am: null, verantwortlich: null, notiz: "",
            created_at: jetzt(), updated_at: jetzt(), ...eintrag.projekt };
          d.projekte.push(p);
        }
        let nr = Math.max(0, ...d.staende.filter(s => s.kalk_projekt_id === p.id).map(s => s.nummer));
        eintrag.staende.forEach((st, i) => {
          const s = { id: neueId(), kalk_projekt_id: p.id, art: st.art, nummer: ++nr, bezeichnung: st.bezeichnung, basis_id: null,
            gesperrt: false, freigabe_status: "offen", nachlass: st.nachlass, mwst: st.mwst, summe_netto: null,
            altes_angebot_id: st.altes_angebot_id, created_at: jetzt() };
          d.staende.push(s);
          for (const k of st.knoten) d.knoten.push({ ...kopie(k), stand_id: s.id });
          for (const a of st.ansaetze || []) d.ansaetze.push({ ...kopie(a), stand_id: s.id });
          if (st.zuschlaege) s.zuschlaege = kopie(st.zuschlaege);
          if (st.gesperrt) Object.assign(s, { gesperrt: true, gesperrt_am: jetzt(), summe_netto: standSumme(s.id) });
          if (i === eintrag.aktuellerStandIndex) p.aktueller_stand = s.id;
          protokoll("kalk_staende", s.id, p.id, s.id, "anlegen", { kurz: `Übernahme aus Angebot ${st.altes_angebot_id}` });
          onFortschritt?.(++n);
        });
      }
      sichern();
      return n;
    },
  };
}
