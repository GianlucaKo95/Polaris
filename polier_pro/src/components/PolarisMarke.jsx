// Bildmarke von Polaris: vierstrahliger Stern auf dunkler Kachel, dazu das
// Wort in der Oberflächenschrift. Ein Zeichen, keine Wiederholung als Emoji.
export function PolarisMarke({ groesse = 24, wort = true, wortGroesse = 16 }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <svg width={groesse} height={groesse} viewBox="0 0 24 24" aria-hidden="true">
        <rect width="24" height="24" rx="6" fill="var(--text)" />
        <path d="M12 4.5 L13.6 10.4 L19.5 12 L13.6 13.6 L12 19.5 L10.4 13.6 L4.5 12 L10.4 10.4 Z" fill="var(--bg)" />
      </svg>
      {wort && <span style={{ fontWeight: 600, fontSize: wortGroesse, color: "var(--text)" }}>Polaris</span>}
    </span>
  );
}
