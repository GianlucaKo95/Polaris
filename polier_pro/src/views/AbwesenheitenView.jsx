import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Palmtree, Plus, X, Check, Ban, TriangleAlert, Trash2, Thermometer } from "lucide-react";
import { sbFetch, sbUrlaubBeantragen, sbKrankheitErfassen, sbUrlaubEntscheiden, sbAbwesenheitLoeschen } from "../lib/supabase.js";
import { Label, inputStyle } from "../components/Label.jsx";
import { Spinner } from "../components/Spinner.jsx";
import { useBackButton } from "../hooks/useBackButton.js";

// Urlaub: jeder beantragt für sich selbst, diese vier Rollen genehmigen/
// lehnen ab. Krankheit: NUR diese vier Rollen tragen sie ein (nie der
// Mitarbeiter selbst) — serverseitig über die abwesenheiten-Trigger/RLS
// erzwungen (siehe Migration abwesenheiten_urlaub_krankheit), hier nur
// gespiegelt, um die passenden Aktionen überhaupt erst anzuzeigen.
const PRIVILEGIERT = ["polier", "bauleiter", "geschaeftsfuehrer", "administrator"];

const STATUS_LABEL = { beantragt: "Offen", genehmigt: "Genehmigt", abgelehnt: "Abgelehnt", erfasst: "Erfasst" };
const STATUS_FARBE = {
  beantragt: { bg: "var(--ybg)", fg: "var(--ydark)" },
  genehmigt: { bg: "var(--gbg)", fg: "var(--green)" },
  erfasst:   { bg: "var(--gbg)", fg: "var(--green)" },
  abgelehnt: { bg: "var(--rbg)", fg: "var(--red)" },
};

function heute() { return new Date().toISOString().slice(0, 10); }

function datumKurz(iso) {
  const [j, m, t] = (iso || "").split("-");
  return j ? `${t}.${m}.${j}` : "—";
}

function zeitraum(a) {
  return a.von_datum === a.bis_datum ? datumKurz(a.von_datum) : `${datumKurz(a.von_datum)} – ${datumKurz(a.bis_datum)}`;
}

function mitarbeiterName(p) {
  return p ? [p.vorname, p.nachname].filter(Boolean).join(" ") || "Unbekannt" : "Unbekannt";
}

function knopfStyle(betont) {
  return { background: betont ? "var(--yellow)" : "var(--surface2)", color: betont ? "#1a1200" : "var(--text)",
    border: betont ? "none" : "1px solid var(--border)", borderRadius: 8, padding: "9px 14px",
    fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit",
    display: "flex", alignItems: "center", gap: 6 };
}

function iconKnopf(bg, fg) {
  return { background: bg, color: fg, border: "none", borderRadius: 8, width: 34, height: 34,
    display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 };
}

function StatusBadge({ status }) {
  const f = STATUS_FARBE[status] || { bg: "var(--surface2)", fg: "var(--muted)" };
  return (
    <span style={{ background: f.bg, color: f.fg, borderRadius: 6, padding: "4px 9px",
      fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{STATUS_LABEL[status] || status}</span>
  );
}

function Abschnitt({ titel, children }) {
  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: 13, color: "var(--muted)", marginBottom: 8,
        textTransform: "uppercase", letterSpacing: 0.5 }}>{titel}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{children}</div>
    </div>
  );
}

function ZeileKarte({ children }) {
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10,
      padding: "12px 14px", display: "flex", alignItems: "center", gap: 10 }}>{children}</div>
  );
}

function FormularGeruest({ titel, Icon, onSchliessen, children }) {
  useBackButton(true, onSchliessen);
  return createPortal(
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "var(--bg)",
      zIndex: 650, overflowY: "auto", WebkitOverflowScrolling: "touch", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "14px 18px", paddingTop: "calc(14px + env(safe-area-inset-top))",
        background: "var(--surface)", borderBottom: "1px solid var(--border)", position: "sticky", top: 0, zIndex: 5 }}>
        <div style={{ fontWeight: 800, fontSize: 16, color: "var(--text)", display: "flex", alignItems: "center", gap: 8 }}>
          <Icon size={16} /> {titel}
        </div>
        <button onClick={onSchliessen} style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", display: "flex" }}>
          <X size={22} />
        </button>
      </div>
      <div style={{ flex: 1, padding: "18px 16px", paddingBottom: "calc(18px + env(safe-area-inset-bottom))" }}>
        {children}
      </div>
    </div>,
    document.body
  );
}

function UrlaubFormular({ onSchliessen, onSpeichern }) {
  const [vonDatum, setVonDatum] = useState(heute());
  const [bisDatum, setBisDatum] = useState(heute());
  const [notiz, setNotiz] = useState("");
  const [speichert, setSpeichert] = useState(false);
  const [fehler, setFehler] = useState("");

  async function speichern() {
    if (bisDatum < vonDatum) { setFehler("Das Enddatum darf nicht vor dem Startdatum liegen."); return; }
    setFehler(""); setSpeichert(true);
    const ok = await onSpeichern({ vonDatum, bisDatum, notiz });
    setSpeichert(false);
    if (!ok) setFehler("Antrag konnte nicht gespeichert werden.");
  }

  return (
    <FormularGeruest titel="Urlaub beantragen" Icon={Palmtree} onSchliessen={onSchliessen}>
      {fehler && (
        <div style={{ background: "var(--rbg)", color: "var(--red)", borderRadius: 10, padding: "10px 14px",
          fontSize: 13, marginBottom: 14, display: "flex", alignItems: "center", gap: 7 }}>
          <TriangleAlert size={14} /> {fehler}
        </div>
      )}
      <Label>Von</Label>
      <input type="date" value={vonDatum} onChange={e => setVonDatum(e.target.value)} style={inputStyle()} />
      <div style={{ height: 14 }} />
      <Label>Bis</Label>
      <input type="date" value={bisDatum} onChange={e => setBisDatum(e.target.value)} style={inputStyle()} />
      <div style={{ height: 14 }} />
      <Label>Notiz (optional)</Label>
      <textarea value={notiz} onChange={e => setNotiz(e.target.value)} rows={3}
        style={{ ...inputStyle(), resize: "vertical", fontFamily: "inherit" }} />
      <div style={{ height: 22 }} />
      <button onClick={speichern} disabled={speichert}
        style={{ width: "100%", background: "var(--yellow)", color: "#1a1200", border: "none", borderRadius: 10,
          padding: 13, fontWeight: 800, fontSize: 15, cursor: speichert ? "default" : "pointer", fontFamily: "inherit",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
        {speichert ? <><Spinner size={14} /> Wird gesendet…</> : "Antrag senden"}
      </button>
    </FormularGeruest>
  );
}

function KrankheitFormular({ mitarbeiter, onSchliessen, onSpeichern }) {
  const [profileId, setProfileId] = useState(mitarbeiter[0]?.id || "");
  const [vonDatum, setVonDatum] = useState(heute());
  const [bisDatum, setBisDatum] = useState(heute());
  const [notiz, setNotiz] = useState("");
  const [speichert, setSpeichert] = useState(false);
  const [fehler, setFehler] = useState("");

  async function speichern() {
    if (!profileId) { setFehler("Bitte einen Mitarbeiter auswählen."); return; }
    if (bisDatum < vonDatum) { setFehler("Das Enddatum darf nicht vor dem Startdatum liegen."); return; }
    setFehler(""); setSpeichert(true);
    const ok = await onSpeichern({ profileId, vonDatum, bisDatum, notiz });
    setSpeichert(false);
    if (!ok) setFehler("Eintrag konnte nicht gespeichert werden.");
  }

  return (
    <FormularGeruest titel="Krankmeldung erfassen" Icon={Thermometer} onSchliessen={onSchliessen}>
      {fehler && (
        <div style={{ background: "var(--rbg)", color: "var(--red)", borderRadius: 10, padding: "10px 14px",
          fontSize: 13, marginBottom: 14, display: "flex", alignItems: "center", gap: 7 }}>
          <TriangleAlert size={14} /> {fehler}
        </div>
      )}
      <Label>Mitarbeiter</Label>
      <select value={profileId} onChange={e => setProfileId(e.target.value)} style={{ ...inputStyle(), appearance: "auto" }}>
        {mitarbeiter.length === 0 && <option value="">Keine Mitarbeiter gefunden</option>}
        {mitarbeiter.map(p => (
          <option key={p.id} value={p.id}>{mitarbeiterName(p)}</option>
        ))}
      </select>
      <div style={{ height: 14 }} />
      <Label>Von</Label>
      <input type="date" value={vonDatum} onChange={e => setVonDatum(e.target.value)} style={inputStyle()} />
      <div style={{ height: 14 }} />
      <Label>Bis</Label>
      <input type="date" value={bisDatum} onChange={e => setBisDatum(e.target.value)} style={inputStyle()} />
      <div style={{ height: 14 }} />
      <Label>Notiz (optional)</Label>
      <textarea value={notiz} onChange={e => setNotiz(e.target.value)} rows={3}
        style={{ ...inputStyle(), resize: "vertical", fontFamily: "inherit" }} />
      <div style={{ height: 22 }} />
      <button onClick={speichern} disabled={speichert}
        style={{ width: "100%", background: "var(--yellow)", color: "#1a1200", border: "none", borderRadius: 10,
          padding: 13, fontWeight: 800, fontSize: 15, cursor: speichert ? "default" : "pointer", fontFamily: "inherit",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
        {speichert ? <><Spinner size={14} /> Wird gespeichert…</> : "Eintragen"}
      </button>
    </FormularGeruest>
  );
}

export function AbwesenheitenView({ session, profil }) {
  const istPrivilegiert = PRIVILEGIERT.includes(profil?.rolle);
  const [liste, setListe] = useState([]);
  const [mitarbeiter, setMitarbeiter] = useState([]);
  const [laden, setLaden] = useState(true);
  const [aktionsFehler, setAktionsFehler] = useState("");
  const [zeigeUrlaubForm, setZeigeUrlaubForm] = useState(false);
  const [zeigeKrankForm, setZeigeKrankForm] = useState(false);

  useEffect(() => { ladeAlles(); }, []);

  async function ladeAlles() {
    setLaden(true);
    const [l, m] = await Promise.all([
      sbFetch(
        "abwesenheiten?select=*,mitarbeiter:profile!abwesenheiten_profile_id_fkey(vorname,nachname)" +
        "&order=von_datum.desc&limit=200",
        { headers: { Authorization: `Bearer ${session?.access_token}` } }
      ),
      istPrivilegiert
        ? sbFetch("profile?select=id,vorname,nachname,rolle&order=vorname.asc",
            { headers: { Authorization: `Bearer ${session?.access_token}` } })
        : Promise.resolve([]),
    ]);
    setListe(l || []);
    setMitarbeiter(m || []);
    setLaden(false);
  }

  async function urlaubBeantragen(werte) {
    const { fehler } = await sbUrlaubBeantragen(werte, session);
    if (fehler) { setAktionsFehler(fehler); return false; }
    setZeigeUrlaubForm(false);
    await ladeAlles();
    return true;
  }

  async function krankheitErfassen(werte) {
    const { fehler } = await sbKrankheitErfassen(werte, session);
    if (fehler) { setAktionsFehler(fehler); return false; }
    setZeigeKrankForm(false);
    await ladeAlles();
    return true;
  }

  async function entscheiden(id, genehmigt) {
    setAktionsFehler("");
    const { ok, fehler } = await sbUrlaubEntscheiden(id, genehmigt, null, session);
    if (!ok) { setAktionsFehler(fehler); return; }
    await ladeAlles();
  }

  async function zuruecknehmen(id) {
    setAktionsFehler("");
    const { ok, fehler } = await sbAbwesenheitLoeschen(id, session);
    if (!ok) { setAktionsFehler(fehler); return; }
    setListe(prev => prev.filter(a => a.id !== id));
  }

  if (laden) {
    return <div style={{ display: "flex", justifyContent: "center", padding: "60px 0", color: "var(--muted)" }}><Spinner size={20} /></div>;
  }

  const offeneAntraege = liste.filter(a => a.typ === "urlaub" && a.status === "beantragt");
  const eigene = liste.filter(a => a.profile_id === profil?.id);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <div style={{ fontWeight: 800, fontSize: 18, color: "var(--text)", display: "flex", alignItems: "center", gap: 8 }}>
        <Palmtree size={18} /> Abwesenheiten
      </div>

      {aktionsFehler && (
        <div style={{ background: "var(--rbg)", color: "var(--red)", borderRadius: 10, padding: "10px 14px",
          fontSize: 13, display: "flex", alignItems: "center", gap: 7 }}>
          <TriangleAlert size={14} /> {aktionsFehler}
        </div>
      )}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button onClick={() => setZeigeUrlaubForm(true)} style={knopfStyle(true)}>
          <Plus size={14} /> Urlaub beantragen
        </button>
        {istPrivilegiert && (
          <button onClick={() => setZeigeKrankForm(true)} style={knopfStyle(false)}>
            <Thermometer size={14} /> Krankmeldung erfassen
          </button>
        )}
      </div>

      {istPrivilegiert && offeneAntraege.length > 0 && (
        <Abschnitt titel={`Offene Urlaubsanträge (${offeneAntraege.length})`}>
          {offeneAntraege.map(a => (
            <ZeileKarte key={a.id}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, color: "var(--text)" }}>{mitarbeiterName(a.mitarbeiter)}</div>
                <div style={{ fontSize: 13, color: "var(--text2)" }}>{zeitraum(a)}</div>
                {a.notiz && <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{a.notiz}</div>}
              </div>
              <button onClick={() => entscheiden(a.id, true)} title="Genehmigen" style={iconKnopf("var(--gbg)", "var(--green)")}>
                <Check size={16} />
              </button>
              <button onClick={() => entscheiden(a.id, false)} title="Ablehnen" style={iconKnopf("var(--rbg)", "var(--red)")}>
                <Ban size={16} />
              </button>
            </ZeileKarte>
          ))}
        </Abschnitt>
      )}

      <Abschnitt titel="Meine Abwesenheiten">
        {eigene.length === 0 ? (
          <div style={{ color: "var(--muted)", fontSize: 13 }}>Noch keine Einträge.</div>
        ) : eigene.map(a => (
          <ZeileKarte key={a.id}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, color: "var(--text)" }}>{a.typ === "urlaub" ? "Urlaub" : "Krankheit"}</div>
              <div style={{ fontSize: 13, color: "var(--text2)" }}>{zeitraum(a)}</div>
            </div>
            <StatusBadge status={a.status} />
            {a.status === "beantragt" && (
              <button onClick={() => zuruecknehmen(a.id)} title="Zurückziehen" style={iconKnopf("var(--surface2)", "var(--muted)")}>
                <Trash2 size={15} />
              </button>
            )}
          </ZeileKarte>
        ))}
      </Abschnitt>

      <Abschnitt titel="Firma — Übersicht">
        {liste.length === 0 ? (
          <div style={{ color: "var(--muted)", fontSize: 13 }}>Noch keine Einträge.</div>
        ) : liste.map(a => (
          <ZeileKarte key={a.id}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, color: "var(--text)" }}>
                {mitarbeiterName(a.mitarbeiter)} <span style={{ fontWeight: 500, color: "var(--muted)" }}>· {a.typ === "urlaub" ? "Urlaub" : "Krankheit"}</span>
              </div>
              <div style={{ fontSize: 13, color: "var(--text2)" }}>{zeitraum(a)}</div>
            </div>
            <StatusBadge status={a.status} />
          </ZeileKarte>
        ))}
      </Abschnitt>

      {zeigeUrlaubForm && <UrlaubFormular onSchliessen={() => setZeigeUrlaubForm(false)} onSpeichern={urlaubBeantragen} />}
      {zeigeKrankForm && <KrankheitFormular mitarbeiter={mitarbeiter} onSchliessen={() => setZeigeKrankForm(false)} onSpeichern={krankheitErfassen} />}
    </div>
  );
}
