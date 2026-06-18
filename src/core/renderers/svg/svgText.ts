import type { DisplayObject } from "../../display-list/displayTypes";
import { escapeXml, sanitizeUrl } from "../../utils/sanitize";

export function renderSvgText(object: Extract<DisplayObject, { type: "text" }>): string {
  const attrs = [
    `x="${round(object.x)}"`,
    `y="${round(object.y)}"`,
    `font-size="${round(object.fontSize)}"`,
    `font-family="${escapeXml(object.fontFamily)}"`,
    `fill="${escapeXml(object.color)}"`,
    `xml:space="preserve"`,
    object.bold ? `font-weight="700"` : "",
    object.italic ? `font-style="italic"` : ""
  ].filter(Boolean);
  const text = `<text ${attrs.join(" ")}>${escapeXml(object.text)}</text>`;
  const href = object.link ? sanitizeUrl(object.link) : undefined;
  return href ? `<a href="${escapeXml(href)}">${text}</a>` : text;
}

function round(value: number): string {
  return Number(value.toFixed(2)).toString();
}
