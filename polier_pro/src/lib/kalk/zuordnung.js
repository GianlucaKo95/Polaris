// Zuordnung LV-Position → Planmenge nach Regeln (Einheit + Kurztitel).
// Gemeinsam für alle Profile des Plan-Assistenten. Regeln: [id, RegExp, art],
// Reihenfolge = Vorrang. „nie“ schließt Positionen aus. „Zulage zur Vorposition“
// und „wie vor“ übernehmen die Zuordnung der Vorposition. Abweichungen > 25 %
// zur LV-Menge werden zum Prüfen markiert — ein Vorschlag ist kein Urteil.

const ART_EINHEIT = [[/^(m2|m²|qm)$/i, "flaeche"], [/^(m|lfm|lfdm)$/i, "strecke"], [/^(st|stk|stck|stück|stueck)$/i, "zaehlen"]];
export const artVon = e => (ART_EINHEIT.find(([re]) => re.test(String(e || "").trim().replace(/\.$/, ""))) || [])[1] || null;
export const titel = (t, n = 3) => String(t || "").split(/\s+/).slice(0, n).join(" ");

export function zuordnungMitRegeln(positionen, mengen, { regeln, nie }) {
  const da = new Map(mengen.map(m => [m.id, m]));
  let vorher = null;
  return positionen.map(p => {
    const art = artVon(p.einheit);
    // Flächen und Längen nach dem Kurztitel, Stück auch nach DN im längeren Titel
    const t = titel(p.kurztext, art === "zaehlen" ? 8 : 3);
    let id = null;
    if (art && /zur vorposition|wie vor\b/i.test(p.kurztext || "") && vorher?.art === art) id = vorher.id;
    else if (art && !(nie && nie.test(titel(p.kurztext, 8)))) id = (regeln.find(([i, re, a]) => a === art && da.has(i) && re.test(t)) || [])[0] || null;
    const m = id ? da.get(id) : null;
    const abweichung = m && p.mengeLv > 0 ? m.menge / p.mengeLv - 1 : null;
    vorher = art ? { art, id } : vorher;
    return { key: p.key, id, menge: m?.menge ?? null, abweichung, pruefen: abweichung != null && Math.abs(abweichung) > 0.25 };
  });
}
