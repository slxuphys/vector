import type { DisplayObject } from "../../display-list/displayTypes";
import { escapeXml, sanitizeUrl } from "../../utils/sanitize";
import { shapeTextWithFontFile } from "../text/textFontMetrics";

export function renderSvgText(object: Extract<DisplayObject, { type: "text" }>): string {
  const shaped = shapeTextWithFontFile(object.text, {
    fontSize: object.fontSize,
    fontFamily: object.fontFamily,
    monoFontFamily: object.fontFamily,
    bold: object.bold,
    italic: object.italic
  });
  const shapedWidth = object.width ?? shaped?.width;
  const attrs = [
    `x="${round(object.x)}"`,
    `y="${round(object.y)}"`,
    `font-size="${round(object.fontSize)}"`,
    `font-family="${escapeXml(object.fontFamily)}"`,
    `fill="${escapeXml(object.color)}"`,
    `xml:space="preserve"`,
    shapedWidth !== undefined && shapedWidth > 0 ? `textLength="${round(shapedWidth)}"` : "",
    shapedWidth !== undefined && shapedWidth > 0 ? `lengthAdjust="spacing"` : "",
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
