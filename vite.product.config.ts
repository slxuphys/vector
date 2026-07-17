import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? "/",
  plugins: [react()],
  define: {
    "import.meta.env.VITE_PRODUCT_BUILD": JSON.stringify("true")
  },
  build: {
    outDir: "dist-product",
    sourcemap: false,
    emptyOutDir: true,
    rollupOptions: {
      input: "index.html"
    }
  }
});
