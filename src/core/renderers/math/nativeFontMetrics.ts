import fontkit from "@pdf-lib/fontkit";
import katexMainBoldUrl from "katex/dist/fonts/KaTeX_Main-Bold.ttf?url";
import katexMainBoldItalicUrl from "katex/dist/fonts/KaTeX_Main-BoldItalic.ttf?url";
import katexMainItalicUrl from "katex/dist/fonts/KaTeX_Main-Italic.ttf?url";
import katexMainRegularUrl from "katex/dist/fonts/KaTeX_Main-Regular.ttf?url";
import katexMathItalicUrl from "katex/dist/fonts/KaTeX_Math-Italic.ttf?url";
import katexSize1RegularUrl from "katex/dist/fonts/KaTeX_Size1-Regular.ttf?url";
import katexSize2RegularUrl from "katex/dist/fonts/KaTeX_Size2-Regular.ttf?url";
import katexSize3RegularUrl from "katex/dist/fonts/KaTeX_Size3-Regular.ttf?url";
import katexSize4RegularUrl from "katex/dist/fonts/KaTeX_Size4-Regular.ttf?url";
import fontMetricsData from "katex/src/fontMetricsData.js";

export type NativeFontRole =
  | "mainRegular"
  | "mainBold"
  | "mainItalic"
  | "mainBoldItalic"
  | "mathItalic"
  | "size1"
  | "size2"
  | "size3"
  | "size4";

export type NativeGlyphMetrics = {
  advanceWidth: number;
  actualLeft: number;
  actualRight: number;
  actualAscent: number;
  actualDescent: number;
  actualTopOffset: number;
  actualBottomOffset: number;
  actualWidth: number;
};

export type NativeGlyphTexMetrics = {
  advanceWidth: number;
  actualAscent: number;
  actualDescent: number;
};

type KatexMetricFontName =
  | "Main-Regular"
  | "Main-Bold"
  | "Main-Italic"
  | "Main-BoldItalic"
  | "Math-Italic"
  | "Size1-Regular"
  | "Size2-Regular"
  | "Size3-Regular"
  | "Size4-Regular";

type FontkitGlyph = {
  advanceWidth: number;
  bbox: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  };
};

type FontkitFont = {
  unitsPerEm: number;
  glyphForCodePoint(codePoint: number): FontkitGlyph;
};

const fontkitApi = fontkit as unknown as {
  create(bytes: Uint8Array): FontkitFont;
};

const fontUrls: Record<NativeFontRole, string> = {
  mainRegular: katexMainRegularUrl,
  mainBold: katexMainBoldUrl,
  mainItalic: katexMainItalicUrl,
  mainBoldItalic: katexMainBoldItalicUrl,
  mathItalic: katexMathItalicUrl,
  size1: katexSize1RegularUrl,
  size2: katexSize2RegularUrl,
  size3: katexSize3RegularUrl,
  size4: katexSize4RegularUrl
};

const katexMetricFonts: Record<NativeFontRole, KatexMetricFontName> = {
  mainRegular: "Main-Regular",
  mainBold: "Main-Bold",
  mainItalic: "Main-Italic",
  mainBoldItalic: "Main-BoldItalic",
  mathItalic: "Math-Italic",
  size1: "Size1-Regular",
  size2: "Size2-Regular",
  size3: "Size3-Regular",
  size4: "Size4-Regular"
};

const fontCache = new Map<NativeFontRole, FontkitFont>();
const loadPromises = new Map<NativeFontRole, Promise<void>>();
const glyphMetricsCache = new Map<string, NativeGlyphMetrics>();

export async function loadNativeMathFonts(): Promise<void> {
  await Promise.all(Object.keys(fontUrls).map((role) => loadNativeFont(role as NativeFontRole)));
}

export function getNativeGlyphMetrics(
  role: NativeFontRole,
  text: string,
  fontSize: number
): NativeGlyphMetrics | undefined {
  const cacheKey = `${role}:${fontSize}:${text}`;
  const cached = glyphMetricsCache.get(cacheKey);
  if (cached) return cached;

  const font = fontCache.get(role);
  if (!font) return undefined;

  const glyphs = Array.from(text).map((char) => font.glyphForCodePoint(char.codePointAt(0) ?? 0));
  if (glyphs.length === 0) return undefined;

  const scale = fontSize / font.unitsPerEm;
  let advance = 0;
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const glyph of glyphs) {
    minX = Math.min(minX, advance + glyph.bbox.minX);
    maxX = Math.max(maxX, advance + glyph.bbox.maxX);
    minY = Math.min(minY, glyph.bbox.minY);
    maxY = Math.max(maxY, glyph.bbox.maxY);
    advance += glyph.advanceWidth;
  }

  if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minY) || !Number.isFinite(maxY)) {
    return undefined;
  }

  const metrics = {
    advanceWidth: advance * scale,
    actualLeft: Math.max(0, -minX * scale),
    actualRight: Math.max(0, maxX * scale),
    actualAscent: Math.max(0, maxY * scale),
    actualDescent: Math.max(0, -minY * scale),
    actualTopOffset: -maxY * scale,
    actualBottomOffset: -minY * scale,
    actualWidth: Math.max(0, (maxX - minX) * scale)
  };
  glyphMetricsCache.set(cacheKey, metrics);
  return metrics;
}

export function getNativeGlyphSkew(role: NativeFontRole, text: string, fontSize: number): number {
  const chars = Array.from(text);
  if (chars.length !== 1) return 0;

  const fontName = katexMetricFonts[role];
  const codePoint = chars[0].codePointAt(0);
  if (codePoint === undefined) return 0;

  const metric = fontMetricsData[fontName]?.[codePoint];
  return (metric?.[3] ?? 0) * fontSize;
}

export function getNativeGlyphTexMetrics(
  role: NativeFontRole,
  text: string,
  fontSize: number
): NativeGlyphTexMetrics | undefined {
  const fontName = katexMetricFonts[role];
  const chars = Array.from(text);
  if (chars.length === 0) return undefined;

  let width = 0;
  let ascent = 0;
  let descent = 0;
  for (const char of chars) {
    const codePoint = char.codePointAt(0);
    if (codePoint === undefined) return undefined;

    const metric = fontMetricsData[fontName]?.[codePoint];
    if (!metric) return undefined;
    descent = Math.max(descent, metric[0] * fontSize);
    ascent = Math.max(ascent, metric[1] * fontSize);
    width += metric[4] * fontSize;
  }

  return {
    advanceWidth: width,
    actualAscent: ascent,
    actualDescent: descent
  };
}

async function loadNativeFont(role: NativeFontRole): Promise<void> {
  if (fontCache.has(role)) return;
  const current = loadPromises.get(role);
  if (current) return current;

  const promise = fetch(fontUrls[role])
    .then(async (response) => {
      if (!response.ok) throw new Error(`Could not load font: ${fontUrls[role]}`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      fontCache.set(role, fontkitApi.create(bytes));
    })
    .catch(() => {
      // Keep layout usable if a font file cannot be loaded; callers fall back to estimates.
    });
  loadPromises.set(role, promise);
  return promise;
}
