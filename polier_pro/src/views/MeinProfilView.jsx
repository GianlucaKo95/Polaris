import { useState, useEffect } from "react";
import { MapPin, Landmark, Send, Clock, CircleCheckBig, Ban, Lock, LockOpen } from "lucide-react";
import { sbFetch } from "../lib/supabase.js";
import { ROLLEN } from "../config/konstanten.js";
import { ibanGueltig, sha256Hex } from "../lib/utils.js";
import { Label, inputStyle } from "../components/Label.jsx";

const STATUS_ANZEIGE = {
  offen:      { label: "Offen — wartet auf Freigabe",  farbe: "var(--yellow)", icon: Clock },
  genehmigt:  { label: "Genehmigt",                     farbe: "var(--green)",  icon: CircleCheckBig },
  abgelehnt:  { label: "Abgelehnt",                     farbe: "var(--red)",    icon: Ban },
};

// Adresse und Bankverbindung sind sensible Daten (Bankdaten sind ein
// klassischer Betrugsvektor bei Gehaltsauszahlungen) — Änderungen wirken
// sich deshalb nicht sofort aus, sondern landen als Anfrage beim
// Administrator. Serverseitig erzwungen über einen Datenbank-Trigger
// (profile_sensible_felder_schuetzen), nicht nur hier in der UI.
export function MeinProfilView({ profil, session, onProfilAktualisiert, pinPflicht }) {
  const [anfragen, setAnfragen] = useState([]);
  const [laden,    setLaden]    = useState(true);
  const [form,     setForm]     = useState({ strasse:"", plz:"", ort:"", iban:"", kontoinhaber:"" });
  const [senden,   setSenden]   = useState(false);
  const [fehler,   setFehler]   = useState("");

  // App-Sperre — anders als Adresse/Bankverbindung rein persönlich (wie ein
  // Passwort), deshalb ohne Admin-Freigabe direkt änderbar. Nur der Hash
  // landet in profile.pin, nie die PIN selbst.
  const [pinAktiv,   setPinAktiv]   = useState(false);
  const [pinBearbeiten, setPinBearbeiten] = useState(false);
  const [pinNeu,      setPinNeu]      = useState("");
  const [pinNeu2,     setPinNeu2]     = useState("");
  const [pinSpeichert,setPinSpeichert]= useState(false);
  const [pinFehler,   setPinFehler]   = useState("");
  const [pinErfolg,   setPinErfolg]   = useState("");

  useEffect(() => {
    if (!profil?.id) return;
    setForm({
      strasse:      profil.strasse || "",
      plz:          profil.plz || "",
      ort:          profil.ort || "",
      iban:         profil.iban || "",
      kontoinhaber: profil.kontoinhaber || "",
    });
    setPinAktiv(!!profil.pin);
    ladeAnfragen();
  }, [profil?.id]);

  async function pinSpeichern() {
    setPinFehler(""); setPinErfolg("");
    if (!/^\d{4}$/.test(pinNeu) || pinNeu !== pinNeu2) {
      setPinFehler("Beide Eingaben müssen aus 4 Ziffern bestehen und übereinstimmen.");
      return;
    }
    setPinSpeichert(true);
    const hash = await sha256Hex(pinNeu);
    const ok = await sbFetch(`profile?id=eq.${profil.id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ pin: hash }),
    });
    setPinSpeichert(false);
    if (!ok?.length) { setPinFehler("PIN konnte nicht gespeichert werden."); return; }
    setPinAktiv(true);
    setPinBearbeiten(false);
    setPinNeu(""); setPinNeu2("");
    setPinErfolg("PIN gespeichert — gilt ab dem nächsten Öffnen der App.");
    onProfilAktualisiert?.({ pin: hash });
  }

  async function pinEntfernen() {
    setPinFehler(""); setPinErfolg("");
    setPinSpeichert(true);
    const ok = await sbFetch(`profile?id=eq.${profil.id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ pin: null }),
    });
    setPinSpeichert(false);
    if (!ok?.length) { setPinFehler("PIN konnte nicht entfernt werden."); return; }
    setPinAktiv(false);
    setPinErfolg("App-Sperre deaktiviert.");
    onProfilAktualisiert?.({ pin: null });
  }

  async function ladeAnfragen() {
    setLaden(true);
    const data = await sbFetch(
      `profil_aenderungen?select=*&profil_id=eq.${profil.id}&order=beantragt_am.desc&limit=5`,
      { headers: { Authorization: `Bearer ${session?.access_token}` } }
    );
    setAnfragen(data || []);
    setLaden(false);
  }

  const offeneAnfrage = anfragen.find(a => a.status === "offen");

  async function anfrageSenden() {
    setFehler("");
    const geaendert = {};
    for (const key of ["strasse", "plz", "ort", "iban", "kontoinhaber"]) {
      const neu = key === "iban" ? form[key].replace(/\s+/g, "").trim() : form[key].trim();
      if (neu !== (profil[key] || "")) geaendert[key] = neu;
    }
    if (Object.keys(geaendert).length === 0) {
      setFehler("Keine Änderung gegenüber den hinterlegten Daten.");
      return;
    }
    if (geaendert.iban && !ibanGueltig(geaendert.iban)) {
      setFehler("IBAN ungültig — bitte prüfen (Tippfehler in Länderkürzel, Prüfziffer oder Kontonummer).");
      return;
    }
    setSenden(true);
    const ok = await sbFetch("profil_aenderungen", {
      method: "POST",
      headers: { Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({
        profil_id: profil.id,
        firma_id:  profil.firma_id,
        felder:    geaendert,
      }),
    });
    setSenden(false);
    if (!ok?.length) { setFehler("Anfrage konnte nicht gesendet werden."); return; }
    ladeAnfragen();
  }

  async function anfrageZurueckziehen(id) {
    await sbFetch(`profil_aenderungen?id=eq.${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${session?.access_token}` },
    });
    ladeAnfragen();
  }

  if (!profil) return null;
  const rolle = ROLLEN[profil.rolle] || ROLLEN.facharbeiter;
  const pinPflichtGiltFuerMich = pinPflicht && profil.rolle !== "administrator";

  return (
    <div>
      {/* Kopf */}
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:16 }}>
        <div style={{ width:48, height:48, borderRadius:24,
          background:`${rolle.farbe}22`, border:`2px solid ${rolle.farbe}`,
          display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, flexShrink:0 }}>
          {profil.avatar_url
            ? <img src={profil.avatar_url} style={{ width:44, height:44, borderRadius:22, objectFit:"cover" }} />
            : rolle.icon}
        </div>
        <div>
          <div style={{ color:"var(--text)", fontWeight:800, fontSize:17 }}>
            {profil.vorname || "—"} {profil.nachname || ""}
          </div>
          <div style={{ background:`${rolle.farbe}22`, color:rolle.farbe, borderRadius:20,
            padding:"1px 8px", fontSize:11, fontWeight:700, display:"inline-flex",
            alignItems:"center", gap:4, marginTop:3 }}>
            {rolle.icon} {rolle.label}
          </div>
        </div>
      </div>

      {/* App-Sperre */}
      <div style={{ background:"var(--surface)", border:"1px solid var(--border)",
        borderRadius:12, padding:"12px 14px", marginBottom:16 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div style={{ color:"var(--text)", fontWeight:700, fontSize:13,
            display:"flex", alignItems:"center", gap:6 }}>
            {pinAktiv ? <Lock size={14} /> : <LockOpen size={14} />} App-Sperre
          </div>
          {!pinBearbeiten && (
            <button onClick={() => { setPinBearbeiten(true); setPinFehler(""); setPinErfolg(""); }}
              style={{ background:"none", border:"none", color:"var(--ydark)",
                cursor:"pointer", fontSize:12, fontWeight:700, fontFamily:"inherit" }}>
              {pinAktiv ? "PIN ändern" : "PIN einrichten"}
            </button>
          )}
        </div>
        <div style={{ color:"var(--muted)", fontSize:11, marginTop:4 }}>
          {pinAktiv
            ? "Aktiv — beim Öffnen der App und nach längerer Zeit im Hintergrund wird die PIN abgefragt."
            : "Noch nicht eingerichtet — schneller Schutz, falls das Handy in fremde Hände gerät."}
          {pinPflichtGiltFuerMich && " Von eurem Administrator verpflichtend eingestellt."}
        </div>

        {pinBearbeiten && (
          <div style={{ marginTop:10 }}>
            <div style={{ display:"flex", gap:8 }}>
              <input value={pinNeu} onChange={e=>setPinNeu(e.target.value.replace(/\D/g,"").slice(0,4))}
                placeholder="Neue PIN" type="password" inputMode="numeric" maxLength={4}
                style={{ flex:1, textAlign:"center", letterSpacing:6, ...inputStyle() }} />
              <input value={pinNeu2} onChange={e=>setPinNeu2(e.target.value.replace(/\D/g,"").slice(0,4))}
                placeholder="Wiederholen" type="password" inputMode="numeric" maxLength={4}
                onKeyDown={e => e.key==="Enter" && pinSpeichern()}
                style={{ flex:1, textAlign:"center", letterSpacing:6, ...inputStyle() }} />
            </div>
            {pinFehler && (
              <div style={{ color:"var(--red)", fontSize:11, marginTop:6 }}>{pinFehler}</div>
            )}
            <div style={{ display:"flex", gap:8, marginTop:8 }}>
              <button onClick={() => { setPinBearbeiten(false); setPinNeu(""); setPinNeu2(""); setPinFehler(""); }}
                style={{ flex:1, background:"var(--surface2)", color:"var(--muted)",
                  border:"1px solid var(--border)", borderRadius:8, padding:9,
                  cursor:"pointer", fontSize:12, fontFamily:"inherit" }}>
                Abbrechen
              </button>
              <button onClick={pinSpeichern} disabled={pinSpeichert}
                style={{ flex:1, background:"var(--yellow)", color:"#1a1200", border:"none",
                  borderRadius:8, padding:9, fontWeight:700, cursor:"pointer",
                  fontSize:12, fontFamily:"inherit" }}>
                {pinSpeichert ? "…" : "Speichern"}
              </button>
            </div>
          </div>
        )}

        {pinAktiv && !pinBearbeiten && !pinPflichtGiltFuerMich && (
          <button onClick={pinEntfernen} disabled={pinSpeichert}
            style={{ background:"none", border:"none", color:"var(--red)",
              cursor:"pointer", fontSize:11, marginTop:8, fontFamily:"inherit",
              textDecoration:"underline" }}>
            App-Sperre deaktivieren
          </button>
        )}
        {pinErfolg && (
          <div style={{ color:"var(--green)", fontSize:11, marginTop:8, fontWeight:600 }}>{pinErfolg}</div>
        )}
      </div>

      {fehler && (
        <div style={{ background:"var(--rbg)", color:"var(--red)", borderRadius:10,
          padding:"8px 12px", marginBottom:10, fontSize:12 }}>{fehler}</div>
      )}

      {/* Offene Anfrage */}
      {offeneAnfrage && (
        <div style={{ background:"var(--ybg)", border:"1.5px solid var(--yellow)",
          borderRadius:12, padding:"10px 14px", marginBottom:14 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <div style={{ color:"var(--ydark)", fontWeight:700, fontSize:13,
              display:"flex", alignItems:"center", gap:6 }}>
              <Clock size={14} /> Änderungsanfrage ausstehend
            </div>
            <button onClick={() => anfrageZurueckziehen(offeneAnfrage.id)}
              style={{ background:"none", border:"none", color:"var(--muted)",
                cursor:"pointer", fontSize:11, textDecoration:"underline", fontFamily:"inherit" }}>
              Zurückziehen
            </button>
          </div>
          <div style={{ color:"var(--text2)", fontSize:12, marginTop:6 }}>
            {Object.entries(offeneAnfrage.felder).map(([k,v]) => (
              <div key={k}>{FELD_LABEL[k] || k}: <strong>{v || "—"}</strong></div>
            ))}
          </div>
          <div style={{ color:"var(--muted)", fontSize:11, marginTop:6 }}>
            Diese Daten werden erst nach Freigabe durch einen Administrator übernommen.
          </div>
        </div>
      )}

      {/* Formular */}
      <fieldset disabled={!!offeneAnfrage || senden}
        style={{ border:"none", padding:0, margin:0, opacity: offeneAnfrage ? 0.5 : 1 }}>
        <div style={{ color:"var(--text)", fontWeight:700, fontSize:13, marginBottom:8,
          display:"flex", alignItems:"center", gap:6 }}>
          <MapPin size={14} /> Adresse
        </div>
        <div style={{ marginBottom:9 }}>
          <Label>Straße + Nr.</Label>
          <input value={form.strasse} onChange={e=>setForm(p=>({...p,strasse:e.target.value}))}
            placeholder="Musterstraße 12" style={inputStyle()} />
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 2fr", gap:8, marginBottom:16 }}>
          <div>
            <Label>PLZ</Label>
            <input value={form.plz} onChange={e=>setForm(p=>({...p,plz:e.target.value}))}
              placeholder="80331" style={inputStyle()} />
          </div>
          <div>
            <Label>Ort</Label>
            <input value={form.ort} onChange={e=>setForm(p=>({...p,ort:e.target.value}))}
              placeholder="München" style={inputStyle()} />
          </div>
        </div>

        <div style={{ color:"var(--text)", fontWeight:700, fontSize:13, marginBottom:8,
          display:"flex", alignItems:"center", gap:6 }}>
          <Landmark size={14} /> Bankverbindung
        </div>
        <div style={{ marginBottom:9 }}>
          <Label>Kontoinhaber</Label>
          <input value={form.kontoinhaber} onChange={e=>setForm(p=>({...p,kontoinhaber:e.target.value}))}
            placeholder="Max Mustermann" style={inputStyle()} />
        </div>
        <div style={{ marginBottom:16 }}>
          <Label>IBAN</Label>
          <input value={form.iban} onChange={e=>setForm(p=>({...p,iban:e.target.value.toUpperCase()}))}
            placeholder="DE00 0000 0000 0000 0000 00" style={inputStyle()} />
        </div>

        <button onClick={anfrageSenden}
          style={{ width:"100%", background:"var(--yellow)", color:"#1a1200", border:"none",
            borderRadius:10, padding:12, fontWeight:700, cursor:"pointer", fontSize:14,
            fontFamily:"inherit", display:"flex", alignItems:"center", justifyContent:"center", gap:7 }}>
          <Send size={15} /> {senden ? "Wird gesendet…" : "Änderung beantragen"}
        </button>
        <div style={{ color:"var(--muted)", fontSize:11, marginTop:6, textAlign:"center" }}>
          Änderungen an Adresse und Bankverbindung werden erst nach Freigabe durch
          einen Administrator wirksam.
        </div>
      </fieldset>

      {/* Verlauf */}
      {!laden && anfragen.length > 0 && (
        <div style={{ marginTop:20 }}>
          <div style={{ color:"var(--muted)", fontWeight:700, fontSize:12, marginBottom:8 }}>
            Bisherige Anfragen
          </div>
          {anfragen.map(a => {
            const s = STATUS_ANZEIGE[a.status] || STATUS_ANZEIGE.offen;
            const Icon = s.icon;
            return (
              <div key={a.id} style={{ background:"var(--surface)", border:"1px solid var(--border)",
                borderRadius:10, padding:"8px 12px", marginBottom:6 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <div style={{ color:s.farbe, fontWeight:700, fontSize:12,
                    display:"flex", alignItems:"center", gap:5 }}>
                    <Icon size={12} /> {s.label}
                  </div>
                  <div style={{ color:"var(--muted)", fontSize:11 }}>
                    {new Date(a.beantragt_am).toLocaleDateString("de-DE")}
                  </div>
                </div>
                {a.status === "abgelehnt" && a.admin_notiz && (
                  <div style={{ color:"var(--muted)", fontSize:11, marginTop:4, fontStyle:"italic" }}>
                    „{a.admin_notiz}“
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const FELD_LABEL = {
  strasse: "Straße", plz: "PLZ", ort: "Ort", iban: "IBAN", kontoinhaber: "Kontoinhaber",
};
