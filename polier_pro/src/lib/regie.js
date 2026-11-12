// Regieberichte (Stundenlohnzettel) für Stundenlohnarbeiten nach § 15 VOB/B.
//
// Ablauf: Polier erfasst Personal, Geräte und Material des Tages → der
// Auftraggeber (bzw. seine Bauleitung) unterschreibt vor Ort, oder der Zettel
// wird eingereicht. § 15 Abs. 3 VOB/B: unterschriebene Zettel gibt der AG
// „unverzüglich, spätestens jedoch innerhalb von 6 Werktagen nach Zugang“
// zurück; nicht fristgemäß zurückgegebene gelten als anerkannt. Werktage sind
// Montag bis Samstag ohne Feiertage.
//
// Ein Bericht (Tabelle regieberichte):
//   { id, projekt_id, nummer, datum, beschreibung, angeordnet_von,
//     personal: [{ name, lohngruppe, stunden, satz }],
//     geraete:  [{ geraet_id, bezeichnung, stunden, satz }],
//     material: [{ bezeichnung, menge, einheit, preis }],
//     status: entwurf | eingereicht | unterschrieben | beanstandet,
//     eingereicht_am, unterschrift: { name, am, bild }, beanstandung,
//     abgerechnet_in: { angebot_id, am } }

import { feiertage } from "./lohnvorerfassung.js";

// Startwerte; die Firma trägt ihre eigenen Verrechnungssätze ein.
export const REGIE_STANDARD = {
  lohnsaetze: [
    { bez: "Polier", satz: 0 },
    { bez: "Vorarbeiter", satz: 0 },
    { bez: "Facharbeiter", satz: 0 },
    { bez: "Helfer", satz: 0 },
  ],
  materialZuschlag: 0,   // % auf Materialeinkauf
  fristWerktage: 6,
};

const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
const tagMs = 86400000;
const datum = s => new Date(`${String(s).slice(0, 10)}T12:00:00Z`);
const iso = d => d.toISOString().slice(0, 10);

export function regieSummen(b, einst = REGIE_STANDARD) {
  const stunden = (b?.personal || []).reduce((s, p) => s + (Number(p.stunden) || 0), 0);
  const lohn = (b?.personal || []).reduce((s, p) => s + (Number(p.stunden) || 0) * (Number(p.satz) || 0), 0);
  const geraete = (b?.geraete || []).reduce((s, g) => s + (Number(g.stunden) || 0) * (Number(g.satz) || 0), 0);
  const materialEk = (b?.material || []).reduce((s, m) => s + (Number(m.menge) || 0) * (Number(m.preis) || 0), 0);
  const zuschlag = materialEk * (Number(einst?.materialZuschlag) || 0) / 100;
  return { stunden: r2(stunden), lohn: r2(lohn), geraete: r2(geraete), material: r2(materialEk + zuschlag), materialZuschlag: r2(zuschlag),
    netto: r2(lohn + geraete + materialEk + zuschlag) };
}

export function werktageDazu(vonIso, n, land = "NW") {
  let d = datum(vonIso), rest = Number(n) || 0;
  const ft = {};
  while (rest > 0) {
    d = new Date(+d + tagMs);
    const j = d.getUTCFullYear();
    if (!ft[j]) ft[j] = feiertage(j, land);
    if (d.getUTCDay() !== 0 && !ft[j][iso(d)]) rest--;
  }
  return iso(d);
}

// Stand eines Berichts mit Rückgabefrist; ein eingereichter Bericht ohne
// Antwort nach Fristablauf gilt als anerkannt (§ 15 Abs. 3 Satz 5 VOB/B).
export function regieStand(b, heute, { land = "NW", fristWerktage = 6 } = {}) {
  if (b?.abgerechnet_in) return { stand: "abgerechnet", text: "abgerechnet" };
  if (b?.status === "unterschrieben") return { stand: "anerkannt", text: "unterschrieben" };
  if (b?.status === "beanstandet") return { stand: "beanstandet", text: "beanstandet" };
  if (b?.status === "eingereicht" && b.eingereicht_am) {
    const frist = werktageDazu(b.eingereicht_am, fristWerktage, land);
    if (heute > frist) return { stand: "anerkannt", text: "als anerkannt geltend", frist, fristAbgelaufen: true };
    return { stand: "offen", text: `Rückgabe bis ${frist.split("-").reverse().join(".")}`, frist };
  }
  return { stand: "entwurf", text: "Entwurf" };
}

export const abrechenbar = (b, heute, opt) => regieStand(b, heute, opt).stand === "anerkannt";

export function naechsteNummer(berichte) {
  return (berichte || []).reduce((m, b) => Math.max(m, Number(b.nummer) || 0), 0) + 1;
}

const datumDe = s => s ? s.split("-").reverse().join(".") : "";

// Positionen für einen Nachtrag bzw. eine Abrechnung: je Bericht ein Titel,
// Stunden je Lohngruppe zusammengefasst, Geräte und Material (mit Zuschlag
// im Einheitspreis).
export function regieAlsPositionen(berichte, einst = REGIE_STANDARD, idStart = Date.now()) {
  const pos = [];
  let id = idStart;
  const zu = 1 + (Number(einst?.materialZuschlag) || 0) / 100;
  for (const b of [...(berichte || [])].sort((x, y) => (x.nummer || 0) - (y.nummer || 0))) {
    pos.push({ id: id++, bez: `── Regiebericht Nr. ${b.nummer} vom ${datumDe(b.datum)} ──`, einheit: "", menge: 0, ep: 0, rabatt: 0 });
    const gruppen = new Map();
    for (const p of b.personal || []) {
      const k = `${p.lohngruppe || "Lohn"}|${Number(p.satz) || 0}`;
      gruppen.set(k, (gruppen.get(k) || 0) + (Number(p.stunden) || 0));
    }
    for (const [k, h] of gruppen) {
      const [lg, satz] = k.split("|");
      pos.push({ id: id++, bez: `Stundenlohn ${lg}`, langtext: b.beschreibung || "", einheit: "h", menge: r2(h), ep: Number(satz), rabatt: 0 });
    }
    for (const g of b.geraete || []) {
      if (!Number(g.stunden)) continue;
      pos.push({ id: id++, bez: `Gerät: ${g.bezeichnung}`, einheit: "h", menge: r2(g.stunden), ep: Number(g.satz) || 0, rabatt: 0 });
    }
    for (const m of b.material || []) {
      if (!Number(m.menge)) continue;
      pos.push({ id: id++, bez: `Material: ${m.bezeichnung}`, einheit: m.einheit || "Stk", menge: r2(m.menge), ep: r2((Number(m.preis) || 0) * zu), rabatt: 0 });
    }
  }
  return pos;
}

export function leererBericht(projektId, nummer, heute, teil = {}) {
  return { projekt_id: projektId, nummer, datum: heute, beschreibung: "", angeordnet_von: "", personal: [], geraete: [], material: [],
    status: "entwurf", eingereicht_am: null, unterschrift: null, beanstandung: "", abgerechnet_in: null, ...teil };
}

// Druckfassung (Stundenlohnzettel) — esc: HTML-Escape-Funktion des Aufrufers.
export function regieHtml(b, { projekt, firma, einst = REGIE_STANDARD, esc }) {
  const s = regieSummen(b, einst);
  const eur = n => (n || 0).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
  const z = n => (Number(n) || 0).toLocaleString("de-DE", { maximumFractionDigits: 2 });
  const zeilen = (liste, f) => liste.length ? liste.map(f).join("") : `<tr><td colspan="5" class="leer">–</td></tr>`;
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Regiebericht ${b.nummer}</title><style>
  body{font:12px/1.45 "IBM Plex Sans",Arial,sans-serif;color:#16181D;margin:32px}
  h1{font-size:18px;font-weight:500;margin:0 0 4px} .meta{color:#4A4D55;margin-bottom:16px}
  table{width:100%;border-collapse:collapse;margin:8px 0 16px} th{text-align:left;font-weight:400;color:#4A4D55;border-bottom:1px solid #C9CBD0;padding:4px}
  td{padding:4px;border-bottom:1px solid #E4E5E1} td.n{text-align:right;font-variant-numeric:tabular-nums} .leer{color:#9A9DA4}
  h2{font-size:13px;font-weight:500;margin:16px 0 0} .summe td{border:none;font-weight:500}
  .unterschrift{display:flex;gap:32px;margin-top:32px} .unterschrift div{flex:1;border-top:1px solid #16181D;padding-top:4px;color:#4A4D55}
  .unterschrift img{height:56px;display:block;margin-bottom:4px} @media print{body{margin:16mm}}
  </style></head><body>
  <h1>Regiebericht Nr. ${esc(b.nummer)} · Stundenlohnarbeiten</h1>
  <div class="meta">${esc(firma?.name || "")} · Baustelle ${esc(projekt?.name || "")}${projekt?.ort ? ", " + esc(projekt.ort) : ""} · ${esc(datumDe(b.datum))}${b.angeordnet_von ? ` · angeordnet von ${esc(b.angeordnet_von)}` : ""}</div>
  <div><b>Ausgeführte Leistung:</b> ${esc(b.beschreibung || "–")}</div>
  <h2>Personal</h2><table><tr><th>Name</th><th>Lohngruppe</th><th class="n">Stunden</th><th class="n">Satz</th><th class="n">Betrag</th></tr>
  ${zeilen(b.personal || [], p => `<tr><td>${esc(p.name)}</td><td>${esc(p.lohngruppe)}</td><td class="n">${z(p.stunden)}</td><td class="n">${eur(Number(p.satz))}</td><td class="n">${eur((Number(p.stunden) || 0) * (Number(p.satz) || 0))}</td></tr>`)}</table>
  <h2>Geräte</h2><table><tr><th>Gerät</th><th></th><th class="n">Stunden</th><th class="n">Satz</th><th class="n">Betrag</th></tr>
  ${zeilen(b.geraete || [], g => `<tr><td>${esc(g.bezeichnung)}</td><td></td><td class="n">${z(g.stunden)}</td><td class="n">${eur(Number(g.satz))}</td><td class="n">${eur((Number(g.stunden) || 0) * (Number(g.satz) || 0))}</td></tr>`)}</table>
  <h2>Material</h2><table><tr><th>Material</th><th>Einheit</th><th class="n">Menge</th><th class="n">Preis</th><th class="n">Betrag</th></tr>
  ${zeilen(b.material || [], m => `<tr><td>${esc(m.bezeichnung)}</td><td>${esc(m.einheit)}</td><td class="n">${z(m.menge)}</td><td class="n">${eur(Number(m.preis))}</td><td class="n">${eur((Number(m.menge) || 0) * (Number(m.preis) || 0))}</td></tr>`)}</table>
  <table>${s.materialZuschlag ? `<tr class="summe"><td>Zuschlag Material ${esc(einst.materialZuschlag)} %</td><td class="n">${eur(s.materialZuschlag)}</td></tr>` : ""}
  <tr class="summe"><td>Summe netto (${z(s.stunden)} Lohnstunden)</td><td class="n">${eur(s.netto)}</td></tr></table>
  <div class="unterschrift"><div>Auftragnehmer</div><div>${b.unterschrift?.bild ? `<img src="${esc(b.unterschrift.bild)}" alt="">` : ""}Auftraggeber${b.unterschrift ? `: ${esc(b.unterschrift.name)}, ${esc(new Date(b.unterschrift.am).toLocaleString("de-DE"))}` : ""}</div></div>
  </body></html>`;
}
