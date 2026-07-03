import type { InlineRun } from "./layoutBlocks";
import { measureTextWithFontFile } from "../renderers/text/textFontMetrics";
import { isDebugLogEnabled } from "../utils/debugSettings";

export type TextStyle = {
  fontSize: number;
  fontFamily: string;
  monoFontFamily: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
};

const canvasContext = createCanvasContext();
const cache = new Map<string, number>();
const fallbackLogKeys = new Set<string>();

export function measureText(text: string, style: TextStyle): number {
  if (text.length === 0) return 0;
  const font = cssFont(style);
  const cacheKey = `${font}\n${text}`;
  const cached = cache.get(cacheKey);
  if (cached !== undefined) return cached;

  const fontFileWidth = measureTextWithFontFile(text, style);
  if (fontFileWidth !== undefined) {
    cache.set(cacheKey, fontFileWidth);
    return fontFileWidth;
  }
  logTextMeasureFallback(text, style);

  if (canvasContext) {
    canvasContext.font = font;
    const width = canvasContext.measureText(text).width;
    cache.set(cacheKey, width);
    return width;
  }

  const base = style.code ? 0.61 : 0.57;
  const weight = style.bold ? 1.14 : 1;
  let width = 0;
  for (const char of text) {
    if (char === " ") width += style.fontSize * 0.32;
    else if (/[mwMW@#%&]/.test(char)) width += style.fontSize * base * 1.45;
    else if (/[A-Z0-9]/.test(char)) width += style.fontSize * base * 1.12;
    else if (/[il.,;:|!]/.test(char)) width += style.fontSize * base * 0.5;
    else width += style.fontSize * base;
  }
  const measured = width * weight;
  cache.set(cacheKey, measured);
  return measured;
}

function logTextMeasureFallback(text: string, style: TextStyle): void {
  if (typeof console === "undefined" || !isDebugLogEnabled("text")) return;
  const normalized = text.length > 40 ? `${text.slice(0, 40)}...` : text;
  const key = `${style.fontFamily}:${style.bold ? "b" : ""}${style.italic ? "i" : ""}:${style.code ? "code" : ""}:${normalized}`;
  if (fallbackLogKeys.has(key)) return;
  fallbackLogKeys.add(key);
  if (fallbackLogKeys.size > 80) return;
  console.log("[text-measure-fallback]", {
    text: normalized,
    fontFamily: style.fontFamily,
    fontSize: style.fontSize,
    bold: Boolean(style.bold),
    italic: Boolean(style.italic),
    code: Boolean(style.code),
    reason: style.code ? "code font" : "font file metrics unavailable"
  });
}

export function measureRun(run: InlineRun, style: TextStyle): number {
  return measureText(run.text, { ...style, ...run });
}

export function clearTextMeasureCache(): void {
  cache.clear();
}

function cssFont(style: TextStyle): string {
  const fontStyle = style.italic ? "italic" : "normal";
  const fontWeight = style.bold ? "700" : "400";
  const family = style.code ? style.monoFontFamily : style.fontFamily;
  return `${fontStyle} ${fontWeight} ${style.fontSize}px ${family}`;
}

function createCanvasContext(): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | undefined {
  try {
    if (typeof OffscreenCanvas !== "undefined") {
      return new OffscreenCanvas(1, 1).getContext("2d") ?? undefined;
    }

    if (typeof document !== "undefined") {
      return document.createElement("canvas").getContext("2d") ?? undefined;
    }
  } catch {
    return undefined;
  }

  return undefined;
}
