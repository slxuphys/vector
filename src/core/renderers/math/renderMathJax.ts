import mathJaxBundle from "mathjax-full/es5/tex-svg-full.js?raw";

export type MathJaxSvgArtifact = {
  svg: string;
  body: string;
  viewBox: string;
  width: number;
  height: number;
  baseline: number;
};

type MathJaxGlobal = {
  startup: { promise: Promise<void> };
  tex2svg(latex: string, options: { display: boolean }): HTMLElement;
};

const artifactCache = new Map<string, MathJaxSvgArtifact>();
let mathJaxPromise: Promise<MathJaxGlobal> | undefined;
let measureRoot: HTMLDivElement | undefined;

export async function renderMathJaxSvgArtifact(
  latex: string,
  displayMode: boolean,
  fontSize: number,
  color: string
): Promise<MathJaxSvgArtifact> {
  const key = cacheKey(latex, displayMode, fontSize, color);
  const cached = artifactCache.get(key);
  if (cached) return cached;

  const mathJax = await ensureMathJax();
  const node = mathJax.tex2svg(latex, { display: displayMode });
  const svg = node.querySelector("svg");
  if (!svg) return fallbackArtifact(latex, fontSize, color);

  const viewBox = svg.getAttribute("viewBox") ?? "0 0 1000 1000";
  const verticalAlign = parseVerticalAlign(svg.getAttribute("style") ?? "", fontSize);
  const measuredBaseline = displayMode ? undefined : measureMathJaxBaseline(node);
  const body = svg.innerHTML;
  const artifact = buildArtifact(viewBox, body, fontSize, color, verticalAlign, measuredBaseline);
  artifactCache.set(key, artifact);
  return artifact;
}

export function getCachedMathJaxSvgArtifact(
  latex: string,
  displayMode: boolean,
  fontSize: number,
  color: string
): MathJaxSvgArtifact {
  return artifactCache.get(cacheKey(latex, displayMode, fontSize, color)) ?? fallbackArtifact(latex, fontSize, color);
}

async function ensureMathJax(): Promise<MathJaxGlobal> {
  const existing = (globalThis as { MathJax?: MathJaxGlobal }).MathJax;
  if (existing?.tex2svg) return existing;
  if (mathJaxPromise) return mathJaxPromise;

  mathJaxPromise = new Promise((resolve, reject) => {
    if (typeof document === "undefined") {
      reject(new Error("MathJax SVG rendering requires a browser document"));
      return;
    }

    (globalThis as { MathJax?: unknown }).MathJax = {
      startup: { typeset: false },
      svg: { fontCache: "none" }
    };

    const script = document.createElement("script");
    script.textContent = mathJaxBundle;
    script.onload = () => {
      const mathJax = (globalThis as { MathJax?: MathJaxGlobal }).MathJax;
      if (!mathJax) {
        reject(new Error("MathJax did not initialize"));
        return;
      }
      mathJax.startup.promise.then(() => resolve(mathJax)).catch(reject);
    };
    script.onerror = () => reject(new Error("Could not load MathJax"));
    document.head.appendChild(script);
    script.onload?.(new Event("load"));
  });

  return mathJaxPromise;
}

function buildArtifact(
  viewBox: string,
  body: string,
  fontSize: number,
  color: string,
  verticalAlign?: number,
  measuredBaseline?: { baseline: number; height: number }
): MathJaxSvgArtifact {
  const [, minY, viewWidth, viewHeight] = viewBox.split(/\s+/).map(Number);
  const safeWidth = Number.isFinite(viewWidth) && viewWidth > 0 ? viewWidth : 1000;
  const safeHeight = Number.isFinite(viewHeight) && viewHeight > 0 ? viewHeight : 1000;
  const safeMinY = Number.isFinite(minY) ? minY : -safeHeight;
  const width = Math.max(1, safeWidth / 1000 * fontSize);
  const height = Math.max(fontSize * 1.2, safeHeight / 1000 * fontSize);
  const viewBoxBaseline = Math.max(0, -safeMinY / 1000 * fontSize);
  const styleBaseline = verticalAlign === undefined ? undefined : height + verticalAlign;
  const domBaseline = measuredBaseline && measuredBaseline.height > 0
    ? measuredBaseline.baseline * (height / measuredBaseline.height)
    : undefined;
  const baseline = domBaseline ?? Math.max(viewBoxBaseline, styleBaseline ?? 0);
  const coloredBody = color === "#000000" ? body : `<g fill="${escapeAttr(color)}">${body}</g>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${viewBox}">${coloredBody}</svg>`;
  return { svg, body: coloredBody, viewBox, width, height, baseline };
}

function measureMathJaxBaseline(node: HTMLElement): { baseline: number; height: number } | undefined {
  if (typeof document === "undefined") return undefined;

  const container = document.createElement("span");
  container.style.display = "inline";
  container.style.lineHeight = "normal";

  const marker = document.createElement("span");
  marker.style.display = "inline-block";
  marker.style.width = "0";
  marker.style.height = "0";
  marker.style.padding = "0";
  marker.style.margin = "0";
  marker.style.border = "0";
  marker.style.verticalAlign = "baseline";

  container.appendChild(node.cloneNode(true));
  container.appendChild(marker);
  getMeasureRoot().appendChild(container);

  const svg = container.querySelector("svg");
  const svgRect = svg?.getBoundingClientRect();
  const markerRect = marker.getBoundingClientRect();
  container.remove();

  if (!svgRect || svgRect.height <= 0) return undefined;
  const baseline = markerRect.top - svgRect.top;
  return Number.isFinite(baseline) && baseline > 0 ? { baseline, height: svgRect.height } : undefined;
}

function getMeasureRoot(): HTMLDivElement {
  if (measureRoot) return measureRoot;

  measureRoot = document.createElement("div");
  measureRoot.setAttribute("aria-hidden", "true");
  measureRoot.style.position = "absolute";
  measureRoot.style.left = "-10000px";
  measureRoot.style.top = "0";
  measureRoot.style.visibility = "hidden";
  measureRoot.style.pointerEvents = "none";
  measureRoot.style.whiteSpace = "nowrap";
  document.body.appendChild(measureRoot);
  return measureRoot;
}

function parseVerticalAlign(style: string, fontSize: number): number | undefined {
  const match = style.match(/vertical-align:\s*([-+]?\d*\.?\d+)(e[mx]|px)/);
  if (!match) return undefined;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return undefined;
  if (match[2] === "px") return value;
  return value * 0.5 * fontSize;
}

function fallbackArtifact(latex: string, fontSize: number, color: string): MathJaxSvgArtifact {
  const width = Math.max(fontSize, latex.length * fontSize * 0.55);
  const height = fontSize * 1.4;
  const baseline = fontSize;
  const escaped = escapeText(latex);
  const body = `<text x="0" y="${baseline}" font-size="${fontSize}" fill="${escapeAttr(color)}">${escaped}</text>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`;
  return { svg, body, viewBox: `0 0 ${width} ${height}`, width, height, baseline };
}

function cacheKey(latex: string, displayMode: boolean, fontSize: number, color: string): string {
  return `${displayMode ? "display" : "inline"}:${fontSize.toFixed(2)}:${color}:${latex}`;
}

function escapeAttr(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("\"", "&quot;").replaceAll("<", "&lt;");
}

function escapeText(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
