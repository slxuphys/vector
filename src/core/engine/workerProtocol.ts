import type { PagedDisplayList, PreviewStats } from "../display-list/displayTypes";
import type { MathMeasurement, MathMeasureRequest } from "../layout/mathMetrics";
import type { PageSizeName } from "../layout/pageConfig";
import type { DocumentTheme } from "../theme/themeTypes";

export type EngineOptions = {
  pageSize?: PageSizeName;
  margin?: number;
  theme?: Partial<DocumentTheme>;
  useWorker?: boolean;
};

export type LayoutRequest = {
  id: number;
  type: "layout";
  markdown: string;
  options: EngineOptions;
};

export type LayoutResponse = {
  id: number;
  type: "layoutResult";
  layout: PagedDisplayList;
  stats: PreviewStats;
};

export type LayoutErrorResponse = {
  id: number;
  type: "layoutError";
  message: string;
};

export type MathMeasureWorkerRequest = {
  id: number;
  type: "measureMath";
  requests: MathMeasureRequest[];
};

export type MathMeasureWorkerResponse = {
  id: number;
  type: "measureMathResult";
  measurements: Record<string, MathMeasurement>;
};

export type WorkerRequest = LayoutRequest | MathMeasureWorkerResponse;
export type WorkerResponse = LayoutResponse | LayoutErrorResponse | MathMeasureWorkerRequest;
