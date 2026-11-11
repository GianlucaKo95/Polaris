// Erzeugt src/lib/__fixtures__/plan.pdf (Testplan M 1:100) für lib/pdfPlan.test.mjs.
import { jsPDF } from "jspdf"; import { writeFileSync } from "node:fs";
// Plan M 1:100 auf A3 quer, Einheit mm auf Papier. 1 m = 10 mm Papier.
const d = new jsPDF({ orientation: "landscape", unit: "mm", format: "a3" });
const O = { x: 60, y: 230 }; // Ursprung Achse A/1 (Papier-y nach unten)
const P = (x, y) => [O.x + x * 10, O.y - y * 10]; // Meter → Papier-mm
d.setLineWidth(0.2);
// Achsen A,B,C bei x=0,6,12 ; 1,2 bei y=0,8
for (const [t, x] of [["A",0],["B",6],["C",12]]) { d.line(...P(x,-2), ...P(x,10)); d.circle(...P(x,-2.6), 3); d.text(t, ...P(x-0.1,-2.7)); }
for (const [t, y] of [["1",0],["2",8]]) { d.line(...P(-2,y), ...P(14,y)); d.circle(...P(-2.6,y), 3); d.text(t, ...P(-2.7,y-0.1)); }
// Decke als gefüllte Fläche (grau) 0..12 × 0..8
d.setFillColor(200,200,200); const [x0,y0]=P(0,8); d.rect(x0, y0, 120, 80, "F");
// Raumstempel
d.setFontSize(9); d.text("Wohnen", ...P(2,4)); d.text("F: 23,45 m²", ...P(2,3.4)); d.text("U: 19,60 m", ...P(2,2.9));
d.text("Küche", ...P(8,4)); d.text("12,10 m²", ...P(8,3.4));
d.setFontSize(12); d.text("Grundriss EG  M 1:100", 300, 280);
writeFileSync("src/lib/__fixtures__/plan.pdf", Buffer.from(d.output("arraybuffer")));
