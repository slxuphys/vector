import { finishMarkdownLayout, prepareMarkdownLayout } from "../core/engine/createDocumentEngine";
import type { WorkerRequest, WorkerResponse } from "../core/engine/workerProtocol";
import { isNativeMathRenderer } from "../core/renderers/math/nativeMath";
import { loadNativeMathFonts } from "../core/renderers/math/nativeFontMetrics";
import { loadTextFontsForTheme } from "../core/renderers/text/textFontMetrics";

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  void handleLayout(event.data);
};

async function handleLayout(request: WorkerRequest) {
  try {
    const prepared = prepareMarkdownLayout(request.markdown, request.options);
    await loadTextFontsForTheme(prepared.theme);
    if (isNativeMathRenderer(prepared.mathRenderer)) await loadNativeMathFonts();
    const result = finishMarkdownLayout(prepared, request.mathMeasurements);
    const response: WorkerResponse = {
      id: request.id,
      type: "layoutResult",
      layout: result.layout,
      stats: result.stats
    };
    self.postMessage(response);
  } catch (error) {
    const response: WorkerResponse = {
      id: request.id,
      type: "layoutError",
      message: error instanceof Error ? error.message : "Unknown layout error"
    };
    self.postMessage(response);
  }
}
