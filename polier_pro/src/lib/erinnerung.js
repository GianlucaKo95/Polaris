// E-Mail-Erinnerung an Geschäftsführung und Bauleitung: was ist fällig oder
// überfällig bei Fristen, Sicherheiten, Geräteprüfungen und Regieberichten?
//
// Läuft täglich in der Edge Function fristen-erinnerung (die diese Datei
// als gebündeltes logik.js mitbringt, siehe scripts/funktionen-bundeln.mjs)
// und im Browser für die Vorschau unter Sicherheiten & Fristen.
//
// Rhythmus (firmen.erinnerung_einstellungen.rhythmus):
//   neu          — nur wenn seit der letzten Mail etwas neu fällig geworden ist
//                  (Standard: keine tägliche Wiederholung desselben Punkts)
//   taeglich     — jeden Morgen, solange etwas offen ist
//   woechentlich — montags, solange etwas offen ist

import { terminListe, abnahmeJeProjekt } from "./fristen.js";
import { pruefStand } from "./geraete.js";
import { regieStand, werktageDazu } from "./regie.js";

export const ERINNERUNG_STANDARD = {
  aktiv: false,
  rhythmus: "neu",
  rollen: ["administrator", "geschaeftsfuehrer", "bauleiter"],
  vorlaufTage: 30,
};
export const RHYTHMEN = [
  ["neu", "Nur bei neuen fälligen Punkten"],
  ["taeglich", "Täglich, solange etwas offen ist"],
  ["woechentlich", "Montags, solange etwas offen ist"],
];

const datumDe = s => s ? String(s).slice(0, 10).split("-").reverse().join(".") : "";
const datum = s => new Date(`${String(s).slice(0, 10)}T12:00:00Z`);
const tageZwischen = (a, b) => Math.round((datum(b) - datum(a)) / 86400000);

// Alle Punkte, die jetzt Aufmerksamkeit brauchen.
export function erinnerungsPunkte({ projekte = [], fristen = [], sicherheiten = [], geraete = [], regieberichte = [], heute, vorlaufTage = 30, land = "NW", fristWerktage = 6 }) {
  const name = id => projekte.find(p => String(p.id) === String(id))?.name || "";
  const aktivesProjekt = id => { const p = projekte.find(x => String(x.id) === String(id)); return !p || !p.geloescht; };
  const punkte = [];

  for (const t of terminListe({ fristen, sicherheiten, abnahmeJeProjekt: abnahmeJeProjekt(projekte), heute, vorlaufTage })) {
    if (t.stand === "ok" || t.tage < -365) continue;
    punkte.push({ schluessel: `t:${t.quelle.typ}:${t.quelle.id}:${t.art}:${t.datum}`, bereich: "frist", datum: t.datum, stand: t.stand,
      titel: t.titel, baustelle: name(t.projekt_id),
      text: t.tage < 0 ? `seit ${datumDe(t.datum)}` : t.tage === 0 ? "heute" : `am ${datumDe(t.datum)}` });
  }

  for (const g of geraete) {
    if (g.status === "ausgemustert") continue;
    for (const p of pruefStand(g, heute, vorlaufTage)) {
      if (p.stand === "ok") continue;
      punkte.push({ schluessel: `g:${g.id}:${p.art}:${p.faellig || "offen"}`, bereich: "geraet", datum: p.faellig || heute,
        stand: p.stand === "offen" ? "ueberfaellig" : p.stand,
        titel: `${p.label}: ${[g.inventarnr, g.bezeichnung].filter(Boolean).join(" ")}`,
        baustelle: g.status === "einsatz" ? name(g.projekt_id) : g.status === "werkstatt" ? "Werkstatt" : "Bauhof",
        text: p.stand === "offen" ? "nie geprüft" : p.tage < 0 ? `fällig seit ${datumDe(p.faellig)}` : `fällig am ${datumDe(p.faellig)}` });
    }
  }

  for (const b of regieberichte) {
    if (!aktivesProjekt(b.projekt_id)) continue;
    const st = regieStand(b, heute, { land, fristWerktage });
    if (st.stand === "offen" && st.frist && st.frist <= werktageDazu(heute, 2, land)) {
      punkte.push({ schluessel: `r:${b.id}:frist:${st.frist}`, bereich: "regie", datum: st.frist, stand: "bald",
        titel: `Regiebericht ${b.nummer}: Rückgabe durch den Auftraggeber`, baustelle: name(b.projekt_id),
        text: `bis ${datumDe(st.frist)}, danach gilt er als anerkannt` });
    } else if (st.fristAbgelaufen && !b.abgerechnet_in && tageZwischen(st.frist, heute) <= 14) {
      punkte.push({ schluessel: `r:${b.id}:anerkannt`, bereich: "regie", datum: st.frist, stand: "info",
        titel: `Regiebericht ${b.nummer} gilt als anerkannt`, baustelle: name(b.projekt_id),
        text: `keine Rückgabe bis ${datumDe(st.frist)}, kann abgerechnet werden` });
    } else if (st.stand === "beanstandet") {
      punkte.push({ schluessel: `r:${b.id}:beanstandet`, bereich: "regie", datum: b.datum, stand: "ueberfaellig",
        titel: `Regiebericht ${b.nummer} beanstandet`, baustelle: name(b.projekt_id), text: b.beanstandung || "Grund nicht vermerkt" });
    }
  }

  const rang = { ueberfaellig: 0, bald: 1, info: 2 };
  return punkte.sort((a, b) => rang[a.stand] - rang[b.stand] || String(a.datum).localeCompare(String(b.datum)));
}

// Ob heute gesendet wird und was davon neu ist. gemeldet: Schlüssel, die in
// den letzten Mails schon standen.
export function erinnerungPlanen({ punkte, gemeldet = [], heute, rhythmus = "neu" }) {
  const alt = new Set(gemeldet);
  const neu = punkte.filter(p => !alt.has(p.schluessel));
  const weiter = punkte.filter(p => alt.has(p.schluessel));
  const montag = datum(heute).getUTCDay() === 1;
  const senden = rhythmus === "taeglich" ? punkte.length > 0
    : rhythmus === "woechentlich" ? montag && punkte.length > 0
    : neu.length > 0;
  return { senden, neu, weiter };
}

export function erinnerungBetreff({ neu, weiter }) {
  const alle = [...neu, ...weiter];
  const ueber = alle.filter(p => p.stand === "ueberfaellig").length;
  const teile = [];
  if (ueber) teile.push(`${ueber} überfällig`);
  const bald = alle.filter(p => p.stand === "bald").length;
  if (bald) teile.push(`${bald} bald fällig`);
  const info = alle.length - ueber - bald;
  if (info) teile.push(`${info} Hinweis${info === 1 ? "" : "e"}`);
  return `Polaris: ${teile.join(", ")}`;
}

const BEREICHE = [["frist", "Fristen und Sicherheiten"], ["geraet", "Geräteprüfungen"], ["regie", "Regieberichte"]];
const FARBE = { ueberfaellig: "#B42318", bald: "#C2410C", info: "#4A4D55" };

// HTML der Mail (Inline-Styles, weil Mailprogramme kein CSS laden).
export function erinnerungHtml({ firmaName = "", neu = [], weiter = [], heute, appUrl = "", esc }) {
  const zeile = p => `<tr>
    <td style="padding:8px 12px 8px 0;vertical-align:top;width:10px"><span style="display:inline-block;width:8px;height:8px;border-radius:4px;background:${FARBE[p.stand]}"></span></td>
    <td style="padding:8px 12px 8px 0;vertical-align:top;color:#16181D">${esc(p.titel)}<div style="color:#6B6E76;font-size:13px">${esc(p.baustelle)}</div></td>
    <td style="padding:8px 0;vertical-align:top;color:${FARBE[p.stand]};white-space:nowrap;font-size:13px;text-align:right">${esc(p.text)}</td></tr>`;
  const block = (liste, ueberschrift) => {
    if (!liste.length) return "";
    return `<h2 style="font-size:15px;font-weight:600;margin:24px 0 4px;color:#16181D">${esc(ueberschrift)}</h2>` +
      BEREICHE.map(([k, l]) => {
        const teil = liste.filter(p => p.bereich === k);
        return teil.length ? `<div style="font-size:13px;color:#6B6E76;margin:12px 0 0">${esc(l)}</div><table style="width:100%;border-collapse:collapse;font-size:14px">${teil.map(zeile).join("")}</table>` : "";
      }).join("");
  };
  return `<!doctype html><html lang="de"><body style="margin:0;background:#F5F5F2;font-family:Arial,Helvetica,sans-serif">
  <div style="max-width:640px;margin:0 auto;padding:24px">
    <div style="background:#FFFFFF;border:1px solid #E4E5E1;border-radius:12px;padding:24px">
      <div style="font-size:13px;color:#6B6E76">${["Polaris", firmaName, datumDe(heute)].filter(Boolean).map(esc).join(" · ")}</div>
      <h1 style="font-size:20px;font-weight:600;margin:8px 0 0;color:#16181D">Fristen und Prüfungen</h1>
      ${block(neu, weiter.length ? "Neu fällig" : "Fällig")}
      ${block(weiter, "Weiterhin offen")}
      ${appUrl ? `<p style="margin:24px 0 0"><a href="${esc(appUrl)}" style="display:inline-block;background:#16181D;color:#FFFFFF;text-decoration:none;padding:10px 16px;border-radius:8px;font-size:14px">In Polaris öffnen</a></p>` : ""}
    </div>
    <p style="font-size:12px;color:#9A9DA4;margin:16px 0 0">Diese Erinnerung stellen Geschäftsführung und Administration unter Sicherheiten &amp; Fristen ein. Abbestellen: im eigenen Profil.</p>
  </div></body></html>`;
}
