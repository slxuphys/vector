import type { DisplayObject, DisplayPage } from "../../display-list/displayTypes";
import { escapeXml } from "../../utils/sanitize";
import { renderKatexForeignObject } from "../math/renderKatex";
import { renderSvgShape } from "./svgShapes";
import { renderSvgText } from "./svgText";

export type SvgRenderOptions = {
  className?: string;
  title?: string;
};

export function renderPageToSvg(page: DisplayPage, options: SvgRenderOptions = {}): string {
  const body = page.objects.map(renderObject).join("");
  const title = options.title ? `<title>${options.title}</title>` : "";
  const className = options.className ? ` class="${options.className}"` : "";
  return `<svg${className} xmlns="http://www.w3.org/2000/svg" width="${page.width}" height="${page.height}" viewBox="0 0 ${page.width} ${page.height}" role="img">${title}${body}</svg>`;
}

function renderObject(object: DisplayObject): string {
  if (object.type === "math") {
    if (object.renderer === "mathjax-vector" || object.renderer === "mathjax-glyph") {
      return `<svg x="${round(object.x)}" y="${round(object.y)}" width="${round(object.width)}" height="${round(object.height)}" viewBox="${escapeXml(object.viewBox ?? `0 0 ${object.width} ${object.height}`)}" overflow="visible">${object.svgBody ?? ""}</svg>`;
    }
    return renderKatexForeignObject({
      html: object.html,
      displayMode: object.displayMode,
      x: object.x,
      y: object.y,
      width: object.width,
      height: object.height,
      fontSize: object.fontSize,
      color: object.color,
      includeCss: true
    });
  }
  return object.type === "text" ? renderSvgText(object) : renderSvgShape(object);
}

function round(value: number): string {
  return Number(value.toFixed(2)).toString();
}
