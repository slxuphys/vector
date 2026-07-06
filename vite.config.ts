import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    sourcemap: true,
    lib: {
      entry: "src/index.ts",
      formats: ["es"],
      name: "SvgMdPreview"
    },
    rollupOptions: {
      external: ["react", "react-dom"]
    }
  },
  worker: {
    format: "es"
  }
});
