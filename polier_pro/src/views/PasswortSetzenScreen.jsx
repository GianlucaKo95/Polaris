import { useState } from "react";
import { Eye, EyeOff, CircleX, ArrowRight } from "lucide-react";
import { PolarisMarke } from "../components/PolarisMarke.jsx";

export function PasswortSetzenScreen({ auth, type }) {
  const [password,  setPassword]  = useState("");
  const [password2, setPassword2] = useState("");
  const [showPw,    setShowPw]    = useState(false);

  const titel = type === "recovery" ? "Passwort zurücksetzen" : "Konto aktivieren";
  const valid = password.length >= 8 && password === password2;

  return (
    <div style={{ background:"var(--bg)", minHeight:"100dvh", display:"flex",
      flexDirection:"column", alignItems:"center", justifyContent:"center",
      padding:"17px 20px",
      paddingTop:"calc(17px + env(safe-area-inset-top))",
      paddingBottom:"calc(17px + env(safe-area-inset-bottom))" }}>
      <div style={{ textAlign:"center", marginBottom:23 }}>
        <div style={{ fontWeight:900, fontSize:28, letterSpacing:-1.5, color:"var(--text)" }}>
          {document.documentElement.dataset.layout === "desktop" ? <PolarisMarke groesse={32} wortGroesse={24} /> : <><span style={{ color:"var(--yellow)" }}>★</span> POLARIS</>}
        </div>
      </div>
      <div style={{ background:"var(--surface)", borderRadius:20, padding:20,
        width:"100%", maxWidth:380, border:"1.5px solid var(--border)" }}>
        <div style={{ fontWeight:800, fontSize:18, color:"var(--text)", marginBottom:6 }}>
          {titel}
        </div>
        <div style={{ color:"var(--muted)", fontSize:13, marginBottom:14 }}>
          Wähle ein sicheres Passwort (min. 8 Zeichen).
        </div>

        {auth.fehler && (
          <div style={{ background:"var(--rbg)", color:"var(--red)", borderRadius:10,
            padding:"7px 14px", marginBottom:12, fontSize:13,
            border:"1px solid var(--red)",
            display:"flex", alignItems:"center", gap:6 }}><CircleX size={14} /> {auth.fehler}</div>
        )}

        <div style={{ marginBottom:10 }}>
          <div style={{ color:"var(--muted)", fontSize:11, fontWeight:600,
            marginBottom:6 }}>Neues Passwort</div>
          <div style={{ position:"relative" }}>
            <input type={showPw ? "text" : "password"} value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••" style={{ width:"100%", background:"var(--surface2)",
                color:"var(--text)", border:"1.5px solid var(--border)", borderRadius:10,
                padding:"12px 44px 12px 14px", fontSize:14, boxSizing:"border-box",
                fontFamily:"inherit" }} />
            <button onClick={() => setShowPw(p=>!p)}
              style={{ position:"absolute", right:12, top:"50%",
                transform:"translateY(-50%)", background:"none", border:"none",
                cursor:"pointer", color:"var(--muted)", display:"flex" }}>
              {showPw ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </div>
        </div>

        <div style={{ marginBottom:14 }}>
          <div style={{ color:"var(--muted)", fontSize:11, fontWeight:600,
            marginBottom:6 }}>Passwort wiederholen</div>
          <input type={showPw ? "text" : "password"} value={password2}
            onChange={e => setPassword2(e.target.value)}
            placeholder="••••••••" style={{ width:"100%", background:"var(--surface2)",
              color:"var(--text)", border:`1.5px solid ${password2 && password !== password2 ? "var(--red)" : "var(--border)"}`,
              borderRadius:10, padding:"12px 14px", fontSize:14,
              boxSizing:"border-box", fontFamily:"inherit" }} />
          {password2 && password !== password2 && (
            <div style={{ color:"var(--red)", fontSize:11, marginTop:4 }}>
              Passwörter stimmen nicht überein
            </div>
          )}
        </div>

        <button onClick={() => auth.passwortSetzen(password)}
          disabled={!valid || auth.loading}
          style={{ width:"100%", background: valid ? "var(--yellow)" : "var(--surface2)",
            color: valid ? "#1a1200" : "var(--muted)", border:"none",
            borderRadius:12, padding:15, fontWeight:800, fontSize:15,
            cursor: valid ? "pointer" : "default", fontFamily:"inherit",
            display:"flex", alignItems:"center", justifyContent:"center", gap:7 }}>
          {auth.loading ? "Wird gesetzt…" : <>Passwort setzen & einloggen <ArrowRight size={15} /></>}
        </button>
      </div>
    </div>
  );
}
