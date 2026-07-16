import type { DisplayObject, DisplayPage } from "../../display-list/displayTypes";
import { escapeXml } from "../../utils/sanitize";
import { renderNativeMathSvg } from "../math/nativeMath";
import { renderSvgImage } from "./svgImage";
import { renderSvgGraphSX } from "./svgGraphSX";
import { renderSvgShape } from "./svgShapes";
import { renderSvgText } from "./svgText";

export type SvgRenderOptions = {
  className?: string;
  includeFontCss?: boolean;
  title?: string;
};

export function renderPageToSvg(page: DisplayPage, options: SvgRenderOptions = {}): string {
  const body = page.objects.map((object) => renderObject(object, options)).join("");
  const title = options.title ? `<title>${options.title}</title>` : "";
  const includeFontCss = options.includeFontCss ?? true;
  const fontFace = includeFontCss && page.fontFaceCss ? `<style>${page.fontFaceCss}</style>` : "";
  const className = options.className ? ` class="${options.className}"` : "";
  return `<svg${className} xmlns="http://www.w3.org/2000/svg" width="${page.width}" height="${page.height}" viewBox="0 0 ${page.width} ${page.height}" role="img">${title}${fontFace}${body}</svg>`;
}

function renderObject(object: DisplayObject, options: SvgRenderOptions): string {
  const rendered = renderObjectBody(object, options);
  const attributes = [
    object.anchorId ? `id="${escapeXml(object.anchorId)}"` : "",
    object.sourceSpan ? `data-vector-source-start="${object.sourceSpan.start}"` : "",
    object.sourceSpan ? `data-vector-source-end="${object.sourceSpan.end}"` : ""
  ].filter(Boolean);
  return attributes.length ? `<g ${attributes.join(" ")}>${rendered}</g>` : rendered;
}

function renderObjectBody(object: DisplayObject, options: SvgRenderOptions): string {
  if (object.type === "math") {
    return renderNativeMathSvg(object, { includeFontCss: options.includeFontCss });
  }
  if (object.type === "image") return renderSvgImage(object);
  if (object.type === "graphsx") return renderSvgGraphSX(object);
  return object.type === "text" ? renderSvgText(object) : renderSvgShape(object);
}

function round(value: number): string {
  return Number(value.toFixed(2)).toString();
}
