import type { DocumentTheme } from "../theme/themeTypes";
import type { MathRendererName } from "../engine/workerProtocol";
import type { NativeMathMetrics } from "../renderers/math/nativeMath";
import type { InlineRun } from "./layoutBlocks";
import { getMeasuredMath, type MathMeasurementMap } from "./mathMetrics";
import { measureText } from "./measureText";

export type LayoutLine = {
  runs: InlineRun[];
  width: number;
  height: number;
};

export function breakRunsIntoLines(
  runs: InlineRun[],
  maxWidth: number,
  fontSize: number,
  theme: DocumentTheme,
  mathMeasurements?: MathMeasurementMap,
  mathRenderer: MathRendererName = "katex-raster",
  nativeMathMetrics?: NativeMathMetrics
): LayoutLine[] {
  const lines: LayoutLine[] = [];
  let current: InlineRun[] = [];
  let currentWidth = 0;
  const lineHeight = fontSize * theme.lineHeight;
  let currentHeight = lineHeight;

  const pushLine = () => {
    lines.push({ runs: current, width: currentWidth, height: currentHeight });
    current = [];
    currentWidth = 0;
    currentHeight = lineHeight;
  };

  for (const run of runs) {
    const words = run.math ? [run.text.trim()] : run.text.match(/\S+\s*|\s+/g) ?? [];
    for (const word of words) {
      const width = run.math
        ? measureMathChunk(word, fontSize, mathMeasurements, mathRenderer, nativeMathMetrics)
        : measureText(word, {
        fontSize,
        fontFamily: theme.fontFamily,
        monoFontFamily: theme.monoFontFamily,
        ...run
      });
      const height = run.math ? measureMathHeight(word, fontSize, lineHeight, mathMeasurements, mathRenderer, nativeMathMetrics) : lineHeight;
      if (current.length > 0 && currentWidth + width > maxWidth) pushLine();
      if (run.math) {
        current.push({ ...run, text: word });
        currentWidth += width;
        currentHeight = Math.max(currentHeight, height);
        continue;
      }
      if (width > maxWidth) {
        for (const char of word) {
          const charWidth = measureText(char, {
            fontSize,
            fontFamily: theme.fontFamily,
            monoFontFamily: theme.monoFontFamily,
            ...run
          });
          if (current.length > 0 && currentWidth + charWidth > maxWidth) pushLine();
          current.push({ ...run, text: char });
          currentWidth += charWidth;
          currentHeight = Math.max(currentHeight, lineHeight);
        }
      } else {
        current.push({ ...run, text: word });
        currentWidth += width;
        currentHeight = Math.max(currentHeight, height);
      }
    }
  }

  if (current.length > 0) pushLine();
  return lines.length > 0 ? lines : [{ runs: [], width: 0, height: lineHeight }];
}

function measureMathChunk(
  text: string,
  fontSize: number,
  mathMeasurements?: MathMeasurementMap,
  mathRenderer: MathRendererName = "katex-raster",
  nativeMathMetrics?: NativeMathMetrics
): number {
  return getMeasuredMath(mathMeasurements, text, false, fontSize, mathRenderer, nativeMathMetrics)?.advance ?? fontSize * Math.max(1, text.length * 0.6);
}

function measureMathHeight(
  text: string,
  fontSize: number,
  fallback: number,
  mathMeasurements?: MathMeasurementMap,
  mathRenderer: MathRendererName = "katex-raster",
  nativeMathMetrics?: NativeMathMetrics
): number {
  return getMeasuredMath(mathMeasurements, text, false, fontSize, mathRenderer, nativeMathMetrics)?.height ?? fallback;
}
