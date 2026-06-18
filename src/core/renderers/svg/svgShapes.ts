import type { DisplayObject } from "../../display-list/displayTypes";
import { escapeXml } from "../../utils/sanitize";

export function renderSvgShape(object: Extract<DisplayObject, { type: "rect" } | { type: "line" }>): string {
  if (object.type === "line") {
    return `<line x1="${round(object.x1)}" y1="${round(object.y1)}" x2="${round(object.x2)}" y2="${round(object.y2)}" stroke="${escapeXml(object.stroke)}" stroke-width="${round(object.strokeWidth)}" />`;
  }

  return `<rect x="${round(object.x)}" y="${round(object.y)}" width="${round(object.width)}" height="${round(object.height)}" fill="${escapeXml(object.fill ?? "none")}" stroke="${escapeXml(object.stroke ?? "none")}" stroke-width="${round(object.strokeWidth ?? 0)}" rx="${round(object.radius ?? 0)}" />`;
}

function round(value: number): string {
  return Number(value.toFixed(2)).toString();
}
