import { createDocumentEngine } from "../../src/core/engine/createDocumentEngine";
import { loadNativeMathFonts } from "../../src/core/renderers/math/nativeFontMetrics";
import { renderToPdf } from "../../src/core/renderers/pdf/renderToPdf";
import { parityFixture } from "./fixture";
import { summarizeParity } from "./summary";

declare global {
  interface Window {
    runVectorParity(): ReturnType<typeof runVectorParity>;
  }
}

async function runVectorParity() {
  await loadNativeMathFonts();
  const engine = createDocumentEngine({
    sourceFormat: "latex",
    mathRenderer: "native-openmath",
    nativeMathProfile: "openmath"
  });
  const { layout } = await engine.layout(parityFixture);
  const bytes = await renderToPdf(layout, { subsetFonts: true });
  return summarizeParity(layout, bytes);
}

window.runVectorParity = runVectorParity;
