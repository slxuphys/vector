import type { PDFPage, PDFFont } from "pdf-lib";
import type { DisplayObject } from "../../display-list/displayTypes";
import { layoutNativeMath, nativeMathProfileForRenderer, type NativeGlyph } from "../math/nativeMath";
import { getOpenMathFontProfile, openMathFontProfiles } from "../math/openMathFont";
import type { PdfFontSet } from "./pdfFonts";
import { canEncodePdfText, hexToRgb, logMissingPdfGlyph } from "./pdfText";
import { drawPdfGraphSX } from "./pdfGraphSX";

type NativeMathObject = Extract<DisplayObject, { type: "math" }>;

export function drawPdfNativeMath(
  page: PDFPage,
  object: NativeMathObject,
  fonts: PdfFontSet,
  pageHeight: number
): boolean {
  const layout = object.nativeLayout ?? layoutNativeMath(
    object.latex,
    object.displayMode,
    object.fontSize,
    object.nativeMetrics,
    object.nativeMathProfile ?? nativeMathProfileForRenderer(object.renderer)
  );
  for (const node of layout.nodes) {
    if (node.type === "graphsx") {
      drawPdfGraphSX(page, {
        type: "graphsx",
        source: node.source,
        svg: "",
        svgBody: node.svgBody,
        viewBox: `0 0 ${node.width} ${node.height}`,
        summary: node.summary,
        displayList: node.displayList,
        nativeMathProfile: object.nativeMathProfile,
        x: object.x + node.x,
        y: object.y + node.y,
        width: node.width,
        height: node.height
      }, fonts, pageHeight);
      continue;
    }
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

    const font = selectNativeGlyphFont(node, fonts);
    if (!font) {
      logMissingPdfGlyph("native-math-font", node.text, node.fontFamily);
      continue;
    }
    if (!canEncodePdfText(font, node.text)) {
      logMissingPdfGlyph("native-math", node.text, node.fontFamily);
      continue;
    }
    const x = object.x + node.x;
    const y = pageHeight - object.y - node.y;
    page.drawText(node.text, {
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
  fonts: PdfFontSet
): PDFFont | undefined {
  if (glyph.fontFamily?.includes(openMathFontProfiles.libertinus.family) && fonts.openMathLibertinus) return fonts.openMathLibertinus;
  if (glyph.fontFamily?.includes(getOpenMathFontProfile("latin-modern").family) && fonts.openMath) return fonts.openMath;
  return undefined;
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
