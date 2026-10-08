import { useState } from "react";
import { ChartColumn, Search, Download } from "lucide-react";
import { sbFetch } from "../lib/supabase.js";
import { TAETIGKEITEN } from "../config/konstanten.js";
import { Label, inputStyle } from "../components/Label.jsx";

const SPALTEN = [
  { width: 11 }, { width: 20 }, { width: 22 }, { width: 14 }, { width: 8 },
  { width: 8 }, { width: 12 }, { width: 11 }, { width: 26 }, { width: 24 },
];

export function StundenExportView({ profil, session, projekte, darfAlleSehen = false }) {
  const [vonDatum, setVonDatum] = useState(() => {
    const d = new Date(); d.setDate(1); // Monatserster
    return d.toISOString().slice(0,10);
  });
  const [bisDatum, setBisDatum] = useState(new Date().toISOString().slice(0,10));
  const [laden,    setLaden]    = useState(false);
  const [buchungen,setBuchungen]= useState([]);
  const [geladen,  setGeladen]  = useState(false);
  const [gewaehlteMA, setGewaehlteMA] = useState("alle");

  async function ladeZeitraum() {
    setLaden(true); setGeladen(false);
    // Kein separater profil_id-Filter mehr im Query — die RLS auf
    // zeitbuchungen liefert für jede Rolle ohnehin nur das, was sie sehen
    // darf (Polier z.B. nur seine eigenen Baustellen, nie andere oder gar
    // Admin/Geschäftsführer). Die Mitarbeiter-Auswahl unten filtert danach
    // rein clientseitig innerhalb dieser bereits korrekt eingeschränkten
    // Treffermenge — es gibt dadurch gar keine Möglichkeit mehr, im
    // Dropdown einen Namen zu sehen, dessen Buchungen man nicht laden dürfte.
    const data = await sbFetch(
      `zeitbuchungen?select=*,profile(vorname,nachname)&status=eq.abgeschlossen` +
      `&eingestempelt_at=gte.${vonDatum}T00:00:00` +
      `&eingestempelt_at=lte.${bisDatum}T23:59:59` +
      `&order=eingestempelt_at.asc`,
      { headers: { "Authorization": `Bearer ${session?.access_token}` } }
    );
    setBuchungen(data || []);
    setGewaehlteMA("alle");
    setGeladen(true);
    setLaden(false);
  }

  // Mitarbeiter-Dropdown-Optionen kommen ausschließlich aus den bereits
  // geladenen (RLS-gefilterten) Buchungen selbst, nicht aus einer separaten
  // firmenweiten Mitarbeiterliste.
  const mitarbeiterOptionen = [...new Map(
    buchungen.filter(b => b.profil_id).map(b => [b.profil_id, buchungName(b)])
  ).entries()].map(([id, name]) => ({ id, name })).sort((a,b) => a.name.localeCompare(b.name,"de"));

  const sichtbareBuchungen = gewaehlteMA === "alle"
    ? buchungen
    : buchungen.filter(b => String(b.profil_id) === String(gewaehlteMA));

  const gesamtMinuten = sichtbareBuchungen.reduce((s,b) => s + (b.netto_minuten||0), 0);
  const gesamtStunden = (gesamtMinuten / 60).toFixed(2);

  function projektName(id) {
    return projekte.find(p => p.id === id)?.name || "—";
  }

  function buchungName(b) {
    return b.profile ? `${b.profile.vorname||""} ${b.profile.nachname||""}`.trim() : `${profil.vorname} ${profil.nachname}`;
  }

  // Pro Mitarbeiter gruppiert statt einer durchmischten Gesamtliste — mit
  // eigener Zwischensumme je Mitarbeiter, damit "pro MA" auch in der Datei
  // selbst klar erkennbar ist, nicht nur über eine Namensspalte. Echtes
  // .xlsx statt CSV (write-excel-file, browserseitig, ohne Node-Polyfills)
  // — SheetJS/"xlsx" von npm bringt zwei ungepatchte High-Severity-CVEs mit
  // (Prototype Pollution, ReDoS) und war deshalb keine Option.
  const zelle = (value, extra) => ({ value, ...extra });

  async function exportExcel() {
    const gruppen = new Map();
    for (const b of sichtbareBuchungen) {
      const name = buchungName(b);
      if (!gruppen.has(name)) gruppen.set(name, []);
      gruppen.get(name).push(b);
    }
    const namenSortiert = [...gruppen.keys()].sort((a,b) => a.localeCompare(b,"de"));

    const kopf = ["Datum","Name","Projekt","Tätigkeit","Von","Bis","Pause (min)","Netto (Std)","Adresse Start","Notiz"];
    const rows = [kopf.map(t => zelle(t, { fontWeight: "bold", type: String }))];

    for (const name of namenSortiert) {
      rows.push([
        zelle(`Mitarbeiter: ${name}`, { fontWeight: "bold", type: String, columnSpan: kopf.length }),
        ...Array(kopf.length - 1).fill(null),
      ]);
      let summeMinuten = 0;
      for (const b of gruppen.get(name)) {
        const von = new Date(b.eingestempelt_at);
        const bis = b.ausgestempelt_at ? new Date(b.ausgestempelt_at) : null;
        summeMinuten += b.netto_minuten || 0;
        rows.push([
          zelle(von.toLocaleDateString("de-DE"), { type: String }),
          zelle(name, { type: String }),
          zelle(projektName(b.projekt_id), { type: String }),
          zelle(TAETIGKEITEN[b.taetigkeit]?.label || "—", { type: String }),
          zelle(von.toLocaleTimeString("de-DE",{hour:"2-digit",minute:"2-digit"}), { type: String }),
          zelle(bis ? bis.toLocaleTimeString("de-DE",{hour:"2-digit",minute:"2-digit"}) : "—", { type: String }),
          zelle(b.pause_minuten || 0, { type: Number }),
          zelle(Number(((b.netto_minuten||0)/60).toFixed(2)), { type: Number }),
          zelle(b.ein_adresse || "", { type: String }),
          zelle(b.notiz || "", { type: String }),
        ]);
      }
      rows.push([
        zelle("", { type: String }), zelle("", { type: String }), zelle("", { type: String }),
        zelle("", { type: String }), zelle("", { type: String }), zelle("", { type: String }),
        zelle(`Summe ${name}:`, { fontWeight: "bold", type: String }),
        zelle(Number((summeMinuten/60).toFixed(2)), { fontWeight: "bold", type: Number }),
      ]);
      rows.push([]);
    }
    if (namenSortiert.length > 1) {
      rows.push([
        zelle("", { type: String }), zelle("", { type: String }), zelle("", { type: String }),
        zelle("", { type: String }), zelle("", { type: String }), zelle("", { type: String }),
        zelle("GESAMT (alle):", { fontWeight: "bold", type: String }),
        zelle(Number(gesamtStunden), { fontWeight: "bold", type: Number }),
      ]);
    }

    const maSuffix = gewaehlteMA !== "alle"
      ? "_" + (mitarbeiterOptionen.find(m => String(m.id) === String(gewaehlteMA))?.name || "MA").replace(/\s+/g, "_")
      : "";
    // Dynamisch statt statisch importiert: ein Top-Level-Import hätte die
    // Bibliothek in jeden Seiten-Load eingebunden, obwohl der Stunden-Export
    // nur gelegentlich genutzt wird.
    const { default: writeXlsxFile } = await import("write-excel-file/browser");
    await writeXlsxFile(rows, { columns: SPALTEN })
      .toFile(`Stunden_${vonDatum}_bis_${bisDatum}${maSuffix}.xlsx`);
  }

  return (
    <div>
      <div style={{ color:"var(--text)", fontWeight:800, fontSize:16, marginBottom:10,
        display:"flex", alignItems:"center", gap:8 }}>
        <ChartColumn size={17} /> Stunden-Export
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:10 }}>
        <div>
          <Label>Von</Label>
          <input type="date" value={vonDatum} onChange={e=>setVonDatum(e.target.value)}
            style={inputStyle()} />
        </div>
        <div>
          <Label>Bis</Label>
          <input type="date" value={bisDatum} onChange={e=>setBisDatum(e.target.value)}
            style={inputStyle()} />
        </div>
      </div>

      <button onClick={ladeZeitraum} disabled={laden}
        style={{ width:"100%", background:"var(--surface2)", color:"var(--text)",
          border:"1.5px solid var(--border)", borderRadius:12, padding:13,
          fontWeight:700, cursor:"pointer", fontSize:14, fontFamily:"inherit",
          marginBottom:16, display:"flex", alignItems:"center", justifyContent:"center", gap:7 }}>
        {laden ? "Lädt…" : <><Search size={14} /> Zeitraum laden</>}
      </button>

      {geladen && (
        <>
          {darfAlleSehen && mitarbeiterOptionen.length > 1 && (
            <div style={{ marginBottom:10 }}>
              <Label>Mitarbeiter</Label>
              <select value={gewaehlteMA} onChange={e=>setGewaehlteMA(e.target.value)}
                style={{ ...inputStyle(), padding:"11px 12px" }}>
                <option value="alle">Alle Mitarbeiter</option>
                {mitarbeiterOptionen.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>
          )}

          <div style={{ background:"var(--surface)", borderRadius:14, padding:12,
            marginBottom:10, border:"1.5px solid var(--border)" }}>
            <div style={{ display:"flex", justifyContent:"space-between",
              alignItems:"center" }}>
              <div>
                <div style={{ color:"var(--muted)", fontSize:11, fontWeight:700,
                  textTransform:"uppercase" }}>Gesamt</div>
                <div style={{ color:"var(--text)", fontWeight:900, fontSize:24 }}>
                  {gesamtStunden} Std
                </div>
              </div>
              <div style={{ color:"var(--muted)", fontSize:12, textAlign:"right" }}>
                {sichtbareBuchungen.length} Buchung{sichtbareBuchungen.length!==1?"en":""}
              </div>
            </div>
          </div>

          {sichtbareBuchungen.length > 0 && (
            <button onClick={exportExcel}
              style={{ width:"100%", background:"var(--yellow)", color:"#1a1200",
                border:"none", borderRadius:12, padding:14, fontWeight:800,
                fontSize:15, cursor:"pointer", fontFamily:"inherit",
                marginBottom:16, display:"flex", alignItems:"center", justifyContent:"center", gap:7 }}>
              <Download size={15} /> Als Excel exportieren
            </button>
          )}

          {sichtbareBuchungen.length === 0 && (
            <div style={{ textAlign:"center", padding:"23px 20px", color:"var(--muted)" }}>
              Keine Buchungen im gewählten Zeitraum.
            </div>
          )}

          {sichtbareBuchungen.map(b => {
            const von = new Date(b.eingestempelt_at);
            const name = b.profile ? `${b.profile.vorname||""} ${b.profile.nachname||""}`.trim() : "";
            return (
              <div key={b.id} style={{ background:"var(--surface)", borderRadius:10,
                padding:"7px 12px", marginBottom:6, border:"1px solid var(--border)" }}>
                <div style={{ display:"flex", justifyContent:"space-between" }}>
                  <div>
                    <div style={{ color:"var(--text)", fontSize:12, fontWeight:600 }}>
                      {von.toLocaleDateString("de-DE")} {name && `· ${name}`}
                    </div>
                    <div style={{ color:"var(--muted)", fontSize:11, marginTop:2 }}>
                      {projektName(b.projekt_id)}
                      {b.taetigkeit && ` · ${TAETIGKEITEN[b.taetigkeit]?.icon} ${TAETIGKEITEN[b.taetigkeit]?.label}`}
                    </div>
                  </div>
                  <div style={{ color:"var(--text)", fontWeight:700, fontSize:13 }}>
                    {((b.netto_minuten||0)/60).toFixed(1)}h
                  </div>
                </div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
