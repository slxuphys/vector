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
import { openMathFontProfiles, type OpenMathFontProfileName } from "./openMathFont";

export type NativeFontRole =
  | "mainRegular"
  | "mainBold"
  | "mainItalic"
  | "mainBoldItalic"
  | "mathItalic"
  | "openMath"
  | "openMathLibertinus"
  | "openMathNewComputerModern"
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

export type OpenTypeMathConstants = {
  unitsPerEm: number;
  scriptPercentScaleDown: number;
  scriptScriptPercentScaleDown: number;
  delimitedSubFormulaMinHeight: number;
  displayOperatorMinHeight: number;
  axisHeight: number;
  subscriptShiftDown: number;
  superscriptShiftUp: number;
  subSuperscriptGapMin: number;
  spaceAfterScript: number;
  upperLimitGapMin: number;
  upperLimitBaselineRiseMin: number;
  lowerLimitGapMin: number;
  lowerLimitBaselineDropMin: number;
  fractionNumeratorShiftUp: number;
  fractionNumeratorDisplayStyleShiftUp: number;
  fractionDenominatorShiftDown: number;
  fractionDenominatorDisplayStyleShiftDown: number;
  fractionNumeratorGapMin: number;
  fractionNumDisplayStyleGapMin: number;
  fractionRuleThickness: number;
  fractionDenominatorGapMin: number;
  fractionDenomDisplayStyleGapMin: number;
  overbarVerticalGap: number;
  overbarRuleThickness: number;
  radicalVerticalGap: number;
  radicalDisplayStyleVerticalGap: number;
  radicalRuleThickness: number;
  radicalExtraAscender: number;
};

export type OpenTypeMathGlyphInfo = {
  italicCorrection?: number;
  topAccentAttachment?: number;
};

export type OpenTypeMathGlyphVariant = {
  advanceMeasurement: number;
  glyphId: number;
};

export type OpenTypeMathKernCorner = "topRight" | "topLeft" | "bottomRight" | "bottomLeft";

export type OpenTypeMathKernTable = {
  correctionHeights: number[];
  kernValues: number[];
};

export type NativeGlyphOutline = {
  glyphId: number;
  path: string;
  advanceWidth: number;
  bbox: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
  unitsPerEm: number;
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
  id: number;
  advanceWidth: number;
  bbox: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  };
  path: {
    toSVG(): string;
  };
};

type FontkitFont = {
  unitsPerEm: number;
  glyphForCodePoint(codePoint: number): FontkitGlyph;
  getGlyph(glyphId: number): FontkitGlyph;
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
  openMath: openMathFontProfiles["latin-modern"].url,
  openMathLibertinus: openMathFontProfiles.libertinus.url,
  openMathNewComputerModern: openMathFontProfiles["new-computer-modern"].url,
  size1: katexSize1RegularUrl,
  size2: katexSize2RegularUrl,
  size3: katexSize3RegularUrl,
  size4: katexSize4RegularUrl
};

const katexMetricFonts: Partial<Record<NativeFontRole, KatexMetricFontName>> = {
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
type OpenMathParsedGlyphInfo = {
  italicCorrections: Map<number, number>;
  topAccentAttachments: Map<number, number>;
  mathKerns: Map<number, Partial<Record<OpenTypeMathKernCorner, OpenTypeMathKernTable>>>;
};
type OpenMathParsedVariants = {
  vertical: Map<number, OpenTypeMathGlyphVariant[]>;
  horizontal: Map<number, OpenTypeMathGlyphVariant[]>;
};

const openTypeMathConstantsByRole = new Map<NativeFontRole, OpenTypeMathConstants>();
const openTypeMathGlyphInfoByRole = new Map<NativeFontRole, OpenMathParsedGlyphInfo>();
const openTypeMathVariantsByRole = new Map<NativeFontRole, OpenMathParsedVariants>();
let activeOpenMathRole: NativeFontRole = "openMath";

export function openMathFontRoleForProfile(name: OpenMathFontProfileName | undefined): NativeFontRole {
  if (name === "new-computer-modern") return "openMathNewComputerModern";
  return name === "libertinus" ? "openMathLibertinus" : "openMath";
}

export function setActiveOpenMathFontProfile(name: OpenMathFontProfileName | undefined): void {
  activeOpenMathRole = openMathFontRoleForProfile(name);
}

export function getActiveOpenMathFontRole(): NativeFontRole {
  return activeOpenMathRole;
}

export async function loadNativeMathFonts(): Promise<void> {
  await Promise.all(Object.keys(fontUrls).map((role) => loadNativeFont(role as NativeFontRole)));
}

export function loadNativeFontFromBytes(role: NativeFontRole, bytes: Uint8Array): void {
  fontCache.set(role, fontkitApi.create(bytes));
  glyphMetricsCache.clear();
  if (role === "openMath" || role === "openMathLibertinus" || role === "openMathNewComputerModern") {
    const constants = parseOpenTypeMathConstants(bytes);
    const glyphInfo = parseOpenTypeMathGlyphInfo(bytes);
    const variants = parseOpenTypeMathVariants(bytes);
    if (constants) openTypeMathConstantsByRole.set(role, constants);
    if (glyphInfo) openTypeMathGlyphInfoByRole.set(role, glyphInfo);
    if (variants) openTypeMathVariantsByRole.set(role, variants);
  }
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

export function getOpenTypeMathConstants(): OpenTypeMathConstants | undefined {
  return openTypeMathConstantsByRole.get(activeOpenMathRole);
}

export function getOpenTypeMathGlyphInfo(text: string, fontSize: number): OpenTypeMathGlyphInfo | undefined {
  const font = fontCache.get(activeOpenMathRole);
  const openTypeMathGlyphInfo = openTypeMathGlyphInfoByRole.get(activeOpenMathRole);
  if (!font || !openTypeMathGlyphInfo) return undefined;

  const chars = Array.from(text);
  if (chars.length !== 1) return undefined;
  const codePoint = chars[0].codePointAt(0);
  if (codePoint === undefined) return undefined;

  const glyph = font.glyphForCodePoint(codePoint);
  const scale = fontSize / font.unitsPerEm;
  const italicCorrection = openTypeMathGlyphInfo.italicCorrections.get(glyph.id);
  const topAccentAttachment = openTypeMathGlyphInfo.topAccentAttachments.get(glyph.id);
  if (italicCorrection === undefined && topAccentAttachment === undefined) return undefined;

  return {
    italicCorrection: italicCorrection === undefined ? undefined : italicCorrection * scale,
    topAccentAttachment: topAccentAttachment === undefined ? undefined : topAccentAttachment * scale
  };
}

export function getOpenTypeMathKern(
  glyphId: number,
  corner: OpenTypeMathKernCorner,
  height: number,
  fontSize: number
): number | undefined {
  const font = fontCache.get(activeOpenMathRole);
  const table = openTypeMathGlyphInfoByRole.get(activeOpenMathRole)?.mathKerns.get(glyphId)?.[corner];
  if (!font || !table) return undefined;

  const targetHeight = height * font.unitsPerEm / fontSize;
  const index = table.correctionHeights.findIndex((correctionHeight) => targetHeight <= correctionHeight);
  const kernIndex = index < 0 ? table.kernValues.length - 1 : index;
  const kern = table.kernValues[kernIndex];
  return kern === undefined ? undefined : kern * fontSize / font.unitsPerEm;
}

export function getOpenTypeMathRadicalVariant(targetHeight: number, fontSize: number): OpenTypeMathGlyphVariant | undefined {
  return getOpenTypeMathGlyphVariant("√", targetHeight, fontSize);
}

export function getOpenTypeMathGlyphVariant(text: string, targetHeight: number, fontSize: number): OpenTypeMathGlyphVariant | undefined {
  return getOpenTypeMathVariant(text, targetHeight, fontSize, "vertical");
}

export function getOpenTypeMathHorizontalGlyphVariant(text: string, targetWidth: number, fontSize: number): OpenTypeMathGlyphVariant | undefined {
  return getOpenTypeMathVariant(text, targetWidth, fontSize, "horizontal");
}

function getOpenTypeMathVariant(
  text: string,
  targetMeasurement: number,
  fontSize: number,
  direction: "vertical" | "horizontal"
): OpenTypeMathGlyphVariant | undefined {
  const font = fontCache.get(activeOpenMathRole);
  const openTypeMathVariants = openTypeMathVariantsByRole.get(activeOpenMathRole);
  if (!font || !openTypeMathVariants) return undefined;

  const codePoint = Array.from(text)[0]?.codePointAt(0);
  if (codePoint === undefined) return undefined;

  const baseGlyph = font.glyphForCodePoint(codePoint);
  const variants = openTypeMathVariants[direction].get(baseGlyph.id);
  if (!variants?.length) return undefined;

  const targetDesignMeasurement = targetMeasurement * font.unitsPerEm / fontSize;
  return variants.find((variant) => variant.advanceMeasurement >= targetDesignMeasurement)
    ?? variants[variants.length - 1];
}

export function getNativeGlyphOutline(role: NativeFontRole, glyphId: number): NativeGlyphOutline | undefined {
  const font = fontCache.get(role);
  if (!font) return undefined;

  const glyph = font.getGlyph(glyphId);
  if (!glyph) return undefined;
  return {
    glyphId,
    path: glyph.path.toSVG(),
    advanceWidth: glyph.advanceWidth,
    bbox: glyph.bbox,
    unitsPerEm: font.unitsPerEm
  };
}

export function getNativeGlyphSkew(role: NativeFontRole, text: string, fontSize: number): number {
  const chars = Array.from(text);
  if (chars.length !== 1) return 0;

  const fontName = katexMetricFonts[role];
  if (!fontName) return 0;
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
  if (!fontName) return undefined;
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
      loadNativeFontFromBytes(role, bytes);
    })
    .catch(() => {
      // Keep layout usable if a font file cannot be loaded; callers fall back to estimates.
    });
  loadPromises.set(role, promise);
  return promise;
}

export function parseOpenTypeMathVariants(bytes: Uint8Array): {
  vertical: Map<number, OpenTypeMathGlyphVariant[]>;
  horizontal: Map<number, OpenTypeMathGlyphVariant[]>;
} | undefined {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const mathOffset = findTableOffset(view, "MATH");
  if (mathOffset < 0 || mathOffset + 10 >= view.byteLength) return undefined;

  const variantsOffsetValue = readUint16(view, mathOffset + 8);
  if (!variantsOffsetValue) return undefined;
  const variantsOffset = mathOffset + variantsOffsetValue;
  if (variantsOffset <= mathOffset || variantsOffset + 10 >= view.byteLength) return undefined;

  const verticalCoverageOffsetValue = readUint16(view, variantsOffset + 2);
  const horizontalCoverageOffsetValue = readUint16(view, variantsOffset + 4);
  const verticalGlyphCount = readUint16(view, variantsOffset + 6);
  const horizontalGlyphCount = readUint16(view, variantsOffset + 8);

  const vertical = new Map<number, OpenTypeMathGlyphVariant[]>();
  const horizontal = new Map<number, OpenTypeMathGlyphVariant[]>();

  if (verticalCoverageOffsetValue && verticalGlyphCount) {
    const verticalCoverage = parseCoverage(view, variantsOffset + verticalCoverageOffsetValue);
    for (let index = 0; index < Math.min(verticalGlyphCount, verticalCoverage.length); index += 1) {
      const constructionOffsetValue = readUint16(view, variantsOffset + 10 + index * 2);
      if (!constructionOffsetValue) continue;
      const constructionOffset = variantsOffset + constructionOffsetValue;
      const variants = parseMathGlyphConstruction(view, constructionOffset);
      if (variants.length) vertical.set(verticalCoverage[index], variants);
    }
  }

  if (horizontalCoverageOffsetValue && horizontalGlyphCount) {
    const horizontalCoverage = parseCoverage(view, variantsOffset + horizontalCoverageOffsetValue);
    const horizontalRecordsOffset = variantsOffset + 10 + verticalGlyphCount * 2;
    for (let index = 0; index < Math.min(horizontalGlyphCount, horizontalCoverage.length); index += 1) {
      const constructionOffsetValue = readUint16(view, horizontalRecordsOffset + index * 2);
      if (!constructionOffsetValue) continue;
      const constructionOffset = variantsOffset + constructionOffsetValue;
      const variants = parseMathGlyphConstruction(view, constructionOffset);
      if (variants.length) horizontal.set(horizontalCoverage[index], variants);
    }
  }

  return { vertical, horizontal };
}

function parseMathGlyphConstruction(
  view: DataView,
  offset: number
): OpenTypeMathGlyphVariant[] {
  if (offset < 0 || offset + 4 >= view.byteLength) return [];
  const variantCount = readUint16(view, offset + 2);
  const variants: OpenTypeMathGlyphVariant[] = [];
  for (let index = 0; index < variantCount; index += 1) {
    const recordOffset = offset + 4 + index * 4;
    if (recordOffset + 4 > view.byteLength) break;
    const glyphId = readUint16(view, recordOffset);
    variants.push({
      advanceMeasurement: readUint16(view, recordOffset + 2),
      glyphId
    });
  }
  return variants;
}

export function parseOpenTypeMathGlyphInfo(bytes: Uint8Array): {
  italicCorrections: Map<number, number>;
  topAccentAttachments: Map<number, number>;
  mathKerns: Map<number, Partial<Record<OpenTypeMathKernCorner, OpenTypeMathKernTable>>>;
} | undefined {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const mathOffset = findTableOffset(view, "MATH");
  if (mathOffset < 0 || mathOffset + 10 >= view.byteLength) return undefined;

  const glyphInfoOffset = mathOffset + readUint16(view, mathOffset + 6);
  if (glyphInfoOffset <= mathOffset || glyphInfoOffset >= view.byteLength) return undefined;

  const italicInfoOffset = readUint16(view, glyphInfoOffset);
  const topAccentInfoOffset = readUint16(view, glyphInfoOffset + 2);
  const mathKernInfoOffset = readUint16(view, glyphInfoOffset + 6);
  return {
    italicCorrections: italicInfoOffset
      ? parseMathValueInfo(view, glyphInfoOffset + italicInfoOffset)
      : new Map(),
    topAccentAttachments: topAccentInfoOffset
      ? parseMathValueInfo(view, glyphInfoOffset + topAccentInfoOffset)
      : new Map(),
    mathKerns: mathKernInfoOffset
      ? parseMathKernInfo(view, glyphInfoOffset + mathKernInfoOffset)
      : new Map()
  };
}

export function parseOpenTypeMathConstants(bytes: Uint8Array): OpenTypeMathConstants | undefined {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.byteLength < 12) return undefined;

  const mathOffset = findTableOffset(view, "MATH");
  const headOffset = findTableOffset(view, "head");
  if (mathOffset < 0 || mathOffset + 10 >= view.byteLength) return undefined;

  const constantsOffset = mathOffset + readUint16(view, mathOffset + 4);
  if (constantsOffset <= mathOffset || constantsOffset >= view.byteLength) return undefined;

  const unitsPerEm = headOffset >= 0 && headOffset + 20 < view.byteLength
    ? readUint16(view, headOffset + 18)
    : 1000;
  let cursor = constantsOffset;
  const scriptPercentScaleDown = readUint16(view, cursor); cursor += 2;
  const scriptScriptPercentScaleDown = readUint16(view, cursor); cursor += 2;
  const delimitedSubFormulaMinHeight = readUint16(view, cursor); cursor += 2;
  const displayOperatorMinHeight = readUint16(view, cursor); cursor += 2;
  cursor += 4; // MathLeading
  const axisHeight = readMathValue(view, cursor); cursor += 4;
  cursor += 4; // AccentBaseHeight
  cursor += 4; // FlattenedAccentBaseHeight
  const subscriptShiftDown = readMathValue(view, cursor); cursor += 4;
  cursor += 4; // SubscriptTopMax
  cursor += 4; // SubscriptBaselineDropMin
  const superscriptShiftUp = readMathValue(view, cursor); cursor += 4;
  cursor += 4; // SuperscriptShiftUpCramped
  cursor += 4; // SuperscriptBottomMin
  cursor += 4; // SuperscriptBaselineDropMax
  const subSuperscriptGapMin = readMathValue(view, cursor); cursor += 4;
  cursor += 4; // SuperscriptBottomMaxWithSubscript
  const spaceAfterScript = readMathValue(view, cursor); cursor += 4;
  const upperLimitGapMin = readMathValue(view, cursor); cursor += 4;
  const upperLimitBaselineRiseMin = readMathValue(view, cursor); cursor += 4;
  const lowerLimitGapMin = readMathValue(view, cursor); cursor += 4;
  const lowerLimitBaselineDropMin = readMathValue(view, cursor); cursor += 4;
  cursor += 4; // StackTopShiftUp
  cursor += 4; // StackTopDisplayStyleShiftUp
  cursor += 4; // StackBottomShiftDown
  cursor += 4; // StackBottomDisplayStyleShiftDown
  cursor += 4; // StackGapMin
  cursor += 4; // StackDisplayStyleGapMin
  cursor += 4; // StretchStackTopShiftUp
  cursor += 4; // StretchStackBottomShiftDown
  cursor += 4; // StretchStackGapAboveMin
  cursor += 4; // StretchStackGapBelowMin
  const fractionNumeratorShiftUp = readMathValue(view, cursor); cursor += 4;
  const fractionNumeratorDisplayStyleShiftUp = readMathValue(view, cursor); cursor += 4;
  const fractionDenominatorShiftDown = readMathValue(view, cursor); cursor += 4;
  const fractionDenominatorDisplayStyleShiftDown = readMathValue(view, cursor); cursor += 4;
  const fractionNumeratorGapMin = readMathValue(view, cursor); cursor += 4;
  const fractionNumDisplayStyleGapMin = readMathValue(view, cursor); cursor += 4;
  const fractionRuleThickness = readMathValue(view, cursor); cursor += 4;
  const fractionDenominatorGapMin = readMathValue(view, cursor); cursor += 4;
  const fractionDenomDisplayStyleGapMin = readMathValue(view, cursor); cursor += 4;
  cursor += 4; // SkewedFractionHorizontalGap
  cursor += 4; // SkewedFractionVerticalGap
  const overbarVerticalGap = readMathValue(view, cursor); cursor += 4;
  const overbarRuleThickness = readMathValue(view, cursor); cursor += 4;
  cursor += 4; // OverbarExtraAscender
  cursor += 4; // UnderbarVerticalGap
  cursor += 4; // UnderbarRuleThickness
  cursor += 4; // UnderbarExtraDescender
  const radicalVerticalGap = readMathValue(view, cursor); cursor += 4;
  const radicalDisplayStyleVerticalGap = readMathValue(view, cursor); cursor += 4;
  const radicalRuleThickness = readMathValue(view, cursor); cursor += 4;
  const radicalExtraAscender = readMathValue(view, cursor);

  return {
    unitsPerEm,
    scriptPercentScaleDown,
    scriptScriptPercentScaleDown,
    delimitedSubFormulaMinHeight,
    displayOperatorMinHeight,
    axisHeight,
    subscriptShiftDown,
    superscriptShiftUp,
    subSuperscriptGapMin,
    spaceAfterScript,
    upperLimitGapMin,
    upperLimitBaselineRiseMin,
    lowerLimitGapMin,
    lowerLimitBaselineDropMin,
    fractionNumeratorShiftUp,
    fractionNumeratorDisplayStyleShiftUp,
    fractionDenominatorShiftDown,
    fractionDenominatorDisplayStyleShiftDown,
    fractionNumeratorGapMin,
    fractionNumDisplayStyleGapMin,
    fractionRuleThickness,
    fractionDenominatorGapMin,
    fractionDenomDisplayStyleGapMin,
    overbarVerticalGap,
    overbarRuleThickness,
    radicalVerticalGap,
    radicalDisplayStyleVerticalGap,
    radicalRuleThickness,
    radicalExtraAscender
  };
}

function parseMathValueInfo(view: DataView, offset: number): Map<number, number> {
  const coverageOffset = readUint16(view, offset);
  const count = readUint16(view, offset + 2);
  const glyphIds = parseCoverage(view, offset + coverageOffset);
  const values = new Map<number, number>();

  for (let index = 0; index < Math.min(count, glyphIds.length); index += 1) {
    values.set(glyphIds[index], readMathValue(view, offset + 4 + index * 4));
  }
  return values;
}

function parseMathKernInfo(view: DataView, offset: number): Map<number, Partial<Record<OpenTypeMathKernCorner, OpenTypeMathKernTable>>> {
  const coverageOffset = readUint16(view, offset);
  const count = readUint16(view, offset + 2);
  const glyphIds = parseCoverage(view, offset + coverageOffset);
  const values = new Map<number, Partial<Record<OpenTypeMathKernCorner, OpenTypeMathKernTable>>>();

  for (let index = 0; index < Math.min(count, glyphIds.length); index += 1) {
    const recordOffset = offset + 4 + index * 8;
    if (recordOffset + 8 > view.byteLength) break;

    const topRightOffset = readUint16(view, recordOffset);
    const topLeftOffset = readUint16(view, recordOffset + 2);
    const bottomRightOffset = readUint16(view, recordOffset + 4);
    const bottomLeftOffset = readUint16(view, recordOffset + 6);
    const kerns: Partial<Record<OpenTypeMathKernCorner, OpenTypeMathKernTable>> = {};

    if (topRightOffset) kerns.topRight = parseMathKernTable(view, offset + topRightOffset);
    if (topLeftOffset) kerns.topLeft = parseMathKernTable(view, offset + topLeftOffset);
    if (bottomRightOffset) kerns.bottomRight = parseMathKernTable(view, offset + bottomRightOffset);
    if (bottomLeftOffset) kerns.bottomLeft = parseMathKernTable(view, offset + bottomLeftOffset);
    if (Object.keys(kerns).length) values.set(glyphIds[index], kerns);
  }

  return values;
}

function parseMathKernTable(view: DataView, offset: number): OpenTypeMathKernTable | undefined {
  if (offset < 0 || offset + 2 > view.byteLength) return undefined;
  const heightCount = readUint16(view, offset);
  const correctionHeights: number[] = [];
  const kernValues: number[] = [];

  for (let index = 0; index < heightCount; index += 1) {
    const heightOffset = offset + 2 + index * 4;
    if (heightOffset + 4 > view.byteLength) return undefined;
    correctionHeights.push(readMathValue(view, heightOffset));
  }

  const kernOffset = offset + 2 + heightCount * 4;
  for (let index = 0; index < heightCount + 1; index += 1) {
    const valueOffset = kernOffset + index * 4;
    if (valueOffset + 4 > view.byteLength) return undefined;
    kernValues.push(readMathValue(view, valueOffset));
  }

  return { correctionHeights, kernValues };
}

function parseCoverage(view: DataView, offset: number): number[] {
  const format = readUint16(view, offset);
  if (format === 1) {
    const count = readUint16(view, offset + 2);
    return Array.from({ length: count }, (_, index) => readUint16(view, offset + 4 + index * 2));
  }
  if (format === 2) {
    const rangeCount = readUint16(view, offset + 2);
    const glyphIds: number[] = [];
    for (let index = 0; index < rangeCount; index += 1) {
      const rangeOffset = offset + 4 + index * 6;
      const startGlyph = readUint16(view, rangeOffset);
      const endGlyph = readUint16(view, rangeOffset + 2);
      for (let glyphId = startGlyph; glyphId <= endGlyph; glyphId += 1) {
        glyphIds.push(glyphId);
      }
    }
    return glyphIds;
  }
  return [];
}

function parseGlyphIdToCodePointMap(view: DataView): Map<number, number> {
  const cmapOffset = findTableOffset(view, "cmap");
  const mapping = new Map<number, number>();
  if (cmapOffset < 0 || cmapOffset + 4 >= view.byteLength) return mapping;

  const subtableCount = readUint16(view, cmapOffset + 2);
  const subtables: Array<{ platformId: number; encodingId: number; offset: number; format: number }> = [];
  for (let index = 0; index < subtableCount; index += 1) {
    const recordOffset = cmapOffset + 4 + index * 8;
    if (recordOffset + 8 > view.byteLength) break;
    const subtableOffset = cmapOffset + readUint32(view, recordOffset + 4);
    if (subtableOffset < 0 || subtableOffset + 2 > view.byteLength) continue;
    subtables.push({
      platformId: readUint16(view, recordOffset),
      encodingId: readUint16(view, recordOffset + 2),
      offset: subtableOffset,
      format: readUint16(view, subtableOffset)
    });
  }

  const preferred = subtables
    .filter((subtable) => subtable.format === 12 || subtable.format === 4)
    .sort((a, b) => cmapSubtableScore(b) - cmapSubtableScore(a))[0];
  if (!preferred) return mapping;

  if (preferred.format === 12) parseCmapFormat12(view, preferred.offset, mapping);
  else if (preferred.format === 4) parseCmapFormat4(view, preferred.offset, mapping);
  return mapping;
}

function cmapSubtableScore(subtable: { platformId: number; encodingId: number; format: number }): number {
  let score = subtable.format === 12 ? 100 : 50;
  if (subtable.platformId === 3 && subtable.encodingId === 10) score += 20;
  if (subtable.platformId === 0) score += 10;
  if (subtable.platformId === 3 && subtable.encodingId === 1) score += 5;
  return score;
}

function parseCmapFormat12(view: DataView, offset: number, mapping: Map<number, number>): void {
  if (offset + 16 > view.byteLength) return;
  const groupCount = readUint32(view, offset + 12);
  for (let index = 0; index < groupCount; index += 1) {
    const groupOffset = offset + 16 + index * 12;
    if (groupOffset + 12 > view.byteLength) break;
    const startCodePoint = readUint32(view, groupOffset);
    const endCodePoint = readUint32(view, groupOffset + 4);
    const startGlyphId = readUint32(view, groupOffset + 8);
    for (let codePoint = startCodePoint; codePoint <= endCodePoint; codePoint += 1) {
      const glyphId = startGlyphId + codePoint - startCodePoint;
      if (!mapping.has(glyphId)) mapping.set(glyphId, codePoint);
    }
  }
}

function parseCmapFormat4(view: DataView, offset: number, mapping: Map<number, number>): void {
  if (offset + 16 > view.byteLength) return;
  const segCount = readUint16(view, offset + 6) / 2;
  const endCodeOffset = offset + 14;
  const startCodeOffset = endCodeOffset + segCount * 2 + 2;
  const idDeltaOffset = startCodeOffset + segCount * 2;
  const idRangeOffsetOffset = idDeltaOffset + segCount * 2;
  if (idRangeOffsetOffset + segCount * 2 > view.byteLength) return;

  for (let segment = 0; segment < segCount; segment += 1) {
    const endCode = readUint16(view, endCodeOffset + segment * 2);
    const startCode = readUint16(view, startCodeOffset + segment * 2);
    const idDelta = readInt16(view, idDeltaOffset + segment * 2);
    const idRangeOffsetLocation = idRangeOffsetOffset + segment * 2;
    const idRangeOffset = readUint16(view, idRangeOffsetLocation);
    if (startCode === 0xffff && endCode === 0xffff) continue;

    for (let codePoint = startCode; codePoint <= endCode; codePoint += 1) {
      let glyphId = 0;
      if (idRangeOffset === 0) {
        glyphId = (codePoint + idDelta) & 0xffff;
      } else {
        const glyphIndexOffset = idRangeOffsetLocation + idRangeOffset + (codePoint - startCode) * 2;
        if (glyphIndexOffset + 2 > view.byteLength) continue;
        const glyphIndex = readUint16(view, glyphIndexOffset);
        glyphId = glyphIndex === 0 ? 0 : (glyphIndex + idDelta) & 0xffff;
      }
      if (glyphId && !mapping.has(glyphId)) mapping.set(glyphId, codePoint);
    }
  }
}

function findTableOffset(view: DataView, tableTag: string): number {
  if (view.byteLength < 12) return -1;
  const numTables = readUint16(view, 4);
  for (let index = 0; index < numTables; index += 1) {
    const recordOffset = 12 + index * 16;
    if (readTag(view, recordOffset) === tableTag) return readUint32(view, recordOffset + 8);
  }
  return -1;
}

function readTag(view: DataView, offset: number): string {
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3)
  );
}

function readUint16(view: DataView, offset: number): number {
  return view.getUint16(offset, false);
}

function readUint32(view: DataView, offset: number): number {
  return view.getUint32(offset, false);
}

function readInt16(view: DataView, offset: number): number {
  return view.getInt16(offset, false);
}

function readMathValue(view: DataView, offset: number): number {
  return view.getInt16(offset, false);
}
