import type { DisplayObject, DisplayPage } from "../../display-list/displayTypes";
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
