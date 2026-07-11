import {
  PDFName,
  PDFPage,
  PDFFont,
  beginText,
  endText,
  moveText,
  popGraphicsState,
  pushGraphicsState,
  setCharacterSpacing,
  setFillingColor,
  setFontAndSize,
  showText,
  rgb
} from "pdf-lib";
import type { DisplayObject } from "../../display-list/displayTypes";
import { isDebugLogEnabled } from "../../utils/debugSettings";
import { shapeTextWithFontFile, type ShapedTextRun } from "../text/textFontMetrics";
import { addPdfLinkAnnotation, type PdfLinkTargets } from "./pdfLinks";

const missingGlyphLogKeys = new Set<string>();
const pageFontKeys = new WeakMap<PDFPage, Map<PDFFont, string>>();

export function drawPdfText(
  page: PDFPage,
  object: Extract<DisplayObject, { type: "text" }>,
  font: PDFFont | PDFFont[],
  pageHeight: number,
  linkTargets?: PdfLinkTargets
): void {
  const fonts = Array.isArray(font) ? font : [font];
  const text = object.text || " ";
  const singleFont = fonts.find((candidate) => canEncode(candidate, text));
  if (singleFont) {
    drawFittedPdfText(page, object, singleFont, pageHeight);
    if (object.link) addTextLink(page, object, pageHeight, object.width ?? singleFont.widthOfTextAtSize(text, object.fontSize), linkTargets);
    return;
  }
  const shaped = shapeTextWithFontFile(text, {
    fontSize: object.fontSize,
    fontFamily: object.fontFamily,
    monoFontFamily: object.fontFamily,
    bold: object.bold,
    italic: object.italic
  });

  if (shaped) drawShapedPdfText(page, object, fonts, pageHeight, shaped);
  else drawUnshapedPdfText(page, object, fonts, pageHeight);

  if (object.link) addTextLink(
    page,
    object,
    pageHeight,
    object.width && object.width > 0
      ? object.width
      : shaped?.width ?? measurePdfTextWidth(text, fonts, object.fontSize, object.fontFamily),
    linkTargets
  );
}

function drawFittedPdfText(
  page: PDFPage,
  object: Extract<DisplayObject, { type: "text" }>,
  font: PDFFont,
  pageHeight: number
): void {
  const text = object.text || " ";
  const naturalWidth = font.widthOfTextAtSize(text, object.fontSize);
  const gapCount = Math.max(0, Array.from(text).length - 1);
  const targetWidth = object.width && object.width > 0 ? object.width : naturalWidth;
  const characterSpacing = gapCount > 0 ? (targetWidth - naturalWidth) / gapCount : 0;
  drawCachedPdfText(page, text, font, object.x, pageHeight - object.y, object.fontSize, object.color, characterSpacing);
}

function addTextLink(
  page: PDFPage,
  object: Extract<DisplayObject, { type: "text" }>,
  pageHeight: number,
  width: number,
  linkTargets?: PdfLinkTargets
): void {
  addPdfLinkAnnotation(page, {
    x: object.x,
    y: pageHeight - object.y - object.fontSize * 0.25,
    width,
    height: object.fontSize * 1.2
  }, object.link!, linkTargets);
}

function drawUnshapedPdfText(
  page: PDFPage,
  object: Extract<DisplayObject, { type: "text" }>,
  fonts: PDFFont[],
  pageHeight: number
): void {
  let cursorX = object.x;
  let run = "";
  let runFont: PDFFont | undefined;

  const flush = () => {
    if (!run || !runFont) return;
    drawCachedPdfText(page, run, runFont, cursorX, pageHeight - object.y, object.fontSize, object.color);
    cursorX += runFont.widthOfTextAtSize(run, object.fontSize) + justifyExtraForText(run, object, fonts);
    run = "";
    runFont = undefined;
  };

  for (const char of Array.from(object.text || " ")) {
    const selectedFont = fonts.find((candidate) => canEncode(candidate, char));
    if (!selectedFont) {
      flush();
      logMissingPdfGlyph("text", char, object.fontFamily);
      continue;
    }
    if (runFont && runFont !== selectedFont) flush();
    runFont = selectedFont;
    run += char;
  }
  flush();
}

function drawShapedPdfText(
  page: PDFPage,
  object: Extract<DisplayObject, { type: "text" }>,
  fonts: PDFFont[],
  pageHeight: number,
  shaped: ShapedTextRun
): void {
  const clusters = shapedClusters(object.text || " ", shaped);
  const extraBySpace = justifyExtraBySpace(object, shaped.width);
  let cursorX = object.x;
  let run = "";
  let runAdvance = 0;
  let runFont: PDFFont | undefined;

  const flush = () => {
    if (!run || !runFont) return;
    drawCachedPdfText(page, run, runFont, cursorX, pageHeight - object.y, object.fontSize, object.color);
    cursorX += runAdvance;
    run = "";
    runAdvance = 0;
    runFont = undefined;
  };

  for (const cluster of clusters) {
    if (isStretchCluster(cluster.text)) {
      flush();
      cursorX += cluster.advance + extraBySpace;
      continue;
    }

    const selectedFont = fonts.find((candidate) => canEncode(candidate, cluster.text));
    if (!selectedFont) {
      flush();
      logMissingPdfGlyph("text", cluster.text, object.fontFamily);
      cursorX += cluster.advance;
      continue;
    }
    if (runFont && runFont !== selectedFont) flush();
    runFont = selectedFont;
    run += cluster.text;
    runAdvance += cluster.advance;
  }
  flush();
}

function drawCachedPdfText(
  page: PDFPage,
  text: string,
  font: PDFFont,
  x: number,
  y: number,
  size: number,
  color: string,
  characterSpacing = 0
): void {
  const fontKey = cachedPageFontKey(page, font);
  page.pushOperators(
    pushGraphicsState(),
    beginText(),
    setFillingColor(hexToRgb(color)),
    setFontAndSize(fontKey, size),
    setCharacterSpacing(characterSpacing),
    moveText(x, y),
    showText(font.encodeText(text)),
    endText(),
    popGraphicsState()
  );
}

function cachedPageFontKey(page: PDFPage, font: PDFFont): string {
  let fonts = pageFontKeys.get(page);
  if (!fonts) {
    fonts = new Map();
    pageFontKeys.set(page, fonts);
  }
  const cached = fonts.get(font);
  if (cached) return cached;

  const key = `VectorText${fonts.size + 1}`;
  page.node.setFontDictionary(PDFName.of(key), font.ref);
  fonts.set(font, key);
  return key;
}

function shapedClusters(text: string, shaped: ShapedTextRun): Array<{ text: string; advance: number }> {
  if (shaped.glyphs.length === 0) return [];
  const orderedClusters = Array.from(new Set(shaped.glyphs.map((glyph) => glyph.cluster))).sort((a, b) => a - b);
  return orderedClusters.map((cluster, index) => {
    const nextCluster = orderedClusters[index + 1] ?? text.length;
    const glyphs = shaped.glyphs.filter((glyph) => glyph.cluster === cluster);
    const designAdvance = glyphs.reduce((sum, glyph) => sum + glyph.xAdvance, 0);
    return {
      text: text.slice(cluster, nextCluster),
      advance: designAdvance * shaped.fontSize / shaped.unitsPerEm
    };
  });
}

function justifyExtraBySpace(object: Extract<DisplayObject, { type: "text" }>, naturalWidth: number | undefined): number {
  const target = object.width;
  if (!target || !naturalWidth || target <= naturalWidth) return 0;
  const spaces = countStretchSpaces(object.text || "");
  return spaces > 0 ? (target - naturalWidth) / spaces : 0;
}

function justifyExtraForText(
  text: string,
  object: Extract<DisplayObject, { type: "text" }>,
  fonts: PDFFont[]
): number {
  const target = object.width;
  if (!target) return 0;
  const naturalWidth = measurePdfTextWidth(object.text || "", fonts, object.fontSize, object.fontFamily);
  if (target <= naturalWidth) return 0;
  return countStretchSpaces(text) * ((target - naturalWidth) / Math.max(1, countStretchSpaces(object.text || "")));
}

function countStretchSpaces(text: string): number {
  return (text.match(/ +/g) ?? []).length;
}

function isStretchCluster(text: string): boolean {
  return / +/.test(text);
}

export function measurePdfTextWidth(text: string, fonts: PDFFont | PDFFont[], fontSize: number, fontFamily = ""): number {
  const candidates = Array.isArray(fonts) ? fonts : [fonts];
  let width = 0;
  for (const char of Array.from(text)) {
    const selectedFont = candidates.find((candidate) => canEncode(candidate, char));
    if (!selectedFont) {
      logMissingPdfGlyph("text-measure", char, fontFamily);
      continue;
    }
    width += selectedFont.widthOfTextAtSize(char, fontSize);
  }
  return width;
}

export function hexToRgb(hex: string) {
  const value = hex.replace("#", "");
  const bigint = Number.parseInt(value.length === 3 ? value.split("").map((c) => c + c).join("") : value, 16);
  return rgb(((bigint >> 16) & 255) / 255, ((bigint >> 8) & 255) / 255, (bigint & 255) / 255);
}

function canEncode(font: PDFFont, text: string): boolean {
  try {
    font.encodeText(text);
    return true;
  } catch {
    return false;
  }
}

export function canEncodePdfText(font: PDFFont, text: string): boolean {
  return canEncode(font, text);
}

export function logMissingPdfGlyph(context: string, text: string, fontFamily = ""): void {
  if (!isDebugLogEnabled("pdf")) return;
  const codePoints = Array.from(text).map((char) => `U+${(char.codePointAt(0) ?? 0).toString(16).toUpperCase()}`).join(" ");
  const key = `${context}:${fontFamily}:${text}:${codePoints}`;
  if (missingGlyphLogKeys.has(key)) return;
  missingGlyphLogKeys.add(key);
  console.warn("[pdf-missing-glyph]", {
    context,
    text,
    codePoints,
    fontFamily
  });
}
