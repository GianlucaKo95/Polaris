import { useEffect, useMemo, useRef, useState } from "react";
import { PolarisMarke } from "./PolarisMarke.jsx";
import { emojiAusTextknoten } from "../lib/utils.js";
import { verlassenBestaetigen } from "../lib/ungespeichert.js";
import { LogOut, Moon, Sun, Search, User, Palmtree } from "lucide-react";

// Desktop-Rahmen (ab 1024 px): Seitenleiste nach Arbeitsbereichen, Kopf mit
// Titel, Reitern und Aktionen, Suche über ⌘K. Die Handy-App nutzt ihn nicht.
//
// nav: [{ id, label, Icon, zahl? }] · reiter: [{ id, label }] · befehle: [{ id, label, gruppe, hinweis?, suchtext?, immer?, aktion(text) }]
export function DesktopShell({
  nav, aktivNav, onNav, titel, untertitel, kopfzeile, aktionen, reiter, aktiverReiter, onReiter, befehle = [],
  firmenName, nutzerName, rolleLabel, onProfil, onAbwesenheit, dark, onThemeWechsel, onAbmelden, verbunden, children,
}) {
  const [suche, setSuche] = useState(false);

  // Die älteren Ansichten setzen Emojis als Symbole (🔴 Status, 🏗️ Gewerk,
  // 👷 Rolle). Im Desktop-Rahmen tragen Wort und Farbe die Bedeutung: Emojis
  // aus allen Textknoten entfernen (auch Dialoge, die per Portal am <body>
  // hängen), auch nach jedem Neuzeichnen. Der Rahmen gibt es nur auf dem Desktop.
  useEffect(() => {
    const wurzel = document.body;
    const knoten = n => {
      if (n.nodeType === 3) { const neu = emojiAusTextknoten(n.nodeValue); if (neu !== n.nodeValue) n.nodeValue = neu; return; }
      if (n.nodeType !== 1 || n.isContentEditable) return;
      const w = document.createTreeWalker(n, NodeFilter.SHOW_TEXT);
      for (let t = w.nextNode(); t; t = w.nextNode()) { const neu = emojiAusTextknoten(t.nodeValue); if (neu !== t.nodeValue) t.nodeValue = neu; }
    };
    knoten(wurzel);
    const beobachter = new MutationObserver(liste => {
      for (const m of liste) {
        if (m.type === "characterData") knoten(m.target);
        else m.addedNodes.forEach(knoten);
      }
    });
    beobachter.observe(wurzel, { subtree: true, childList: true, characterData: true });
    return () => beobachter.disconnect();
  }, []);

  useEffect(() => {
    const taste = e => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setSuche(s => !s); }
    };
    window.addEventListener("keydown", taste);
    return () => window.removeEventListener("keydown", taste);
  }, []);

  const zeile = aktiv => ({
    display: "flex", alignItems: "center", gap: 8, height: 36, flexShrink: 0, padding: "0 8px", borderRadius: 8, width: "100%",
    border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 14, textAlign: "left",
    background: aktiv ? "var(--surface2)" : "transparent", color: aktiv ? "var(--text)" : "var(--text2)", fontWeight: aktiv ? 500 : 400,
    boxShadow: aktiv ? "inset 0 0 0 1px var(--border)" : "none",
  });
  const symbol = { flexShrink: 0, background: "none", border: "none", color: "var(--text2)", cursor: "pointer", width: 32, height: 32,
    display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8 };

  return (
    <div style={{ height: "100dvh", display: "flex", background: "var(--bg)", color: "var(--text)", fontSize: 14, lineHeight: "20px" }}>
      <nav aria-label="Hauptnavigation" data-navigation className="desk-leiste" style={{ width: 248, flexShrink: 0, boxSizing: "border-box", padding: "20px 12px 16px",
        background: "var(--surface)", borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column", overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, height: 32, padding: "0 8px", marginBottom: 16 }}>
          <PolarisMarke />
          <span title={verbunden ? "Verbunden" : "Offline"} aria-label={verbunden ? "Verbunden" : "Offline"}
            style={{ marginLeft: "auto", width: 8, height: 8, borderRadius: 4, background: verbunden ? "var(--green)" : "var(--muted)" }} />
        </div>

        <button onClick={() => setSuche(true)} data-navigation-frei className="desk-nav"
          style={{ ...zeile(false), border: "1px solid var(--border2)", marginBottom: 16, color: "var(--muted)" }}>
          <Search size={16} strokeWidth={1.5} aria-hidden="true" />
          <span style={{ flexGrow: 1, whiteSpace: "nowrap" }}>Suchen</span>
          <span style={{ fontFamily: "var(--font-zahl)", fontSize: 12, lineHeight: "16px", padding: "0 4px", border: "1px solid var(--border2)", borderBottomWidth: 2, borderRadius: 4 }}>⌘K</span>
        </button>

        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {nav.map(e => (
            <button key={e.id} className="desk-nav" onClick={() => onNav(e.id)} aria-current={aktivNav === e.id ? "page" : undefined} style={zeile(aktivNav === e.id)}>
              {e.Icon && <e.Icon size={18} strokeWidth={1.5} aria-hidden="true" />}
              <span style={{ flexGrow: 1 }}>{e.label}</span>
              {e.zahl != null && <span style={{ fontFamily: "var(--font-zahl)", fontSize: 12, color: "var(--muted)" }}>{e.zahl}</span>}
            </button>
          ))}
        </div>

        <div style={{ flexGrow: 1, minHeight: 24 }} />
        <div style={{ borderRadius: 8, background: "var(--bg)", padding: 4 }}>
          <div style={{ padding: "8px 8px 4px", fontSize: 13, color: "var(--text2)" }}>
            <div style={{ fontWeight: 500, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{firmenName || "Polaris"}</div>
            <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{[nutzerName, rolleLabel].filter(Boolean).join(" · ")}</div>
          </div>
          <div style={{ display: "flex", gap: 2 }}>
            {onProfil && <button onClick={onProfil} aria-label="Mein Profil" title="Mein Profil" style={symbol}><User size={16} strokeWidth={1.5} /></button>}
            {onAbwesenheit && <button onClick={onAbwesenheit} aria-label="Abwesenheit" title="Abwesenheit" style={symbol}><Palmtree size={16} strokeWidth={1.5} /></button>}
            <div style={{ flexGrow: 1 }} />
            <button onClick={onThemeWechsel} data-navigation-frei aria-label={dark ? "Helles Design" : "Dunkles Design"} title={dark ? "Helles Design" : "Dunkles Design"} style={symbol}>
              {dark ? <Sun size={16} strokeWidth={1.5} /> : <Moon size={16} strokeWidth={1.5} />}
            </button>
            <button onClick={onAbmelden} aria-label="Abmelden" title="Abmelden" style={symbol}><LogOut size={16} strokeWidth={1.5} /></button>
          </div>
        </div>
      </nav>

      <main style={{ flex: 1, minWidth: 0, overflowY: "auto" }}>
        <div className="desk-inhalt" style={{ maxWidth: 1360, boxSizing: "border-box", padding: "32px 32px 48px" }}>
          <header style={{ marginBottom: reiter?.length ? 16 : 24 }}>
            {kopfzeile && <div data-navigation style={{ fontSize: 13, color: "var(--text2)", marginBottom: 4 }}>{kopfzeile}</div>}
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: 16 }}>
              <div style={{ minWidth: 0 }}>
                <h1 style={{ margin: 0, fontSize: 28, lineHeight: "36px", fontWeight: 500, letterSpacing: "-0.01em" }}>{titel}</h1>
                {untertitel && <div style={{ color: "var(--text2)", marginTop: 4 }}>{untertitel}</div>}
              </div>
              {aktionen && <div data-navigation style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{aktionen}</div>}
            </div>
            {reiter?.length > 0 && (
              <div role="tablist" data-navigation style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 20, borderBottom: "1px solid var(--border)" }}>
                {reiter.map(r => {
                  const aktiv = aktiverReiter === r.id;
                  return (
                    <button key={r.id} role="tab" aria-selected={aktiv} onClick={() => onReiter(r.id)} className="desk-reiter"
                      style={{ height: 40, padding: "0 12px", border: "none", background: "none", fontFamily: "inherit", fontSize: 14, cursor: "pointer", marginBottom: -1,
                        color: aktiv ? "var(--text)" : "var(--text2)", fontWeight: aktiv ? 500 : 400,
                        boxShadow: aktiv ? "inset 0 -2px 0 var(--text)" : "none", borderRadius: 0 }}>{r.label}</button>
                  );
                })}
              </div>
            )}
          </header>
          {children}
        </div>
      </main>

      {suche && <Befehlspalette befehle={befehle} onSchliessen={() => setSuche(false)} />}
    </div>
  );
}

// ⌘K: Baustellen, Seiten und "KI fragen" mit der Tastatur erreichen.
function Befehlspalette({ befehle, onSchliessen }) {
  const [text, setText] = useState("");
  const [index, setIndex] = useState(0);
  const eingabe = useRef(null);
  useEffect(() => { eingabe.current?.focus(); }, []);
  const q = text.trim().toLowerCase();
  const treffer = useMemo(() => befehle
    .filter(b => b.immer || !q || b.label.toLowerCase().includes(q) || (b.suchtext || "").toLowerCase().includes(q))
    .slice(0, 12), [befehle, q]);
  useEffect(() => { setIndex(0); }, [q]);
  // Wechselt die Ansicht: bei ungespeicherten Änderungen erst nachfragen (lib/ungespeichert.js)
  const ausfuehren = async b => { onSchliessen(); const t = text.trim(); if (await verlassenBestaetigen()) b.aktion(t); };
  const taste = e => {
    if (e.key === "Escape") onSchliessen();
    else if (e.key === "ArrowDown") { e.preventDefault(); setIndex(i => Math.min(treffer.length - 1, i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setIndex(i => Math.max(0, i - 1)); }
    else if (e.key === "Enter" && treffer[index]) ausfuehren(treffer[index]);
  };
  let letzteGruppe = null;
  return (
    <div onClick={onSchliessen} style={{ position: "fixed", inset: 0, background: "rgba(22,24,29,0.32)", zIndex: 200, display: "flex", justifyContent: "center", paddingTop: "12vh" }}>
      <div role="dialog" aria-label="Suchen" onClick={e => e.stopPropagation()}
        style={{ width: 560, maxWidth: "calc(100vw - 32px)", alignSelf: "flex-start", background: "var(--surface)", border: "1px solid var(--border)",
          borderRadius: 12, boxShadow: "0 12px 32px rgba(22,24,29,0.16)", overflow: "hidden", animation: "desk-auf 140ms ease-out" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 16px", height: 52, borderBottom: "1px solid var(--border)", color: "var(--muted)" }}>
          <Search size={18} strokeWidth={1.5} aria-hidden="true" />
          <input ref={eingabe} value={text} onChange={e => setText(e.target.value)} onKeyDown={taste} placeholder="Baustelle, Seite oder Frage" aria-label="Suchen"
            style={{ flex: 1, border: "none", outline: "none", background: "transparent", font: "inherit", fontSize: 16, color: "var(--text)" }} />
        </label>
        <div role="listbox" style={{ maxHeight: 400, overflowY: "auto", padding: 8 }}>
          {treffer.map((b, i) => {
            const kopf = b.gruppe !== letzteGruppe ? (letzteGruppe = b.gruppe) : null;
            return (
              <div key={b.id}>
                {kopf && <div style={{ padding: "8px 8px 4px", fontSize: 12, color: "var(--muted)" }}>{kopf}</div>}
                <button role="option" aria-selected={i === index} onMouseEnter={() => setIndex(i)} onClick={() => ausfuehren(b)}
                  style={{ display: "flex", width: "100%", alignItems: "center", gap: 8, height: 36, padding: "0 8px", border: "none", borderRadius: 8, cursor: "pointer",
                    fontFamily: "inherit", fontSize: 14, textAlign: "left", background: i === index ? "var(--surface2)" : "transparent", color: "var(--text)" }}>
                  <span style={{ flexGrow: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.anzeige ? b.anzeige(text.trim()) : b.label}</span>
                  {b.hinweis && <span style={{ fontSize: 12, color: "var(--muted)" }}>{b.hinweis}</span>}
                </button>
              </div>
            );
          })}
          {!treffer.length && <div style={{ padding: 16, color: "var(--text2)" }}>Nichts gefunden</div>}
        </div>
      </div>
    </div>
  );
}
