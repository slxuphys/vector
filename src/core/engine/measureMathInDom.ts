import type { MathMeasurement, MathMeasureRequest } from "../layout/mathMetrics";
import type { MathRendererName } from "./workerProtocol";
import { renderMathJaxSvgArtifact } from "../renderers/math/renderMathJax";
import { renderKatex } from "../renderers/math/renderKatex";
import { katexCssWithInlineFonts } from "../renderers/math/katexFontCss";
import {
  defaultNativeMathMetrics,
  getDefaultOpenMathMetricsForProfile,
  isNativeMathRenderer,
  layoutNativeMath,
  nativeMathProfileForRenderer
} from "../renderers/math/nativeMath";
import { loadNativeMathFonts } from "../renderers/math/nativeFontMetrics";
import { getOpenMathFontProfile, openMathFontFaceCss } from "../renderers/math/openMathFont";
import { isDebugLogEnabled } from "../utils/debugSettings";

let root: HTMLDivElement | undefined;
const loadedFontSizes = new Set<number>();
const measurementCache = new Map<string, MathMeasurement>();
const openMathFontStyleIds = new Set<string>();
const browserMeasureLogKeys = new Set<string>();

export async function measureMathInDom(
  requests: MathMeasureRequest[],
  renderer: MathRendererName = "katex-raster"
): Promise<Record<string, MathMeasurement>> {
  if (isNativeMathRenderer(renderer)) return measureNativeMath(requests, renderer);
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
    node.style.display = request.displayMode ? "inline-flex" : "inline-block";
    node.style.alignItems = request.displayMode ? "center" : "";
    node.style.justifyContent = request.displayMode ? "center" : "";
    node.style.lineHeight = "normal";
    node.innerHTML = `${renderKatex(request.latex, request.displayMode)}${request.displayMode ? "" : '<span class="svg-md-baseline-marker"></span>'}`;
    container.appendChild(node);

    const mathNode = node.querySelector(".katex, .katex-display") ?? node;
    logBrowserMathMeasurement("katex-dom", request);
    const rect = mathNode.getBoundingClientRect();
    const wrapperRect = node.getBoundingClientRect();
    const marker = node.querySelector(".svg-md-baseline-marker");
    const markerRect = marker?.getBoundingClientRect();
    const width = Math.ceil(rect.width * 100) / 100;
    const height = Math.ceil(rect.height * 100) / 100;
    const measurement = {
      width: width + 1,
      height: Math.max(height, request.fontSize * 1.2),
      advance: width,
      baseline: markerRect ? markerRect.top - wrapperRect.top : undefined
    };
    measurementCache.set(request.key, measurement);
    measurements[request.key] = measurement;
    node.remove();
  }

  return measurements;
}

async function measureNativeMath(requests: MathMeasureRequest[], renderer: MathRendererName): Promise<Record<string, MathMeasurement>> {
  const measurements: Record<string, MathMeasurement> = {};
  await loadNativeMathFonts();
  await waitForOpenMathFonts(requests, renderer);
  for (const request of requests) {
    const profile = request.nativeMathProfile ?? nativeMathProfileForRenderer(renderer);
    const fallbackMetrics = renderer === "native-openmath"
      ? getDefaultOpenMathMetricsForProfile(profile)
      : defaultNativeMathMetrics;
    const layout = layoutNativeMath(request.latex, request.displayMode, request.fontSize, request.nativeMetrics ?? fallbackMetrics, profile);
    measurements[request.key] = {
      width: layout.width,
      height: layout.height,
      advance: layout.advance,
      baseline: layout.baseline,
      nativeLayout: layout
    };
  }
  return measurements;
}

async function waitForOpenMathFonts(requests: MathMeasureRequest[], renderer: MathRendererName): Promise<void> {
  if (renderer !== "native-openmath" || typeof document === "undefined" || !document.fonts) return;
  const fontLoads = requests.map((request) => {
    const profileName = request.nativeMathProfile === "openmath-new-computer-modern"
      ? "new-computer-modern"
      : request.nativeMathProfile === "openmath-libertinus"
        ? "libertinus"
        : "latin-modern";
    const profile = getOpenMathFontProfile(profileName);
    ensureOpenMathFontFace(profileName);
    return document.fonts.load(`${request.fontSize}px "${profile.family}"`);
  });
  await Promise.race([
    Promise.allSettled(fontLoads),
    new Promise((resolve) => window.setTimeout(resolve, 100))
  ]);
}

function ensureOpenMathFontFace(profileName: "latin-modern" | "libertinus" | "new-computer-modern"): void {
  if (openMathFontStyleIds.has(profileName)) return;
  openMathFontStyleIds.add(profileName);
  const style = document.createElement("style");
  style.textContent = openMathFontFaceCss(profileName);
  document.head.appendChild(style);
}

async function measureMathJax(requests: MathMeasureRequest[]): Promise<Record<string, MathMeasurement>> {
  const measurements: Record<string, MathMeasurement> = {};
  for (const request of requests) {
    logBrowserMathMeasurement("mathjax-svg-artifact", request);
    const artifact = await renderMathJaxSvgArtifact(request.latex, request.displayMode, request.fontSize, request.color);
    measurements[request.key] = {
      width: artifact.width,
      height: artifact.height,
      advance: artifact.width
    };
  }
  return measurements;
}

function logBrowserMathMeasurement(path: "katex-dom" | "mathjax-svg-artifact", request: MathMeasureRequest): void {
  if (!isDebugLogEnabled("math")) return;
  const normalized = request.latex.length > 80 ? `${request.latex.slice(0, 80)}...` : request.latex;
  const key = `${path}:${request.key}`;
  if (browserMeasureLogKeys.has(key)) return;
  browserMeasureLogKeys.add(key);
  if (browserMeasureLogKeys.size > 120) return;
  console.log("[math-browser-measure]", {
    path,
    latex: normalized,
    displayMode: request.displayMode,
    fontSize: request.fontSize
  });
}

async function waitForKatexFonts(fontSize: number): Promise<void> {
  if (typeof document === "undefined") return;
  if (!document.fonts) return;
  if (loadedFontSizes.has(fontSize)) return;
  loadedFontSizes.add(fontSize);

  const loads = [
    document.fonts.load(`${fontSize}px "KaTeX_Main"`),
    document.fonts.load(`${fontSize}px "KaTeX_Math"`),
    document.fonts.load(`${fontSize}px "KaTeX_Size1"`),
    document.fonts.load(`${fontSize}px "KaTeX_Size2"`),
    document.fonts.load(`${fontSize}px "KaTeX_Size3"`),
    document.fonts.load(`${fontSize}px "KaTeX_Size4"`)
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
.svg-md-katex-measure .katex{font-size:1em!important;}
.svg-md-katex-measure .katex-display{margin:0;}
.svg-md-katex-measure .svg-md-baseline-marker{display:inline-block;width:0;height:0;padding:0;margin:0;border:0;vertical-align:baseline;}
`;
  root.appendChild(style);
  document.body.appendChild(root);
  return root;
}
