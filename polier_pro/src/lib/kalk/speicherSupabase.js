// Kalkulationsdaten in Supabase (Tabellen aus supabase-kalkulation-v2.sql).
// Gleiche Schnittstelle wie speicherLokal.js. Rechte, Sperren und Protokoll
// setzt die Datenbank durch; hier wird nur gelesen und geschrieben.

import { sbClientMitToken } from "../supabase.js";

const KNOTEN_FELDER = ["id", "parent_id", "sort", "typ", "oz", "art", "kurztext", "langtext", "menge", "einheit", "ep", "rabatt", "stlk", "extra"];
const BLOCK = 500;

function nutzerFehler(error, standard = "Speichern fehlgeschlagen") {
  const roh = error?.message || "";
  let text = standard;
  if (/gesperrt/i.test(roh)) text = roh;
  else if (/row-level security|Berechtigung|permission/i.test(roh)) text = "Dafür fehlt dir die Berechtigung.";
  else if (/schema cache|does not exist|PGRST20[25]/i.test(`${roh} ${error?.code || ""}`)) text = "Die Kalkulationstabellen fehlen noch. Bitte supabase-kalkulation-v2.sql in Supabase ausführen.";
  else if (/fetch|network|Failed/i.test(roh)) text = "Keine Verbindung zum Server.";
  const e = new Error(text);
  e.nutzerText = text;
  e.ursache = error;
  return e;
}

const pruefe = ({ data, error }, standard) => { if (error) throw nutzerFehler(error, standard); return data; };
const zeile = (k, standId, firmaId) => ({ ...Object.fromEntries(KNOTEN_FELDER.map(f => [f, k[f] ?? null])), extra: k.extra || {}, stand_id: standId, firma_id: firmaId });

async function inBloecken(liste, fn) {
  for (let i = 0; i < liste.length; i += BLOCK) await fn(liste.slice(i, i + BLOCK));
}

export function supabaseSpeicher({ session, firmaId }) {
  const db = () => sbClientMitToken(session);

  async function summenFuer(standIds) {
    if (!standIds.length) return new Map();
    const rows = pruefe(await db().from("kalk_stand_summen").select("stand_id, positionen, netto").in("stand_id", standIds), "Summen nicht geladen");
    return new Map(rows.map(r => [r.stand_id, r]));
  }

  return {
    art: "supabase",

    async gesellschaftenLaden() {
      return pruefe(await db().from("gesellschaften").select("*").order("name"), "Gesellschaften nicht geladen");
    },

    async projekteLaden() {
      const projekte = pruefe(await db().from("kalk_projekte").select("*").order("updated_at", { ascending: false }), "Projekte nicht geladen");
      const staende = projekte.length
        ? pruefe(await db().from("kalk_staende").select("id, kalk_projekt_id, nummer, gesperrt, summe_netto").in("kalk_projekt_id", projekte.map(p => p.id)), "Stände nicht geladen")
        : [];
      const aktuelle = projekte.map(p => staende.find(s => s.id === p.aktueller_stand) || staende.filter(s => s.kalk_projekt_id === p.id).sort((a, b) => b.nummer - a.nummer)[0]).filter(Boolean);
      const sm = await summenFuer(aktuelle.filter(s => !s.gesperrt).map(s => s.id));
      const posZahl = await summenFuer(aktuelle.filter(s => s.gesperrt).map(s => s.id));
      return projekte.map(p => {
        const akt = aktuelle.find(s => s.kalk_projekt_id === p.id);
        const z = akt ? (sm.get(akt.id) || posZahl.get(akt.id)) : null;
        return { ...p, staende_anzahl: staende.filter(s => s.kalk_projekt_id === p.id).length,
          summe: akt ? (akt.gesperrt ? Number(akt.summe_netto) : Number(z?.netto || 0)) : 0, positionen: Number(z?.positionen || 0) };
      });
    },

    async projektAnlegen(felder) {
      let gesellschaft = felder.gesellschaft_id;
      if (!gesellschaft) gesellschaft = (await this.gesellschaftenLaden()).find(g => !g.parent_id)?.id;
      const p = pruefe(await db().from("kalk_projekte").insert({ ...felder, firma_id: firmaId, gesellschaft_id: gesellschaft }).select().single(), "Projekt nicht angelegt");
      const s = pruefe(await db().from("kalk_staende").insert({ firma_id: firmaId, kalk_projekt_id: p.id, art: "angebot", nummer: 1, bezeichnung: "Angebot" }).select().single(), "Stand nicht angelegt");
      return pruefe(await db().from("kalk_projekte").update({ aktueller_stand: s.id }).eq("id", p.id).select().single(), "Projekt nicht gespeichert");
    },

    async projektAendern(id, felder) {
      return pruefe(await db().from("kalk_projekte").update(felder).eq("id", id).select().single(), "Projekt nicht gespeichert");
    },

    async projektLoeschen(id) {
      pruefe(await db().from("kalk_projekte").delete().eq("id", id), "Projekt nicht gelöscht");
    },

    async staendeLaden(projektId) {
      const st = pruefe(await db().from("kalk_staende").select("*").eq("kalk_projekt_id", projektId).order("nummer"), "Stände nicht geladen");
      const sm = await summenFuer(st.filter(s => !s.gesperrt).map(s => s.id));
      return st.map(s => ({ ...s, summe: s.gesperrt ? Number(s.summe_netto) : Number(sm.get(s.id)?.netto || 0) }));
    },

    async knotenLaden(standId) {
      // Seitenweise, damit auch LVs mit 20.000 Zeilen vollständig ankommen
      const alle = [];
      for (let von = 0; ; von += 1000) {
        const teil = pruefe(await db().from("lv_knoten").select(KNOTEN_FELDER.join(",")).eq("stand_id", standId).order("id").range(von, von + 999), "LV nicht geladen");
        alle.push(...teil);
        if (teil.length < 1000) break;
      }
      return alle.map(k => ({ ...k, menge: Number(k.menge), ep: Number(k.ep), rabatt: Number(k.rabatt) }));
    },

    // aktuell: Knotenliste NACH der Änderung (für vollständige Zeilen beim Upsert)
    async knotenSpeichern(standId, { neu = [], aendern = [], loeschen = [] }, { aktuell = [] } = {}) {
      const nachId = new Map(aktuell.map(k => [k.id, k]));
      if (loeschen.length) await inBloecken(loeschen, async ids => pruefe(await db().from("lv_knoten").delete().in("id", ids).eq("stand_id", standId)));
      const geaendert = aendern.map(a => nachId.get(a.id) || null).filter(Boolean);
      const schreiben = [...neu.filter(k => !loeschen.includes(k.id)).map(k => nachId.get(k.id) || k), ...geaendert];
      // Eltern vor Kindern, damit der Fremdschlüssel bei neuen Unterbäumen passt
      const ids = new Set(schreiben.map(k => k.id));
      const tiefe = k => { let t = 0; for (let p = k.parent_id; p && ids.has(p) && t < 50; p = nachId.get(p)?.parent_id) t++; return t; };
      schreiben.sort((a, b) => tiefe(a) - tiefe(b));
      await inBloecken(schreiben.map(k => zeile(k, standId, firmaId)), async rows => pruefe(await db().from("lv_knoten").upsert(rows)));
    },

    async knotenImportieren(standId, knoten, anlass = "Import") {
      const tiefe = new Map();
      const nachId = new Map(knoten.map(k => [k.id, k]));
      const t = k => { if (tiefe.has(k.id)) return tiefe.get(k.id); const v = k.parent_id && nachId.has(k.parent_id) ? t(nachId.get(k.parent_id)) + 1 : 0; tiefe.set(k.id, v); return v; };
      const sortiert = [...knoten].sort((a, b) => t(a) - t(b));
      let n = 0;
      // In Blöcken; die Eltern eines Blocks liegen dank Sortierung im selben oder einem früheren Block
      await inBloecken(sortiert, async teil => {
        n += pruefe(await db().rpc("kalk_knoten_einfuegen", {
          p_stand: standId, p_knoten: teil.map(k => Object.fromEntries(KNOTEN_FELDER.map(f => [f, k[f] ?? null]))), p_anlass: anlass,
        }), "Import fehlgeschlagen");
      });
      return n;
    },

    async standAendern(id, felder) {
      return pruefe(await db().from("kalk_staende").update(felder).eq("id", id).select().single(), "Stand nicht gespeichert");
    },

    async standSperren(id) {
      return pruefe(await db().from("kalk_staende").update({ gesperrt: true }).eq("id", id).select().single(), "Stand nicht gesperrt");
    },

    async standKopieren(basisId, art, bezeichnung = "") {
      const neuId = pruefe(await db().rpc("kalk_stand_kopieren", { p_basis: basisId, p_art: art, p_bezeichnung: bezeichnung }), "Stand nicht angelegt");
      return pruefe(await db().from("kalk_staende").select("*").eq("id", neuId).single());
    },

    async protokollLaden(projektId, { grenze = 200 } = {}) {
      return pruefe(await db().from("kalk_protokoll").select("*").eq("kalk_projekt_id", projektId).order("zeit", { ascending: false }).limit(grenze), "Protokoll nicht geladen");
    },

    async bereitsMigriert() {
      const rows = pruefe(await db().from("kalk_staende").select("altes_angebot_id").not("altes_angebot_id", "is", null));
      return new Set(rows.map(r => String(r.altes_angebot_id)));
    },

    async planUebernehmen(plan, { onFortschritt } = {}) {
      const vorhanden = pruefe(await db().from("kalk_projekte").select("id, projekt_id"));
      const gesellschaft = (await this.gesellschaftenLaden()).find(g => !g.parent_id)?.id;
      let n = 0;
      for (const eintrag of plan) {
        let p = eintrag.projekt.projekt_id != null ? vorhanden.find(x => String(x.projekt_id) === String(eintrag.projekt.projekt_id)) : null;
        if (!p) p = pruefe(await db().from("kalk_projekte").insert({ ...eintrag.projekt, firma_id: firmaId, gesellschaft_id: gesellschaft }).select().single(), "Projekt nicht angelegt");
        const bisher = pruefe(await db().from("kalk_staende").select("nummer").eq("kalk_projekt_id", p.id));
        let nr = Math.max(0, ...bisher.map(s => s.nummer));
        let aktuell = null;
        for (const [i, st] of eintrag.staende.entries()) {
          const s = pruefe(await db().from("kalk_staende").insert({
            firma_id: firmaId, kalk_projekt_id: p.id, art: st.art, nummer: ++nr, bezeichnung: st.bezeichnung,
            nachlass: st.nachlass, mwst: st.mwst, altes_angebot_id: st.altes_angebot_id,
          }).select().single(), "Stand nicht angelegt");
          if (st.knoten.length) await this.knotenImportieren(s.id, st.knoten, `Übernahme aus Angebot ${st.altes_angebot_id}`);
          if (st.gesperrt) await this.standSperren(s.id);
          if (i === eintrag.aktuellerStandIndex) aktuell = s.id;
          onFortschritt?.(++n);
        }
        if (aktuell) pruefe(await db().from("kalk_projekte").update({ aktueller_stand: aktuell }).eq("id", p.id));
      }
      return n;
    },

    // ── Gesellschaften und Rechte ──
    async gesellschaftSpeichern(g) {
      const zeile = { name: g.name, kuerzel: g.kuerzel || "", parent_id: g.parent_id || null, aktiv: g.aktiv !== false };
      return g.id
        ? pruefe(await db().from("gesellschaften").update(zeile).eq("id", g.id).select().single(), "Gesellschaft nicht gespeichert")
        : pruefe(await db().from("gesellschaften").insert({ ...zeile, firma_id: firmaId }).select().single(), "Gesellschaft nicht angelegt");
    },

    async nutzerLaden() {
      return pruefe(await db().from("profile").select("id, vorname, nachname, rolle").eq("firma_id", firmaId).order("nachname"), "Nutzer nicht geladen");
    },

    async rechteLaden() {
      return pruefe(await db().from("kalk_rechte").select("*"), "Rechte nicht geladen");
    },

    // stufe null = Eintrag entfernen (dann gilt wieder die Polaris-Rolle)
    async rechtSetzen(profilId, gesellschaftId, stufe) {
      let q = db().from("kalk_rechte").delete().eq("profil_id", profilId);
      q = gesellschaftId ? q.eq("gesellschaft_id", gesellschaftId) : q.is("gesellschaft_id", null);
      pruefe(await q, "Recht nicht gespeichert");
      if (stufe) pruefe(await db().from("kalk_rechte").insert({ firma_id: firmaId, profil_id: profilId, gesellschaft_id: gesellschaftId || null, stufe }), "Recht nicht gespeichert");
    },

    async meinRecht(gesellschaftId) {
      return Number(pruefe(await db().rpc("kalk_recht", { p_gesellschaft: gesellschaftId }), "Recht nicht geprüft")) || 0;
    },

    // Alte Angebote der Firma für die Übernahme
    async alteAngeboteLaden() {
      return pruefe(await db().from("angebote").select("*"), "Angebote nicht geladen");
    },
  };
}
