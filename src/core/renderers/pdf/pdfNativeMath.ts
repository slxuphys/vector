import type { PDFPage, PDFFont } from "pdf-lib";
import type { DisplayObject } from "../../display-list/displayTypes";
import { layoutNativeMath, type NativeGlyph } from "../math/nativeMath";
import type { PdfFontSet } from "./pdfFonts";
import { hexToRgb } from "./pdfText";

type NativeMathObject = Extract<DisplayObject, { type: "math" }>;

export function drawPdfNativeMath(
  page: PDFPage,
  object: NativeMathObject,
  fonts: PdfFontSet,
  pageHeight: number
): boolean {
  const layout = layoutNativeMath(object.latex, object.displayMode, object.fontSize);
  const texFonts = fonts.tex ?? fonts;
  for (const node of layout.nodes) {
    if (node.type === "rule") {
      page.drawRectangle({
        x: object.x + node.x,
        y: pageHeight - object.y - node.y - node.height,
        width: node.width,
        height: node.height,
        color: hexToRgb(object.color)
      });
      continue;
    }

    const font = selectNativeGlyphFont(node, texFonts);
    const text = encodeWithFallback(font, node.text);
    if (!text) continue;
    page.drawText(text, {
      x: object.x + node.x,
      y: pageHeight - object.y - node.y,
      size: node.fontSize,
      font,
      color: hexToRgb(node.color ?? object.color)
    });
  }
  return true;
}

function selectNativeGlyphFont(
  glyph: NativeGlyph,
  fonts: PdfFontSet | NonNullable<PdfFontSet["tex"]>
): PDFFont {
  if (glyph.bold && glyph.italic) return fonts.boldItalic;
  if (glyph.bold) return fonts.bold;
  if (glyph.italic && "mathItalic" in fonts && fonts.mathItalic) return fonts.mathItalic;
  if (glyph.italic) return fonts.italic;
  return fonts.regular;
}

function encodeWithFallback(font: PDFFont, text: string): string {
  try {
    font.encodeText(text);
    return text;
  } catch {
    return Array.from(text).filter((char) => {
      try {
        font.encodeText(char);
        return true;
      } catch {
        return false;
      }
    }).join("");
  }
}
