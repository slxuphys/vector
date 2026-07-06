import { PDFPage, PDFFont, rgb } from "pdf-lib";
import type { DisplayObject } from "../../display-list/displayTypes";
import { isDebugLogEnabled } from "../../utils/debugSettings";
import { shapeTextWithFontFile, type ShapedTextRun } from "../text/textFontMetrics";
import { addPdfLinkAnnotation, type PdfLinkTargets } from "./pdfLinks";

const missingGlyphLogKeys = new Set<string>();

export function drawPdfText(
  page: PDFPage,
  object: Extract<DisplayObject, { type: "text" }>,
  font: PDFFont | PDFFont[],
  pageHeight: number,
  linkTargets?: PdfLinkTargets
): void {
  const fonts = Array.isArray(font) ? font : [font];
  const text = object.text || " ";
  const shaped = shapeTextWithFontFile(text, {
    fontSize: object.fontSize,
    fontFamily: object.fontFamily,
    monoFontFamily: object.fontFamily,
    bold: object.bold,
    italic: object.italic
  });

  if (shaped) drawShapedPdfText(page, object, fonts, pageHeight, shaped);
  else drawUnshapedPdfText(page, object, fonts, pageHeight);

  if (object.link) {
    const width = object.width && object.width > 0
      ? object.width
      : shaped?.width ?? measurePdfTextWidth(text, fonts, object.fontSize, object.fontFamily);
    addPdfLinkAnnotation(page, {
      x: object.x,
      y: pageHeight - object.y - object.fontSize * 0.25,
      width,
      height: object.fontSize * 1.2
    }, object.link, linkTargets);
  }
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
    page.drawText(run, {
      x: cursorX,
      y: pageHeight - object.y,
      size: object.fontSize,
      font: runFont,
      color: hexToRgb(object.color)
    });
    cursorX += runFont.widthOfTextAtSize(run, object.fontSize);
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
  let cursorX = object.x;
  for (const cluster of clusters) {
    const selectedFont = fonts.find((candidate) => canEncode(candidate, cluster.text));
    if (selectedFont) {
      page.drawText(cluster.text, {
        x: cursorX,
        y: pageHeight - object.y,
        size: object.fontSize,
        font: selectedFont,
        color: hexToRgb(object.color)
      });
    } else {
      logMissingPdfGlyph("text", cluster.text, object.fontFamily);
    }
    cursorX += cluster.advance;
  }
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
