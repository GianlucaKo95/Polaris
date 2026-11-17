// GENERIERT aus src/lib/erinnerung.js durch scripts/funktionen-bundeln.mjs — nicht von Hand ändern.

// src/lib/fristen.js
var SICHERHEIT_ARTEN = [
  { art: "vertragserfuellung", label: "Vertragserf\xFCllungsb\xFCrgschaft", hinweis: "\xFCblich 5 % der Auftragssumme" },
  { art: "gewaehrleistung", label: "Gew\xE4hrleistungsb\xFCrgschaft", hinweis: "\xFCblich 3\u20135 % der Abrechnungssumme" },
  { art: "vorauszahlung", label: "Vorauszahlungsb\xFCrgschaft", hinweis: "in H\xF6he der Vorauszahlung" },
  { art: "abschlag", label: "Abschlagszahlungsb\xFCrgschaft", hinweis: "" },
  { art: "einbehalt", label: "Sicherheitseinbehalt (bar)", hinweis: "h\xF6chstens 10 % je Zahlung, \xA7 17 Abs. 6 VOB/B" }
];
var sicherheitLabel = (art) => SICHERHEIT_ARTEN.find((a) => a.art === art)?.label || art;
var FRIST_ARTEN = [
  { art: "gewaehrleistung", label: "Gew\xE4hrleistung" },
  { art: "abnahme", label: "Abnahme" },
  { art: "schlusszahlung", label: "Schlusszahlung" },
  { art: "vertrag", label: "Vertragsfrist" },
  { art: "sonstig", label: "Sonstige Frist" }
];
var fristLabel = (art) => FRIST_ARTEN.find((a) => a.art === art)?.label || art;
var datum = (s) => /* @__PURE__ */ new Date(`${String(s).slice(0, 10)}T12:00:00Z`);
var iso = (d) => d.toISOString().slice(0, 10);
var tagMs = 864e5;
function plusMonate(isoDatum, monate) {
  const d = datum(isoDatum);
  const tag = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + Math.round(Number(monate) || 0));
  const letzter = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 12)).getUTCDate();
  d.setUTCDate(Math.min(tag, letzter));
  return iso(d);
}
function gewaehrleistungsEnde(abnahmeIso, jahre = 4) {
  return abnahmeIso ? plusMonate(abnahmeIso, Number(jahre) * 12) : null;
}
function rueckgabeDatum(s, { abnahme = null } = {}) {
  if (s?.rueckgabe_am) return s.rueckgabe_am;
  if (s?.art === "vertragserfuellung") return abnahme || null;
  if (s?.art === "gewaehrleistung" || s?.art === "einbehalt") return abnahme ? plusMonate(abnahme, 24) : null;
  return null;
}
function stand(datumIso, heute, vorlaufTage = 30) {
  if (!datumIso) return null;
  const tage = Math.round((datum(datumIso) - datum(heute)) / tagMs);
  return { tage, stand: tage < 0 ? "ueberfaellig" : tage <= vorlaufTage ? "bald" : "ok" };
}
function terminListe({ fristen = [], sicherheiten = [], abnahmeJeProjekt: abnahmeJeProjekt2 = {}, heute, vorlaufTage = 30 }) {
  const t = [];
  const add = (e) => {
    const st = stand(e.datum, heute, e.vorlauf ?? vorlaufTage);
    if (st) t.push({ ...e, ...st });
  };
  for (const f of fristen) {
    if (f.erledigt_am) continue;
    if (f.art === "gewaehrleistung") {
      const abnahme = f.abnahme_am || abnahmeJeProjekt2[f.projekt_id];
      const ende = f.datum || gewaehrleistungsEnde(abnahme, f.jahre ?? 4);
      if (!ende) continue;
      add({ datum: plusMonate(ende, -3), titel: `Begehung vor Gew\xE4hrleistungsende${f.titel ? `: ${f.titel}` : ""}`, art: "begehung", projekt_id: f.projekt_id, quelle: { typ: "frist", id: f.id }, vorlauf: 30 });
      add({ datum: ende, titel: `Gew\xE4hrleistung endet${f.titel ? `: ${f.titel}` : ""}`, art: "gewaehrleistung", projekt_id: f.projekt_id, quelle: { typ: "frist", id: f.id }, vorlauf: 90 });
      continue;
    }
    if (f.datum) add({ datum: f.datum, titel: f.titel || fristLabel(f.art), art: f.art, projekt_id: f.projekt_id, quelle: { typ: "frist", id: f.id }, vorlauf: f.erinnerung_tage ?? vorlaufTage });
  }
  for (const s of sicherheiten) {
    if (s.status === "zurueck") continue;
    const name = `${sicherheitLabel(s.art)}${s.partner ? ` ${s.richtung === "erhalten" ? "von" : "an"} ${s.partner}` : ""}`;
    if (s.befristet_bis) add({ datum: s.befristet_bis, titel: `${name} l\xE4uft ab`, art: "befristung", projekt_id: s.projekt_id, quelle: { typ: "sicherheit", id: s.id } });
    const r = rueckgabeDatum(s, { abnahme: abnahmeJeProjekt2[s.projekt_id] });
    if (r && s.status !== "zurueckgefordert") {
      add({ datum: r, titel: s.richtung === "gestellt" ? `${name} zur\xFCckfordern` : `${name} zur\xFCckgeben`, art: "rueckgabe", projekt_id: s.projekt_id, quelle: { typ: "sicherheit", id: s.id } });
    }
  }
  return t.sort((a, b) => a.datum.localeCompare(b.datum));
}
function abnahmeJeProjekt(projekte) {
  const m = {};
  for (const p of projekte || []) {
    const d = p.abnahme_datum || p.abschluss_datum;
    if (d) m[p.id] = String(d).slice(0, 10);
  }
  return m;
}

// src/lib/lohnvorerfassung.js
var LOHNARTEN = [
  { key: "grund", bez: "Arbeitsstunden", einheit: "h" },
  { key: "ueberstunden", bez: "\xDCberstundenzuschlag", einheit: "h" },
  { key: "nacht", bez: "Nachtarbeitszuschlag", einheit: "h" },
  { key: "sonntag", bez: "Sonntagszuschlag", einheit: "h" },
  { key: "feiertagArbeit", bez: "Feiertagszuschlag", einheit: "h" },
  { key: "feiertagBezahlt", bez: "Feiertagslohn", einheit: "h" },
  { key: "urlaub", bez: "Urlaub", einheit: "Tage" },
  { key: "krank", bez: "Krankheit", einheit: "Tage" },
  { key: "schlechtwetter", bez: "Ausfallstunden Schlechtwetter", einheit: "h" },
  { key: "erschwernis", bez: "Erschwerniszuschlag", einheit: "h" },
  { key: "ausloese", bez: "Ausl\xF6se/Verpflegung", einheit: "Tage" }
];
var STANDARD_LOHN = {
  bundesland: "NW",
  sollJeWochentag: [0, 8, 8, 8, 8, 8, 0],
  // So … Sa
  ueberstunden: "woche",
  // "woche" | "tag" | "keine"
  wochenSoll: 40,
  nachtVon: "20:00",
  nachtBis: "05:00",
  beraterNr: "",
  mandantenNr: "",
  // la = Lohnart im Lohnprogramm, bs = BS-Nr (Stunden/Tage) — Platzhalter!
  lohnarten: Object.fromEntries(LOHNARTEN.map((l, i) => [l.key, { la: String(100 + i * 10), bs: l.einheit === "Tage" ? "2" : "1" }])),
  personalnummern: {}
};
function ostersonntag(j) {
  const a = j % 19, b = Math.floor(j / 100), c = j % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451), monat = Math.floor((h + l - 7 * m + 114) / 31), tag = (h + l - 7 * m + 114) % 31 + 1;
  return new Date(Date.UTC(j, monat - 1, tag));
}
var iso2 = (d) => d.toISOString().slice(0, 10);
var plus = (d, n) => new Date(d.getTime() + n * 864e5);
function feiertage(jahr, land = "NW") {
  const o = ostersonntag(jahr);
  const f = {
    [`${jahr}-01-01`]: "Neujahr",
    [iso2(plus(o, -2))]: "Karfreitag",
    [iso2(plus(o, 1))]: "Ostermontag",
    [`${jahr}-05-01`]: "Tag der Arbeit",
    [iso2(plus(o, 39))]: "Christi Himmelfahrt",
    [iso2(plus(o, 50))]: "Pfingstmontag",
    [`${jahr}-10-03`]: "Tag der Deutschen Einheit",
    [`${jahr}-12-25`]: "1. Weihnachtstag",
    [`${jahr}-12-26`]: "2. Weihnachtstag"
  };
  const in_ = (...l) => l.includes(land);
  if (in_("BW", "BY", "ST")) f[`${jahr}-01-06`] = "Heilige Drei K\xF6nige";
  if (in_("BE", "MV")) f[`${jahr}-03-08`] = "Internationaler Frauentag";
  if (in_("BB")) {
    f[iso2(o)] = "Ostersonntag";
    f[iso2(plus(o, 49))] = "Pfingstsonntag";
  }
  if (in_("BW", "BY", "HE", "NW", "RP", "SL")) f[iso2(plus(o, 60))] = "Fronleichnam";
  if (in_("SL")) f[`${jahr}-08-15`] = "Mari\xE4 Himmelfahrt";
  if (in_("TH")) f[`${jahr}-09-20`] = "Weltkindertag";
  if (in_("BB", "MV", "SN", "ST", "TH", "HB", "HH", "NI", "SH")) f[`${jahr}-10-31`] = "Reformationstag";
  if (in_("BW", "BY", "NW", "RP", "SL")) f[`${jahr}-11-01`] = "Allerheiligen";
  if (in_("SN")) {
    const nov23 = new Date(Date.UTC(jahr, 10, 23));
    f[iso2(plus(nov23, -((nov23.getUTCDay() - 3 + 7) % 7 || 7)))] = "Bu\xDF- und Bettag";
  }
  return f;
}

// src/lib/geraete.js
var PRUEFARTEN = [
  { art: "uvv", label: "UVV-Pr\xFCfung", monate: 12 },
  { art: "hu", label: "Hauptuntersuchung", monate: 24 },
  { art: "elektro", label: "Elektropr\xFCfung DGUV V3", monate: 12 },
  { art: "kran", label: "Kranpr\xFCfung", monate: 12 },
  { art: "wartung", label: "Wartung nach Hersteller", monate: 12 }
];
var pruefLabel = (art) => PRUEFARTEN.find((p) => p.art === art)?.label || art;
var tagMs2 = 864e5;
var datum2 = (s) => /* @__PURE__ */ new Date(`${String(s).slice(0, 10)}T12:00:00Z`);
var iso3 = (d) => d.toISOString().slice(0, 10);
function monateDazu(isoDatum, monate) {
  const d = datum2(isoDatum);
  const tag = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + Number(monate || 0));
  const letzter = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 12)).getUTCDate();
  d.setUTCDate(Math.min(tag, letzter));
  return iso3(d);
}
function pruefStand(geraet, heute, vorlaufTage = 30) {
  return (geraet?.pruefungen || []).map((p) => {
    const faellig = p.zuletzt ? monateDazu(p.zuletzt, p.intervall_monate) : null;
    const tage = faellig ? Math.round((datum2(faellig) - datum2(heute)) / tagMs2) : null;
    const stand2 = !faellig ? "offen" : tage < 0 ? "ueberfaellig" : tage <= vorlaufTage ? "bald" : "ok";
    return { ...p, label: pruefLabel(p.art), faellig, tage, stand: stand2 };
  }).sort((a, b) => (a.faellig || "0000") < (b.faellig || "0000") ? -1 : 1);
}

// src/lib/regie.js
var tagMs3 = 864e5;
var datum3 = (s) => /* @__PURE__ */ new Date(`${String(s).slice(0, 10)}T12:00:00Z`);
var iso4 = (d) => d.toISOString().slice(0, 10);
function werktageDazu(vonIso, n, land = "NW") {
  let d = datum3(vonIso), rest = Number(n) || 0;
  const ft = {};
  while (rest > 0) {
    d = new Date(+d + tagMs3);
    const j = d.getUTCFullYear();
    if (!ft[j]) ft[j] = feiertage(j, land);
    if (d.getUTCDay() !== 0 && !ft[j][iso4(d)]) rest--;
  }
  return iso4(d);
}
function regieStand(b, heute, { land = "NW", fristWerktage = 6 } = {}) {
  if (b?.abgerechnet_in) return { stand: "abgerechnet", text: "abgerechnet" };
  if (b?.status === "unterschrieben") return { stand: "anerkannt", text: "unterschrieben" };
  if (b?.status === "beanstandet") return { stand: "beanstandet", text: "beanstandet" };
  if (b?.status === "eingereicht" && b.eingereicht_am) {
    const frist = werktageDazu(b.eingereicht_am, fristWerktage, land);
    if (heute > frist) return { stand: "anerkannt", text: "als anerkannt geltend", frist, fristAbgelaufen: true };
    return { stand: "offen", text: `R\xFCckgabe bis ${frist.split("-").reverse().join(".")}`, frist };
  }
  return { stand: "entwurf", text: "Entwurf" };
}

// src/lib/erinnerung.js
var ERINNERUNG_STANDARD = {
  aktiv: false,
  rhythmus: "neu",
  rollen: ["administrator", "geschaeftsfuehrer", "bauleiter"],
  vorlaufTage: 30
};
var RHYTHMEN = [
  ["neu", "Nur bei neuen f\xE4lligen Punkten"],
  ["taeglich", "T\xE4glich, solange etwas offen ist"],
  ["woechentlich", "Montags, solange etwas offen ist"]
];
var datumDe = (s) => s ? String(s).slice(0, 10).split("-").reverse().join(".") : "";
var datum4 = (s) => /* @__PURE__ */ new Date(`${String(s).slice(0, 10)}T12:00:00Z`);
var tageZwischen = (a, b) => Math.round((datum4(b) - datum4(a)) / 864e5);
function erinnerungsPunkte({ projekte = [], fristen = [], sicherheiten = [], geraete = [], regieberichte = [], heute, vorlaufTage = 30, land = "NW", fristWerktage = 6 }) {
  const name = (id) => projekte.find((p) => String(p.id) === String(id))?.name || "";
  const aktivesProjekt = (id) => {
    const p = projekte.find((x) => String(x.id) === String(id));
    return !p || !p.geloescht;
  };
  const punkte = [];
  for (const t of terminListe({ fristen, sicherheiten, abnahmeJeProjekt: abnahmeJeProjekt(projekte), heute, vorlaufTage })) {
    if (t.stand === "ok" || t.tage < -365) continue;
    punkte.push({
      schluessel: `t:${t.quelle.typ}:${t.quelle.id}:${t.art}:${t.datum}`,
      bereich: "frist",
      datum: t.datum,
      stand: t.stand,
      titel: t.titel,
      baustelle: name(t.projekt_id),
      text: t.tage < 0 ? `seit ${datumDe(t.datum)}` : t.tage === 0 ? "heute" : `am ${datumDe(t.datum)}`
    });
  }
  for (const g of geraete) {
    if (g.status === "ausgemustert") continue;
    for (const p of pruefStand(g, heute, vorlaufTage)) {
      if (p.stand === "ok") continue;
      punkte.push({
        schluessel: `g:${g.id}:${p.art}:${p.faellig || "offen"}`,
        bereich: "geraet",
        datum: p.faellig || heute,
        stand: p.stand === "offen" ? "ueberfaellig" : p.stand,
        titel: `${p.label}: ${[g.inventarnr, g.bezeichnung].filter(Boolean).join(" ")}`,
        baustelle: g.status === "einsatz" ? name(g.projekt_id) : g.status === "werkstatt" ? "Werkstatt" : "Bauhof",
        text: p.stand === "offen" ? "nie gepr\xFCft" : p.tage < 0 ? `f\xE4llig seit ${datumDe(p.faellig)}` : `f\xE4llig am ${datumDe(p.faellig)}`
      });
    }
  }
  for (const b of regieberichte) {
    if (!aktivesProjekt(b.projekt_id)) continue;
    const st = regieStand(b, heute, { land, fristWerktage });
    if (st.stand === "offen" && st.frist && st.frist <= werktageDazu(heute, 2, land)) {
      punkte.push({
        schluessel: `r:${b.id}:frist:${st.frist}`,
        bereich: "regie",
        datum: st.frist,
        stand: "bald",
        titel: `Regiebericht ${b.nummer}: R\xFCckgabe durch den Auftraggeber`,
        baustelle: name(b.projekt_id),
        text: `bis ${datumDe(st.frist)}, danach gilt er als anerkannt`
      });
    } else if (st.fristAbgelaufen && !b.abgerechnet_in && tageZwischen(st.frist, heute) <= 14) {
      punkte.push({
        schluessel: `r:${b.id}:anerkannt`,
        bereich: "regie",
        datum: st.frist,
        stand: "info",
        titel: `Regiebericht ${b.nummer} gilt als anerkannt`,
        baustelle: name(b.projekt_id),
        text: `keine R\xFCckgabe bis ${datumDe(st.frist)}, kann abgerechnet werden`
      });
    } else if (st.stand === "beanstandet") {
      punkte.push({
        schluessel: `r:${b.id}:beanstandet`,
        bereich: "regie",
        datum: b.datum,
        stand: "ueberfaellig",
        titel: `Regiebericht ${b.nummer} beanstandet`,
        baustelle: name(b.projekt_id),
        text: b.beanstandung || "Grund nicht vermerkt"
      });
    }
  }
  const rang = { ueberfaellig: 0, bald: 1, info: 2 };
  return punkte.sort((a, b) => rang[a.stand] - rang[b.stand] || String(a.datum).localeCompare(String(b.datum)));
}
function erinnerungPlanen({ punkte, gemeldet = [], heute, rhythmus = "neu" }) {
  const alt = new Set(gemeldet);
  const neu = punkte.filter((p) => !alt.has(p.schluessel));
  const weiter = punkte.filter((p) => alt.has(p.schluessel));
  const montag = datum4(heute).getUTCDay() === 1;
  const senden = rhythmus === "taeglich" ? punkte.length > 0 : rhythmus === "woechentlich" ? montag && punkte.length > 0 : neu.length > 0;
  return { senden, neu, weiter };
}
function erinnerungBetreff({ neu, weiter }) {
  const alle = [...neu, ...weiter];
  const ueber = alle.filter((p) => p.stand === "ueberfaellig").length;
  const teile = [];
  if (ueber) teile.push(`${ueber} \xFCberf\xE4llig`);
  const bald = alle.filter((p) => p.stand === "bald").length;
  if (bald) teile.push(`${bald} bald f\xE4llig`);
  const info = alle.length - ueber - bald;
  if (info) teile.push(`${info} Hinweis${info === 1 ? "" : "e"}`);
  return `Polaris: ${teile.join(", ")}`;
}
var BEREICHE = [["frist", "Fristen und Sicherheiten"], ["geraet", "Ger\xE4tepr\xFCfungen"], ["regie", "Regieberichte"]];
var FARBE = { ueberfaellig: "#B42318", bald: "#C2410C", info: "#4A4D55" };
function erinnerungHtml({ firmaName = "", neu = [], weiter = [], heute, appUrl = "", esc }) {
  const zeile = (p) => `<tr>
    <td style="padding:8px 12px 8px 0;vertical-align:top;width:10px"><span style="display:inline-block;width:8px;height:8px;border-radius:4px;background:${FARBE[p.stand]}"></span></td>
    <td style="padding:8px 12px 8px 0;vertical-align:top;color:#16181D">${esc(p.titel)}<div style="color:#6B6E76;font-size:13px">${esc(p.baustelle)}</div></td>
    <td style="padding:8px 0;vertical-align:top;color:${FARBE[p.stand]};white-space:nowrap;font-size:13px;text-align:right">${esc(p.text)}</td></tr>`;
  const block = (liste, ueberschrift) => {
    if (!liste.length) return "";
    return `<h2 style="font-size:15px;font-weight:600;margin:24px 0 4px;color:#16181D">${esc(ueberschrift)}</h2>` + BEREICHE.map(([k, l]) => {
      const teil = liste.filter((p) => p.bereich === k);
      return teil.length ? `<div style="font-size:13px;color:#6B6E76;margin:12px 0 0">${esc(l)}</div><table style="width:100%;border-collapse:collapse;font-size:14px">${teil.map(zeile).join("")}</table>` : "";
    }).join("");
  };
  return `<!doctype html><html lang="de"><body style="margin:0;background:#F5F5F2;font-family:Arial,Helvetica,sans-serif">
  <div style="max-width:640px;margin:0 auto;padding:24px">
    <div style="background:#FFFFFF;border:1px solid #E4E5E1;border-radius:12px;padding:24px">
      <div style="font-size:13px;color:#6B6E76">${["Polaris", firmaName, datumDe(heute)].filter(Boolean).map(esc).join(" \xB7 ")}</div>
      <h1 style="font-size:20px;font-weight:600;margin:8px 0 0;color:#16181D">Fristen und Pr\xFCfungen</h1>
      ${block(neu, weiter.length ? "Neu f\xE4llig" : "F\xE4llig")}
      ${block(weiter, "Weiterhin offen")}
      ${appUrl ? `<p style="margin:24px 0 0"><a href="${esc(appUrl)}" style="display:inline-block;background:#16181D;color:#FFFFFF;text-decoration:none;padding:10px 16px;border-radius:8px;font-size:14px">In Polaris \xF6ffnen</a></p>` : ""}
    </div>
    <p style="font-size:12px;color:#9A9DA4;margin:16px 0 0">Diese Erinnerung stellen Gesch\xE4ftsf\xFChrung und Administration unter Sicherheiten &amp; Fristen ein. Abbestellen: im eigenen Profil.</p>
  </div></body></html>`;
}
export {
  ERINNERUNG_STANDARD,
  RHYTHMEN,
  erinnerungBetreff,
  erinnerungHtml,
  erinnerungPlanen,
  erinnerungsPunkte
};
