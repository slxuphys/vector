import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "katex/dist/katex.min.css";
import "./playground.css";

(globalThis as { __SVG_MD_PLAYGROUND_STARTED_AT__?: number }).__SVG_MD_PLAYGROUND_STARTED_AT__ = performance.now();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
