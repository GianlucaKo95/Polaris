export function Label({ children }) {
  return <div className="feld-label" style={{ color: "var(--muted)", fontSize:11, marginBottom:6, fontWeight:700, letterSpacing:0.6, textTransform:"uppercase" }}>{children}</div>;
}

export function inputStyle() {
  return { width:"100%", background: "var(--surface)", color: "var(--text)",
    border:`1.5px solid ${'var(--border2)'}`,
    padding:"13px 14px", fontSize:15, boxSizing:"border-box", marginTop:4 };
}
