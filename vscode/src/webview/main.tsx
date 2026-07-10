import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { VsCodePreviewApp } from "./VsCodePreviewApp";
import "./webview.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <VsCodePreviewApp />
  </StrictMode>
);
