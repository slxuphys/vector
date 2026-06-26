import katex from "katex";
import { katexCssWithInlineFonts } from "./katexFontCss";

export function renderKatex(latex: string, displayMode: boolean): string {
  return katex.renderToString(latex, {
    displayMode,
    throwOnError: false,
    strict: "ignore",
    output: "html"
  });
}

export function renderKatexSvg(options: {
  latex: string;
  html: string;
  displayMode: boolean;
  width: number;
  height: number;
  fontSize: number;
  color: string;
}): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${options.width}" height="${options.height}" viewBox="0 0 ${options.width} ${options.height}">
${renderKatexForeignObject({ ...options, x: 0, y: 0, includeCss: true })}
</svg>`;
}

export function renderKatexForeignObject(options: {
  html: string;
  displayMode: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  color: string;
  includeCss?: boolean;
}): string {
  const alignItems = options.displayMode ? "center" : "flex-start";
  const justifyContent = options.displayMode ? "center" : "flex-start";
  const css = options.includeCss ? `<style>${katexCssWithInlineFonts}</style>
<style>
html,body{margin:0;padding:0;background:transparent;}
.svg-md-katex{box-sizing:border-box;width:${options.width}px;height:${options.height}px;display:flex;align-items:${alignItems};justify-content:${justifyContent};overflow:hidden;color:${options.color};font-size:${options.fontSize}px;line-height:normal;}
.svg-md-katex .katex{font-size:1em!important;}
.svg-md-katex .katex-display{margin:0;}
</style>
` : "";
  return `<foreignObject class="svg-md-katex-box" x="${options.x}" y="${options.y}" width="${options.width}" height="${options.height}">
<div xmlns="http://www.w3.org/1999/xhtml" class="svg-md-katex" style="width:${options.width}px;height:${options.height}px;display:flex;align-items:${alignItems};justify-content:${justifyContent};overflow:hidden;color:${options.color};font-size:${options.fontSize}px;line-height:normal;">${css}${options.html}</div>
</foreignObject>`;
}

export function svgToDataUrl(svg: string): string {
  const nodeBuffer = (globalThis as { Buffer?: { from(value: string, encoding: string): { toString(encoding: string): string } } }).Buffer;
  const encoded = typeof nodeBuffer === "undefined"
    ? btoa(unescape(encodeURIComponent(svg)))
    : nodeBuffer.from(svg, "utf8").toString("base64");
  return `data:image/svg+xml;base64,${encoded}`;
}
