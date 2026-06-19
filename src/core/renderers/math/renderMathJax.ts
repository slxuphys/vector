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
  const body = svg.innerHTML;
  const artifact = buildArtifact(viewBox, body, fontSize, color);
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

function buildArtifact(viewBox: string, body: string, fontSize: number, color: string): MathJaxSvgArtifact {
  const [, minY, viewWidth, viewHeight] = viewBox.split(/\s+/).map(Number);
  const safeWidth = Number.isFinite(viewWidth) && viewWidth > 0 ? viewWidth : 1000;
  const safeHeight = Number.isFinite(viewHeight) && viewHeight > 0 ? viewHeight : 1000;
  const safeMinY = Number.isFinite(minY) ? minY : -safeHeight;
  const width = Math.max(1, safeWidth / 1000 * fontSize);
  const height = Math.max(fontSize * 1.2, safeHeight / 1000 * fontSize);
  const baseline = Math.max(0, -safeMinY / 1000 * fontSize);
  const coloredBody = color === "#000000" ? body : `<g fill="${escapeAttr(color)}">${body}</g>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${viewBox}">${coloredBody}</svg>`;
  return { svg, body: coloredBody, viewBox, width, height, baseline };
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
