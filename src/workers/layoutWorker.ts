import { finishMarkdownLayout, prepareMarkdownLayout } from "../core/engine/createDocumentEngine";
import type { WorkerRequest, WorkerResponse } from "../core/engine/workerProtocol";

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  void handleLayout(event.data);
};

async function handleLayout(request: WorkerRequest) {
  try {
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
