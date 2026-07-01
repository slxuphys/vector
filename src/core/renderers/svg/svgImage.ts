import type { DisplayObject } from "../../display-list/displayTypes";
import { escapeXml, sanitizeImageUrl } from "../../utils/sanitize";

type ImageObject = Extract<DisplayObject, { type: "image" }>;

export function renderSvgImage(object: ImageObject): string {
  const href = sanitizeImageUrl(object.src);
  if (!href) return "";
  return `<image href="${escapeXml(href)}" x="${round(object.x)}" y="${round(object.y)}" width="${round(object.width)}" height="${round(object.height)}" preserveAspectRatio="xMidYMid meet"><title>${escapeXml(object.alt)}</title></image>`;
}

function round(value: number): string {
  return Number(value.toFixed(2)).toString();
}
