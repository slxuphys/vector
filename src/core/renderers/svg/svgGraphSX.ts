import type { DisplayObject } from "../../display-list/displayTypes";
import { escapeXml } from "../../utils/sanitize";

type GraphSXObject = Extract<DisplayObject, { type: "graphsx" }>;

export function renderSvgGraphSX(object: GraphSXObject): string {
  return `<svg x="${round(object.x)}" y="${round(object.y)}" width="${round(object.width)}" height="${round(object.height)}" viewBox="${escapeXml(object.viewBox)}" role="img" aria-label="${escapeXml(object.summary)}">${object.svgBody}</svg>`;
}

function round(value: number): string {
  return Number(value.toFixed(2)).toString();
}
