import { buildDisplayList } from "../display-list/buildDisplayList";
import type { PagedDisplayList, PreviewStats } from "../display-list/displayTypes";
import { applyDocumentFrontMatter, applySourceFormatDefaults, mergeCrossRefConfig, mergeLayoutConfig, parseMarkdownDocument, type ParsedMarkdownDocument } from "../config/documentConfig";
import { createPageConfig } from "../layout/pageConfig";
import type { LayoutConfig } from "../layout/layoutConfig";
import { paginate } from "../layout/paginate";
import { collectMathMeasureRequests, type MathMeasurementMap } from "../layout/mathMetrics";
import type { LayoutBlock } from "../layout/layoutBlocks";
import type { PageConfig } from "../layout/pageConfig";
import { normalizeAst } from "../markdown/normalizeAst";
import { parseMarkdown } from "../markdown/parseMarkdown";
import { parseLatex } from "../latex/parseLatex";
import { resolveCrossReferences } from "../xref/resolveReferences";
import { defaultTheme } from "../theme/defaultTheme";
import {
  defaultNativeMathMetrics,
  getDefaultOpenMathMetricsForProfile,
  isNativeMathRenderer,
  layoutNativeMath,
  nativeMathProfileForRenderer,
  type NativeMathMetrics
} from "../renderers/math/nativeMath";
import { loadNativeMathFonts } from "../renderers/math/nativeFontMetrics";
import { loadTextFontsForTheme } from "../renderers/text/textFontMetrics";
import type { NativeMathFontProfileName } from "../renderers/math/nativeMathProfiles";
import type { DocumentTheme } from "../theme/themeTypes";
import { now } from "../utils/timing";
import { defaultDocumentOptions, type EngineOptions, type MathRendererName } from "./engineTypes";
import type { CrossRefConfig } from "../xref/xrefTypes";
import { flattenInline, type TitleMatter } from "../layout/layoutBlocks";
import { parseInline } from "../markdown/parseInline";

export type DocumentEngine = {
  layout(markdown: string): Promise<{ layout: PagedDisplayList; stats: PreviewStats }>;
};

export type PreparedLayout = {
  blocks: LayoutBlock[];
  titleMatter?: TitleMatter;
  page: PageConfig;
  theme: DocumentTheme;
  mathRenderer: MathRendererName;
  nativeMathMetrics?: NativeMathMetrics;
  nativeMathProfile?: NativeMathFontProfileName;
  crossRef: CrossRefConfig;
  layoutConfig: LayoutConfig;
  parseMs: number;
  totalStart: number;
};

export function createDocumentEngine(options: EngineOptions = {}): DocumentEngine {
  return {
    async layout(markdown: string) {
      const prepared = await prepareMarkdownLayoutWithFonts(markdown, options);
      await loadTextFontsForTheme(prepared.theme);
      return finishMarkdownLayout(prepared, measureNativeMathRequests(prepared));
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
  return prepareMarkdownLayoutFromDocument(document, options, totalStart, parseStart);
}

export async function prepareMarkdownLayoutWithFonts(markdown: string, options: EngineOptions = {}): Promise<PreparedLayout> {
  const totalStart = now();
  const parseStart = now();
  const document = parseMarkdownDocument(markdown);
  if (needsNativeMathFontsBeforeFrontMatter(document, options)) {
    await loadNativeMathFonts();
  }
  return prepareMarkdownLayoutFromDocument(document, options, totalStart, parseStart);
}

function prepareMarkdownLayoutFromDocument(
  document: ParsedMarkdownDocument,
  options: EngineOptions,
  totalStart: number,
  parseStart: number
): PreparedLayout {
  const sourceDefaults = applySourceFormatDefaults(document.markdown, options);
  const resolvedOptions = applyDocumentFrontMatter(sourceDefaults, document.frontMatter);
  warnFrontMatter(document.warnings);
  const documentOptions = {
    ...defaultDocumentOptions,
    ...(resolvedOptions.document ?? {})
  };
  const crossRef = mergeCrossRefConfig(resolvedOptions.crossRef, undefined);
  const ast = resolveCrossReferences(parseSourceAst(document.markdown, resolvedOptions.sourceFormat), crossRef, {
    titleFromFirstHeading: documentOptions.titleFromFirstHeading && !documentOptions.title,
    numberSections: documentOptions.numberSections,
    sectionNumberStyle: documentOptions.sectionNumberStyle
  });
  const blocks = normalizeAst(ast);
  const titleMatter = buildTitleMatter(documentOptions);
  const parseMs = now() - parseStart;
  const page = createPageConfig(resolvedOptions.pageSize ?? "letter", resolvedOptions.margin ?? 72);
  const theme: DocumentTheme = { ...defaultTheme, ...(resolvedOptions.theme ?? {}) };
  const mathRenderer = resolvedOptions.mathRenderer ?? "katex-raster";
  const nativeMathMetrics = resolvedOptions.nativeMathMetrics;
  const nativeMathProfile = resolvedOptions.nativeMathProfile;
  const layoutConfig = mergeLayoutConfig(resolvedOptions.layout, undefined);

  return { blocks, titleMatter, page, theme, mathRenderer, nativeMathMetrics, nativeMathProfile, crossRef, layoutConfig, parseMs, totalStart };
}

function parseSourceAst(source: string, format: EngineOptions["sourceFormat"] = "markdown") {
  return format === "latex" ? parseLatex(source) : parseMarkdown(source);
}

function needsNativeMathFontsBeforeFrontMatter(document: ParsedMarkdownDocument, options: EngineOptions): boolean {
  return Boolean(
    options.sourceFormat === "latex" ||
    document.frontMatter?.typography?.family ||
    document.frontMatter?.math?.renderer ||
    isNativeMathRenderer(options.mathRenderer)
  );
}

export function finishMarkdownLayout(
  prepared: PreparedLayout,
  mathMeasurements?: MathMeasurementMap
): { layout: PagedDisplayList; stats: PreviewStats } {
  const layoutStart = now();
  const pages = paginate(prepared.blocks, prepared.page, prepared.theme, mathMeasurements, prepared.mathRenderer, prepared.nativeMathMetrics, prepared.nativeMathProfile, prepared.crossRef, prepared.layoutConfig, prepared.titleMatter);
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

function buildTitleMatter(documentOptions: typeof defaultDocumentOptions): TitleMatter | undefined {
  const hasTitleMatter = Boolean(
    documentOptions.title ||
    documentOptions.authors?.length ||
    documentOptions.abstract
  );
  if (!hasTitleMatter) return undefined;
  return {
    title: documentOptions.title ? flattenInline(parseInline(documentOptions.title)) : undefined,
    titleFontSize: documentOptions.titleFontSize,
    authors: (documentOptions.authors ?? []).map((author) => flattenInline(parseInline(author))),
    date: documentOptions.date ? flattenInline(parseInline(documentOptions.date)) : undefined,
    abstract: documentOptions.abstract ? flattenInline(parseInline(documentOptions.abstract)) : undefined,
    abstractTitle: documentOptions.abstractTitle ?? defaultDocumentOptions.abstractTitle ?? "Abstract",
    style: documentOptions.titleStyle
  };
}

export function collectPreparedMathRequests(prepared: PreparedLayout) {
  return collectMathMeasureRequests(prepared.blocks, prepared.theme, prepared.mathRenderer, prepared.nativeMathMetrics, prepared.nativeMathProfile, prepared.titleMatter, prepared.layoutConfig);
}

function measureNativeMathRequests(prepared: PreparedLayout): MathMeasurementMap | undefined {
  if (!isNativeMathRenderer(prepared.mathRenderer)) return undefined;

  const measurements: MathMeasurementMap = {};
  for (const request of collectPreparedMathRequests(prepared)) {
    const profile = request.nativeMathProfile ?? prepared.nativeMathProfile ?? nativeMathProfileForRenderer(prepared.mathRenderer);
    const metrics = request.nativeMetrics
      ?? prepared.nativeMathMetrics
      ?? (prepared.mathRenderer === "native-openmath" ? getDefaultOpenMathMetricsForProfile(profile) : defaultNativeMathMetrics);
    const layout = layoutNativeMath(request.latex, request.displayMode, request.fontSize, metrics, profile);
    measurements[request.key] = {
      width: layout.width,
      height: layout.height,
      advance: layout.advance,
      baseline: layout.baseline,
      nativeLayout: layout
    };
  }
  return measurements;
}

function warnFrontMatter(warnings: string[]): void {
  if (typeof console === "undefined") return;
  for (const warning of warnings) console.warn("[front-matter]", warning);
}
