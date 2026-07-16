import type { MathMeasurement, MathMeasureRequest } from "../layout/mathMetrics";
import type { MathRendererName } from "./engineTypes";
import {
  getDefaultOpenMathMetricsForProfile,
  layoutNativeMath,
  nativeMathProfileForRenderer
} from "../renderers/math/nativeMath";
import { loadNativeMathFonts } from "../renderers/math/nativeFontMetrics";
import { getOpenMathFontProfile, openMathFontFaceCss } from "../renderers/math/openMathFont";

const openMathFontStyleIds = new Set<string>();

export async function measureMathInDom(
  requests: MathMeasureRequest[],
  renderer: MathRendererName = "native-openmath"
): Promise<Record<string, MathMeasurement>> {
  return measureNativeMath(requests, renderer);
}

async function measureNativeMath(requests: MathMeasureRequest[], renderer: MathRendererName): Promise<Record<string, MathMeasurement>> {
  const measurements: Record<string, MathMeasurement> = {};
  await loadNativeMathFonts();
  await waitForOpenMathFonts(requests);
  for (const request of requests) {
    const profile = request.nativeMathProfile ?? nativeMathProfileForRenderer(renderer);
    const fallbackMetrics = getDefaultOpenMathMetricsForProfile(profile);
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

async function waitForOpenMathFonts(requests: MathMeasureRequest[]): Promise<void> {
  if (typeof document === "undefined" || !document.fonts) return;
  const fontLoads = requests.map((request) => {
    const profileName = request.nativeMathProfile === "openmath-libertinus"
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

function ensureOpenMathFontFace(profileName: "latin-modern" | "libertinus"): void {
  if (openMathFontStyleIds.has(profileName)) return;
  openMathFontStyleIds.add(profileName);
  const style = document.createElement("style");
  style.textContent = openMathFontFaceCss(profileName);
  document.head.appendChild(style);
}
