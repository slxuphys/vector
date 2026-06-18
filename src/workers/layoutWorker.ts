import {
  collectPreparedMathRequests,
  finishMarkdownLayout,
  prepareMarkdownLayout
} from "../core/engine/createDocumentEngine";
import type { MathMeasurementMap, MathMeasureRequest } from "../core/layout/mathMetrics";
import type { MathMeasureWorkerResponse, WorkerRequest, WorkerResponse } from "../core/engine/workerProtocol";

const pendingMeasurements = new Map<number, (measurements: MathMeasurementMap) => void>();

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  if (request.type === "measureMathResult") {
    console.log("[math-worker] received measurements", {
      id: request.id,
      count: Object.keys(request.measurements).length
    });
    pendingMeasurements.get(request.id)?.(request.measurements);
    pendingMeasurements.delete(request.id);
    return;
  }

  void handleLayout(request);
};

async function handleLayout(request: Exclude<WorkerRequest, MathMeasureWorkerResponse>) {
  try {
    const prepared = prepareMarkdownLayout(request.markdown, request.options);
    const measureRequests = collectPreparedMathRequests(prepared);
    console.log("[math-worker] collected measurement requests", {
      id: request.id,
      count: measureRequests.length
    });
    const measurements = measureRequests.length > 0 ? await requestMathMeasurements(request.id, measureRequests) : {};
    const result = finishMarkdownLayout(prepared, measurements);
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

function requestMathMeasurements(
  id: number,
  requests: MathMeasureRequest[]
): Promise<MathMeasurementMap> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      console.warn("[math-worker] measurement timeout", { id, count: requests.length });
      pendingMeasurements.delete(id);
      resolve({});
    }, 3000);
    pendingMeasurements.set(id, resolve);
    pendingMeasurements.set(id, (measurements) => {
      clearTimeout(timeout);
      resolve(measurements);
    });
    self.postMessage({ id, type: "measureMath", requests } satisfies WorkerResponse);
  });
}
