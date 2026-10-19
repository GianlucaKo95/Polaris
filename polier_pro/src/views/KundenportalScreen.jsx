import { useState, useEffect } from "react";
import { MapPin, Users, Cloud, Camera, Building2, TriangleAlert, CircleCheckBig, Ban, ClipboardCheck, FileText, Download, Receipt } from "lucide-react";
import { sbKundenportalDaten } from "../lib/supabase.js";
import { PROJEKTTYPEN, AUFGABEN_STATUS } from "../config/konstanten.js";
import { KundenMangelMelden } from "../components/KundenMangelMelden.jsx";
import { KundenAbnahme } from "../components/KundenAbnahme.jsx";
import { KundenRechnungBestaetigen } from "../components/KundenRechnungBestaetigen.jsx";
import { rechnungGesamt } from "../lib/rechnung.js";

const EUR = n => (n || 0).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Öffentliche, read-only Seite für den Bauherrn — kein Login, kein Zugriff
// auf den Rest der App. Erreicht über ?kunde=<token> (siehe App.jsx), lädt
// ausschließlich über die kuratierte kundenportal_daten-RPC (kein Session-
// Token, kein Zugriff auf interne Daten wie Kosten/Mängel/Kommentare).
export function KundenportalScreen({ token }) {
  const [daten,  setDaten]  = useState(null);
  const [laden,  setLaden]  = useState(true);
  const [fehler, setFehler] = useState(false);
  const [zeigeMangelMelden, setZeigeMangelMelden] = useState(false);
  const [zeigeAbnahme, setZeigeAbnahme] = useState(false);
  const [abnahmeErgebnis, setAbnahmeErgebnis] = useState(null);
  const [rechnungZumBestaetigen, setRechnungZumBestaetigen] = useState(null); // die gerade geöffnete Rechnung, oder null
  const [rechnungErgebnisse, setRechnungErgebnisse] = useState({}); // { [rechnung_id]: { entscheidung, ... } } — optimistisch nach dem Absenden, bevor daten.rechnungen neu geladen wird

  useEffect(() => {
    let aktiv = true;
    sbKundenportalDaten(token).then(d => {
      if (!aktiv) return;
      if (!d) setFehler(true); else setDaten(d);
      setLaden(false);
    });
    return () => { aktiv = false; };
  }, [token]);

  if (laden) {
    return (
      <div style={{ minHeight:"100dvh", display:"flex", alignItems:"center", justifyContent:"center",
        background:"var(--bg)", color:"var(--muted)", fontFamily:"inherit" }}>
        Lädt…
      </div>
    );
  }

  if (fehler || !daten) {
    return (
      <div style={{ minHeight:"100dvh", display:"flex", flexDirection:"column", alignItems:"center",
        justifyContent:"center", background:"var(--bg)", color:"var(--text)", padding:24, textAlign:"center" }}>
        <Building2 size={40} style={{ opacity:0.4, marginBottom:12 }} />
        <div style={{ fontWeight:700, fontSize:16, marginBottom:6 }}>Link nicht gültig</div>
        <div style={{ color:"var(--muted)", fontSize:13.5 }}>
          Dieser Freigabe-Link ist abgelaufen oder wurde deaktiviert.
          Bitte beim Bauleiter einen neuen Link anfordern.
        </div>
      </div>
    );
  }

  const pct = daten.aufgaben_gesamt > 0
    ? Math.round((daten.aufgaben_fertig / daten.aufgaben_gesamt) * 100)
    : 0;
  const typInfo = PROJEKTTYPEN[daten.projekt_typ];
  // Die RPC coalesced tagesberichte serverseitig bereits auf '[]'::jsonb,
  // aber defensiv bleiben wie der Rest der App (bericht.bilder in
  // RevisionssichererExport.jsx, pdf.jsx, tagebuchVorlage.js) — sonst würde
  // diese öffentliche, loginfreie Seite bei einem unerwarteten null
  // komplett leer abstürzen statt den "Noch keine Berichte"-Hinweis zu zeigen.
  const tagesberichte = daten.tagesberichte || [];
  const maengel = daten.maengel || [];
  const dokumente = daten.dokumente || [];
  const rechnungen = daten.rechnungen || [];
  const abnahmeEntscheidung = abnahmeErgebnis?.entscheidung || daten.abnahme_entscheidung;
  const abnahmeName    = abnahmeErgebnis ? abnahmeErgebnis.name    : daten.abnahme_entschieden_name;
  const abnahmeDatum   = abnahmeErgebnis ? new Date(abnahmeErgebnis.entschieden_am) : (daten.abnahme_entschieden_am ? new Date(daten.abnahme_entschieden_am) : null);
  const abnahmeGrund   = abnahmeErgebnis ? abnahmeErgebnis.grund   : daten.abnahme_ablehnungsgrund;
  const abnahmeHash    = abnahmeErgebnis?.hash || daten.abnahme_hash;

  return (
    <div style={{ minHeight:"100dvh", background:"var(--bg)", color:"var(--text)", fontFamily:"inherit" }}>
      <div style={{ background:"var(--ink)", color:"#fff", padding:"20px 18px",
        paddingTop:"calc(20px + env(safe-area-inset-top))" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:14 }}>
          {daten.firma_logo_url
            ? <img src={daten.firma_logo_url} alt="" style={{ width:34, height:34, borderRadius:8, objectFit:"cover" }} />
            : <div style={{ width:34, height:34, borderRadius:8, background:"rgba(255,255,255,.1)",
                display:"flex", alignItems:"center", justifyContent:"center" }}>
                <Building2 size={18} />
              </div>}
          <div style={{ fontSize:13, fontWeight:700, color:"var(--yellow)" }}>{daten.firma_name}</div>
        </div>
        <div style={{ fontSize:22, fontWeight:800, letterSpacing:-0.5, lineHeight:1.2 }}>
          {typInfo?.icon} {daten.projekt_name}
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:5, color:"var(--ink-text2)",
          fontSize:12.5, marginTop:6 }}>
          <MapPin size={13} />
          {[daten.projekt_adresse, [daten.projekt_plz, daten.projekt_ort].filter(Boolean).join(" ")]
            .filter(Boolean).join(", ")}
        </div>
        {daten.bauleiter && (
          <div style={{ display:"flex", alignItems:"center", gap:5, color:"var(--ink-text2)",
            fontSize:12.5, marginTop:4 }}>
            <Users size={13} />Bauleiter: {daten.bauleiter}
          </div>
        )}
      </div>

      <div style={{ padding:"18px 16px 40px" }}>
        {/* Fortschritt */}
        <div style={{ background:"var(--ink)", color:"#fff", padding:"16px 18px", marginBottom:18 }}>
          <div style={{ display:"flex", alignItems:"baseline", gap:8 }}>
            <div className="num" style={{ fontSize:38, fontWeight:800, color:"var(--yellow)", lineHeight:1 }}>
              {pct}%
            </div>
            <div style={{ fontSize:12, color:"var(--ink-text2)" }}>Baufortschritt</div>
          </div>
          <div style={{ height:8, background:"rgba(255,255,255,.12)", marginTop:12 }}>
            <div style={{ height:"100%", width:`${pct}%`, background:"var(--yellow)", transition:"width .5s" }} />
          </div>
          <div style={{ fontSize:11.5, color:"var(--ink-text2)", marginTop:8 }}>
            {daten.aufgaben_fertig} von {daten.aufgaben_gesamt} Positionen abgeschlossen
          </div>
        </div>

        {/* Bauabnahme — einmalige Entscheidung über denselben Portal-Token,
            siehe kundenportal_abnahme_entscheiden-RPC. Vor der Entscheidung
            ein Hinweis + Button, danach eine feste Status-Anzeige (Hash als
            Beleg, analog zum Angebots-Nachweis). */}
        <div style={{ marginBottom:18 }}>
          {!abnahmeEntscheidung ? (
            <button onClick={() => setZeigeAbnahme(true)}
              style={{ width:"100%", background:"var(--ybg)", color:"var(--ydark)",
                border:"1.5px solid var(--yellow)", borderRadius:10, padding:"11px 14px",
                fontWeight:700, cursor:"pointer", fontSize:13, fontFamily:"inherit",
                display:"flex", alignItems:"center", justifyContent:"center", gap:7 }}>
              <ClipboardCheck size={15} />Bauabnahme
            </button>
          ) : (
            <div style={{ background:"var(--surface)", border:`1.5px solid ${abnahmeEntscheidung === "angenommen" ? "var(--green)" : "var(--red)"}`,
              borderRadius:10, padding:"12px 14px" }}>
              <div style={{ display:"flex", alignItems:"center", gap:7, fontWeight:700, fontSize:13,
                color: abnahmeEntscheidung === "angenommen" ? "var(--green)" : "var(--red)", marginBottom:4 }}>
                {abnahmeEntscheidung === "angenommen" ? <CircleCheckBig size={15} /> : <Ban size={15} />}
                Bauabnahme {abnahmeEntscheidung === "angenommen" ? "erklärt" : "verweigert"}
              </div>
              <div style={{ color:"var(--muted)", fontSize:12 }}>
                {abnahmeName && <>von {abnahmeName}</>}
                {abnahmeDatum && <> · {abnahmeDatum.toLocaleDateString("de-DE")}</>}
              </div>
              {abnahmeEntscheidung === "abgelehnt" && abnahmeGrund && (
                <div style={{ marginTop:6, fontSize:12.5, color:"var(--text2)" }}>{abnahmeGrund}</div>
              )}
              {abnahmeHash && (
                <div style={{ marginTop:6, fontFamily:"monospace", fontSize:10.5, color:"var(--muted)" }}>DOC-{abnahmeHash}</div>
              )}
            </div>
          )}
        </div>
        {zeigeAbnahme && (
          <KundenAbnahme token={token} onClose={() => setZeigeAbnahme(false)}
            onEntschieden={erg => { setAbnahmeErgebnis(erg); setZeigeAbnahme(false); }} />
        )}

        {/* Rechnungen — Abschlags-/Schlussrechnungen nach Baufortschritt
            (siehe lib/rechnung.js), hier nur versendete/bezahlte (nie
            Entwürfe). Vor einer Bestätigung zeigt eine Karte den
            Leistungsstand je Position mit Button; danach den unveränderlichen
            Beleg (Name/Zeitpunkt/Hash), analog zur Bauabnahme oben. */}
        {rechnungen.length > 0 && (
          <div style={{ marginBottom:18 }}>
            <div style={{ fontWeight:800, fontSize:13, marginBottom:10,
              display:"flex", alignItems:"center", gap:6 }}>
              <Receipt size={14} /> Rechnungen
            </div>
            {rechnungen.map(r => {
              const erg = rechnungErgebnisse[r.id];
              const entscheidung = erg?.entscheidung || r.bestaetigung?.entscheidung;
              const g = rechnungGesamt(r.netto_betrag, { sicherheitseinbehaltProzent: r.sicherheitseinbehalt_prozent, mwstProzent: r.mwst });
              return (
                <div key={r.id} style={{ background:"var(--surface)", border:"1px solid var(--border)",
                  padding:"12px 14px", marginBottom:9 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:8 }}>
                    <div>
                      <div style={{ fontWeight:700, fontSize:13.5 }}>
                        {r.typ === "schluss" ? "Schlussrechnung" : "Abschlagsrechnung"} {r.nummer}
                      </div>
                      <div style={{ color:"var(--muted)", fontSize:11.5, marginTop:2 }}>
                        {new Date(r.datum).toLocaleDateString("de-DE")}
                      </div>
                    </div>
                    <div style={{ fontWeight:800, fontSize:14, color:"var(--yellow)", flexShrink:0 }}>
                      {EUR(g.zahlbetrag)} €
                    </div>
                  </div>
                  {!entscheidung ? (
                    <button onClick={() => setRechnungZumBestaetigen(r)}
                      style={{ width:"100%", background:"var(--ybg)", color:"var(--ydark)",
                        border:"1.5px solid var(--yellow)", borderRadius:10, padding:"9px 12px",
                        fontWeight:700, cursor:"pointer", fontSize:12.5, fontFamily:"inherit",
                        marginTop:10, display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>
                      <ClipboardCheck size={13} />Leistungsstand bestätigen
                    </button>
                  ) : (
                    <div style={{ marginTop:9, color: entscheidung === "bestaetigt" ? "var(--green)" : "var(--red)",
                      fontSize:12, fontWeight:700, display:"flex", alignItems:"center", gap:5 }}>
                      {entscheidung === "bestaetigt" ? <CircleCheckBig size={13} /> : <Ban size={13} />}
                      Leistungsstand {entscheidung === "bestaetigt" ? "bestätigt" : "beanstandet"}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {rechnungZumBestaetigen && (
          <KundenRechnungBestaetigen rechnung={rechnungZumBestaetigen} token={token}
            onClose={() => setRechnungZumBestaetigen(null)}
            onEntschieden={erg => {
              setRechnungErgebnisse(x => ({ ...x, [rechnungZumBestaetigen.id]: erg }));
              setRechnungZumBestaetigen(null);
            }} />
        )}

        {/* Mangel melden — läuft über eine eigene, token-geprüfte RPC
            (kundenportal_mangel_melden), kein Login nötig. */}
        <button onClick={() => setZeigeMangelMelden(true)}
          style={{ width:"100%", background:"var(--rbg)", color:"var(--red)",
            border:"1.5px solid var(--red)", borderRadius:10, padding:"11px 14px",
            fontWeight:700, cursor:"pointer", fontSize:13, fontFamily:"inherit",
            display:"flex", alignItems:"center", justifyContent:"center", gap:7, marginBottom:18 }}>
          <TriangleAlert size={15} />Mangel melden
        </button>
        {zeigeMangelMelden && (
          <KundenMangelMelden token={token} onClose={() => setZeigeMangelMelden(false)} />
        )}

        {/* Mängel-Status — Nachverfolgung für bereits gemeldete (eigene wie
            fremde) Mängel dieses Projekts, damit nach dem Melden nicht
            einfach Stille herrscht. Reihenfolge wie von der RPC geliefert
            (neueste zuerst). */}
        {maengel.length > 0 && (
          <div style={{ marginBottom:18 }}>
            <div style={{ fontWeight:800, fontSize:13, marginBottom:10 }}>Mängel-Status</div>
            {maengel.map(m => {
              const statusInfo = AUFGABEN_STATUS[m.status] || AUFGABEN_STATUS.offen;
              const behoben = m.status === "abgeschlossen";
              return (
                <div key={m.id} style={{ background:"var(--surface)", border:"1px solid var(--border)",
                  padding:"12px 14px", marginBottom:9 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:8, marginBottom:4 }}>
                    <div style={{ fontWeight:700, fontSize:13.5 }}>{m.titel}</div>
                    <div style={{ display:"flex", alignItems:"center", gap:4, flexShrink:0,
                      color:statusInfo.farbe, fontSize:11.5, fontWeight:700 }}>
                      {statusInfo.icon} {statusInfo.label}
                    </div>
                  </div>
                  {m.beschreibung && (
                    <div style={{ fontSize:12.5, color:"var(--text2)", lineHeight:1.4, marginBottom:6 }}>
                      {m.beschreibung}
                    </div>
                  )}
                  <div style={{ fontSize:11, color:"var(--muted)" }}>
                    Gemeldet am {new Date(m.erstellt_am).toLocaleDateString("de-DE")}
                  </div>
                  {m.fotos?.length > 0 && (
                    <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginTop:8 }}>
                      {m.fotos.slice(0, 4).map((url, j) => (
                        <img key={j} src={url} alt="" style={{ width:48, height:48, borderRadius:8, objectFit:"cover" }} />
                      ))}
                    </div>
                  )}
                  {m.dokumente?.length > 0 && (
                    <div style={{ display:"flex", flexDirection:"column", gap:4, marginTop:8 }}>
                      {m.dokumente.map((url, j) => (
                        <a key={j} href={url} download={`Mangel-Anhang-${j + 1}.pdf`}
                          style={{ color:"var(--blue)", fontSize:11.5, display:"flex", alignItems:"center", gap:5, textDecoration:"none" }}>
                          <FileText size={12} />PDF-Anhang {j + 1}
                        </a>
                      ))}
                    </div>
                  )}
                  {behoben && m.behebung_fotos?.length > 0 && (
                    <div style={{ marginTop:8 }}>
                      <div style={{ fontSize:11, color:"var(--green)", fontWeight:700, marginBottom:5 }}>Nachweis Behebung</div>
                      <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                        {m.behebung_fotos.slice(0, 4).map((url, j) => (
                          <img key={j} src={url} alt="" style={{ width:48, height:48, borderRadius:8, objectFit:"cover" }} />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Dokumente — von der Firma bereitgestellte PDFs (Abnahmeprotokoll,
            Rechnung etc.), siehe ProjektDokumente.jsx (Upload-Seite). */}
        {dokumente.length > 0 && (
          <div style={{ marginBottom:18 }}>
            <div style={{ fontWeight:800, fontSize:13, marginBottom:10 }}>Dokumente</div>
            {dokumente.map(d => (
              <a key={d.id} href={d.daten} download={d.dateiname}
                style={{ display:"flex", alignItems:"center", gap:8, background:"var(--surface)",
                  border:"1px solid var(--border)", borderRadius:10, padding:"10px 14px",
                  marginBottom:6, color:"var(--text)", textDecoration:"none", fontSize:13 }}>
                <FileText size={15} style={{ flexShrink:0, color:"var(--blue)" }} />
                <span style={{ flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{d.dateiname}</span>
                <Download size={14} style={{ flexShrink:0, color:"var(--muted)" }} />
              </a>
            ))}
          </div>
        )}

        {/* Tagesberichte */}
        <div style={{ fontWeight:800, fontSize:13, marginBottom:10 }}>Baustellenberichte</div>
        {tagesberichte.length === 0 && (
          <div style={{ color:"var(--muted)", fontSize:13, textAlign:"center", padding:"20px 0" }}>
            Noch keine Berichte veröffentlicht.
          </div>
        )}
        {tagesberichte.map((b, i) => (
          <div key={i} style={{ background:"var(--surface)", border:"1px solid var(--border)",
            padding:"12px 14px", marginBottom:9 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
              <div style={{ fontWeight:700, fontSize:13.5 }}>
                {new Date(b.datum).toLocaleDateString("de-DE", { weekday:"short", day:"2-digit", month:"2-digit" })}
              </div>
              <div style={{ display:"flex", gap:10, color:"var(--muted)", fontSize:11.5 }}>
                {b.wetter && <span style={{ display:"flex", alignItems:"center", gap:4 }}><Cloud size={12} />{b.wetter}</span>}
                {b.arbeiter > 0 && <span style={{ display:"flex", alignItems:"center", gap:4 }}><Users size={12} />{b.arbeiter}</span>}
              </div>
            </div>
            {b.besonderheiten && (
              <div style={{ fontSize:12.5, color:"var(--text2)", lineHeight:1.4, marginBottom: b.bilder?.length ? 8 : 0 }}>
                {b.besonderheiten}
              </div>
            )}
            {b.bilder?.length > 0 && (
              <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                {b.bilder.slice(0, 6).map((url, j) => (
                  <img key={j} src={url} alt="" style={{ width:56, height:56, borderRadius:8, objectFit:"cover" }} />
                ))}
                {b.bilder.length > 6 && (
                  <div style={{ width:56, height:56, borderRadius:8, background:"var(--surface2)",
                    color:"var(--muted)", fontSize:11, fontWeight:700,
                    display:"flex", alignItems:"center", justifyContent:"center" }}>
                    <Camera size={11} style={{ marginRight:3 }} />+{b.bilder.length - 6}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        <div style={{ textAlign:"center", color:"var(--muted)", fontSize:11, marginTop:24 }}>
          Bereitgestellt über Polaris
        </div>
      </div>
    </div>
  );
}
