import type { PagedDisplayList, PreviewStats } from "../display-list/displayTypes";
import type { LayoutConfig } from "../layout/layoutConfig";
import type { PageMarginInput, PageSizeName } from "../layout/pageConfig";
import type { NativeMathMetrics } from "../renderers/math/nativeMath";
import type { NativeMathFontProfileName } from "../renderers/math/nativeMathProfiles";
import type { DocumentTheme } from "../theme/themeTypes";
import type { CrossRefConfig } from "../xref/xrefTypes";
import type { VectorPluginRegistry } from "../plugins/pluginRegistry";

export type EngineOptions = {
  sourceFormat?: SourceFormat;
  pageSize?: PageSizeName;
  margin?: PageMarginInput;
  theme?: Partial<DocumentTheme>;
  mathRenderer?: MathRendererName;
  nativeMathMetrics?: NativeMathMetrics;
  nativeMathProfile?: NativeMathFontProfileName;
  crossRef?: Partial<CrossRefConfig>;
  layout?: Partial<LayoutConfig>;
  bibliographyFiles?: Record<string, string>;
  assetUrls?: Record<string, string>;
  sourcePath?: string;
  document?: Partial<DocumentOptions>;
  plugins?: VectorPluginRegistry;
};

export type SourceFormat = "markdown" | "latex";

export type DocumentOptions = {
  titleFromFirstHeading: boolean;
  title?: string;
  titleFontSize?: number;
  authors?: Array<string | DocumentAuthor>;
  date?: string;
  abstract?: string;
  abstractTitle?: string;
  titleStyle?: "default" | "latex-article" | "revtex";
  numberSections?: boolean;
  sectionNumberStyle?: "decimal" | "revtex";
};

export type DocumentAuthor = {
  name: string;
  affiliations?: string[];
  email?: string;
};

export const defaultDocumentOptions: DocumentOptions = {
  titleFromFirstHeading: true,
  authors: [],
  abstractTitle: "Abstract"
};

export type MathRendererName = "native-openmath";

export type LayoutResult = {
  layout: PagedDisplayList;
  stats: PreviewStats;
};
