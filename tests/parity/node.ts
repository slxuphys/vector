import { createDocumentEngine } from "../../src/core/engine/createDocumentEngine";
import { loadNativeMathFonts } from "../../src/core/renderers/math/nativeFontMetrics";
import { renderToPdf } from "../../src/core/renderers/pdf/renderToPdf";
import { parityFixture } from "./fixture";
import { summarizeParity } from "./summary";

declare const process: { stdout: { write(value: string): void } };

async function main(): Promise<void> {
  await loadNativeMathFonts();
  const engine = createDocumentEngine({
    sourceFormat: "latex",
    mathRenderer: "native-openmath",
    nativeMathProfile: "openmath"
  });
  const { layout } = await engine.layout(parityFixture);
  const bytes = await renderToPdf(layout, { subsetFonts: true });
  process.stdout.write(JSON.stringify(await summarizeParity(layout, bytes)));
}

void main();
