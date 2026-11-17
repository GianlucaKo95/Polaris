// Bündelt die reine Logik aus src/lib für Edge Functions, damit Browser und
// Server dieselben Regeln rechnen (kein doppelter Code). Läuft vor jedem
// Release; das Ergebnis wird mit eingecheckt, weil `supabase functions deploy`
// nur den Funktionsordner hochlädt.
//   node scripts/funktionen-bundeln.mjs
import { build } from "esbuild";

const ziele = [
  { ein: "src/lib/erinnerung.js", aus: "supabase/functions/fristen-erinnerung/logik.js" },
];
for (const z of ziele) {
  await build({
    entryPoints: [z.ein], outfile: z.aus, bundle: true, format: "esm", platform: "neutral", target: "es2022",
    banner: { js: `// GENERIERT aus ${z.ein} durch scripts/funktionen-bundeln.mjs — nicht von Hand ändern.` },
  });
  console.log("gebündelt:", z.aus);
}
