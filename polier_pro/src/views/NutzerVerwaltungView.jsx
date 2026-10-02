import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Users, Plus, TriangleAlert, X, Pencil, HardHat, Phone, CircleCheckBig, Ban, User, Calendar, Copy, ArrowUpRight, Mail, FileClock, MapPin } from "lucide-react";
import { sbFetch } from "../lib/supabase.js";
import { ROLLEN } from "../config/konstanten.js";
import { ibanMaskiert } from "../lib/utils.js";
import { EinladungGenerieren } from "./EinladungGenerieren.jsx";
import { useBackButton } from "../hooks/useBackButton.js";

const AENDERUNGS_FELD_LABEL = {
  strasse: "Straße", plz: "PLZ", ort: "Ort", iban: "IBAN", kontoinhaber: "Kontoinhaber",
};

export function NutzerVerwaltungView({ session, kolonnen = [], firmaId = null, projekte = [] }) {
  const [nutzer,      setNutzer]      = useState([]);
  const [einladungen, setEinladungen] = useState([]);
  const [aenderungen, setAenderungen] = useState([]);
  const [projektZugriffe, setProjektZugriffe] = useState([]); // [{profil_id, projekt_id}]
  const [laden,       setLaden]       = useState(true);
  const [ansicht,     setAnsicht]     = useState("nutzer"); // nutzer | einladungen | aenderungen
  const [editNutzer,  setEditNutzer]  = useState(null);
  const [zeigeEinladen, setZeigeEinladen] = useState(false);
  useBackButton(zeigeEinladen, () => setZeigeEinladen(false));
  const [aktionsFehler, setAktionsFehler] = useState("");
  const [ibanAufgedeckt, setIbanAufgedeckt] = useState(new Set());

  useEffect(() => { ladeAlles(); }, []);

  async function ladeAlles() {
    setLaden(true);
    const [n, e, a, z] = await Promise.all([
      sbFetch("profile?select=*&order=created_at.desc", {
        headers: { "Authorization": `Bearer ${session?.access_token}` }
      }),
      sbFetch("einladungen?select=*&order=created_at.desc&limit=20", {
        headers: { "Authorization": `Bearer ${session?.access_token}` }
      }),
      sbFetch("profil_aenderungen?select=*,profile!profil_aenderungen_profil_id_fkey(vorname,nachname)&order=beantragt_am.desc&limit=50", {
        headers: { "Authorization": `Bearer ${session?.access_token}` }
      }),
      sbFetch("projekt_zugriff?select=profil_id,projekt_id", {
        headers: { "Authorization": `Bearer ${session?.access_token}` }
      }),
    ]);
    if (n) setNutzer(n);
    if (e) setEinladungen(e);
    if (a) setAenderungen(a);
    if (z) setProjektZugriffe(z);
    setLaden(false);
  }

  // Baustellen-Zugriff für Rollen, die nicht siehtAlleProjekte sind (Polier,
  // Vorarbeiter, Facharbeiter) — steuert, welche Baustellen sie z.B. im
  // Stunden-Export sehen dürfen (durchgesetzt per RLS über projekt_zugriff,
  // hier nur die Verwaltungsoberfläche dafür).
  async function projektZugriffUmschalten(profilId, projektId, hatZugriff) {
    setAktionsFehler("");
    if (hatZugriff) {
      const ok = await sbFetch(`projekt_zugriff?profil_id=eq.${profilId}&projekt_id=eq.${projektId}`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${session?.access_token}` },
      });
      if (ok === null) { setAktionsFehler("Baustellen-Zugriff konnte nicht entfernt werden."); return; }
      setProjektZugriffe(prev => prev.filter(z => !(z.profil_id === profilId && z.projekt_id === projektId)));
    } else {
      const ok = await sbFetch("projekt_zugriff", {
        method: "POST",
        headers: { "Authorization": `Bearer ${session?.access_token}` },
        body: JSON.stringify({ profil_id: profilId, projekt_id: projektId }),
      });
      if (!ok?.length) { setAktionsFehler("Baustellen-Zugriff konnte nicht erteilt werden."); return; }
      setProjektZugriffe(prev => [...prev, { profil_id: profilId, projekt_id: projektId }]);
    }
  }

  async function aenderungBearbeiten(id, status) {
    setAktionsFehler("");
    let admin_notiz = null;
    if (status === "abgelehnt") {
      admin_notiz = window.prompt("Grund der Ablehnung (optional):") || null;
    }
    const ok = await sbFetch(`profil_aenderungen?id=eq.${id}`, {
      method: "PATCH",
      headers: { "Authorization": `Bearer ${session?.access_token}` },
      body: JSON.stringify({ status, bearbeitet_von: session?.user?.id, admin_notiz }),
    });
    if (!ok?.length) { setAktionsFehler("Änderungsanfrage konnte nicht bearbeitet werden."); return; }
    if (status === "genehmigt") ladeAlles(); // Profil hat sich serverseitig mitgeändert
    else setAenderungen(prev => prev.map(a => a.id === id ? { ...a, ...ok[0] } : a));
  }

  async function rolleAendern(id, neueRolle) {
    setAktionsFehler("");
    const ok = await sbFetch(`profile?id=eq.${id}`, {
      method: "PATCH",
      headers: { "Authorization": `Bearer ${session?.access_token}` },
      body: JSON.stringify({ rolle: neueRolle }),
    });
    if (!ok?.length) { setAktionsFehler("Rolle konnte nicht geändert werden."); return; }
    setNutzer(prev => prev.map(n => n.id === id ? { ...n, rolle: neueRolle } : n));
  }

  async function aktivitaetToggle(id, aktiv) {
    setAktionsFehler("");
    const ok = await sbFetch(`profile?id=eq.${id}`, {
      method: "PATCH",
      headers: { "Authorization": `Bearer ${session?.access_token}` },
      body: JSON.stringify({ aktiv: !aktiv }),
    });
    if (!ok?.length) { setAktionsFehler("Status konnte nicht geändert werden."); return; }
    setNutzer(prev => prev.map(n => n.id === id ? { ...n, aktiv: !aktiv } : n));
  }

  async function kolonneAendern(id, kolonneId) {
    setAktionsFehler("");
    const ok = await sbFetch(`profile?id=eq.${id}`, {
      method: "PATCH",
      headers: { "Authorization": `Bearer ${session?.access_token}` },
      body: JSON.stringify({ kolonne_id: kolonneId || null }),
    });
    if (!ok?.length) { setAktionsFehler("Kolonne konnte nicht geändert werden."); return; }
    setNutzer(prev => prev.map(n => n.id === id
      ? { ...n, kolonne_id: kolonneId || null } : n));
  }

  async function einladungWiderrufen(id) {
    setAktionsFehler("");
    const ok = await sbFetch(`einladungen?id=eq.${id}`, {
      method: "PATCH",
      headers: { "Authorization": `Bearer ${session?.access_token}` },
      body: JSON.stringify({ aktiv: false }),
    });
    if (!ok?.length) { setAktionsFehler("Einladung konnte nicht widerrufen werden."); return; }
    setEinladungen(prev => prev.map(e => e.id === id ? { ...e, aktiv: false } : e));
  }

  function teilen(link) {
    if (navigator.share) {
      navigator.share({ title: "Polaris Einladung", url: link });
    } else {
      navigator.clipboard?.writeText(link);
    }
  }

  const aktiveNutzer   = nutzer.filter(n => n.aktiv !== false);
  const inaktiveNutzer = nutzer.filter(n => n.aktiv === false);
  const offeneEinl     = einladungen.filter(e => e.aktiv && new Date(e.läuft_ab_at) > new Date());
  const abgelaufeneEinl= einladungen.filter(e => !e.aktiv || new Date(e.läuft_ab_at) <= new Date());
  const offeneAenderungen = aenderungen.filter(a => a.status === "offen");
  const entschiedeneAenderungen = aenderungen.filter(a => a.status !== "offen");

  return (
    <div>
      {/* Header */}
      <div style={{ display:"flex", justifyContent:"space-between",
        alignItems:"center", marginBottom:12 }}>
        <div style={{ color:"var(--text)", fontWeight:800, fontSize:16,
          display:"flex", alignItems:"center", gap:8 }}>
          <Users size={17} /> Nutzerverwaltung
        </div>
        <button onClick={() => setZeigeEinladen(true)}
          style={{ background:"var(--yellow)", color:"#1a1200", border:"none",
            borderRadius:10, padding:"8px 14px", fontWeight:700,
            cursor:"pointer", fontSize:13, fontFamily:"inherit",
            display:"flex", alignItems:"center", gap:5 }}>
          <Plus size={14} /> Einladen
        </button>
      </div>

      {aktionsFehler && (
        <div style={{ background:"var(--rbg)", color:"var(--red)", borderRadius:12,
          padding:"7px 14px", marginBottom:10, fontSize:12,
          border:"1px solid var(--red)",
          display:"flex", alignItems:"center", gap:6 }}>
          <TriangleAlert size={13} /> {aktionsFehler}
        </div>
      )}

      {/* Stats */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr",
        gap:8, marginBottom:12 }}>
        {[
          ["Aktive Nutzer",    aktiveNutzer.length,       "var(--green)"],
          ["Inaktiv",          inaktiveNutzer.length,     "var(--muted)"],
          ["Offen. Einl.",     offeneEinl.length,         "var(--yellow)"],
          ["Änderungen",       offeneAenderungen.length,  offeneAenderungen.length > 0 ? "var(--red)" : "var(--muted)"],
        ].map(([l,v,c]) => (
          <div key={l} style={{ background:"var(--surface)", borderRadius:12,
            padding:"7px 12px", border:"1.5px solid var(--border)",
            position:"relative", overflow:"hidden" }}>
            <div style={{ position:"absolute", top:0, left:0, right:0,
              height:3, background:c }} />
            {/* overflowWrap: mehrwortige Labels ("Aktive Nutzer") brechen am
                Leerzeichen von selbst um, aber ein einzelnes langes Wort ohne
                Leerzeichen ("Änderungen") hat sonst keine Umbruchstelle und
                wird vom overflow:hidden der Karte einfach abgeschnitten. */}
            <div style={{ color:"var(--muted)", fontSize:10, fontWeight:700,
              textTransform:"uppercase", marginBottom:4, overflowWrap:"anywhere" }}>{l}</div>
            <div style={{ color:"var(--text)", fontWeight:900, fontSize:22 }}>{v}</div>
          </div>
        ))}
      </div>

      {/* Tab Toggle */}
      <div style={{ display:"flex", gap:6, marginBottom:10 }}>
        {[["nutzer",User,"Nutzer"], ["einladungen",Mail,"Einladungen"], ["aenderungen",FileClock,"Änderungen"]].map(([k,Icon,l]) => (
          <button key={k} onClick={() => setAnsicht(k)}
            style={{ flex:1, position:"relative", background: ansicht===k ? "var(--yellow)" : "var(--surface2)",
              color: ansicht===k ? "#1a1200" : "var(--muted)",
              border:`1.5px solid ${ansicht===k ? "var(--yellow)" : "var(--border)"}`,
              borderRadius:10, padding:9, fontWeight: ansicht===k ? 700 : 400,
              cursor:"pointer", fontSize:13, fontFamily:"inherit",
              display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>
            <Icon size={13} /> {l}
            {k === "aenderungen" && offeneAenderungen.length > 0 && (
              <span style={{ position:"absolute", top:-6, right:-6, background:"var(--red)",
                color:"#fff", borderRadius:20, minWidth:18, height:18, fontSize:10, fontWeight:800,
                display:"flex", alignItems:"center", justifyContent:"center", padding:"0 4px" }}>
                {offeneAenderungen.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {laden && (
        <div style={{ textAlign:"center", color:"var(--muted)", padding:23 }}>
          Laden…
        </div>
      )}

      {/* NUTZER LISTE */}
      {!laden && ansicht === "nutzer" && (
        <div>
          {nutzer.map(n => {
            const rolle = ROLLEN[n.rolle] || ROLLEN.facharbeiter;
            const kolonne = kolonnen.find(k => k.id === n.kolonne_id);
            const isEdit = editNutzer === n.id;
            return (
              <div key={n.id} style={{ background:"var(--surface)", borderRadius:14,
                padding:"10px 16px", marginBottom:7,
                border:`1.5px solid ${n.aktiv === false ? "var(--border)" : "var(--border)"}`,
                opacity: n.aktiv === false ? 0.6 : 1 }}>

                {/* Nutzer Header */}
                <div style={{ display:"flex", justifyContent:"space-between",
                  alignItems:"flex-start", marginBottom: isEdit ? 12 : 0 }}>
                  <div style={{ display:"flex", gap:10, alignItems:"center" }}>
                    {/* Avatar */}
                    <div style={{ width:40, height:40, borderRadius:20,
                      background:`${rolle.farbe}22`,
                      border:`2px solid ${rolle.farbe}`,
                      display:"flex", alignItems:"center", justifyContent:"center",
                      fontSize:16, flexShrink:0 }}>
                      {n.avatar_url
                        ? <img src={n.avatar_url} style={{ width:36, height:36,
                            borderRadius:18, objectFit:"cover" }} />
                        : rolle.icon}
                    </div>
                    <div>
                      <div style={{ color:"var(--text)", fontWeight:700, fontSize:14 }}>
                        {n.vorname || "—"} {n.nachname || ""}
                        {n.aktiv === false && (
                          <span style={{ color:"var(--muted)", fontSize:11,
                            marginLeft:6 }}>· Inaktiv</span>
                        )}
                      </div>
                      <div style={{ display:"flex", gap:6, marginTop:2,
                        alignItems:"center" }}>
                        <div style={{ background:`${rolle.farbe}22`,
                          color:rolle.farbe, borderRadius:20,
                          padding:"1px 8px", fontSize:10, fontWeight:700 }}>
                          {rolle.icon} {rolle.label}
                        </div>
                        {kolonne && (
                          <div style={{ color:"var(--muted)", fontSize:11,
                            display:"flex", alignItems:"center", gap:3 }}>
                            <HardHat size={10} /> {kolonne.name}
                          </div>
                        )}
                      </div>
                      {n.telefon && (
                        <div style={{ color:"var(--muted)", fontSize:11, marginTop:2,
                          display:"flex", alignItems:"center", gap:3 }}>
                          <Phone size={10} /> {n.telefon}
                        </div>
                      )}
                    </div>
                  </div>
                  <button onClick={() => setEditNutzer(isEdit ? null : n.id)}
                    style={{ background:"var(--surface2)", border:"1px solid var(--border)",
                      color:"var(--muted)", borderRadius:8, padding:"4px 10px",
                      cursor:"pointer", fontSize:12, fontFamily:"inherit", display:"flex" }}>
                    {isEdit ? <X size={13} /> : <Pencil size={13} />}
                  </button>
                </div>

                {/* Edit Panel */}
                {isEdit && (
                  <div style={{ borderTop:"1px solid var(--border)", paddingTop:12,
                    display:"flex", flexDirection:"column", gap:10 }}>
                    <div>
                      <div style={{ color:"var(--muted)", fontSize:11,
                        fontWeight:600, marginBottom:4 }}>Rolle</div>
                      <select value={n.rolle || "facharbeiter"}
                        onChange={e => rolleAendern(n.id, e.target.value)}
                        style={{ width:"100%", background:"var(--surface2)",
                          color:"var(--text)", border:"1px solid var(--border)",
                          borderRadius:8, padding:"8px 10px", fontSize:13,
                          cursor:"pointer", fontFamily:"inherit" }}>
                        {Object.entries(ROLLEN).map(([k,r]) => (
                          <option key={k} value={k}>{r.icon} {r.label}</option>
                        ))}
                      </select>
                    </div>

                    {kolonnen.length > 0 && (
                      <div>
                        <div style={{ color:"var(--muted)", fontSize:11,
                          fontWeight:600, marginBottom:4 }}>Kolonne</div>
                        <select value={n.kolonne_id || ""}
                          onChange={e => kolonneAendern(n.id, e.target.value)}
                          style={{ width:"100%", background:"var(--surface2)",
                            color:"var(--text)", border:"1px solid var(--border)",
                            borderRadius:8, padding:"8px 10px", fontSize:13,
                            cursor:"pointer", fontFamily:"inherit" }}>
                          <option value="">Keine Kolonne</option>
                          {kolonnen.map(k => (
                            <option key={k.id} value={k.id}>{k.name}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* Baustellen-Zugriff — nur für Rollen, die nicht ohnehin
                        alle Baustellen sehen (z.B. Polier): steuert u.a., wessen
                        Stunden im Stunden-Export sichtbar sind. Für Vorarbeiter/
                        Facharbeiter ergibt sich der Zugriff automatisch aus der
                        zugewiesenen Kolonne und deren Baustelle (serverseitig per
                        RLS über kolonne_id durchgesetzt) — nur für Polier, die
                        keiner einzelnen Kolonne zugeordnet sind, bleibt der
                        Zugriff eine manuelle Vergabe je Baustelle. */}
                    {projekte.length > 0 && ROLLEN[n.rolle]?.siehtAlleProjekte === false && (
                      ROLLEN[n.rolle]?.baustellenZugriffUeberKolonne ? (
                        <div>
                          <div style={{ color:"var(--muted)", fontSize:11,
                            fontWeight:600, marginBottom:4, display:"flex",
                            alignItems:"center", gap:4 }}>
                            <MapPin size={11} /> Baustellen-Zugriff
                          </div>
                          {kolonne ? (
                            (() => {
                              const kolonneProjekt = projekte.find(p => p.id === kolonne.projekt_id);
                              return (
                                <div style={{ background:"var(--surface2)", border:"1px solid var(--border)",
                                  borderRadius:8, padding:"7px 10px", fontSize:13, color:"var(--text)" }}>
                                  Automatisch über Kolonne „{kolonne.name}“: {kolonneProjekt?.name || "Baustelle nicht gefunden"}
                                </div>
                              );
                            })()
                          ) : (
                            <div style={{ color:"var(--muted)", fontSize:12.5 }}>
                              Ohne zugewiesene Kolonne (siehe oben) hat {n.vorname || "dieser Nutzer"} aktuell keinen Baustellen-Zugriff.
                            </div>
                          )}
                        </div>
                      ) : (
                        <div>
                          <div style={{ color:"var(--muted)", fontSize:11,
                            fontWeight:600, marginBottom:4, display:"flex",
                            alignItems:"center", gap:4 }}>
                            <MapPin size={11} /> Baustellen-Zugriff
                          </div>
                          <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                            {projekte.map(p => {
                              const hatZugriff = projektZugriffe.some(z => z.profil_id === n.id && z.projekt_id === p.id);
                              return (
                                <label key={p.id} style={{ display:"flex", alignItems:"center", gap:8,
                                  background:"var(--surface2)", border:"1px solid var(--border)",
                                  borderRadius:8, padding:"7px 10px", fontSize:13,
                                  color:"var(--text)", cursor:"pointer" }}>
                                  <input type="checkbox" checked={hatZugriff}
                                    onChange={() => projektZugriffUmschalten(n.id, p.id, hatZugriff)} />
                                  {p.name}
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      )
                    )}

                    <button onClick={() => aktivitaetToggle(n.id, n.aktiv !== false)}
                      style={{ background: n.aktiv === false ? "var(--gbg)" : "var(--rbg)",
                        color: n.aktiv === false ? "var(--green)" : "var(--red)",
                        border:`1px solid ${n.aktiv === false ? "var(--green)" : "var(--red)"}`,
                        borderRadius:8, padding:"8px 14px", cursor:"pointer",
                        fontWeight:700, fontSize:13, fontFamily:"inherit",
                        display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>
                      {n.aktiv === false ? <><CircleCheckBig size={13} /> Nutzer reaktivieren</> : <><Ban size={13} /> Nutzer deaktivieren</>}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          {nutzer.length === 0 && !laden && (
            <div style={{ textAlign:"center", padding:"23px 20px",
              color:"var(--muted)" }}>
              <div style={{ display:"flex", justifyContent:"center", marginBottom:6 }}><User size={32} /></div>
              <div>Noch keine Nutzer · Lade Mitarbeiter ein</div>
            </div>
          )}
        </div>
      )}

      {/* ÄNDERUNGSANFRAGEN — Adresse/Bankverbindung, von Mitarbeitern
          eingereicht, wirken sich erst nach Freigabe hier auf das Profil aus */}
      {!laden && ansicht === "aenderungen" && (
        <div>
          {offeneAenderungen.length > 0 && (
            <div style={{ color:"var(--text)", fontWeight:700, fontSize:13, marginBottom:6 }}>
              Offene Anfragen
            </div>
          )}
          {offeneAenderungen.map(a => {
            const name = a.profile ? `${a.profile.vorname||""} ${a.profile.nachname||""}`.trim() : "Unbekannt";
            return (
              <div key={a.id} style={{ background:"var(--surface)", borderRadius:12,
                padding:"10px 14px", marginBottom:7, border:"1.5px solid var(--yellow)" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:10 }}>
                  <div>
                    <div style={{ color:"var(--text)", fontWeight:700, fontSize:14 }}>{name}</div>
                    <div style={{ color:"var(--muted)", fontSize:11, marginTop:2,
                      display:"flex", alignItems:"center", gap:4 }}>
                      <Calendar size={10} /> {new Date(a.beantragt_am).toLocaleDateString("de-DE")}
                    </div>
                  </div>
                </div>
                <div style={{ color:"var(--text2)", fontSize:12, marginTop:8,
                  background:"var(--surface2)", borderRadius:8, padding:"7px 10px" }}>
                  {Object.entries(a.felder).map(([k,v]) => {
                    const istIban = k === "iban";
                    const aufgedeckt = ibanAufgedeckt.has(a.id);
                    const anzeige = istIban && v && !aufgedeckt ? ibanMaskiert(v) : (v || "—");
                    return (
                      <div key={k} style={{ display:"flex", alignItems:"center", gap:8 }}>
                        <span>{AENDERUNGS_FELD_LABEL[k] || k}: <strong>{anzeige}</strong></span>
                        {istIban && v && (
                          <button onClick={() => setIbanAufgedeckt(prev => {
                              const next = new Set(prev);
                              next.has(a.id) ? next.delete(a.id) : next.add(a.id);
                              return next;
                            })}
                            style={{ background:"none", border:"none", color:"var(--muted)",
                              cursor:"pointer", fontSize:10, textDecoration:"underline", fontFamily:"inherit" }}>
                            {aufgedeckt ? "verbergen" : "anzeigen"}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div style={{ display:"flex", gap:8, marginTop:9 }}>
                  <button onClick={() => aenderungBearbeiten(a.id, "abgelehnt")}
                    style={{ flex:1, background:"var(--rbg)", color:"var(--red)",
                      border:`1px solid ${'var(--red)'}`, borderRadius:8, padding:"8px 0",
                      cursor:"pointer", fontWeight:700, fontSize:12, fontFamily:"inherit",
                      display:"flex", alignItems:"center", justifyContent:"center", gap:5 }}>
                    <Ban size={13} /> Ablehnen
                  </button>
                  <button onClick={() => aenderungBearbeiten(a.id, "genehmigt")}
                    style={{ flex:1, background:"var(--green)", color:"#fff",
                      border:"none", borderRadius:8, padding:"8px 0",
                      cursor:"pointer", fontWeight:700, fontSize:12, fontFamily:"inherit",
                      display:"flex", alignItems:"center", justifyContent:"center", gap:5 }}>
                    <CircleCheckBig size={13} /> Genehmigen
                  </button>
                </div>
              </div>
            );
          })}

          {entschiedeneAenderungen.length > 0 && (
            <div>
              <div style={{ color:"var(--muted)", fontWeight:600, fontSize:12,
                marginTop:16, marginBottom:6 }}>Bereits entschieden</div>
              {entschiedeneAenderungen.map(a => {
                const name = a.profile ? `${a.profile.vorname||""} ${a.profile.nachname||""}`.trim() : "Unbekannt";
                const genehmigt = a.status === "genehmigt";
                return (
                  <div key={a.id} style={{ background:"var(--surface)", borderRadius:10,
                    padding:"7px 12px", marginBottom:6, opacity:0.75,
                    border:"1px solid var(--border)" }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                      <div style={{ color:"var(--text)", fontSize:12, fontWeight:600 }}>{name}</div>
                      <div style={{ color: genehmigt ? "var(--green)" : "var(--red)",
                        fontSize:11, fontWeight:700, display:"flex", alignItems:"center", gap:4 }}>
                        {genehmigt ? <CircleCheckBig size={11} /> : <Ban size={11} />}
                        {genehmigt ? "Genehmigt" : "Abgelehnt"}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {aenderungen.length === 0 && (
            <div style={{ textAlign:"center", padding:"23px 20px", color:"var(--muted)" }}>
              <div style={{ display:"flex", justifyContent:"center", marginBottom:6 }}><FileClock size={32} /></div>
              <div>Keine Änderungsanfragen</div>
            </div>
          )}
        </div>
      )}

      {/* EINLADUNGEN */}
      {!laden && ansicht === "einladungen" && (
        <div>
          {offeneEinl.length > 0 && (
            <div style={{ color:"var(--text)", fontWeight:700, fontSize:13,
              marginBottom:6 }}>Offene Einladungen</div>
          )}
          {offeneEinl.map(e => {
            const rolle = ROLLEN[e.rolle] || ROLLEN.facharbeiter;
            const link = `${window.location.origin}?einladung=${e.token}`;
            const abgelaufen = new Date(e.läuft_ab_at).toLocaleDateString("de-DE");
            return (
              <div key={e.id} style={{ background:"var(--surface)", borderRadius:12,
                padding:"9px 14px", marginBottom:6,
                border:"1.5px solid var(--yellow)" }}>
                <div style={{ display:"flex", justifyContent:"space-between",
                  alignItems:"flex-start", marginBottom:6 }}>
                  <div>
                    <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                      <div style={{ background:`${rolle.farbe}22`, color:rolle.farbe,
                        borderRadius:20, padding:"2px 8px", fontSize:11,
                        fontWeight:700 }}>
                        {rolle.icon} {rolle.label}
                      </div>
                    </div>
                    <div style={{ color:"var(--muted)", fontSize:11, marginTop:4,
                      display:"flex", alignItems:"center", gap:4 }}>
                      <Calendar size={10} /> Gültig bis {abgelaufen}
                      {e.email && ` · ${e.email}`}
                    </div>
                  </div>
                  <button onClick={() => einladungWiderrufen(e.id)}
                    style={{ background:"var(--rbg)", color:"var(--red)",
                      border:"1px solid var(--red)", borderRadius:8,
                      padding:"4px 10px", cursor:"pointer", fontSize:11,
                      fontFamily:"inherit" }}>
                    Widerrufen
                  </button>
                </div>
                <div style={{ display:"flex", gap:6 }}>
                  <div style={{ flex:1, background:"var(--surface2)", borderRadius:8,
                    padding:"7px 10px", fontSize:11, color:"var(--muted)",
                    overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                    {link}
                  </div>
                  <button onClick={() => navigator.clipboard?.writeText(link)}
                    style={{ background:"var(--surface2)", color:"var(--muted)",
                      border:"1px solid var(--border)", borderRadius:8,
                      padding:"0 12px", cursor:"pointer",
                      fontFamily:"inherit", flexShrink:0, display:"flex", alignItems:"center" }}>
                    <Copy size={14} />
                  </button>
                  <button onClick={() => teilen(link)}
                    style={{ background:"var(--green)", color:"#fff",
                      border:"none", borderRadius:8, padding:"0 12px",
                      cursor:"pointer", fontFamily:"inherit",
                      flexShrink:0, display:"flex", alignItems:"center" }}>
                    <ArrowUpRight size={14} />
                  </button>
                </div>
              </div>
            );
          })}

          {abgelaufeneEinl.length > 0 && (
            <div>
              <div style={{ color:"var(--muted)", fontWeight:600, fontSize:12,
                marginTop:16, marginBottom:6 }}>Abgelaufen / Widerrufen</div>
              {abgelaufeneEinl.map(e => {
                const rolle = ROLLEN[e.rolle] || ROLLEN.facharbeiter;
                return (
                  <div key={e.id} style={{ background:"var(--surface)", borderRadius:10,
                    padding:"7px 12px", marginBottom:6, opacity:0.5,
                    border:"1px solid var(--border)" }}>
                    <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                      <div style={{ color:rolle.farbe, fontSize:11,
                        fontWeight:700 }}>{rolle.icon} {rolle.label}</div>
                      <div style={{ color:"var(--muted)", fontSize:11 }}>
                        · {e.aktiv === false ? "Widerrufen" : "Abgelaufen"}
                        {e.eingelöst_at ? " · Eingelöst" : ""}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {einladungen.length === 0 && !laden && (
            <div style={{ textAlign:"center", padding:"23px 20px",
              color:"var(--muted)" }}>
              <div style={{ display:"flex", justifyContent:"center", marginBottom:6 }}><Mail size={32} /></div>
              <div>Noch keine Einladungen generiert</div>
            </div>
          )}
        </div>
      )}

      {/* Einladungs-Generator Modal — als Portal gerendert, sonst derselbe
          nested-position:fixed-Bug wie beim Aufgabenformular */}
      {zeigeEinladen && createPortal(
        <div style={{ position:"fixed", top:0, left:0, right:0, bottom:0,
          background:"var(--bg)", zIndex:500, overflowY:"auto",
          WebkitOverflowScrolling:"touch" }}>
          <div style={{ background:"var(--surface)", padding:"10px 18px",
            paddingTop:"calc(14px + env(safe-area-inset-top))",
            borderBottom:"3px solid var(--yellow)", position:"sticky", top:0,
            display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <div style={{ fontWeight:700, fontSize:16, color:"var(--text)",
              display:"flex", alignItems:"center", gap:8 }}>
              <User size={16} /> Mitarbeiter einladen
            </div>
            <button onClick={() => { setZeigeEinladen(false); ladeAlles(); }}
              style={{ background:"var(--surface2)", border:"1px solid var(--border)",
                color:"var(--text)", borderRadius:8, padding:"6px 14px",
                cursor:"pointer", fontFamily:"inherit", display:"flex" }}><X size={15} /></button>
          </div>
          <div style={{ padding:"14px 16px" }}>
            <EinladungGenerieren
              session={session}
              firmaId={firmaId}
              kolonnen={kolonnen}
            />
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
