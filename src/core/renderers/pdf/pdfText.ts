import { PDFPage, PDFFont, popGraphicsState, pushGraphicsState, rgb, setCharacterSqueeze } from "pdf-lib";
import type { DisplayObject } from "../../display-list/displayTypes";

export function drawPdfText(
  page: PDFPage,
  object: Extract<DisplayObject, { type: "text" }>,
  font: PDFFont | PDFFont[],
  pageHeight: number
): void {
  const fonts = Array.isArray(font) ? font : [font];
  const text = object.text || " ";
  const selectedFont = fonts.find((candidate) => canEncode(candidate, text)) ?? fonts[0];
  const printableText = canEncode(selectedFont, text) ? text : stripUnencodableText(selectedFont, text);
  if (!printableText) return;

  const naturalWidth = selectedFont.widthOfTextAtSize(printableText, object.fontSize);
  const targetWidth = printableText === text ? object.width : undefined;
  const squeeze = textSqueezePercent(naturalWidth, targetWidth);
  if (squeeze !== undefined) page.pushOperators(pushGraphicsState(), setCharacterSqueeze(squeeze));
  page.drawText(printableText, {
    x: object.x,
    y: pageHeight - object.y,
    size: object.fontSize,
    font: selectedFont,
    color: hexToRgb(object.color)
  });
  if (squeeze !== undefined) page.pushOperators(popGraphicsState());
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

function stripUnencodableText(font: PDFFont, text: string): string {
  return Array.from(text).filter((char) => canEncode(font, char)).join("");
}

function textSqueezePercent(naturalWidth: number, targetWidth: number | undefined): number | undefined {
  if (!targetWidth || naturalWidth <= 0) return undefined;
  const ratio = targetWidth / naturalWidth;
  if (!Number.isFinite(ratio) || Math.abs(ratio - 1) < 0.01) return undefined;
  return Math.max(80, Math.min(125, ratio * 100));
}
