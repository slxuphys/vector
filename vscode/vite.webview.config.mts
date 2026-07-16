import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    outDir: resolve(import.meta.dirname, "webview-dist"),
    emptyOutDir: true,
    cssCodeSplit: false,
    rollupOptions: {
      input: resolve(import.meta.dirname, "src/webview/main.tsx"),
      output: {
        entryFileNames: "webview.js",
        assetFileNames: (asset) => asset.name?.endsWith(".css") ? "webview.css" : "assets/[name][extname]"
      }
    }
  }
});
