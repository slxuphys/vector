import { buildDisplayList } from "../display-list/buildDisplayList";
import type { PagedDisplayList, PreviewStats } from "../display-list/displayTypes";
import { applyDocumentFrontMatter, mergeCrossRefConfig, parseMarkdownDocument } from "../config/documentConfig";
import { createPageConfig } from "../layout/pageConfig";
import { paginate } from "../layout/paginate";
import { collectMathMeasureRequests, type MathMeasurementMap } from "../layout/mathMetrics";
import type { LayoutBlock } from "../layout/layoutBlocks";
import type { PageConfig } from "../layout/pageConfig";
import { normalizeAst } from "../markdown/normalizeAst";
import { parseMarkdown } from "../markdown/parseMarkdown";
import { resolveCrossReferences } from "../xref/resolveReferences";
import { defaultTheme } from "../theme/defaultTheme";
import { isNativeMathRenderer, type NativeMathMetrics } from "../renderers/math/nativeMath";
import { loadNativeMathFonts } from "../renderers/math/nativeFontMetrics";
import { loadTextFontsForTheme } from "../renderers/text/textFontMetrics";
import type { NativeMathFontProfileName } from "../renderers/math/nativeMathProfiles";
import type { DocumentTheme } from "../theme/themeTypes";
import { now } from "../utils/timing";
import type { EngineOptions, MathRendererName } from "./workerProtocol";
import type { CrossRefConfig } from "../xref/xrefTypes";

export type DocumentEngine = {
  layout(markdown: string): Promise<{ layout: PagedDisplayList; stats: PreviewStats }>;
};

export type PreparedLayout = {
  blocks: LayoutBlock[];
  page: PageConfig;
  theme: DocumentTheme;
  mathRenderer: MathRendererName;
  nativeMathMetrics?: NativeMathMetrics;
  nativeMathProfile?: NativeMathFontProfileName;
  crossRef: CrossRefConfig;
  parseMs: number;
  totalStart: number;
};

export function createDocumentEngine(options: EngineOptions = {}): DocumentEngine {
  return {
    async layout(markdown: string) {
      const prepared = prepareMarkdownLayout(markdown, options);
      await loadTextFontsForTheme(prepared.theme);
      if (isNativeMathRenderer(prepared.mathRenderer)) await loadNativeMathFonts();
      return finishMarkdownLayout(prepared);
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
  const document = parseMarkdownDocument(markdown);
  const resolvedOptions = applyDocumentFrontMatter(options, document.frontMatter);
  warnFrontMatter(document.warnings);
  const crossRef = mergeCrossRefConfig(resolvedOptions.crossRef, undefined);
  const ast = resolveCrossReferences(parseMarkdown(document.markdown), crossRef);
  const blocks = normalizeAst(ast);
  const parseMs = now() - parseStart;
  const page = createPageConfig(resolvedOptions.pageSize ?? "letter", resolvedOptions.margin ?? 72);
  const theme: DocumentTheme = { ...defaultTheme, ...(resolvedOptions.theme ?? {}) };
  const mathRenderer = resolvedOptions.mathRenderer ?? "katex-raster";
  const nativeMathMetrics = resolvedOptions.nativeMathMetrics;
  const nativeMathProfile = resolvedOptions.nativeMathProfile;

  return { blocks, page, theme, mathRenderer, nativeMathMetrics, nativeMathProfile, crossRef, parseMs, totalStart };
}

export function finishMarkdownLayout(
  prepared: PreparedLayout,
  mathMeasurements?: MathMeasurementMap
): { layout: PagedDisplayList; stats: PreviewStats } {
  const layoutStart = now();
  const pages = paginate(prepared.blocks, prepared.page, prepared.theme, mathMeasurements, prepared.mathRenderer, prepared.nativeMathMetrics, prepared.nativeMathProfile, prepared.crossRef);
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
  return collectMathMeasureRequests(prepared.blocks, prepared.theme, prepared.mathRenderer, prepared.nativeMathMetrics, prepared.nativeMathProfile);
}

function warnFrontMatter(warnings: string[]): void {
  if (typeof console === "undefined") return;
  for (const warning of warnings) console.warn("[front-matter]", warning);
}
