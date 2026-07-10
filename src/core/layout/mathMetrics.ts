import { flattenInline, type LayoutBlock, type InlineRun, type TitleMatter } from "./layoutBlocks";
import type { DocumentTheme } from "../theme/themeTypes";
import type { MathRendererName } from "../engine/engineTypes";
import { isNativeMathRenderer, type NativeMathLayout, type NativeMathMetrics } from "../renderers/math/nativeMath";
import type { NativeMathFontProfileName } from "../renderers/math/nativeMathProfiles";
import { defaultLayoutConfig, type LayoutConfig } from "./layoutConfig";
import { parseInline } from "../markdown/parseInline";

export type MathMeasureRequest = {
  key: string;
  latex: string;
  displayMode: boolean;
  fontSize: number;
  color: string;
  nativeMetrics?: NativeMathMetrics;
  nativeMathProfile?: NativeMathFontProfileName;
};

export type MathMeasurement = {
  width: number;
  height: number;
  advance: number;
  baseline?: number;
  nativeLayout?: NativeMathLayout;
};

export type MathMeasurementMap = Record<string, MathMeasurement>;

export function mathMeasureKey(
  latex: string,
  displayMode: boolean,
  fontSize: number,
  renderer: MathRendererName = "katex-raster",
  nativeMetrics?: NativeMathMetrics,
  nativeMathProfile?: NativeMathFontProfileName
): string {
  const metricsKey = isNativeMathRenderer(renderer) && nativeMetrics ? `:${nativeMetricsKey(nativeMetrics)}` : "";
  const profileKey = isNativeMathRenderer(renderer) && nativeMathProfile ? `:${nativeMathProfile}` : "";
  return `${renderer}${profileKey}:${displayMode ? "display" : "inline"}:${round(fontSize)}:${normalizeMathLatex(latex)}${metricsKey}`;
}

export function normalizeMathLatex(latex: string): string {
  return latex.replace(/\s+/g, "");
}

export function collectMathMeasureRequests(
  blocks: LayoutBlock[],
  theme: DocumentTheme,
  renderer: MathRendererName = "katex-raster",
  nativeMetrics?: NativeMathMetrics,
  nativeMathProfile?: NativeMathFontProfileName,
  titleMatter?: TitleMatter,
  layoutConfig: LayoutConfig = defaultLayoutConfig
): MathMeasureRequest[] {
  const requests = new Map<string, MathMeasureRequest>();

  const addRun = (run: InlineRun, fontSize: number, color: string) => {
    if (!run.math) return;
    const latex = run.text.trim();
    const key = mathMeasureKey(latex, false, fontSize, renderer, nativeMetrics, nativeMathProfile);
    requests.set(key, { key, latex, displayMode: false, fontSize, color, nativeMetrics, nativeMathProfile });
  };

  for (const block of blocks) {
    if (block.type === "heading") {
      block.runs.forEach((run) => addRun(run, headingSize(block.level, theme.fontSize, block.title, layoutConfig.headingFontSizes), theme.text));
    } else if (block.type === "paragraph") {
      block.runs.forEach((run) => addRun(run, theme.fontSize, theme.text));
    } else if (block.type === "list") {
      block.items.forEach((item) => item.forEach((run) => addRun(run, theme.fontSize, theme.text)));
    } else if (block.type === "table") {
      const fontSize = theme.fontSize * 0.92;
      block.headers.forEach((cell) => cell.runs.forEach((run) => addRun(run, fontSize, theme.text)));
      block.rows.forEach((row) => row.forEach((cell) => cell.runs.forEach((run) => addRun(run, fontSize, theme.text))));
    } else if (block.type === "math") {
      const fontSize = theme.fontSize;
      const latex = block.text.replace(/\s+/g, " ").trim();
      const key = mathMeasureKey(latex, true, fontSize, renderer, nativeMetrics, nativeMathProfile);
      requests.set(key, { key, latex, displayMode: true, fontSize, color: theme.text, nativeMetrics, nativeMathProfile });
    } else if ((block.type === "image" || block.type === "graphsx") && block.caption) {
      const fontSize = theme.fontSize * 0.86;
      flattenInline(parseInline(block.caption)).forEach((run) => addRun(run, fontSize, theme.text));
    }
  }

  if (titleMatter) {
    const titleFontSize = titleMatter.titleFontSize ?? headingSize(1, theme.fontSize, true, layoutConfig.headingFontSizes);
    titleMatter.title?.forEach((run) => addRun(run, titleFontSize, theme.text));
    const authorFontSize = theme.fontSize * 1.05;
    titleMatter.authors.forEach((author) => author.forEach((run) => addRun(run, authorFontSize, theme.mutedText)));
    titleMatter.abstract?.forEach((run) => addRun(run, theme.fontSize, theme.text));
  }

  return [...requests.values()];
}

export function getMeasuredMath(
  measurements: MathMeasurementMap | undefined,
  latex: string,
  displayMode: boolean,
  fontSize: number,
  renderer: MathRendererName = "katex-raster",
  nativeMetrics?: NativeMathMetrics,
  nativeMathProfile?: NativeMathFontProfileName
): MathMeasurement | undefined {
  return measurements?.[mathMeasureKey(latex, displayMode, fontSize, renderer, nativeMetrics, nativeMathProfile)];
}

export function headingSize(
  level: number,
  base: number,
  title = false,
  headingFontSizes: LayoutConfig["headingFontSizes"] = defaultLayoutConfig.headingFontSizes
): number {
  if (title) return Math.max(32, base * 2.7);
  return headingFontSizes[level as keyof LayoutConfig["headingFontSizes"]] ?? [0, 28, 22, 18, 15, 13, 12][level] ?? base;
}

function round(value: number): string {
  return Number(value.toFixed(2)).toString();
}

function nativeMetricsKey(metrics: NativeMathMetrics): string {
  return Object.keys(metrics)
    .sort()
    .map((key) => `${key}=${round(metrics[key as keyof NativeMathMetrics])}`)
    .join(",");
}
