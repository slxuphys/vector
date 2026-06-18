import type { PagedDisplayList, PreviewStats } from "../display-list/displayTypes";
import type { EngineOptions, WorkerRequest, WorkerResponse } from "./workerProtocol";
import type { MathMeasurementMap } from "../layout/mathMetrics";

export type WorkerLayoutClient = {
  layout(markdown: string, mathMeasurements?: MathMeasurementMap): Promise<{ layout: PagedDisplayList; stats: PreviewStats }>;
  dispose(): void;
};

export function createWorkerClient(options: EngineOptions = {}): WorkerLayoutClient {
  const worker = new Worker(new URL("../../workers/layoutWorker.ts", import.meta.url), {
    type: "module"
  });
  let nextId = 1;
  const pending = new Map<
    number,
    {
      resolve: (value: { layout: PagedDisplayList; stats: PreviewStats }) => void;
      reject: (error: Error) => void;
    }
  >();

  worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
    const response = event.data;
    const entry = pending.get(response.id);
    if (!entry) return;
    pending.delete(response.id);
    if (response.type === "layoutError") entry.reject(new Error(response.message));
    else entry.resolve({ layout: response.layout, stats: response.stats });
  };
  worker.onerror = (event) => {
    const error = new Error(event.message || "Layout worker failed");
    pending.forEach((entry) => entry.reject(error));
    pending.clear();
  };

  return {
    layout(markdown, mathMeasurements) {
      const id = nextId++;
      const message: WorkerRequest = { id, type: "layout", markdown, options, mathMeasurements };
      worker.postMessage(message);
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
      });
    },
    dispose() {
      worker.terminate();
      pending.clear();
    }
  };
}
