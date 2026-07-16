import type { PDFPage } from "pdf-lib";
import { clip, concatTransformationMatrix, endPath, popGraphicsState, pushGraphicsState, rectangle, rgb, rotateDegrees } from "pdf-lib";
import type { DisplayObject } from "../../display-list/displayTypes";
import {
  getDefaultOpenMathMetricsForProfile,
  layoutNativeMath
} from "../math/nativeMath";
import { drawPdfNativeMath } from "./pdfNativeMath";
import { selectPdfTextFontFallbacks, type PdfFontSet } from "./pdfFonts";
import { drawPdfText, hexToRgb, measurePdfTextWidth } from "./pdfText";
import { debugWarn } from "../../utils/debugSettings";

type GraphSXObject = Extract<DisplayObject, { type: "graphsx" }>;
type ClipRect = { x: number; y: number; width: number; height: number };

export function drawPdfGraphSX(
  page: PDFPage,
  object: GraphSXObject,
  fonts: PdfFontSet,
  pageHeight: number
): boolean {
  if (!object.displayList) {
    debugWarn("graph", "[GraphSX PDF] missing neutral display list", {
      summary: object.summary
    });
    return false;
  }
  drawGraphSXDisplayList(page, object, fonts, pageHeight);
  return true;
}

function drawGraphSXDisplayList(page: PDFPage, object: GraphSXObject, fonts: PdfFontSet, pageHeight: number): void {
  const displayList = object.displayList;
  if (!displayList) return;
  const scale = displayList.width > 0 ? object.width / displayList.width : 1;
  const clips = collectClipRects(displayList);
  const items = displayList.type !== "plot"
    ? [
        ...displayList.items.filter((item: Record<string, any>) => item.layer === "edge"),
        ...displayList.items.filter((item: Record<string, any>) => item.layer === "path"),
        ...displayList.items.filter((item: Record<string, any>) => item.layer === "node")
      ]
    : displayList.items;
  for (const item of items) drawGraphSXItem(page, item, object, fonts, pageHeight, scale, clips);
}

function drawGraphSXItem(
  page: PDFPage,
  item: Record<string, any> | undefined,
  object: GraphSXObject,
  fonts: PdfFontSet,
  pageHeight: number,
  scale: number,
  clips: Map<string, ClipRect>,
  offsetX = 0,
  offsetY = 0
): void {
  if (!item) return;
  if (item.type === "plot" && item.displayList) {
    const attrs = displayProps(item);
    const nextOffsetX = offsetX + numberAttr(attrs.x) * scale;
    const nextOffsetY = offsetY + numberAttr(attrs.y) * scale;
    const nestedScale = numberAttr(attrs.width, item.displayList.width) > 0
      ? scale * numberAttr(attrs.width, item.displayList.width) / item.displayList.width
      : scale;
    for (const child of item.displayList.items ?? []) drawGraphSXItem(page, child, object, fonts, pageHeight, nestedScale, clips, nextOffsetX, nextOffsetY);
    return;
  }
  if (item.type === "element") {
    drawGraphSXElement(page, item, object, fonts, pageHeight, scale, clips, offsetX, offsetY);
    return;
  }
  if (item.type === "rect" || item.type === "circle" || item.type === "path" || item.type === "text" || item.type === "math") {
    drawGraphSXElement(page, { tag: item.type, text: item.text, type: item.type, ...item }, object, fonts, pageHeight, scale, clips, offsetX, offsetY);
  }
}

function drawGraphSXElement(
  page: PDFPage,
  item: Record<string, any>,
  object: GraphSXObject,
  fonts: PdfFontSet,
  pageHeight: number,
  scale: number,
  clips: Map<string, ClipRect>,
  offsetX: number,
  offsetY: number,
  ignoreClip = false
): void {
  if (item.type === "math") {
    drawGraphSXMath(page, item, object, fonts, pageHeight, scale, offsetX, offsetY);
    return;
  }

  const tag = item.tag ?? item.type;
  const attrs = displayProps(item);
  const clipRect = ignoreClip ? undefined : clipRectForAttrs(attrs, clips);
  if (clipRect) {
    page.pushOperators(pushGraphicsState());
    applyClipRect(page, object, clipRect, pageHeight, scale, offsetX, offsetY);
    drawGraphSXElement(page, item, object, fonts, pageHeight, scale, clips, offsetX, offsetY, true);
    page.pushOperators(popGraphicsState());
    return;
  }
  if (tag === "defs" || tag === "clipPath" || tag === "marker") {
    return;
  }
  if (tag === "g") {
    const translation = transformTranslation(attrs.transform);
    const nextOffsetX = offsetX + translation.x * scale;
    const nextOffsetY = offsetY + translation.y * scale;
    for (const child of item.children ?? []) drawGraphSXItem(page, child, object, fonts, pageHeight, scale, clips, nextOffsetX, nextOffsetY);
    return;
  }
  if (tag === "svg") {
    const nextOffsetX = offsetX + numberAttr(attrs.x) * scale;
    const nextOffsetY = offsetY + numberAttr(attrs.y) * scale;
    for (const child of item.children ?? []) drawGraphSXItem(page, child, object, fonts, pageHeight, scale, clips, nextOffsetX, nextOffsetY);
    return;
  }
  if (tag === "rect") {
    const x = offsetX + numberAttr(attrs.x) * scale;
    const y = offsetY + numberAttr(attrs.y) * scale;
    const width = numberAttr(attrs.width) * scale;
    const height = numberAttr(attrs.height) * scale;
    const radius = numberAttr(attrs.rx ?? attrs.ry, 0);
    if (radius > 0) {
      page.drawSvgPath(roundedRectPath(numberAttr(attrs.x), numberAttr(attrs.y), numberAttr(attrs.width), numberAttr(attrs.height), radius), {
        x: object.x + offsetX,
        y: pageHeight - object.y - offsetY,
        scale,
        color: colorAttr(attrs.fill),
        borderColor: colorAttr(attrs.stroke),
        borderWidth: numberAttr(attrs["stroke-width"], 0) * scale
      });
    } else {
      page.drawRectangle({
        x: object.x + x,
        y: pageHeight - object.y - y - height,
        width,
        height,
        color: colorAttr(attrs.fill),
        borderColor: colorAttr(attrs.stroke),
        borderWidth: numberAttr(attrs["stroke-width"], 0) * scale
      });
    }
  } else if (tag === "circle") {
    const cx = offsetX + numberAttr(attrs.cx) * scale;
    const cy = offsetY + numberAttr(attrs.cy) * scale;
    const r = numberAttr(attrs.r) * scale;
    page.drawCircle({
      x: object.x + cx,
      y: pageHeight - object.y - cy,
      size: r,
      color: colorAttr(attrs.fill),
      borderColor: colorAttr(attrs.stroke),
      borderWidth: numberAttr(attrs["stroke-width"], 0) * scale
    });
  } else if (tag === "line") {
    page.drawLine({
      start: { x: object.x + offsetX + numberAttr(attrs.x1) * scale, y: pageHeight - object.y - offsetY - numberAttr(attrs.y1) * scale },
      end: { x: object.x + offsetX + numberAttr(attrs.x2) * scale, y: pageHeight - object.y - offsetY - numberAttr(attrs.y2) * scale },
      thickness: numberAttr(attrs["stroke-width"], 1) * scale,
      color: colorAttr(attrs.stroke) ?? hexToRgb("#111111"),
      dashArray: parseDashArray(attrs["stroke-dasharray"], scale)
    });
  } else if (tag === "path" && typeof attrs.d === "string") {
    const translation = transformTranslation(attrs.transform);
    const originX = object.x + offsetX + translation.x * scale;
    const originY = pageHeight - object.y - offsetY - translation.y * scale;
    const stroke = colorAttr(attrs.stroke);
    page.drawSvgPath(attrs.d, {
      x: originX,
      y: originY,
      scale,
      borderColor: stroke,
      borderWidth: numberAttr(attrs["stroke-width"], 1) * scale,
      borderDashArray: parseDashArray(attrs["stroke-dasharray"], scale),
      color: attrs.fill && attrs.fill !== "none" ? colorAttr(attrs.fill) : undefined
    });
    drawPathMarker(page, attrs, originX, originY, scale, stroke ?? hexToRgb("#111111"));
  } else if (tag === "text") {
    const text = String(item.text ?? "");
    if (text) {
      const textAttrs = { ...styleObject(item.textStyle), ...attrs };
      const fontSize = numberAttr(textAttrs["font-size"] ?? textAttrs.fontSize, 12) * scale;
      const fontFamily = stringAttr(textAttrs["font-family"] ?? textAttrs.fontFamily, "");
      const fontWeight = String(textAttrs["font-weight"] ?? textAttrs.fontWeight ?? "");
      const fontStyle = String(textAttrs["font-style"] ?? textAttrs.fontStyle ?? "");
      const textObject = {
        type: "text" as const,
        text,
        x: 0,
        y: 0,
        width: 0,
        height: fontSize,
        fontSize,
        fontFamily,
        color: stringAttr(attrs.fill, "#111111"),
        bold: fontWeight === "700" || fontWeight === "bold",
        italic: fontStyle === "italic"
      };
      const fontFallbacks = selectPdfTextFontFallbacks(textObject, fonts);
      const anchor = textAttrs["text-anchor"] ?? textAttrs.textAnchor ?? item.anchor;
      const width = measurePdfTextWidth(text, fontFallbacks, fontSize, fontFamily);
      const xValue = textAttrs.x ?? item.x;
      const yValue = textAttrs.y ?? item.y;
      const baselineOffset = item.type === "text" && textAttrs.y === undefined ? 4 : 0;
      const dominantBaselineOffset = dominantBaselineToOffset(textAttrs["dominant-baseline"] ?? textAttrs.dominantBaseline, fontSize);
      const x = object.x + offsetX + numberAttr(xValue) * scale - (anchor === "middle" ? width / 2 : anchor === "end" ? width : 0);
      const y = pageHeight - object.y - offsetY - (numberAttr(yValue) + baselineOffset) * scale - dominantBaselineOffset;
      drawPdfText(page, { ...textObject, x, y: pageHeight - y }, fontFallbacks, pageHeight);
    }
  }

  for (const child of item.children ?? []) drawGraphSXItem(page, child, object, fonts, pageHeight, scale, clips, offsetX, offsetY);
}

function drawGraphSXMath(
  page: PDFPage,
  item: Record<string, any>,
  object: GraphSXObject,
  fonts: PdfFontSet,
  pageHeight: number,
  scale: number,
  offsetX: number,
  offsetY: number
): void {
  const source = String(item.source ?? item.fallback ?? "");
  const fontSize = numberAttr(item.fontSize, 12) * scale;
  const color = stringAttr(item.textStyle?.fill ?? item.style?.fill, "#111111");
  const nativeMathProfile = object.nativeMathProfile ?? "openmath";
  const metrics = getDefaultOpenMathMetricsForProfile(nativeMathProfile);
  const layout = layoutNativeMath(source, false, fontSize, metrics, nativeMathProfile);
  const safeScale = scale || 1;
  const localLayoutWidth = layout.width / safeScale;
  const localLayoutHeight = layout.height / safeScale;
  const localBaseline = layout.baseline / safeScale;
  const localInkTop = layout.inkTop == null ? undefined : layout.inkTop / safeScale;
  const localInkBottom = layout.inkBottom == null ? undefined : layout.inkBottom / safeScale;
  const localPosition = graphSXMathAnchorPosition(
    item,
    localLayoutWidth,
    localLayoutHeight,
    localBaseline,
    localInkTop,
    localInkBottom
  );
  const x = object.x + offsetX + localPosition.x * scale;
  const y = object.y + offsetY + localPosition.y * scale;
  const rotate = numberAttr(item.rotate, 0);
  if (rotate) {
    const pivotX = object.x + offsetX + numberAttr(item.x) * scale;
    const pivotY = pageHeight - object.y - offsetY - numberAttr(item.y) * scale;
    page.pushOperators(
      pushGraphicsState(),
      concatTransformationMatrix(1, 0, 0, 1, pivotX, pivotY),
      rotateDegrees(-rotate),
      concatTransformationMatrix(1, 0, 0, 1, -pivotX, -pivotY)
    );
  }
  drawPdfNativeMath(page, {
    type: "math",
    renderer: "native-openmath",
    latex: source,
    html: "",
    svg: "",
    displayMode: false,
    x,
    y,
    width: layout.width,
    height: layout.height,
    advance: layout.advance,
    baseline: layout.baseline,
    fontSize,
    color,
    nativeMetrics: metrics,
    nativeMathProfile,
    nativeLayout: layout
  }, fonts, pageHeight);
  if (rotate) page.pushOperators(popGraphicsState());
}

function anchorLeft(x: number, width: number, anchor: unknown): number {
  if (anchor === "start") return x;
  if (anchor === "end") return x - width;
  return x - width / 2;
}

function graphSXMathAnchorPosition(
  item: Record<string, any>,
  width: number,
  height: number,
  baseline: number,
  inkTop?: number,
  inkBottom?: number
): { x: number; y: number } {
  if (item.x == null || item.y == null) {
    return {
      x: numberAttr(item.left),
      y: numberAttr(item.top)
    };
  }

  const x = anchorLeft(numberAttr(item.x), width, item.anchor);
  if (item.baseline === "hanging") return { x, y: numberAttr(item.y) };
  if (item.baseline === "middle" || item.baseline === "central") {
    return { x, y: numberAttr(item.y) - inkCenter(height, inkTop, inkBottom) };
  }
  if (item.baseline === "alphabetic") return { x, y: numberAttr(item.y) - baseline };
  return { x, y: numberAttr(item.y) - inkCenter(height, inkTop, inkBottom) };
}

function inkCenter(height: number, inkTop?: number, inkBottom?: number): number {
  return Number.isFinite(inkTop) && Number.isFinite(inkBottom)
    ? (Number(inkTop) + Number(inkBottom)) / 2
    : height / 2;
}

function numberAttr(value: unknown, fallback = 0): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function stringAttr(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function colorAttr(value: unknown): ReturnType<typeof hexToRgb> | undefined {
  if (typeof value !== "string" || value === "none" || value.startsWith("url(")) return undefined;
  if (/^#[0-9a-f]{3,8}$/i.test(value)) {
    const normalized = value.length === 4
      ? `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`
      : value.slice(0, 7);
    return hexToRgb(normalized);
  }
  return undefined;
}

function styleObject(style: unknown): Record<string, unknown> {
  if (!style || typeof style !== "object" || Array.isArray(style)) return {};
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(style)) {
    result[pdfAttrName(key)] = value;
  }
  return result;
}

function displayProps(item: Record<string, any>): Record<string, unknown> {
  const attrs: Record<string, unknown> = {};
  const rawProps = item.props ?? {};
  for (const [key, value] of Object.entries(rawProps)) {
    if (value == null || value === false) continue;
    if (key === "headArrow" || key === "tailArrow" || key === "arrowSize") continue;
    if (key === "commands" && Array.isArray(value)) {
      attrs.d = commandsToPathData(value);
    } else if (key === "transform") {
      attrs.transform = transformsToSvgTransform(value);
    } else if (key === "clip" && typeof value === "object" && "id" in value) {
      attrs["clip-path"] = `url(#${String((value as Record<string, unknown>).id)})`;
    } else {
      attrs[pdfAttrName(key)] = value;
    }
  }
  Object.assign(attrs, styleObject(item.style));
  if (rawProps.tailArrow || rawProps.headArrow) {
    const key = markerKey(numberAttr(rawProps.arrowSize, 12));
    if (rawProps.tailArrow) attrs["marker-start"] = `url(#graphsx-arrow-tail${key === "12" ? "" : `-${key}`})`;
    if (rawProps.headArrow) attrs["marker-end"] = `url(#graphsx-arrow-head${key === "12" ? "" : `-${key}`})`;
  }
  return attrs;
}

function pdfAttrName(key: string): string {
  const names: Record<string, string> = {
    className: "class",
    strokeWidth: "stroke-width",
    strokeDasharray: "stroke-dasharray",
    strokeLinecap: "stroke-linecap",
    strokeLinejoin: "stroke-linejoin",
    fillOpacity: "fill-opacity",
    textAnchor: "text-anchor",
    dominantBaseline: "dominant-baseline",
    markerStart: "marker-start",
    markerEnd: "marker-end",
    fontSize: "font-size",
    fontFamily: "font-family",
    clipPath: "clip-path"
  };
  if (names[key]) return names[key];
  return key.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`);
}

function collectClipRects(displayList: Record<string, any> | undefined): Map<string, ClipRect> {
  const clips = new Map<string, ClipRect>();
  for (const clipItem of displayList?.clips ?? []) {
    if (clipItem?.type === "rect" && typeof clipItem.id === "string") {
      clips.set(clipItem.id, {
        x: numberAttr(clipItem.x),
        y: numberAttr(clipItem.y),
        width: numberAttr(clipItem.width),
        height: numberAttr(clipItem.height)
      });
    }
  }
  const visit = (item: Record<string, any> | undefined) => {
    if (!item) return;
    const tag = item.tag ?? item.type;
    const attrs = displayProps(item);
    if (tag === "clipPath" && typeof attrs.id === "string") {
      const rect = (item.children ?? []).find((child: Record<string, any>) => (child.tag ?? child.type) === "rect");
      if (rect) {
        const rectAttrs = displayProps(rect);
        clips.set(String(attrs.id), {
          x: numberAttr(rectAttrs.x),
          y: numberAttr(rectAttrs.y),
          width: numberAttr(rectAttrs.width),
          height: numberAttr(rectAttrs.height)
        });
      }
    }
    for (const child of item.children ?? []) visit(child);
    if (item.displayList?.items) for (const child of item.displayList.items) visit(child);
  };
  for (const item of displayList?.items ?? []) visit(item);
  return clips;
}

function commandsToPathData(commands: unknown[]): string {
  return commands.map((command) => {
    if (!command || typeof command !== "object") return "";
    const item = command as Record<string, unknown>;
    if (item.op === "moveTo") return `M ${formatPathNumber(numberAttr(item.x))} ${formatPathNumber(numberAttr(item.y))}`;
    if (item.op === "lineTo") return `L ${formatPathNumber(numberAttr(item.x))} ${formatPathNumber(numberAttr(item.y))}`;
    if (item.op === "quadraticTo") return `Q ${formatPathNumber(numberAttr(item.x1))} ${formatPathNumber(numberAttr(item.y1))} ${formatPathNumber(numberAttr(item.x))} ${formatPathNumber(numberAttr(item.y))}`;
    if (item.op === "cubicTo") return `C ${formatPathNumber(numberAttr(item.x1))} ${formatPathNumber(numberAttr(item.y1))} ${formatPathNumber(numberAttr(item.x2))} ${formatPathNumber(numberAttr(item.y2))} ${formatPathNumber(numberAttr(item.x))} ${formatPathNumber(numberAttr(item.y))}`;
    if (item.op === "closePath") return "Z";
    return "";
  }).filter(Boolean).join(" ");
}

function transformsToSvgTransform(value: unknown): string {
  const transforms = Array.isArray(value) ? value : [value];
  return transforms.map((transform) => {
    if (!transform || typeof transform !== "object") return "";
    const item = transform as Record<string, unknown>;
    if (item.type === "translate") return `translate(${formatPathNumber(numberAttr(item.x))} ${formatPathNumber(numberAttr(item.y))})`;
    if (item.type === "matrix") return `matrix(${formatPathNumber(numberAttr(item.a))} ${formatPathNumber(numberAttr(item.b))} ${formatPathNumber(numberAttr(item.c))} ${formatPathNumber(numberAttr(item.d))} ${formatPathNumber(numberAttr(item.e))} ${formatPathNumber(numberAttr(item.f))})`;
    if (item.type === "rotate") {
      return item.cx == null || item.cy == null
        ? `rotate(${formatPathNumber(numberAttr(item.angle))})`
        : `rotate(${formatPathNumber(numberAttr(item.angle))} ${formatPathNumber(numberAttr(item.cx))} ${formatPathNumber(numberAttr(item.cy))})`;
    }
    return "";
  }).filter(Boolean).join(" ");
}

function clipRectForAttrs(attrs: Record<string, unknown>, clips: Map<string, ClipRect>): ClipRect | undefined {
  const value = attrs["clip-path"] ?? attrs.clipPath;
  if (typeof value !== "string") return undefined;
  const match = value.match(/url\(#([^)]+)\)/);
  return match ? clips.get(match[1]) : undefined;
}

function applyClipRect(
  page: PDFPage,
  object: GraphSXObject,
  rect: ClipRect,
  pageHeight: number,
  scale: number,
  offsetX: number,
  offsetY: number
): void {
  page.pushOperators(
    rectangle(
      object.x + offsetX + rect.x * scale,
      pageHeight - object.y - offsetY - (rect.y + rect.height) * scale,
      rect.width * scale,
      rect.height * scale
    ),
    clip(),
    endPath()
  );
}

function parseDashArray(value: unknown, scale: number): number[] | undefined {
  if (typeof value !== "string" || !value.trim() || value === "none") return undefined;
  const values = value
    .split(/[\s,]+/)
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item) && item >= 0)
    .map((item) => item * scale);
  return values.length ? values : undefined;
}

function roundedRectPath(x: number, y: number, width: number, height: number, radius: number): string {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  return [
    "M", formatPathNumber(x + r), formatPathNumber(y),
    "H", formatPathNumber(x + width - r),
    "Q", formatPathNumber(x + width), formatPathNumber(y), formatPathNumber(x + width), formatPathNumber(y + r),
    "V", formatPathNumber(y + height - r),
    "Q", formatPathNumber(x + width), formatPathNumber(y + height), formatPathNumber(x + width - r), formatPathNumber(y + height),
    "H", formatPathNumber(x + r),
    "Q", formatPathNumber(x), formatPathNumber(y + height), formatPathNumber(x), formatPathNumber(y + height - r),
    "V", formatPathNumber(y + r),
    "Q", formatPathNumber(x), formatPathNumber(y), formatPathNumber(x + r), formatPathNumber(y),
    "Z"
  ].join(" ");
}

function dominantBaselineToOffset(value: unknown, fontSize: number): number {
  if (value === "middle" || value === "central") return fontSize * 0.35;
  if (value === "hanging" || value === "text-before-edge") return fontSize * 0.8;
  return 0;
}

function transformTranslation(value: unknown): { x: number; y: number } {
  if (typeof value !== "string") return { x: 0, y: 0 };
  let x = 0;
  let y = 0;
  for (const match of value.matchAll(/translate\(\s*([-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?)\s*(?:[,\s]\s*([-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?))?\s*\)/gi)) {
    x += Number(match[1]) || 0;
    y += Number(match[2]) || 0;
  }
  for (const match of value.matchAll(/matrix\(\s*([-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?)\s*[,\s]\s*([-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?)\s*[,\s]\s*([-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?)\s*[,\s]\s*([-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?)\s*[,\s]\s*([-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?)\s*[,\s]\s*([-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?)\s*\)/gi)) {
    x += Number(match[5]) || 0;
    y += Number(match[6]) || 0;
  }
  return { x, y };
}

function drawPathMarker(
  page: PDFPage,
  attrs: Record<string, unknown>,
  originX: number,
  originY: number,
  scale: number,
  color: ReturnType<typeof hexToRgb>
): void {
  if (typeof attrs["marker-end"] === "string") {
    const endpoint = pathEndpointAndTangent(String(attrs.d ?? ""));
    if (!endpoint) return;
    const markerSize = markerSizeFromUrl(attrs["marker-end"]) * numberAttr(attrs["stroke-width"], 1);
    const d = arrowHeadPath(endpoint.x, endpoint.y, endpoint.dx, endpoint.dy, markerSize);
    page.drawSvgPath(d, {
      x: originX,
      y: originY,
      scale,
      color,
      borderColor: undefined,
      borderWidth: 0
    });
  }
}

function markerSizeFromUrl(value: unknown): number {
  if (typeof value !== "string") return 12;
  const match = value.match(/graphsx-arrow-head(?:-([0-9_]+))?/);
  if (!match?.[1]) return 12;
  const size = Number(match[1].replace(/_/g, "."));
  return Number.isFinite(size) && size > 0 ? size : 12;
}

function markerKey(size: number): string {
  return String(Number(size.toFixed(3))).replace(/[^0-9A-Za-z_-]/g, "_");
}

function arrowHeadPath(x: number, y: number, dx: number, dy: number, size: number): string {
  const length = Math.hypot(dx, dy) || 1;
  const ux = dx / length;
  const uy = dy / length;
  const px = -uy;
  const py = ux;
  const baseX = x - ux * (size * 2 / 3);
  const baseY = y - uy * (size * 2 / 3);
  const half = size / 3;
  return [
    "M", formatPathNumber(x), formatPathNumber(y),
    "L", formatPathNumber(baseX + px * half), formatPathNumber(baseY + py * half),
    "L", formatPathNumber(baseX - px * half), formatPathNumber(baseY - py * half),
    "Z"
  ].join(" ");
}

function pathEndpointAndTangent(path: string): { x: number; y: number; dx: number; dy: number } | undefined {
  const tokens = path.match(/[a-zA-Z]|[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/gi) ?? [];
  let command = "";
  let index = 0;
  let current = { x: 0, y: 0 };
  let start = { x: 0, y: 0 };
  let tangent = { dx: 1, dy: 0 };

  const read = () => Number(tokens[index++]);
  const hasNumber = () => index < tokens.length && !/^[a-zA-Z]$/.test(tokens[index]);
  const point = (relative: boolean) => {
    const x = read();
    const y = read();
    return relative ? { x: current.x + x, y: current.y + y } : { x, y };
  };

  while (index < tokens.length) {
    if (/^[a-zA-Z]$/.test(tokens[index])) command = tokens[index++];
    const upper = command.toUpperCase();
    const relative = command !== upper;

    if (upper === "M") {
      if (!hasNumber()) continue;
      current = point(relative);
      start = current;
      while (hasNumber()) {
        const previous = current;
        current = point(relative);
        tangent = { dx: current.x - previous.x, dy: current.y - previous.y };
      }
      continue;
    }

    while (hasNumber()) {
      const previous = current;
      if (upper === "L") {
        current = point(relative);
        tangent = { dx: current.x - previous.x, dy: current.y - previous.y };
      } else if (upper === "H") {
        const value = read();
        current = { x: relative ? current.x + value : value, y: current.y };
        tangent = { dx: current.x - previous.x, dy: 0 };
      } else if (upper === "V") {
        const value = read();
        current = { x: current.x, y: relative ? current.y + value : value };
        tangent = { dx: 0, dy: current.y - previous.y };
      } else if (upper === "Q") {
        const control = point(relative);
        current = point(relative);
        tangent = { dx: current.x - control.x, dy: current.y - control.y };
      } else if (upper === "C") {
        point(relative);
        const control = point(relative);
        current = point(relative);
        tangent = { dx: current.x - control.x, dy: current.y - control.y };
      } else if (upper === "S") {
        const control = point(relative);
        current = point(relative);
        tangent = { dx: current.x - control.x, dy: current.y - control.y };
      } else if (upper === "T") {
        current = point(relative);
        tangent = { dx: current.x - previous.x, dy: current.y - previous.y };
      } else if (upper === "A") {
        read();
        read();
        read();
        read();
        read();
        current = point(relative);
        tangent = { dx: current.x - previous.x, dy: current.y - previous.y };
      } else if (upper === "Z") {
        current = start;
        tangent = { dx: current.x - previous.x, dy: current.y - previous.y };
        break;
      } else {
        index += 1;
      }
    }
  }

  return { x: current.x, y: current.y, ...tangent };
}

function formatPathNumber(value: number): string {
  return Number(value.toFixed(4)).toString();
}
