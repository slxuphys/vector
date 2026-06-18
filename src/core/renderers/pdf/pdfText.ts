import { PDFPage, PDFFont, rgb } from "pdf-lib";
import type { DisplayObject } from "../../display-list/displayTypes";

export function drawPdfText(
  page: PDFPage,
  object: Extract<DisplayObject, { type: "text" }>,
  font: PDFFont,
  pageHeight: number
): void {
  page.drawText(object.text || " ", {
    x: object.x,
    y: pageHeight - object.y,
    size: object.fontSize,
    font,
    color: hexToRgb(object.color)
  });
}

export function hexToRgb(hex: string) {
  const value = hex.replace("#", "");
  const bigint = Number.parseInt(value.length === 3 ? value.split("").map((c) => c + c).join("") : value, 16);
  return rgb(((bigint >> 16) & 255) / 255, ((bigint >> 8) & 255) / 255, (bigint & 255) / 255);
}
