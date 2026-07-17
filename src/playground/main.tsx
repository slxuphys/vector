import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./playground.css";

(globalThis as { __SVG_MD_PLAYGROUND_STARTED_AT__?: number }).__SVG_MD_PLAYGROUND_STARTED_AT__ = performance.now();

const root = createRoot(document.getElementById("root")!);
const params = new URLSearchParams(window.location.search);
const productBuild = import.meta.env.VITE_PRODUCT_BUILD === "true";
const labMode = !productBuild && (
  params.get("mode") === "lab"
  || window.location.pathname.replace(/\/$/, "").endsWith("/lab")
  || window.location.hash === "#lab"
);

void (labMode
  ? import("./lab/LabApp").then(({ LabApp }) => <LabApp />)
  : import("./product/ProductApp").then(({ ProductApp }) => <ProductApp showLabLink={!productBuild} />)
).then((app) => root.render(
  <StrictMode>
    {app}
  </StrictMode>
));
