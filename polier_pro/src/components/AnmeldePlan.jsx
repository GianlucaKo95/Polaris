// Bildfläche des Desktop-Anmeldebildschirms: ein Ausschnitt aus einem
// Grundriss mit Achsraster, wie Polaris ihn aus IFC/DXF/PDF liest. Ein
// Abschnitt (A–B / 1–2) ist als fertig gemeldet und trägt den Akzent; der
// Rest bleibt Tinte auf Papier. Reine Illustration, keine echten Daten.
const ACHSEN_X = ["A", "B", "C", "D", "E"];
const ACHSEN_Y = ["1", "2", "3", "4"];
const X0 = 96, Y0 = 96, DX = 132, DY = 112;
const xs = ACHSEN_X.map((_, i) => X0 + i * DX);
const ys = ACHSEN_Y.map((_, i) => Y0 + i * DY);
const R = 14;

export function AnmeldePlan() {
  const breite = xs.at(-1) + 96, hoehe = ys.at(-1) + 96;
  return (
    <svg viewBox={`0 0 ${breite} ${hoehe}`} role="img"
      aria-label="Grundriss mit Achsraster A bis E und 1 bis 4, Abschnitt A–B / 1–2 als fertig markiert"
      style={{ width: "100%", maxWidth: 720, height: "auto", display: "block" }}>
      <defs>
        <pattern id="anmelde-schraffur" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="8" stroke="var(--akzent)" strokeWidth="1.5" opacity="0.55" />
        </pattern>
      </defs>

      {/* fertiger Abschnitt */}
      <rect x={xs[0]} y={ys[0]} width={DX} height={DY} fill="var(--akzent)" opacity="0.08" />
      <rect x={xs[0]} y={ys[0]} width={DX} height={DY} fill="url(#anmelde-schraffur)" />

      {/* Achslinien, strichpunktiert wie im Plan */}
      <g stroke="var(--muted)" strokeWidth="1" strokeDasharray="14 4 2 4" opacity="0.7">
        {xs.map(x => <line key={x} x1={x} y1={ys[0] - 48} x2={x} y2={ys.at(-1) + 48} />)}
        {ys.map(y => <line key={y} x1={xs[0] - 48} y1={y} x2={xs.at(-1) + 48} y2={y} />)}
      </g>

      {/* Wände und Decke als Umriss, Stützen an den Kreuzungen */}
      <rect x={xs[0]} y={ys[0]} width={xs.at(-1) - xs[0]} height={ys.at(-1) - ys[0]} fill="none" stroke="var(--text)" strokeWidth="3" />
      <line x1={xs[2]} y1={ys[0]} x2={xs[2]} y2={ys[2]} stroke="var(--text)" strokeWidth="2" />
      <line x1={xs[2]} y1={ys[2]} x2={xs.at(-1)} y2={ys[2]} stroke="var(--text)" strokeWidth="2" />
      {xs.flatMap(x => ys.map(y => (
        <rect key={`${x}-${y}`} x={x - 6} y={y - 6} width="12" height="12" fill="var(--text)" />
      )))}

      {/* Achsblasen oben und links */}
      {ACHSEN_X.map((n, i) => (
        <g key={n} transform={`translate(${xs[i]} ${ys[0] - 48 - R})`}>
          <circle r={R} fill="var(--surface)" stroke={i < 2 ? "var(--akzent)" : "var(--text)"} strokeWidth="1.5" />
          <text textAnchor="middle" dy="5" fontFamily="var(--font-zahl)" fontSize="14" fill={i < 2 ? "var(--akzent)" : "var(--text)"}>{n}</text>
        </g>
      ))}
      {ACHSEN_Y.map((n, i) => (
        <g key={n} transform={`translate(${xs[0] - 48 - R} ${ys[i]})`}>
          <circle r={R} fill="var(--surface)" stroke={i < 2 ? "var(--akzent)" : "var(--text)"} strokeWidth="1.5" />
          <text textAnchor="middle" dy="5" fontFamily="var(--font-zahl)" fontSize="14" fill={i < 2 ? "var(--akzent)" : "var(--text)"}>{n}</text>
        </g>
      ))}

      {/* Bemaßung zwischen A und B */}
      <g stroke="var(--muted)" strokeWidth="1">
        <line x1={xs[0]} y1={ys.at(-1) + 32} x2={xs[1]} y2={ys.at(-1) + 32} />
        <line x1={xs[0]} y1={ys.at(-1) + 26} x2={xs[0]} y2={ys.at(-1) + 38} />
        <line x1={xs[1]} y1={ys.at(-1) + 26} x2={xs[1]} y2={ys.at(-1) + 38} />
      </g>
      <text x={(xs[0] + xs[1]) / 2} y={ys.at(-1) + 26} textAnchor="middle" fontFamily="var(--font-zahl)" fontSize="12" fill="var(--text2)">6,00</text>

      {/* Meldung am Abschnitt */}
      <g transform={`translate(${xs[0] + 12} ${ys[0] + 16})`}>
        <rect width="104" height="40" rx="6" fill="var(--surface)" stroke="var(--border2)" />
        <text x="10" y="17" fontFamily="var(--font-zahl)" fontSize="11" fill="var(--text2)">A–B / 1–2</text>
        <text x="10" y="32" fontSize="12" fill="var(--text)">fertig gemeldet</text>
      </g>
    </svg>
  );
}
