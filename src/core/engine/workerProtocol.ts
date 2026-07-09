import type { PagedDisplayList, PreviewStats } from "../display-list/displayTypes";
import type { MathMeasurementMap } from "../layout/mathMetrics";
import type { LayoutConfig } from "../layout/layoutConfig";
import type { PageMarginInput, PageSizeName } from "../layout/pageConfig";
import type { NativeMathMetrics } from "../renderers/math/nativeMath";
import type { NativeMathFontProfileName } from "../renderers/math/nativeMathProfiles";
import type { DocumentTheme } from "../theme/themeTypes";
import type { CrossRefConfig } from "../xref/xrefTypes";

export type EngineOptions = {
  sourceFormat?: SourceFormat;
  pageSize?: PageSizeName;
  margin?: PageMarginInput;
  theme?: Partial<DocumentTheme>;
  useWorker?: boolean;
  mathRenderer?: MathRendererName;
  nativeMathMetrics?: NativeMathMetrics;
  nativeMathProfile?: NativeMathFontProfileName;
  crossRef?: Partial<CrossRefConfig>;
  layout?: Partial<LayoutConfig>;
  document?: Partial<DocumentOptions>;
};

export type SourceFormat = "markdown" | "latex";

export type DocumentOptions = {
  titleFromFirstHeading: boolean;
  title?: string;
  titleFontSize?: number;
  authors?: string[];
  date?: string;
  abstract?: string;
  abstractTitle?: string;
  titleStyle?: "default" | "latex-article" | "revtex";
  numberSections?: boolean;
  sectionNumberStyle?: "decimal" | "revtex";
};

export const defaultDocumentOptions: DocumentOptions = {
  titleFromFirstHeading: true,
  authors: [],
  abstractTitle: "Abstract"
};

export type MathRendererName =
  | "katex-raster"
  | "katex-glyph"
  | "mathjax-vector"
  | "mathjax-glyph"
  | "native"
  | "native-openmath";

export type LayoutRequest = {
  id: number;
  type: "layout";
  markdown: string;
  options: EngineOptions;
  mathMeasurements?: MathMeasurementMap;
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

export type WorkerRequest = LayoutRequest;
export type WorkerResponse = LayoutResponse | LayoutErrorResponse;
