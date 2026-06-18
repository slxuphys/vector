import { PDFPage } from "pdf-lib";
import type { DisplayObject } from "../../display-list/displayTypes";
import { hexToRgb } from "./pdfText";

export function drawPdfShape(
  page: PDFPage,
  object: Extract<DisplayObject, { type: "rect" } | { type: "line" }>,
  pageHeight: number
): void {
  if (object.type === "line") {
    page.drawLine({
      start: { x: object.x1, y: pageHeight - object.y1 },
      end: { x: object.x2, y: pageHeight - object.y2 },
      thickness: object.strokeWidth,
      color: hexToRgb(object.stroke)
    });
    return;
  }

  page.drawRectangle({
    x: object.x,
    y: pageHeight - object.y - object.height,
    width: object.width,
    height: object.height,
    color: object.fill ? hexToRgb(object.fill) : undefined,
    borderColor: object.stroke && object.stroke !== "none" ? hexToRgb(object.stroke) : undefined,
    borderWidth: object.strokeWidth ?? 0
  });
}
