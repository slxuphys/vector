import { useEffect, useMemo, useState } from "react";
import {
  collectPreparedMathRequests,
  finishMarkdownLayout,
  prepareMarkdownLayoutWithFonts,
  type PreparedLayout
} from "../core/engine/createDocumentEngine";
import { createWorkerClient } from "../core/engine/workerClient";
import { measureMathInDom } from "../core/engine/measureMathInDom";
import type { EngineOptions } from "../core/engine/workerProtocol";
import type { PagedDisplayList, PreviewStats } from "../core/display-list/displayTypes";
import type { MathMeasurementMap } from "../core/layout/mathMetrics";
import { clearTextMeasureCache } from "../core/layout/measureText";
import { defaultTheme } from "../core/theme/defaultTheme";
import {
  libertinusSerifFontFamily,
  latinModernRomanFontFamily,
  newComputerModernFontFamily
} from "../core/renderers/text/latinModernRomanFont";
import { loadTextFontsForTheme } from "../core/renderers/text/textFontMetrics";

export type DocumentLayoutState = {
  layout?: PagedDisplayList;
  stats?: PreviewStats;
  timing?: CompletedPreviewUpdateTiming;
  error?: Error;
  loading: boolean;
};

export type PreviewUpdateTiming = {
  id: number;
  editedAt: number;
  debounceFinishedAt: number;
  debounceMs: number;
};

export type CompletedPreviewUpdateTiming = PreviewUpdateTiming & {
  layoutQueuedAt: number;
  layoutStartedAt: number;
  layoutFinishedAt: number;
  layoutDelayMs: number;
  layoutMs: number;
};

export function useDocumentLayout(
  markdown: string,
  options: EngineOptions = {},
  timing?: PreviewUpdateTiming
): DocumentLayoutState {
  const [state, setState] = useState<DocumentLayoutState>({ loading: true });
  const workerEnabled = options.useWorker !== false && typeof Worker !== "undefined";
  const workerClient = useMemo(
    () => workerEnabled ? createWorkerClient(options) : undefined,
    [workerEnabled, options.sourceFormat, options.pageSize, options.margin, options.theme, options.mathRenderer, options.nativeMathMetrics, options.nativeMathProfile]
  );

  useEffect(() => {
    let cancelled = false;
    const layoutQueuedAt = performance.now();
    setState((current) => ({ ...current, loading: true, error: undefined }));
    const layoutStartedAt = performance.now();
    const layoutPromise = layoutWithPremeasuredMath(markdown, options, workerEnabled)
      .then(({ prepared, measurements, result }) => {
        if (!workerClient) return result ?? finishMarkdownLayout(prepared, measurements);
        return Promise.race([
          workerClient.layout(markdown, measurements),
          new Promise<never>((_, reject) => {
            window.setTimeout(() => reject(new Error("Layout worker timed out")), 500);
          })
        ]).catch(() => finishMarkdownLayout(prepared, measurements));
      });

    layoutPromise
      .then((result) => {
        if (!cancelled) setState({ ...result, timing: finishTiming(timing, layoutQueuedAt, layoutStartedAt), loading: false });
      })
      .catch((error: Error) => {
        if (cancelled) return;
        setState({ error, loading: false });
      });

    return () => {
      cancelled = true;
    };
  }, [workerClient, markdown, timing, options.sourceFormat, options.pageSize, options.margin, options.theme, options.mathRenderer, options.nativeMathMetrics, options.nativeMathProfile, workerEnabled]);

  useEffect(() => {
    return () => {
      workerClient?.dispose();
    };
  }, [workerClient]);

  return state;
}

function finishTiming(
  timing: PreviewUpdateTiming | undefined,
  layoutQueuedAt: number,
  layoutStartedAt: number
): CompletedPreviewUpdateTiming | undefined {
  if (!timing) return undefined;
  const layoutFinishedAt = performance.now();
  return {
    ...timing,
    layoutQueuedAt,
    layoutStartedAt,
    layoutFinishedAt,
    layoutDelayMs: layoutStartedAt - timing.debounceFinishedAt,
    layoutMs: layoutFinishedAt - layoutStartedAt
  };
}

async function layoutWithPremeasuredMath(
  markdown: string,
  options: EngineOptions,
  deferFinish: boolean
): Promise<{
  prepared: PreparedLayout;
  measurements: MathMeasurementMap;
  result?: { layout: PagedDisplayList; stats: PreviewStats };
}> {
  const prepared = await prepareMarkdownLayoutWithFonts(markdown, options);
  await waitForTextFonts(prepared);
  const requests = collectPreparedMathRequests(prepared);
  const measurements = await measureMathInDom(requests, prepared.mathRenderer);
  const result = deferFinish ? undefined : finishMarkdownLayout(prepared, measurements);
  return { prepared, measurements, result };
}

async function waitForTextFonts(prepared: PreparedLayout): Promise<void> {
  await loadTextFontsForTheme(prepared.theme);
  if (typeof document === "undefined" || !document.fonts) return;
  const fontFamily = prepared.theme.fontFamily;
  const installedFontFace = ensureDocumentFontFaceCss(prepared.theme.fontFaceCss);
  const openMathTextFamily = fontFamily?.includes(libertinusSerifFontFamily)
    ? libertinusSerifFontFamily
    : fontFamily?.includes(newComputerModernFontFamily)
      ? newComputerModernFontFamily
    : fontFamily?.includes(latinModernRomanFontFamily)
      ? latinModernRomanFontFamily
      : undefined;
  if (openMathTextFamily) {
    await Promise.race([
      Promise.allSettled([
        document.fonts.load(`12px "${openMathTextFamily}"`),
        document.fonts.load(`700 28px "${openMathTextFamily}"`),
        document.fonts.load(`italic 12px "${openMathTextFamily}"`),
        document.fonts.load(`700 italic 12px "${openMathTextFamily}"`)
      ]),
      new Promise((resolve) => window.setTimeout(resolve, 150))
    ]);
    if (installedFontFace) clearTextMeasureCache();
    return;
  }
  if (!fontFamily?.includes("KaTeX_Main")) return;
  await Promise.race([
    Promise.allSettled([
      document.fonts.load(`12px "KaTeX_Main"`),
      document.fonts.load(`700 28px "KaTeX_Main"`),
      document.fonts.load(`700 22px "KaTeX_Main"`)
    ]),
    new Promise((resolve) => window.setTimeout(resolve, 150))
  ]);
}

function ensureDocumentFontFaceCss(fontFaceCss: string | undefined): boolean {
  if (!fontFaceCss || typeof document === "undefined") return false;
  const id = `svg-md-font-face-${hashString(fontFaceCss)}`;
  if (document.getElementById(id)) return false;

  const style = document.createElement("style");
  style.id = id;
  style.textContent = fontFaceCss;
  document.head.appendChild(style);
  return true;
}

function hashString(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(31, hash) + value.charCodeAt(index) | 0;
  }
  return Math.abs(hash).toString(36);
}
