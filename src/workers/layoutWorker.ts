import { finishMarkdownLayout, prepareMarkdownLayout } from "../core/engine/createDocumentEngine";
import type { WorkerRequest, WorkerResponse } from "../core/engine/workerProtocol";
import { loadNativeMathFonts } from "../core/renderers/math/nativeFontMetrics";
import { isNativeMathRenderer } from "../core/renderers/math/nativeMath";
import { loadTextFontsForTheme } from "../core/renderers/text/textFontMetrics";
import { defaultTheme } from "../core/theme/defaultTheme";

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  void handleLayout(event.data);
};

async function handleLayout(request: WorkerRequest) {
  try {
    await loadTextFontsForTheme({ ...defaultTheme, ...(request.options.theme ?? {}) });
    if (isNativeMathRenderer(request.options.mathRenderer)) await loadNativeMathFonts();
    const prepared = prepareMarkdownLayout(request.markdown, request.options);
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
