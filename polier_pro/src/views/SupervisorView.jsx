import { useState, useEffect } from "react";
import { Crown, UserPlus, TriangleAlert, CircleCheckBig, Building2, Pencil, X, Users, Ban, LockKeyhole } from "lucide-react";
import { Label, inputStyle } from "../components/Label.jsx";
import { Spinner } from "../components/Spinner.jsx";
import { PLAN_CONFIG } from "../config/konstanten.js";
import { sbSupervisorNutzerEinladen, sbSupervisorFirmenListe, sbSupervisorFirmaAktualisieren } from "../lib/supabase.js";

// Werte MÜSSEN exakt zu PlanGuard.jsx passen — das ist die Stelle, die
// plan_status tatsächlich auswertet und bei "cancelled"/"expired" den
// Zugriff sperrt. "overdue" ist bewusst NICHT in dieser Sperrliste
// (realistische Kulanzfrist bei Zahlungsproblemen, bevor der Zugang
// tatsächlich blockiert wird) — nur Information für den Supervisor, kein
// Blocker.
const PLAN_STATUS_LABEL = {
  active:    { label: "Aktiv",      farbe: "var(--green)" },
  overdue:   { label: "Überfällig", farbe: "var(--yellow)" },
  cancelled: { label: "Gekündigt",  farbe: "var(--red)" },
  expired:   { label: "Abgelaufen", farbe: "var(--red)" },
};

// ISO-Timestamp -> value für <input type="date"> (YYYY-MM-DD), bzw. "" wenn
// nicht gesetzt — das Datumsfeld selbst bleibt bewusst nur tageweise genau,
// die Uhrzeit aus trial_ends_at/plan_ends_at interessiert hier nicht.
function alsDatumInput(iso) {
  return iso ? iso.slice(0, 10) : "";
}

// Nur erreichbar für profile.ist_supervisor = true (siehe App.jsx — der
// Home-Tab dafür wird nur dann überhaupt gerendert). Löst den einzigen
// Schritt, der bisher zwingend über das Supabase-Dashboard lief: das
// allererste Admin-Konto einer komplett neuen Kundenfirma anlegen, bevor
// dort irgendjemand eingeloggt ist, um eine normale Einladung zu
// generieren. Alles danach (Passwort setzen, Firma anlegen, Rolle
// "administrator") läuft bereits über bestehende App-Logik — siehe
// supabase/functions/supervisor-nutzer-einladen/index.ts.
export function SupervisorView({ session }) {
  const [email,  setEmail]  = useState("");
  const [laedt,  setLaedt]  = useState(false);
  const [fehler, setFehler] = useState("");
  const [erfolg, setErfolg] = useState("");

  const [firmen,       setFirmen]       = useState([]);
  const [firmenLaedt,  setFirmenLaedt]  = useState(true);
  const [firmenFehler, setFirmenFehler] = useState("");
  const [editId,       setEditId]       = useState(null);
  const [editForm,     setEditForm]     = useState(null);
  const [speichert,    setSpeichert]    = useState(false);

  useEffect(() => { ladeFirmen(); }, []);

  async function ladeFirmen() {
    setFirmenLaedt(true); setFirmenFehler("");
    const daten = await sbSupervisorFirmenListe(session);
    if (daten === null) { setFirmenFehler("Firmenliste konnte nicht geladen werden."); setFirmenLaedt(false); return; }
    setFirmen(daten);
    setFirmenLaedt(false);
  }

  async function einladen() {
    const adresse = email.trim();
    if (!adresse || laedt) return;
    setLaedt(true); setFehler(""); setErfolg("");
    const { ok, fehler: f } = await sbSupervisorNutzerEinladen(adresse, session);
    setLaedt(false);
    if (!ok) { setFehler(f); return; }
    setErfolg(`Einladung an ${adresse} gesendet — sobald die Person ihr Passwort setzt, richtet sie ihre eigene Firma im normalen Onboarding selbst ein.`);
    setEmail("");
  }

  function bearbeitenOeffnen(f) {
    setEditId(f.id);
    setEditForm({
      plan: f.plan, planStatus: f.plan_status,
      trialEndsAt: alsDatumInput(f.trial_ends_at), planEndsAt: alsDatumInput(f.plan_ends_at),
      gesperrt: f.gesperrt,
    });
  }

  async function speichern(firmaId) {
    setSpeichert(true); setFirmenFehler("");
    const { ok, fehler: f } = await sbSupervisorFirmaAktualisieren(firmaId, {
      plan: editForm.plan,
      planStatus: editForm.planStatus,
      trialEndsAt: editForm.trialEndsAt ? new Date(editForm.trialEndsAt).toISOString() : null,
      planEndsAt: editForm.planEndsAt ? new Date(editForm.planEndsAt).toISOString() : null,
      gesperrt: editForm.gesperrt,
    }, session);
    setSpeichert(false);
    if (!ok) { setFirmenFehler(f); return; }
    setEditId(null);
    ladeFirmen();
  }

  return (
    <div>
      <div style={{ color:"var(--text)", fontWeight:800, fontSize:16,
        display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
        <Crown size={17} /> Supervisor
      </div>
      <div style={{ color:"var(--muted)", fontSize:12.5, lineHeight:1.5, marginBottom:16 }}>
        Legt für eine komplett neue Kundenfirma das allererste Administrator-Konto an.
        Die Person bekommt eine E-Mail mit einem Link zum Passwort-Setzen und richtet
        ihre Firma danach selbst im normalen Onboarding ein — hier wird nur das
        Auth-Konto erzeugt.
      </div>

      <div style={{ background:"var(--surface)", borderRadius:16, padding:14,
        border:"1.5px solid var(--border)", marginBottom:20 }}>
        <Label>E-Mail des neuen Administrators</Label>
        <input type="email" value={email} onChange={e => setEmail(e.target.value)}
          placeholder="kunde@firma.de" style={inputStyle()}
          onKeyDown={e => e.key === "Enter" && einladen()} />

        {fehler && (
          <div style={{ background:"var(--rbg)", color:"var(--red)", borderRadius:10,
            padding:"7px 14px", marginTop:10, fontSize:12,
            border:"1px solid var(--red)", display:"flex", alignItems:"center", gap:6 }}>
            <TriangleAlert size={13} /> {fehler}
          </div>
        )}
        {erfolg && (
          <div style={{ background:"var(--gbg)", color:"var(--green)", borderRadius:10,
            padding:"7px 14px", marginTop:10, fontSize:12, lineHeight:1.4,
            border:"1px solid var(--green)", display:"flex", alignItems:"flex-start", gap:6 }}>
            <CircleCheckBig size={13} style={{ marginTop:1, flexShrink:0 }} /> {erfolg}
          </div>
        )}

        <button onClick={einladen} disabled={!email.trim() || laedt}
          style={{ width:"100%", marginTop:12,
            background: email.trim() && !laedt ? "var(--yellow)" : "var(--surface2)",
            color: email.trim() && !laedt ? "#1a1200" : "var(--muted)",
            border:"none", borderRadius:10, padding:12, fontWeight:700,
            cursor: email.trim() && !laedt ? "pointer" : "default", fontSize:14,
            fontFamily:"inherit", display:"flex", alignItems:"center",
            justifyContent:"center", gap:7 }}>
          {laedt ? <><Spinner size={14} /> Sende Einladung…</> : <><UserPlus size={15} /> Einladen</>}
        </button>
      </div>

      {/* Firmen verwalten — Abo/Plan, Testphase, Zugangssperre. Zeigt
          AUSSCHLIESSLICH diese Abo-/Status-Felder (siehe
          supervisor_firmen_liste-RPC) — keine Projekte, Aufgaben oder
          Mitarbeiterdaten der Firmen selbst, nur die Mitarbeiteranzahl als
          reine Kennzahl. */}
      <div style={{ color:"var(--text)", fontWeight:800, fontSize:15,
        display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
        <Building2 size={16} /> Firmen verwalten
      </div>

      {firmenFehler && (
        <div style={{ background:"var(--rbg)", color:"var(--red)", borderRadius:10,
          padding:"7px 14px", marginBottom:10, fontSize:12,
          border:"1px solid var(--red)", display:"flex", alignItems:"center", gap:6 }}>
          <TriangleAlert size={13} /> {firmenFehler}
        </div>
      )}

      {firmenLaedt && (
        <div style={{ textAlign:"center", color:"var(--muted)", padding:20, fontSize:13 }}>Laden…</div>
      )}

      {!firmenLaedt && firmen.map(f => {
        const isEdit = editId === f.id;
        const planInfo = PLAN_CONFIG[f.plan];
        const statusInfo = PLAN_STATUS_LABEL[f.plan_status] || { label: f.plan_status, farbe: "var(--muted)" };
        return (
          <div key={f.id} style={{ background:"var(--surface)", borderRadius:14,
            padding:"10px 16px", marginBottom:7, border:"1.5px solid var(--border)" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
              <div style={{ minWidth:0 }}>
                <div style={{ display:"flex", alignItems:"center", gap:7, flexWrap:"wrap" }}>
                  <div style={{ color:"var(--text)", fontWeight:700, fontSize:14 }}>{f.name}</div>
                  {f.gesperrt && (
                    <span style={{ background:"var(--rbg)", color:"var(--red)", borderRadius:20,
                      padding:"1px 8px", fontSize:10, fontWeight:800,
                      display:"inline-flex", alignItems:"center", gap:3 }}>
                      <LockKeyhole size={10} /> GESPERRT
                    </span>
                  )}
                </div>
                <div style={{ display:"flex", gap:8, marginTop:4, flexWrap:"wrap", alignItems:"center" }}>
                  <span style={{ background:`${statusInfo.farbe}22`, color:statusInfo.farbe,
                    borderRadius:20, padding:"1px 8px", fontSize:10.5, fontWeight:700 }}>
                    {planInfo ? `${planInfo.icon} ${planInfo.label}` : f.plan} · {statusInfo.label}
                  </span>
                  {f.plan === "trial" && f.trial_ends_at && (
                    <span style={{ color:"var(--muted)", fontSize:11 }}>
                      Testphase bis {new Date(f.trial_ends_at).toLocaleDateString("de-DE")}
                    </span>
                  )}
                  <span style={{ color:"var(--muted)", fontSize:11, display:"flex", alignItems:"center", gap:3 }}>
                    <Users size={11} />{f.mitarbeiter_anzahl}
                  </span>
                </div>
              </div>
              <button onClick={() => isEdit ? setEditId(null) : bearbeitenOeffnen(f)}
                style={{ background:"var(--surface2)", border:"1px solid var(--border)",
                  color:"var(--muted)", borderRadius:8, padding:"4px 10px",
                  cursor:"pointer", fontSize:12, fontFamily:"inherit", display:"flex", flexShrink:0 }}>
                {isEdit ? <X size={13} /> : <Pencil size={13} />}
              </button>
            </div>

            {isEdit && (
              <div style={{ borderTop:"1px solid var(--border)", marginTop:10, paddingTop:10,
                display:"flex", flexDirection:"column", gap:9 }}>
                <div>
                  <Label>Plan</Label>
                  <select value={editForm.plan} onChange={e => setEditForm(p => ({ ...p, plan: e.target.value }))}
                    style={{ ...inputStyle(), padding:"8px 10px" }}>
                    {!PLAN_CONFIG[editForm.plan] && <option value={editForm.plan}>{editForm.plan} (unbekannt)</option>}
                    {Object.entries(PLAN_CONFIG).map(([k, p]) => (
                      <option key={k} value={k}>{p.icon} {p.label} — {p.preis}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label>Status</Label>
                  <select value={editForm.planStatus} onChange={e => setEditForm(p => ({ ...p, planStatus: e.target.value }))}
                    style={{ ...inputStyle(), padding:"8px 10px" }}>
                    {!PLAN_STATUS_LABEL[editForm.planStatus] && <option value={editForm.planStatus}>{editForm.planStatus} (unbekannt)</option>}
                    {Object.entries(PLAN_STATUS_LABEL).map(([k, s]) => (
                      <option key={k} value={k}>{s.label}</option>
                    ))}
                  </select>
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                  <div>
                    <Label>Testphase bis</Label>
                    <input type="date" value={editForm.trialEndsAt}
                      onChange={e => setEditForm(p => ({ ...p, trialEndsAt: e.target.value }))}
                      style={{ ...inputStyle(), padding:"8px 10px" }} />
                  </div>
                  <div>
                    <Label>Plan endet am</Label>
                    <input type="date" value={editForm.planEndsAt}
                      onChange={e => setEditForm(p => ({ ...p, planEndsAt: e.target.value }))}
                      style={{ ...inputStyle(), padding:"8px 10px" }} />
                  </div>
                </div>
                <button onClick={() => setEditForm(p => ({ ...p, gesperrt: !p.gesperrt }))}
                  style={{ background: editForm.gesperrt ? "var(--rbg)" : "var(--surface2)",
                    color: editForm.gesperrt ? "var(--red)" : "var(--muted)",
                    border:`1px solid ${editForm.gesperrt ? "var(--red)" : "var(--border)"}`,
                    borderRadius:8, padding:"8px 14px", cursor:"pointer",
                    fontWeight:700, fontSize:13, fontFamily:"inherit",
                    display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>
                  <Ban size={13} /> {editForm.gesperrt ? "Zugang gesperrt — Klick zum Entsperren" : "Zugang für alle Mitarbeiter sperren"}
                </button>
                <button onClick={() => speichern(f.id)} disabled={speichert}
                  style={{ background:"var(--yellow)", color:"#1a1200", border:"none",
                    borderRadius:8, padding:10, fontWeight:700, cursor:"pointer",
                    fontSize:13, fontFamily:"inherit", display:"flex",
                    alignItems:"center", justifyContent:"center", gap:6 }}>
                  {speichert ? <Spinner size={13} /> : "Speichern"}
                </button>
              </div>
            )}
          </div>
        );
      })}

      {!firmenLaedt && !firmenFehler && firmen.length === 0 && (
        <div style={{ textAlign:"center", padding:"20px 0", color:"var(--muted)", fontSize:13 }}>
          Noch keine Firmen registriert.
        </div>
      )}
    </div>
  );
}
