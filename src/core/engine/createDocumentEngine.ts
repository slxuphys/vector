import { buildDisplayList } from "../display-list/buildDisplayList";
import type { PagedDisplayList, PreviewStats } from "../display-list/displayTypes";
import { createPageConfig } from "../layout/pageConfig";
import { paginate } from "../layout/paginate";
import { collectMathMeasureRequests, type MathMeasurementMap } from "../layout/mathMetrics";
import type { LayoutBlock } from "../layout/layoutBlocks";
import type { PageConfig } from "../layout/pageConfig";
import { normalizeAst } from "../markdown/normalizeAst";
import { parseMarkdown } from "../markdown/parseMarkdown";
import { defaultTheme } from "../theme/defaultTheme";
import type { DocumentTheme } from "../theme/themeTypes";
import { now } from "../utils/timing";
import type { EngineOptions } from "./workerProtocol";

export type DocumentEngine = {
  layout(markdown: string): Promise<{ layout: PagedDisplayList; stats: PreviewStats }>;
};

export type PreparedLayout = {
  blocks: LayoutBlock[];
  page: PageConfig;
  theme: DocumentTheme;
  parseMs: number;
  totalStart: number;
};

export function createDocumentEngine(options: EngineOptions = {}): DocumentEngine {
  return {
    async layout(markdown: string) {
      return layoutMarkdown(markdown, options);
    }
  };
}

export function layoutMarkdown(
  markdown: string,
  options: EngineOptions = {},
  mathMeasurements?: MathMeasurementMap
): { layout: PagedDisplayList; stats: PreviewStats } {
  const prepared = prepareMarkdownLayout(markdown, options);
  return finishMarkdownLayout(prepared, mathMeasurements);
}

export function prepareMarkdownLayout(markdown: string, options: EngineOptions = {}): PreparedLayout {
  const totalStart = now();
  const parseStart = now();
  const ast = parseMarkdown(markdown);
  const blocks = normalizeAst(ast);
  const parseMs = now() - parseStart;
  const page = createPageConfig(options.pageSize ?? "letter", options.margin ?? 72);
  const theme: DocumentTheme = { ...defaultTheme, ...(options.theme ?? {}) };

  return { blocks, page, theme, parseMs, totalStart };
}

export function finishMarkdownLayout(
  prepared: PreparedLayout,
  mathMeasurements?: MathMeasurementMap
): { layout: PagedDisplayList; stats: PreviewStats } {
  const layoutStart = now();
  const pages = paginate(prepared.blocks, prepared.page, prepared.theme, mathMeasurements);
  const layout = buildDisplayList(pages, prepared.page, prepared.theme);
  const layoutMs = now() - layoutStart;

  return {
    layout,
    stats: {
      pageCount: layout.pages.length,
      parseMs: prepared.parseMs,
      layoutMs,
      svgMs: 0,
      totalMs: now() - prepared.totalStart
    }
  };
}

export function collectPreparedMathRequests(prepared: PreparedLayout) {
  return collectMathMeasureRequests(prepared.blocks, prepared.theme);
}
