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
  const layout = layoutNativeMath(object.latex, object.displayMode, object.fontSize, object.nativeMetrics);
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

    if (node.type === "path") {
      for (let index = 1; index < node.points.length; index += 1) {
        const [startX, startY] = node.points[index - 1];
        const [endX, endY] = node.points[index];
        page.drawLine({
          start: {
            x: object.x + node.x + startX,
            y: pageHeight - object.y - node.y - startY
          },
          end: {
            x: object.x + node.x + endX,
            y: pageHeight - object.y - node.y - endY
          },
          thickness: node.strokeWidth,
          color: hexToRgb(node.color ?? object.color)
        });
      }
      continue;
    }

    const font = selectNativeGlyphFont(node, texFonts);
    const text = encodeWithFallback(font, node.text);
    if (!text) continue;
    const x = object.x + node.x;
    const y = pageHeight - object.y - node.y;
    page.drawText(text, {
      x,
      y,
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
  if (glyph.fontFamily?.includes("KaTeX_Size4") && "size4" in fonts && fonts.size4) return fonts.size4;
  if (glyph.fontFamily?.includes("KaTeX_Size3") && "size3" in fonts && fonts.size3) return fonts.size3;
  if (glyph.fontFamily?.includes("KaTeX_Size2") && "size2" in fonts && fonts.size2) return fonts.size2;
  if (glyph.fontFamily?.includes("KaTeX_Size1") && "size1" in fonts && fonts.size1) return fonts.size1;
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
