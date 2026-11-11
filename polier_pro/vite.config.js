import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    target: ["es2015", "safari14"],
  },
  // web-ifc (BIM-Import, lib/ifcLaden.js) nutzt BigInt-Literale. Safari 14
  // und alle anderen Zielbrowser unterstützen BigInt nativ; esbuild lehnt
  // sie nur wegen des es2015-Ziels ab. Wird nur im nachgeladenen IFC-Chunk
  // gebraucht.
  esbuild: { supported: { bigint: true } },
  optimizeDeps: { esbuildOptions: { supported: { bigint: true } } },
});
