// LV-Editor: Titelbaum links, Positionstabelle in der Mitte, Details rechts,
// Summenleiste unten. Bedienung wie eine Tabellenkalkulation; große LVs
// werden fenstrig gezeichnet (nur sichtbare Zeilen).
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, ChevronDown, AlertTriangle } from "lucide-react";
import {
  baumIndex, zeilen as zeilenBauen, summen, einfuegen, loeschen, einruecken, ausruecken, verschieben,
  nachfahren, pruefen, ARTEN, ART_KURZ, gpCent, neueId, rundeCent, rundeMenge, sortNach, ozFehlendeVergeben, aenderungenAnwenden,
} from "../lib/kalk/lvBaum.js";
import { euro, menge as mengeFmt, zahlLesen, Taste } from "./ui.jsx";

const ZEILE = 32;
const SPALTEN = [
  { key: "oz", label: "OZ", breite: "104px" },
  { key: "art", label: "Art", breite: "40px" },
  { key: "kurztext", label: "Kurztext", breite: "minmax(120px, 1fr)" },
  { key: "menge", label: "Menge", breite: "96px", r: true },
  { key: "einheit", label: "ME", breite: "56px" },
  { key: "ep", label: "EP", breite: "96px", r: true },
  { key: "gp", label: "GP", breite: "120px", r: true },
];
const RASTER = SPALTEN.map(s => s.breite).join(" ");
const MIN_BREITE = 640; // darunter scrollt die Tabelle waagrecht
const EDITIERBAR = { titel: ["oz", "kurztext"], position: ["oz", "art", "kurztext", "menge", "einheit", "ep"], hinweis: ["kurztext"] };

function wertAnzeige(k, key) {
  if (key === "menge") return k.typ === "position" ? mengeFmt(k.menge) : "";
  if (key === "ep") return k.typ === "position" ? euro(k.ep) : "";
  if (key === "art") return k.typ === "position" ? ART_KURZ[k.art] || "" : "";
  return k[key] ?? "";
}
function wertBearbeiten(k, key) {
  if (key === "menge") return k.menge ? String(k.menge).replace(".", ",") : "";
  if (key === "ep") return k.ep ? Number(k.ep).toFixed(2).replace(".", ",") : "";
  return k[key] ?? "";
}

// Aus Excel eingefügte Zeilen: OZ? | Kurztext | Menge | Einheit | EP
export function tsvZuPositionen(text) {
  const zeilen = String(text || "").replace(/\r/g, "").split("\n").filter(z => z.trim());
  const aus = [];
  for (const z of zeilen) {
    const c = z.split("\t").map(s => s.trim());
    let oz = "", kt = "", m = 0, me = "", ep = 0;
    if (c.length >= 5) [oz, kt, m, me, ep] = c;
    else if (c.length === 4) [kt, m, me, ep] = c;
    else if (c.length === 3) [kt, m, me] = c;
    else kt = c.join(" ");
    aus.push({ oz: oz || "", kurztext: kt, menge: rundeMenge(zahlLesen(m) || 0), einheit: me || "", ep: rundeCent(zahlLesen(ep) || 0) });
  }
  return aus;
}

export function LvEditor({ stand, knoten, gesperrt, anwenden, rueckgaengig, wiederholen, fokusId, onFokusErledigt, sucheText, kalkStatus = null, unten = null }) {
  const [zugeklappt, setZugeklappt] = useState(() => new Set());
  const [cursor, setCursor] = useState({ id: null, spalte: "kurztext" });
  const [anker, setAnker] = useState(null); // Mehrfachauswahl: von anker bis cursor
  const [edit, setEdit] = useState(null); // { id, spalte, text }
  const [scrollTop, setScrollTop] = useState(0);
  const [hoehe, setHoehe] = useState(600);
  const raster = useRef(null);
  const ablage = useRef(null); // { text, knoten }
  const erledigt = useRef(null); // bereits übernommene Bearbeitung (Enter + Blur nicht doppelt)

  const index = useMemo(() => baumIndex(knoten), [knoten]);
  const liste = useMemo(() => zeilenBauen(knoten, { zugeklappt, index }), [knoten, zugeklappt, index]);
  const sm = useMemo(() => summen(knoten, index), [knoten, index]);
  const posIndex = useMemo(() => new Map(liste.map((z, i) => [z.k.id, i])), [liste]);
  const hinweise = useMemo(() => pruefen(knoten), [knoten]);
  const hinweisIds = useMemo(() => new Set(hinweise.map(h => h.id)), [hinweise]);

  const ci = cursor.id != null && posIndex.has(cursor.id) ? posIndex.get(cursor.id) : (liste.length ? 0 : -1);
  const aktuell = ci >= 0 ? liste[ci]?.k : null;
  const auswahl = useMemo(() => {
    if (anker == null || !posIndex.has(anker) || ci < 0) return aktuell ? [aktuell.id] : [];
    const a = posIndex.get(anker);
    return liste.slice(Math.min(a, ci), Math.max(a, ci) + 1).map(z => z.k.id);
  }, [anker, ci, liste, posIndex, aktuell]);
  const ausgewaehlt = useMemo(() => new Set(auswahl), [auswahl]);

  useEffect(() => {
    const el = raster.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHoehe(el.clientHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const sichtbarMachen = i => {
    const el = raster.current;
    if (!el || i < 0) return;
    const oben = i * ZEILE, unten = oben + ZEILE + ZEILE; // + Kopfzeile
    if (oben < el.scrollTop) el.scrollTop = oben;
    else if (unten > el.scrollTop + el.clientHeight) el.scrollTop = unten - el.clientHeight;
  };

  // Von außen: zu einer Zeile springen (Baum, Prüfung, Suche)
  useEffect(() => {
    if (!fokusId) return;
    const pfadIds = [];
    for (let k = index.nachId.get(fokusId)?.parent_id; k; k = index.nachId.get(k)?.parent_id) pfadIds.push(k);
    if (pfadIds.some(id => zugeklappt.has(id))) setZugeklappt(z => { const n = new Set(z); pfadIds.forEach(id => n.delete(id)); return n; });
    setCursor(c => ({ ...c, id: fokusId }));
    setAnker(null);
    onFokusErledigt?.();
    requestAnimationFrame(() => { raster.current?.focus(); });
  }, [fokusId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { sichtbarMachen(ci); }, [ci, liste.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const darfBearbeiten = (k, spalte) => !gesperrt && (EDITIERBAR[k.typ] || []).includes(spalte);

  const bearbeitenStarten = (k, spalte, startText) => {
    if (!k || !darfBearbeiten(k, spalte)) return;
    if (spalte === "art") { setEdit({ id: k.id, spalte, text: k.art }); return; }
    setEdit({ id: k.id, spalte, text: startText ?? wertBearbeiten(k, spalte) });
  };

  const uebernehmen = (e = edit) => {
    if (!e || erledigt.current === e) return true;
    erledigt.current = e;
    const k = index.nachId.get(e.id);
    setEdit(null);
    if (!k) return true;
    let wert = e.text;
    if (e.spalte === "menge" || e.spalte === "ep") {
      const n = zahlLesen(wert);
      if (n == null) { erledigt.current = null; setEdit(e); return false; } // ungültige Zahl: weiter bearbeiten
      wert = e.spalte === "menge" ? rundeMenge(n) : rundeCent(n);
    }
    if (e.spalte === "kurztext" || e.spalte === "oz" || e.spalte === "einheit") wert = String(wert).trim();
    if (k[e.spalte] === wert) return true;
    // Ein von Hand gesetzter EP einer kalkulierten Position wird zum manuellen EP
    if (e.spalte === "ep" && kalkStatus?.get(k.id) === "kalk") {
      anwenden({ aendern: [{ id: k.id, felder: { ep: wert, extra: { ...(k.extra || {}), epManuell: true } } }] });
      return true;
    }
    anwenden({ aendern: [{ id: k.id, felder: { [e.spalte]: wert } }] });
    return true;
  };

  const bewegen = (dz, ds, erweitern = false) => {
    if (!liste.length) return;
    const editierbar = SPALTEN.map(s => s.key);
    let si = editierbar.indexOf(cursor.spalte);
    let zi = Math.max(0, ci);
    if (ds) {
      si += ds;
      if (si >= editierbar.length) { si = 0; zi = Math.min(liste.length - 1, zi + 1); }
      if (si < 0) { si = editierbar.length - 1; zi = Math.max(0, zi - 1); }
    }
    zi = Math.min(liste.length - 1, Math.max(0, zi + dz));
    if (erweitern) { if (anker == null) setAnker(aktuell?.id ?? null); } else setAnker(null);
    setCursor({ id: liste[zi].k.id, spalte: editierbar[si] });
  };

  const neu = (typ, felder = {}) => {
    if (gesperrt) return;
    const nachId = aktuell?.id ?? liste.at(-1)?.k.id ?? null;
    const ae = einfuegen(knoten, { nachId, typ, felder });
    anwenden(ae);
    setCursor({ id: ae.neu[0].id, spalte: typ === "position" && !felder.kurztext ? "kurztext" : "kurztext" });
    setAnker(null);
    if (!felder.kurztext) setTimeout(() => setEdit({ id: ae.neu[0].id, spalte: "kurztext", text: "" }), 0);
  };

  const loeschenAuswahl = () => {
    if (gesperrt || !auswahl.length) return;
    const unter = auswahl.reduce((n, id) => n + nachfahren(knoten, id, index).length, 0);
    if (unter > 0 && !window.confirm(`${auswahl.length} Zeile(n) mit ${unter} Unterzeile(n) löschen?`)) return;
    const naechste = liste[Math.min(liste.length - 1, ci + 1)]?.k.id;
    const vorige = liste[Math.max(0, posIndex.get(auswahl[0]) - 1)]?.k.id;
    anwenden(loeschen(knoten, auswahl));
    setCursor(c => ({ ...c, id: auswahl.includes(naechste) ? vorige : naechste }));
    setAnker(null);
  };

  const hochRunter = richtung => {
    if (gesperrt || !aktuell) return;
    const geschwister = index.kinderVon(aktuell.parent_id ?? null);
    const i = geschwister.findIndex(x => x.id === aktuell.id);
    if (richtung < 0 && i > 0) {
      anwenden(verschieben(knoten, aktuell.id, { parentId: aktuell.parent_id ?? null, nachId: geschwister[i - 2]?.id ?? null }));
    } else if (richtung > 0 && i < geschwister.length - 1) {
      anwenden(verschieben(knoten, aktuell.id, { parentId: aktuell.parent_id ?? null, nachId: geschwister[i + 1].id }));
    }
  };

  const kopieren = async () => {
    if (!auswahl.length) return;
    const ids = new Set();
    for (const id of auswahl) { ids.add(id); nachfahren(knoten, id, index).forEach(x => ids.add(x)); }
    const teil = knoten.filter(k => ids.has(k.id));
    const text = auswahl.map(id => index.nachId.get(id)).filter(Boolean)
      .map(k => [k.oz, k.kurztext, k.typ === "position" ? String(k.menge).replace(".", ",") : "", k.einheit, k.typ === "position" ? Number(k.ep).toFixed(2).replace(".", ",") : ""].join("\t")).join("\n");
    ablage.current = { text, knoten: teil, wurzeln: auswahl.filter(id => !auswahl.some(a => a !== id && nachfahren(knoten, a, index).includes(id))) };
    try { await navigator.clipboard.writeText(text); } catch { /* nur interne Ablage */ }
  };

  const einfuegenAusAblage = async () => {
    if (gesperrt) return;
    let text = "";
    try { text = await navigator.clipboard.readText(); } catch { text = ablage.current?.text || ""; }
    const parentId = aktuell ? (aktuell.typ === "titel" ? aktuell.id : aktuell.parent_id ?? null) : null;
    const nachId = aktuell && aktuell.typ !== "titel" ? aktuell.id : (aktuell ? index.kinderVon(aktuell.id).at(-1)?.id ?? null : liste.at(-1)?.k.id ?? null);
    let sort = sortNach(index, parentId, nachId);
    const nachSort = index.kinderVon(parentId).find(x => x.sort > sort)?.sort ?? null;
    const schritt = nachSort == null ? 1024 : (nachSort - sort) / 1000;
    const neuListe = [];
    if (ablage.current && (!text || text === ablage.current.text)) {
      const map = new Map(ablage.current.knoten.map(k => [k.id, neueId()]));
      for (const k of ablage.current.knoten) {
        const wurzel = ablage.current.wurzeln.includes(k.id);
        neuListe.push({ ...k, id: map.get(k.id), parent_id: wurzel ? parentId : map.get(k.parent_id) ?? parentId, sort: wurzel ? (sort += schritt) : k.sort });
      }
    } else {
      for (const p of tsvZuPositionen(text)) neuListe.push({ id: neueId(), parent_id: parentId, sort: (sort += schritt), typ: "position", art: "normal", langtext: "", rabatt: 0, stlk: null, extra: {}, ...p });
    }
    if (!neuListe.length) return;
    // Eingefügte Positionen ohne OZ bekommen eine passende
    const oz = ozFehlendeVergeben(aenderungenAnwenden(knoten, { neu: neuListe }));
    const ozNachId = new Map(oz.aendern.map(a => [a.id, a.felder.oz]));
    for (const k of neuListe) if (ozNachId.has(k.id)) k.oz = ozNachId.get(k.id);
    anwenden({ neu: neuListe });
    setCursor(c => ({ ...c, id: neuListe[0].id }));
  };

  const taste = e => {
    if (edit) return; // Eingabefeld behandelt selbst
    const strg = e.ctrlKey || e.metaKey;
    const k = aktuell;
    if (strg && e.key.toLowerCase() === "z") { e.preventDefault(); if (e.shiftKey) wiederholen(); else rueckgaengig(); return; }
    if (strg && e.key.toLowerCase() === "y") { e.preventDefault(); wiederholen(); return; }
    if (strg && e.key.toLowerCase() === "c") { e.preventDefault(); kopieren(); return; }
    if (strg && e.key.toLowerCase() === "v") { e.preventDefault(); einfuegenAusAblage(); return; }
    if (strg && e.key === "Enter") { e.preventDefault(); neu(e.shiftKey ? "titel" : "position"); return; }
    if (strg && (e.key === "Delete" || e.key === "Backspace")) { e.preventDefault(); loeschenAuswahl(); return; }
    if (e.altKey && e.key === "ArrowRight") { e.preventDefault(); if (k && !gesperrt) anwenden(einruecken(knoten, k.id)); return; }
    if (e.altKey && e.key === "ArrowLeft") { e.preventDefault(); if (k && !gesperrt) anwenden(ausruecken(knoten, k.id)); return; }
    if (e.altKey && e.key === "ArrowUp") { e.preventDefault(); hochRunter(-1); return; }
    if (e.altKey && e.key === "ArrowDown") { e.preventDefault(); hochRunter(1); return; }
    switch (e.key) {
      case "ArrowDown": e.preventDefault(); bewegen(1, 0, e.shiftKey); return;
      case "ArrowUp": e.preventDefault(); bewegen(-1, 0, e.shiftKey); return;
      case "ArrowRight": e.preventDefault(); bewegen(0, 1); return;
      case "ArrowLeft": e.preventDefault(); bewegen(0, -1); return;
      case "Tab": e.preventDefault(); bewegen(0, e.shiftKey ? -1 : 1); return;
      case "PageDown": e.preventDefault(); bewegen(Math.floor(hoehe / ZEILE) - 1, 0, e.shiftKey); return;
      case "PageUp": e.preventDefault(); bewegen(-Math.floor(hoehe / ZEILE) + 1, 0, e.shiftKey); return;
      case "Home": if (strg) { e.preventDefault(); setCursor(c => ({ ...c, id: liste[0]?.k.id })); } return;
      case "End": if (strg) { e.preventDefault(); setCursor(c => ({ ...c, id: liste.at(-1)?.k.id })); } return;
      case "Enter": case "F2": e.preventDefault(); bearbeitenStarten(k, cursor.spalte); return;
      case "Escape": setAnker(null); return;
      case "Delete": case "Backspace":
        if (k && darfBearbeiten(k, cursor.spalte) && cursor.spalte !== "art") { e.preventDefault(); anwenden({ aendern: [{ id: k.id, felder: { [cursor.spalte]: ["menge", "ep"].includes(cursor.spalte) ? 0 : "" } }] }); }
        return;
      case " ":
        if (k?.typ === "titel" && cursor.spalte !== "kurztext") { e.preventDefault(); umklappen(k.id); return; }
        break;
      default:
    }
    if (e.key.length === 1 && !strg && !e.altKey && k) { e.preventDefault(); bearbeitenStarten(k, cursor.spalte, e.key); }
  };

  const umklappen = id => setZugeklappt(z => { const n = new Set(z); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const editTaste = e => {
    if (e.key === "Escape") { e.preventDefault(); erledigt.current = edit; setEdit(null); raster.current?.focus(); return; }
    if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      if (!uebernehmen()) return;
      raster.current?.focus();
      if (e.key === "Enter") bewegen(e.shiftKey ? -1 : 1, 0);
      else bewegen(0, e.shiftKey ? -1 : 1);
    }
  };

  const von = Math.max(0, Math.floor(scrollTop / ZEILE) - 10);
  const bis = Math.min(liste.length, Math.ceil((scrollTop + hoehe) / ZEILE) + 10);

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: 0, flex: 1 }}>
      <div ref={raster} className="lv-raster" tabIndex={0} onKeyDown={taste} role="grid" aria-label="Leistungsverzeichnis"
        aria-rowcount={liste.length} onScroll={e => setScrollTop(e.currentTarget.scrollTop)}
        style={{ flex: 1, minHeight: 224, overflow: "auto", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8 }}>
        <div className="lv-kopf" style={{ gridTemplateColumns: RASTER, minWidth: MIN_BREITE }} role="row">
          {SPALTEN.map(s => <div key={s.key} className={`lv-zelle${s.r ? " r" : ""}`} role="columnheader">{s.label}</div>)}
        </div>
        <div style={{ height: liste.length * ZEILE, position: "relative", minWidth: MIN_BREITE }}>
          {liste.slice(von, bis).map(({ k, tiefe, hatKinder }, j) => {
            const i = von + j;
            const istCursor = k.id === aktuell?.id;
            return (
              <div key={k.id} role="row" aria-rowindex={i + 1} aria-selected={ausgewaehlt.has(k.id)}
                className={`lv-zeile ${k.typ}${ausgewaehlt.has(k.id) ? " gewaehlt" : ""}`}
                style={{ gridTemplateColumns: RASTER, position: "absolute", top: i * ZEILE, left: 0, right: 0 }}>
                {SPALTEN.map(s => {
                  const aktiv = istCursor && cursor.spalte === s.key;
                  const imEdit = edit && edit.id === k.id && edit.spalte === s.key;
                  const treffer = sucheText && s.key === "kurztext" && String(k.kurztext).toLowerCase().includes(sucheText.toLowerCase());
                  let inhalt;
                  if (imEdit && s.key === "art") {
                    inhalt = (
                      <select autoFocus value={edit.text} onKeyDown={editTaste}
                        onChange={e => { erledigt.current = edit; uebernehmen({ ...edit, text: e.target.value }); raster.current?.focus(); }}
                        onBlur={() => setEdit(null)}>
                        {ARTEN.map(([w, l]) => <option key={w} value={w}>{l}</option>)}
                      </select>
                    );
                  } else if (imEdit) {
                    inhalt = <input autoFocus value={edit.text} onChange={e => setEdit({ ...edit, text: e.target.value })} onKeyDown={editTaste}
                      onBlur={() => uebernehmen()} aria-label={s.label} />;
                  } else if (s.key === "kurztext") {
                    inhalt = (
                      <span style={{ display: "flex", alignItems: "center", gap: 4, paddingLeft: tiefe * 16, minWidth: 0 }}>
                        {k.typ === "titel"
                          ? <button className="kb-symbol" style={{ width: 20, height: 20 }} aria-label={zugeklappt.has(k.id) ? "Aufklappen" : "Zuklappen"} tabIndex={-1}
                              onMouseDown={e => e.stopPropagation()} onClick={() => umklappen(k.id)}>
                              {hatKinder ? (zugeklappt.has(k.id) ? <ChevronRight size={14} /> : <ChevronDown size={14} />) : null}
                            </button>
                          : <span style={{ width: 20, flexShrink: 0 }} />}
                        {hinweisIds.has(k.id) && <AlertTriangle size={13} color="var(--akzent)" aria-label="Prüfhinweis" style={{ flexShrink: 0 }} />}
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", background: treffer ? "var(--ybg)" : undefined,
                          color: k.typ === "position" && (k.art === "bedarf" || k.art === "alternativ") ? "var(--text2)" : undefined }}>
                          {k.kurztext || <span style={{ color: "var(--muted)" }}>{k.typ === "titel" ? "Titel" : k.typ === "hinweis" ? "Hinweis" : "Kurztext"}</span>}
                        </span>
                      </span>
                    );
                  } else if (s.key === "gp") {
                    const cent = k.typ === "titel" ? sm.jeKnoten.get(k.id) || 0 : gpCent(k);
                    const ausserhalb = k.typ === "position" && (k.art === "bedarf" || k.art === "alternativ");
                    inhalt = k.typ === "hinweis" ? "" : <span className="kb-zahl" style={{ color: ausserhalb ? "var(--muted)" : undefined }}>{ausserhalb ? `(${euro(cent / 100)})` : euro(cent / 100)}</span>;
                  } else if (s.key === "ep" && k.typ === "position" && kalkStatus?.get(k.id)) {
                    const st = kalkStatus.get(k.id);
                    inhalt = <span className="kb-zahl" title={st === "kalk" ? "aus den Ansätzen kalkuliert" : "manueller EP, Ansätze vorhanden"}>
                      {st === "manuell" && <span style={{ color: "var(--akzent)", marginRight: 4, fontSize: 11 }}>M</span>}{wertAnzeige(k, s.key)}</span>;
                  } else {
                    const w = wertAnzeige(k, s.key);
                    inhalt = s.r || s.key === "oz" ? <span className="kb-zahl">{w}</span> : w;
                  }
                  return (
                    <div key={s.key} role="gridcell" className={`lv-zelle${s.r ? " r" : ""}${aktiv && !imEdit ? " aktiv" : ""}`}
                      onMouseDown={e => {
                        if (edit) uebernehmen();
                        if (e.shiftKey) { if (anker == null) setAnker(aktuell?.id ?? k.id); } else setAnker(null);
                        setCursor({ id: k.id, spalte: s.key });
                        e.preventDefault();
                        raster.current?.focus();
                      }}
                      onDoubleClick={() => bearbeitenStarten(k, s.key)}>
                      {inhalt}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
        {!liste.length && (
          <div style={{ padding: 32, textAlign: "center", color: "var(--text2)" }}>
            Das LV ist leer. Neue Position mit <Taste>Strg</Taste> <Taste>Enter</Taste>, neuer Titel mit <Taste>Strg</Taste> <Taste>Umschalt</Taste> <Taste>Enter</Taste>, oder ein GAEB-LV importieren.
          </div>
        )}
      </div>
      {unten}
      <Summenleiste sm={sm} stand={stand} anzahlAuswahl={auswahl.length > 1 ? auswahl : null} knoten={knoten} index={index} />
      <EditorAktionen neu={neu} loeschenAuswahl={loeschenAuswahl} gesperrt={gesperrt} aktuell={aktuell} />
    </div>
  );
}

// Unsichtbarer Kanal: Aktionen aus der Werkzeugleiste erreichen den Editor
function EditorAktionen({ neu, loeschenAuswahl, gesperrt, aktuell }) {
  useEffect(() => {
    const h = e => {
      const { aktion, felder } = e.detail || {};
      if (aktion === "position") neu("position", felder);
      else if (aktion === "titel") neu("titel", felder);
      else if (aktion === "hinweis") neu("hinweis", felder);
      else if (aktion === "loeschen") loeschenAuswahl();
    };
    window.addEventListener("lv-aktion", h);
    return () => window.removeEventListener("lv-aktion", h);
  });
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("lv-auswahl", { detail: { knoten: aktuell || null, gesperrt } }));
  }, [aktuell, gesperrt]);
  return null;
}

function Summenleiste({ sm, stand, anzahlAuswahl, knoten, index }) {
  const netto = sm.gesamtCent / 100;
  const nachlass = Number(stand?.nachlass) || 0;
  const nachNachlass = rundeCent(netto * (1 - nachlass / 100));
  const mwst = Number(stand?.mwst ?? 19);
  const steuer = rundeCent(nachNachlass * mwst / 100);
  let auswahlSumme = null;
  if (anzahlAuswahl) {
    let c = 0;
    for (const id of anzahlAuswahl) {
      const k = index.nachId.get(id);
      if (k?.typ === "position" && k.art !== "bedarf" && k.art !== "alternativ" && !anzahlAuswahl.includes(k.parent_id)) c += gpCent(k);
      if (k?.typ === "titel" && !anzahlAuswahl.includes(k.parent_id)) c += sm.jeKnoten.get(k.id) || 0;
    }
    auswahlSumme = c / 100;
  }
  const feld = (label, wert, stark) => (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
      <span style={{ fontSize: 12, color: "var(--muted)" }}>{label}</span>
      <span className="kb-zahl" style={{ fontSize: stark ? 16 : 14, fontWeight: stark ? 500 : 400 }}>{wert}</span>
    </div>
  );
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 28, padding: "10px 4px 0", flexWrap: "wrap" }}>
      <div style={{ color: "var(--text2)", fontSize: 13, flex: 1 }}>
        {sm.positionen} Positionen · {knoten.filter(k => k.typ === "titel").length} Titel
        {auswahlSumme != null && <> · Auswahl {anzahlAuswahl.length} Zeilen: <span className="kb-zahl">{euro(auswahlSumme)}</span></>}
      </div>
      {feld("Netto", euro(netto), !nachlass)}
      {nachlass > 0 && feld(`Nachlass ${String(nachlass).replace(".", ",")} %`, `− ${euro(netto - nachNachlass)}`)}
      {nachlass > 0 && feld("Netto nach Nachlass", euro(nachNachlass), true)}
      {feld(`MwSt ${String(mwst).replace(".", ",")} %`, euro(steuer))}
      {feld("Brutto", euro(nachNachlass + steuer))}
    </div>
  );
}
