import type { DocumentTheme } from "../theme/themeTypes";
import type { MathRendererName } from "../engine/engineTypes";
import type { NativeMathMetrics } from "../renderers/math/nativeMath";
import type { NativeMathFontProfileName } from "../renderers/math/nativeMathProfiles";
import { createFallbackHyphenator, explicitHyphenBreakPoints, type Hyphenator } from "./hyphenation";
import type { InlineRun } from "./layoutBlocks";
import { defaultLayoutConfig, type LayoutConfig } from "./layoutConfig";
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
  nativeMathMetrics?: NativeMathMetrics,
  nativeMathProfile?: NativeMathFontProfileName,
  layoutConfig: LayoutConfig = defaultLayoutConfig
): LayoutLine[] {
  const lines: LayoutLine[] = [];
  let current: InlineRun[] = [];
  let currentWidth = 0;
  const lineHeight = fontSize * theme.lineHeight;
  let currentHeight = lineHeight;
  const hyphenator = layoutConfig.lineBreaking.hyphenation
    ? createFallbackHyphenator(layoutConfig.lineBreaking.language)
    : undefined;
  const explicitHyphenBreaker: Hyphenator = {
    language: "explicit",
    points: explicitHyphenBreakPoints
  };

  const pushLine = () => {
    lines.push({ runs: current, width: currentWidth, height: currentHeight });
    current = [];
    currentWidth = 0;
    currentHeight = lineHeight;
  };
  const pushSpecificLine = (runs: InlineRun[], width: number, height: number) => {
    lines.push({ runs, width, height });
  };

  const algorithm = layoutConfig.lineBreaking.algorithm;
  if (algorithm === "knuth-plass" && typeof console !== "undefined") {
    console.warn("[line-breaking]", "knuth-plass is not implemented yet; using greedy line breaking.");
  }

  for (const run of runs) {
    const words = run.math
      ? [run.text.trim()]
      : run.nonBreak
        ? [run.text]
        : run.text.match(/\S+\s*|\s+/g) ?? [];
    for (const word of words) {
      const gluedToPrevious = previousRunIsNonBreak(current);
      if (!run.math && !run.code && !run.link && !run.nonBreak && !gluedToPrevious) {
        const placed = placeHyphenatedToken({
          token: word,
          run,
          hyphenator: explicitHyphenBreaker,
          maxWidth,
          fontSize,
          theme,
          current,
          currentWidth,
          currentHeight,
          lineHeight,
          pushSpecificLine
        });
        if (placed) {
          current = placed.current;
          currentWidth = placed.currentWidth;
          currentHeight = placed.currentHeight;
          continue;
        }
      }
      if (!run.math && hyphenator && !run.code && !run.link && !run.nonBreak && !gluedToPrevious) {
        const placed = placeHyphenatedToken({
          token: word,
          run,
          hyphenator,
          maxWidth,
          fontSize,
          theme,
          current,
          currentWidth,
          currentHeight,
          lineHeight,
          pushSpecificLine
        });
        if (placed) {
          current = placed.current;
          currentWidth = placed.currentWidth;
          currentHeight = placed.currentHeight;
          continue;
        }
      }

      const width = run.math
        ? measureMathChunk(word, fontSize, mathMeasurements, mathRenderer, nativeMathMetrics, nativeMathProfile)
        : measureText(word, {
        fontSize,
        fontFamily: theme.fontFamily,
        monoFontFamily: theme.monoFontFamily,
        ...run
      });
      const height = run.math ? measureMathHeight(word, fontSize, lineHeight, mathMeasurements, mathRenderer, nativeMathMetrics, nativeMathProfile) : lineHeight;
      const sticky = run.nonBreak || gluedToPrevious || isNoBreakBeforeToken(word);
      if (current.length > 0 && currentWidth + width > maxWidth && !sticky) pushLine();
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

function previousRunIsNonBreak(runs: InlineRun[]): boolean {
  return runs.length > 0 && runs[runs.length - 1].nonBreak === true;
}

type HyphenatedPlacement = {
  current: InlineRun[];
  currentWidth: number;
  currentHeight: number;
};

function placeHyphenatedToken(options: {
  token: string;
  run: InlineRun;
  hyphenator: Hyphenator;
  maxWidth: number;
  fontSize: number;
  theme: DocumentTheme;
  current: InlineRun[];
  currentWidth: number;
  currentHeight: number;
  lineHeight: number;
  pushSpecificLine: (runs: InlineRun[], width: number, height: number) => void;
}): HyphenatedPlacement | undefined {
  const { token, run, hyphenator, maxWidth, fontSize, theme, lineHeight, pushSpecificLine } = options;
  const match = token.match(/^(\S+)(\s*)$/);
  if (!match) return undefined;
  const [, word, trailingSpace] = match;
  const points = hyphenator.points(word);
  if (!points.length) return undefined;

  let current = options.current;
  let currentWidth = options.currentWidth;
  let currentHeight = options.currentHeight;
  let remaining = word;
  let remainingOffset = 0;
  let handled = false;

  while (remaining) {
    const remainingWidth = measureText(remaining + trailingSpace, textMeasureOptions(run, fontSize, theme));
    if (current.length === 0 && remainingWidth <= maxWidth) {
      current.push({ ...run, text: remaining + trailingSpace });
      currentWidth += remainingWidth;
      currentHeight = Math.max(currentHeight, lineHeight);
      handled = true;
      break;
    }
    if (current.length > 0 && currentWidth + remainingWidth <= maxWidth) {
      current.push({ ...run, text: remaining + trailingSpace });
      currentWidth += remainingWidth;
      currentHeight = Math.max(currentHeight, lineHeight);
      handled = true;
      break;
    }

    const available = current.length > 0 ? maxWidth - currentWidth : maxWidth;
    const localPoints = points
      .map((point) => point - remainingOffset)
      .filter((point) => point >= 3 && point <= remaining.length - 3);
    const breakPoint = [...localPoints].reverse().find((point) => {
      const prefix = hyphenatedPrefix(remaining, point);
      return measureText(prefix, textMeasureOptions(run, fontSize, theme)) <= available;
    });

    if (breakPoint === undefined) {
      if (current.length > 0) {
        pushSpecificLine(current, currentWidth, currentHeight);
        current = [];
        currentWidth = 0;
        currentHeight = lineHeight;
        handled = true;
        continue;
      }
      return handled ? { current, currentWidth, currentHeight } : undefined;
    }

    const prefix = hyphenatedPrefix(remaining, breakPoint);
    const prefixWidth = measureText(prefix, textMeasureOptions(run, fontSize, theme));
    current.push({ ...run, text: prefix });
    currentWidth += prefixWidth;
    currentHeight = Math.max(currentHeight, lineHeight);
    handled = true;
    pushSpecificLine(current, currentWidth, currentHeight);
    current = [];
    currentWidth = 0;
    currentHeight = lineHeight;
    remainingOffset += breakPoint;
    remaining = remaining.slice(breakPoint);
  }

  return handled ? { current, currentWidth, currentHeight } : undefined;
}

function hyphenatedPrefix(word: string, breakPoint: number): string {
  const prefix = word.slice(0, breakPoint);
  return prefix.endsWith("-") ? prefix : `${prefix}-`;
}

function textMeasureOptions(run: InlineRun, fontSize: number, theme: DocumentTheme) {
  return {
    fontSize,
    fontFamily: theme.fontFamily,
    monoFontFamily: theme.monoFontFamily,
    ...run
  };
}

function isNoBreakBeforeToken(text: string): boolean {
  return /^[,.;:!?%)}\]”’]+/.test(text);
}

function measureMathChunk(
  text: string,
  fontSize: number,
  mathMeasurements?: MathMeasurementMap,
  mathRenderer: MathRendererName = "katex-raster",
  nativeMathMetrics?: NativeMathMetrics,
  nativeMathProfile?: NativeMathFontProfileName
): number {
  return getMeasuredMath(mathMeasurements, text, false, fontSize, mathRenderer, nativeMathMetrics, nativeMathProfile)?.advance ?? fontSize * Math.max(1, text.length * 0.6);
}

function measureMathHeight(
  text: string,
  fontSize: number,
  fallback: number,
  mathMeasurements?: MathMeasurementMap,
  mathRenderer: MathRendererName = "katex-raster",
  nativeMathMetrics?: NativeMathMetrics,
  nativeMathProfile?: NativeMathFontProfileName
): number {
  return getMeasuredMath(mathMeasurements, text, false, fontSize, mathRenderer, nativeMathMetrics, nativeMathProfile)?.height ?? fallback;
}
