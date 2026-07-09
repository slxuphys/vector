import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "katex/dist/katex.min.css";
import "./playground.css";

(globalThis as { __SVG_MD_PLAYGROUND_STARTED_AT__?: number }).__SVG_MD_PLAYGROUND_STARTED_AT__ = performance.now();

const root = createRoot(document.getElementById("root")!);
const params = new URLSearchParams(window.location.search);
const labMode = params.get("mode") === "lab" || window.location.pathname.replace(/\/$/, "").endsWith("/lab") || window.location.hash === "#lab";

void (labMode
  ? import("./lab/LabApp").then(({ LabApp }) => <LabApp />)
  : import("./product/ProductApp").then(({ ProductApp }) => <ProductApp />)
).then((app) => root.render(
  <StrictMode>
    {app}
  </StrictMode>
));
