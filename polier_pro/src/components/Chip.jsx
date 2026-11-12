// Gewerk-Chip. Auf dem Desktop ohne Emoji, als leise Marke.
export function Chip({ icon, label }) {
  const desk = typeof document !== "undefined" && document.documentElement.dataset.layout === "desktop";
  if (desk) return (
    <span style={{ background: "var(--surface2)", color: "var(--text2)", fontSize: 12, lineHeight: "20px", padding: "0 8px", borderRadius: 6 }}>{label}</span>
  );
  return (
    <div style={{ background: "var(--surface2)", padding:"5px 10px 5px 8px", display:"flex", gap:5, alignItems:"center",
      border:`1px solid ${'var(--border)'}` }}>
      <span style={{ fontSize:12 }}>{icon}</span>
      <span style={{ color: "var(--text2)", fontSize:12, fontWeight:600 }}>{label}</span>
    </div>
  );
}
