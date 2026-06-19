import type { MathMeasurement, MathMeasureRequest } from "../layout/mathMetrics";
import type { MathRendererName } from "./workerProtocol";
import { renderMathJaxSvgArtifact } from "../renderers/math/renderMathJax";
import { renderKatex } from "../renderers/math/renderKatex";
import { katexCssWithInlineFonts } from "../renderers/math/katexFontCss";

let root: HTMLDivElement | undefined;
const loadedFontSizes = new Set<number>();
const measurementCache = new Map<string, MathMeasurement>();

export async function measureMathInDom(
  requests: MathMeasureRequest[],
  renderer: MathRendererName = "katex-raster"
): Promise<Record<string, MathMeasurement>> {
  if (renderer === "mathjax-vector" || renderer === "mathjax-glyph") return measureMathJax(requests);
  if (typeof document === "undefined") return {};

  const container = getRoot();
  const measurements: Record<string, MathMeasurement> = {};

  for (const request of requests) {
    const cached = measurementCache.get(request.key);
    if (cached) {
      measurements[request.key] = cached;
      continue;
    }

    await waitForKatexFonts(request.fontSize);
    const node = document.createElement("div");
    node.className = "svg-md-katex-measure";
    node.style.fontSize = `${request.fontSize}px`;
    node.style.color = request.color;
    node.style.display = "inline-flex";
    node.style.alignItems = request.displayMode ? "center" : "flex-start";
    node.style.justifyContent = request.displayMode ? "center" : "flex-start";
    node.style.lineHeight = "normal";
    node.innerHTML = renderKatex(request.latex, request.displayMode);
    container.appendChild(node);

    const rect = node.getBoundingClientRect();
    const width = Math.ceil(rect.width * 100) / 100;
    const height = Math.ceil(rect.height * 100) / 100;
    const measurement = {
      width: width + 1,
      height: Math.max(height, request.fontSize * 1.2),
      advance: width
    };
    measurementCache.set(request.key, measurement);
    measurements[request.key] = measurement;
    node.remove();
  }

  return measurements;
}

async function measureMathJax(requests: MathMeasureRequest[]): Promise<Record<string, MathMeasurement>> {
  const measurements: Record<string, MathMeasurement> = {};
  for (const request of requests) {
    const artifact = await renderMathJaxSvgArtifact(request.latex, request.displayMode, request.fontSize, request.color);
    measurements[request.key] = {
      width: artifact.width,
      height: artifact.height,
      advance: artifact.width
    };
  }
  return measurements;
}

async function waitForKatexFonts(fontSize: number): Promise<void> {
  if (!document.fonts) return;
  if (loadedFontSizes.has(fontSize)) return;
  loadedFontSizes.add(fontSize);

  const loads = [
    document.fonts.load(`${fontSize}px "KaTeX_Main"`),
    document.fonts.load(`${fontSize}px "KaTeX_Math"`),
    document.fonts.load(`${fontSize}px "KaTeX_Size1"`),
    document.fonts.load(`${fontSize}px "KaTeX_Size2"`)
  ];
  await Promise.race([
    Promise.allSettled(loads),
    new Promise((resolve) => window.setTimeout(resolve, 100))
  ]);
}

function getRoot(): HTMLDivElement {
  if (root) return root;

  root = document.createElement("div");
  root.setAttribute("aria-hidden", "true");
  root.style.position = "absolute";
  root.style.left = "-10000px";
  root.style.top = "0";
  root.style.visibility = "hidden";
  root.style.pointerEvents = "none";
  root.style.whiteSpace = "nowrap";

  const style = document.createElement("style");
  style.textContent = `${katexCssWithInlineFonts}
.svg-md-katex-measure .katex-display{margin:0;}
`;
  root.appendChild(style);
  document.body.appendChild(root);
  return root;
}
