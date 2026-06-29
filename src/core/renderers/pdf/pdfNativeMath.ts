import type { PDFPage, PDFFont } from "pdf-lib";
import type { DisplayObject } from "../../display-list/displayTypes";
import { layoutNativeMath, nativeMathProfileForRenderer, type NativeGlyph } from "../math/nativeMath";
import { openMathFontFamily } from "../math/openMathFont";
import type { PdfFontSet } from "./pdfFonts";
import { hexToRgb } from "./pdfText";

type NativeMathObject = Extract<DisplayObject, { type: "math" }>;

export function drawPdfNativeMath(
  page: PDFPage,
  object: NativeMathObject,
  fonts: PdfFontSet,
  pageHeight: number
): boolean {
  const layout = layoutNativeMath(
    object.latex,
    object.displayMode,
    object.fontSize,
    object.nativeMetrics,
    nativeMathProfileForRenderer(object.renderer)
  );
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

    if (node.type === "glyphPath") {
      page.drawSvgPath(flipSvgPathY(node.d), {
        x: object.x + node.x,
        y: pageHeight - object.y - node.y,
        scale: node.scale,
        color: hexToRgb(node.color ?? object.color)
      });
      continue;
    }

    const font = selectNativeGlyphFont(node, fonts, object.renderer !== "native-openmath");
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
  fonts: PdfFontSet,
  preferTexFonts: boolean
): PDFFont {
  if (glyph.fontFamily?.includes(openMathFontFamily) && fonts.openMath) return fonts.openMath;

  const texFonts = fonts.tex;
  if (glyph.fontFamily?.includes("KaTeX_Size4") && texFonts?.size4) return texFonts.size4;
  if (glyph.fontFamily?.includes("KaTeX_Size3") && texFonts?.size3) return texFonts.size3;
  if (glyph.fontFamily?.includes("KaTeX_Size2") && texFonts?.size2) return texFonts.size2;
  if (glyph.fontFamily?.includes("KaTeX_Size1") && texFonts?.size1) return texFonts.size1;
  if (preferTexFonts && texFonts) {
    if (glyph.bold && glyph.italic) return texFonts.boldItalic;
    if (glyph.bold) return texFonts.bold;
    if (glyph.italic && texFonts.mathItalic) return texFonts.mathItalic;
    if (glyph.italic) return texFonts.italic;
    return texFonts.regular;
  }

  if (glyph.bold && glyph.italic) return fonts.boldItalic;
  if (glyph.bold) return fonts.bold;
  if (glyph.italic && texFonts?.mathItalic) return texFonts.mathItalic;
  if (glyph.italic) return fonts.italic;
  if (glyph.fontFamily?.includes("KaTeX") && texFonts) return texFonts.regular;
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

function flipSvgPathY(path: string): string {
  const tokens = path.match(/[a-zA-Z]|[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/gi) ?? [];
  const output: string[] = [];
  let command = "";
  let values: number[] = [];

  const flush = () => {
    if (!command) return;
    if (values.length === 0) {
      output.push(command);
      return;
    }
    const arity = commandArity(command);
    if (!arity) {
      output.push(command, ...values.map(formatPathNumber));
      return;
    }
    output.push(command);
    for (let index = 0; index < values.length; index += arity) {
      const group = values.slice(index, index + arity);
      for (let groupIndex = 0; groupIndex < group.length; groupIndex += 1) {
        const value = shouldFlipY(command, groupIndex) ? -group[groupIndex] : group[groupIndex];
        output.push(formatPathNumber(value));
      }
    }
  };

  for (const token of tokens) {
    if (/^[a-zA-Z]$/.test(token)) {
      flush();
      command = token;
      values = [];
    } else {
      values.push(Number(token));
    }
  }
  flush();
  return output.join(" ");
}

function commandArity(command: string): number {
  switch (command.toUpperCase()) {
    case "H":
    case "V":
      return 1;
    case "M":
    case "L":
    case "T":
      return 2;
    case "S":
    case "Q":
      return 4;
    case "C":
      return 6;
    case "A":
      return 7;
    default:
      return 0;
  }
}

function shouldFlipY(command: string, groupIndex: number): boolean {
  switch (command.toUpperCase()) {
    case "V":
      return true;
    case "M":
    case "L":
    case "T":
      return groupIndex === 1;
    case "S":
    case "Q":
      return groupIndex === 1 || groupIndex === 3;
    case "C":
      return groupIndex === 1 || groupIndex === 3 || groupIndex === 5;
    case "A":
      return groupIndex === 6;
    default:
      return false;
  }
}

function formatPathNumber(value: number): string {
  return Number(value.toFixed(4)).toString();
}
