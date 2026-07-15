import type { GraphSXDisplayItem, GraphSXDisplayList } from "@slxu/graphsx";
import { escapeXml } from "../../utils/sanitize";
import {
  getDefaultOpenMathMetricsForProfile,
  layoutNativeMath,
  renderNativeMathSvg
} from "../math/nativeMath";
import { getNativeMathProfile, type NativeMathFontProfileName } from "../math/nativeMathProfiles";

export function renderGraphSXDisplayListToSvg(
  displayList: GraphSXDisplayList,
  nativeMathProfile: NativeMathFontProfileName = "openmath"
): string {
  const fontFaceCss = getNativeMathProfile(nativeMathProfile).svgFontFaceCss;
  const fontFace = fontFaceCss ? `<style>${fontFaceCss}</style>` : "";
  const body = displayList.type !== "plot"
    ? [
        renderGraphArrowDefs(displayList),
        renderLayer(displayList, "edge", nativeMathProfile),
        renderLayer(displayList, "path", nativeMathProfile),
        renderLayer(displayList, "node", nativeMathProfile)
      ].join("")
    : [
        renderClipDefs(displayList),
        ...displayList.items.map((item) => renderItem(item, displayList, nativeMathProfile))
      ].join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${round(displayList.width)}" height="${round(displayList.height)}" viewBox="0 0 ${round(displayList.width)} ${round(displayList.height)}">${fontFace}${body}</svg>`;
}

export function renderGraphSXDisplayListBody(
  displayList: GraphSXDisplayList,
  nativeMathProfile: NativeMathFontProfileName = "openmath"
): string {
  return displayList.type !== "plot"
    ? [
        renderGraphArrowDefs(displayList),
        renderLayer(displayList, "edge", nativeMathProfile),
        renderLayer(displayList, "path", nativeMathProfile),
        renderLayer(displayList, "node", nativeMathProfile)
      ].join("")
    : [
        renderClipDefs(displayList),
        ...displayList.items.map((item) => renderItem(item, displayList, nativeMathProfile))
      ].join("");
}

function renderLayer(
  displayList: GraphSXDisplayList,
  layer: "edge" | "path" | "node",
  nativeMathProfile: NativeMathFontProfileName
): string {
  return `<g>${displayList.items.filter((item) => item.layer === layer).map((item) => renderItem(item, displayList, nativeMathProfile)).join("")}</g>`;
}

function renderItem(
  item: GraphSXDisplayItem | undefined,
  displayList?: GraphSXDisplayList,
  nativeMathProfile: NativeMathFontProfileName = "openmath"
): string {
  if (!item) return "";
  if (item.type === "plot" && item.displayList) {
    return `<svg ${attrsToString(displayPropsToSvgAttrs(itemDisplayProps(item), item.style, displayList))} viewBox="0 0 ${round(item.displayList.width)} ${round(item.displayList.height)}">${renderGraphSXDisplayListBody(item.displayList, nativeMathProfile)}</svg>`;
  }
  if (item.type === "element" && item.tag) {
    const children = item.children?.map((child) => renderItem(child, displayList, nativeMathProfile)).join("") ?? "";
    const text = item.text == null ? "" : escapeXml(String(item.text));
    return `<${item.tag}${attrsToString(displayPropsToSvgAttrs(itemDisplayProps(item), item.style, displayList))}>${text}${children}</${item.tag}>`;
  }
  if (item.type === "rect" || item.type === "circle" || item.type === "path") {
    return `<${item.type}${attrsToString(displayPropsToSvgAttrs(itemDisplayProps(item), item.style, displayList))}></${item.type}>`;
  }
  if (item.type === "text") {
    return renderTextItem(item);
  }
  if (item.type === "math") {
    return renderMathItem(item, nativeMathProfile);
  }
  return "";
}

function renderTextItem(item: GraphSXDisplayItem): string {
  const textStyle = item.textStyle ?? {};
  const attrs = displayPropsToSvgAttrs({
    class: item.className,
    x: item.x,
    y: item.y == null ? undefined : item.y + 4,
    textAnchor: item.anchor ?? "middle",
    fill: stringProp(textStyle.fill, "#111111"),
    fontSize: item.fontSize ?? numberProp(textStyle.fontSize, 12),
    fontFamily: stringProp(textStyle.fontFamily ?? textStyle["font-family"], "ui-sans-serif, system-ui, sans-serif"),
    fontWeight: textStyle.fontWeight ?? textStyle["font-weight"],
    fontStyle: textStyle.fontStyle ?? textStyle["font-style"]
  }, item.style);
  return `<text${attrsToString(attrs)}>${escapeXml(item.text ?? "")}</text>`;
}

function renderMathItem(item: GraphSXDisplayItem, nativeMathProfile: NativeMathFontProfileName): string {
  const source = item.source ?? item.fallback ?? "";
  const fontSize = item.fontSize ?? 12;
  const color = stringProp(item.textStyle?.fill ?? item.style?.fill, "#111111");
  const metrics = getDefaultOpenMathMetricsForProfile(nativeMathProfile);
  const layout = layoutNativeMath(source, false, fontSize, metrics, nativeMathProfile);
  const { x, y } = mathAnchorPosition(
    item,
    layout.width,
    layout.height,
    layout.baseline,
    layout.inkTop,
    layout.inkBottom
  );
  const svg = renderNativeMathSvg({
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
  }, { includeFontCss: false });
  return item.rotate ? `<g transform="rotate(${round(item.rotate)} ${round(item.x ?? x)} ${round(item.y ?? y)})">${svg}</g>` : svg;
}

function stringProp(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function anchorLeft(x: number, width: number, anchor: unknown): number {
  if (anchor === "start") return x;
  if (anchor === "end") return x - width;
  return x - width / 2;
}

function mathAnchorPosition(
  item: GraphSXDisplayItem,
  width: number,
  height: number,
  baseline: number,
  inkTop?: number,
  inkBottom?: number
): { x: number; y: number } {
  if (item.x == null || item.y == null) {
    return {
      x: item.left ?? 0,
      y: item.top ?? 0
    };
  }

  const x = anchorLeft(item.x, width, item.anchor);
  if (item.baseline === "hanging") return { x, y: item.y };
  if (item.baseline === "middle" || item.baseline === "central") {
    return { x, y: item.y - inkCenter(height, inkTop, inkBottom) };
  }
  if (item.baseline === "alphabetic") return { x, y: item.y - baseline };
  return { x, y: item.y - inkCenter(height, inkTop, inkBottom) };
}

function inkCenter(height: number, inkTop?: number, inkBottom?: number): number {
  return Number.isFinite(inkTop) && Number.isFinite(inkBottom)
    ? (Number(inkTop) + Number(inkBottom)) / 2
    : height / 2;
}

function renderGraphArrowDefs(displayList: GraphSXDisplayList): string {
  const markers = [...(displayList.arrowMarkers ?? [])];
  if (!markers.length) return "";
  return `<defs>${markers.map((key) => {
    const size = Number(String(key).replace(/_/g, ".")) || 12;
    return [
      renderArrowMarker("head", String(key), size),
      renderArrowMarker("tail", String(key), size)
    ].join("");
  }).join("")}</defs>`;
}

function renderClipDefs(displayList: GraphSXDisplayList): string {
  const clips = displayList.clips ?? [];
  if (!clips.length) return "";
  return `<defs>${clips.map((clip) => {
    if (clip.type !== "rect") return "";
    return `<clipPath id="${escapeXml(clip.id)}"><rect x="${round(clip.x)}" y="${round(clip.y)}" width="${round(clip.width)}" height="${round(clip.height)}"></rect></clipPath>`;
  }).join("")}</defs>`;
}

function renderArrowMarker(kind: "head" | "tail", key: string, size: number): string {
  const id = key === "12" ? `graphsx-arrow-${kind}` : `graphsx-arrow-${kind}-${key}`;
  const d = kind === "head"
    ? `M ${size / 6} ${size / 6} L ${size * 5 / 6} ${size / 2} L ${size / 6} ${size * 5 / 6} z`
    : `M ${size * 5 / 6} ${size / 6} L ${size / 6} ${size / 2} L ${size * 5 / 6} ${size * 5 / 6} z`;
  const refX = kind === "head" ? size * 5 / 6 : size / 6;
  return `<marker id="${escapeXml(id)}" markerWidth="${round(size)}" markerHeight="${round(size)}" refX="${round(refX)}" refY="${round(size / 2)}" orient="auto" markerUnits="strokeWidth"><path d="${escapeXml(d)}" fill="context-stroke"></path></marker>`;
}

function attrsToString(attrs: Record<string, unknown> | undefined): string {
  if (!attrs) return "";
  return Object.entries(attrs)
    .filter(([, value]) => value !== undefined && value !== null && value !== false)
    .map(([key, value]) => ` ${escapeXml(svgAttrName(key))}="${escapeXml(String(value))}"`)
    .join("");
}

function itemDisplayProps(item: GraphSXDisplayItem): Record<string, unknown> {
  return item.props ?? {};
}

function displayPropsToSvgAttrs(
  props: Record<string, unknown> | undefined,
  style: Record<string, unknown> | undefined,
  displayList?: GraphSXDisplayList
): Record<string, unknown> {
  const attrs: Record<string, unknown> = {};
  for (const [key, value] of Object.entries({ ...(props ?? {}), ...(style ?? {}) })) {
    if (value == null || value === false) continue;
    if (key === "headArrow" || key === "tailArrow" || key === "arrowSize") continue;
    if (key === "commands" && Array.isArray(value)) attrs.d = commandsToPathData(value);
    else if (key === "transform") attrs.transform = transformsToSvgTransform(value);
    else if (key === "clip" && typeof value === "object" && "id" in value) attrs["clip-path"] = `url(#${String(value.id)})`;
    else attrs[svgAttrName(key)] = value;
  }
  if (props?.tailArrow || props?.headArrow) {
    const key = arrowMarkerKey(numberProp(props.arrowSize, 12));
    if (props.tailArrow) attrs["marker-start"] = `url(#${arrowMarkerId("tail", key, displayList)})`;
    if (props.headArrow) attrs["marker-end"] = `url(#${arrowMarkerId("head", key, displayList)})`;
  }
  return attrs;
}

function svgAttrName(key: string): string {
  const rawSvgAttrs = new Set(["markerWidth", "markerHeight", "refX", "refY", "markerUnits", "viewBox"]);
  if (rawSvgAttrs.has(key)) return key;
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

function commandsToPathData(commands: unknown[]): string {
  return commands.map((command) => {
    if (!command || typeof command !== "object") return "";
    const item = command as Record<string, unknown>;
    if (item.op === "moveTo") return `M ${round(numberProp(item.x))} ${round(numberProp(item.y))}`;
    if (item.op === "lineTo") return `L ${round(numberProp(item.x))} ${round(numberProp(item.y))}`;
    if (item.op === "quadraticTo") return `Q ${round(numberProp(item.x1))} ${round(numberProp(item.y1))} ${round(numberProp(item.x))} ${round(numberProp(item.y))}`;
    if (item.op === "cubicTo") return `C ${round(numberProp(item.x1))} ${round(numberProp(item.y1))} ${round(numberProp(item.x2))} ${round(numberProp(item.y2))} ${round(numberProp(item.x))} ${round(numberProp(item.y))}`;
    if (item.op === "closePath") return "Z";
    return "";
  }).filter(Boolean).join(" ");
}

function transformsToSvgTransform(value: unknown): string {
  const transforms = Array.isArray(value) ? value : [value];
  return transforms.map((transform) => {
    if (!transform || typeof transform !== "object") return "";
    const item = transform as Record<string, unknown>;
    if (item.type === "translate") return `translate(${round(numberProp(item.x))} ${round(numberProp(item.y))})`;
    if (item.type === "matrix") return `matrix(${round(numberProp(item.a))} ${round(numberProp(item.b))} ${round(numberProp(item.c))} ${round(numberProp(item.d))} ${round(numberProp(item.e))} ${round(numberProp(item.f))})`;
    if (item.type === "rotate") {
      const angle = round(numberProp(item.angle));
      return item.cx == null || item.cy == null
        ? `rotate(${angle})`
        : `rotate(${angle} ${round(numberProp(item.cx))} ${round(numberProp(item.cy))})`;
    }
    return "";
  }).filter(Boolean).join(" ");
}

function arrowMarkerId(kind: "head" | "tail", key: string, displayList?: GraphSXDisplayList): string {
  if (displayList?.arrowMarkerPrefix) {
    return key === "12" ? `${displayList.arrowMarkerPrefix}-${kind}` : `${displayList.arrowMarkerPrefix}-${kind}-${key}`;
  }
  return key === "12" ? `graphsx-arrow-${kind}` : `graphsx-arrow-${kind}-${key}`;
}

function arrowMarkerKey(size: number): string {
  return String(Number(size.toFixed(3))).replace(/[^0-9A-Za-z_-]/g, "_");
}

function numberProp(value: unknown, fallback = 0): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function round(value: number): string {
  return Number(value.toFixed(3)).toString();
}
