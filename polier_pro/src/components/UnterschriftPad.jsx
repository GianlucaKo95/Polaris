import { useState, useRef } from "react";

// onAendern (optional): meldet nach jedem Strich das Bild bzw. null nach Löschen;
// knopf={false} blendet „Übernehmen“ aus, wenn die Seite selbst einen Absendeknopf hat.
export function UnterschriftPad({ label, onSave, onAendern, knopf = true, hoehe }) {
  const canvasRef  = useRef(null);
  const [zeichnen, setZeichnen] = useState(false);
  const [hatZeichen, setHatZeichen] = useState(false);
  const lastPos = useRef(null);

  function getPos(e) {
    const canvas = canvasRef.current;
    const rect   = canvas.getBoundingClientRect();
    const src    = e.touches ? e.touches[0] : e;
    // Canvas hat eine feste interne Auflösung (360×100), wird aber per CSS
    // auf 100% Breite gestreckt — ohne diese Skalierung landet der Strich
    // auf jedem breiteren Bildschirm versetzt zur tatsächlichen Zeigerposition.
    const scaleX = canvas.width  / rect.width;
    const scaleY = canvas.height / rect.height;
    return { x: (src.clientX - rect.left) * scaleX, y: (src.clientY - rect.top) * scaleY };
  }

  function start(e) {
    e.preventDefault();
    setZeichnen(true);
    lastPos.current = getPos(e);
  }
  function draw(e) {
    e.preventDefault();
    if (!zeichnen) return;
    const ctx  = canvasRef.current.getContext("2d");
    const pos  = getPos(e);
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = "#0B1120";
    ctx.lineWidth   = 2.5;
    ctx.lineCap     = "round";
    ctx.stroke();
    lastPos.current = pos;
    setHatZeichen(true);
  }
  function stop(e) {
    e.preventDefault();
    if (zeichnen && onAendern) onAendern(canvasRef.current.toDataURL("image/png"));
    setZeichnen(false);
  }

  function loeschen() {
    const canvas = canvasRef.current;
    canvasRef.current.getContext("2d").clearRect(0,0,canvas.width,canvas.height);
    setHatZeichen(false);
    onAendern?.(null);
  }

  function speichern() {
    if (!hatZeichen) return;
    onSave(canvasRef.current.toDataURL("image/png"));
  }

  return (
    <div style={{ marginBottom:12 }}>
      <div style={{ color:"var(--muted)", fontSize:11, fontWeight:600,
        marginBottom:6 }}>{label}</div>
      <div style={{ position:"relative", border:"1.5px solid var(--border)",
        borderRadius:12, background:"#fff", overflow:"hidden" }}>
        <canvas ref={canvasRef} width={360} height={100}
          style={{ display:"block", width:"100%", height: hoehe, touchAction:"none",
            cursor:"crosshair" }}
          onMouseDown={start} onMouseMove={draw} onMouseUp={stop}
          onTouchStart={start} onTouchMove={draw} onTouchEnd={stop} />
        {!hatZeichen && (
          <div style={{ position:"absolute", top:0, left:0, right:0, bottom:0, display:"flex",
            alignItems:"center", justifyContent:"center", pointerEvents:"none" }}>
            <span style={{ color:"#ccc", fontSize:13 }}>Hier unterschreiben</span>
          </div>
        )}
      </div>
      <div style={{ display:"flex", gap:8, marginTop:6 }}>
        <button onClick={loeschen}
          style={{ background:"var(--surface2)", color:"var(--muted)",
            border:"1px solid var(--border)", borderRadius:8,
            padding:"5px 12px", cursor:"pointer", fontSize:12,
            fontFamily:"inherit" }}>
          Löschen
        </button>
        {knopf && <button onClick={speichern} disabled={!hatZeichen}
          style={{ background: hatZeichen ? "var(--green)" : "var(--surface2)",
            color: hatZeichen ? "#fff" : "var(--muted)",
            border:"none", borderRadius:8, padding:"5px 14px",
            cursor: hatZeichen ? "pointer" : "default", fontSize:12,
            fontWeight:700, fontFamily:"inherit" }}>
          ✓ Übernehmen
        </button>}
      </div>
    </div>
  );
}
