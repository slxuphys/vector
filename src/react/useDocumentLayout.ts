import { useEffect, useMemo, useState } from "react";
import {
  collectPreparedMathRequests,
  finishMarkdownLayout,
  prepareMarkdownLayout
} from "../core/engine/createDocumentEngine";
import { createWorkerClient } from "../core/engine/workerClient";
import { measureMathInDom } from "../core/engine/measureMathInDom";
import type { EngineOptions } from "../core/engine/workerProtocol";
import type { PagedDisplayList, PreviewStats } from "../core/display-list/displayTypes";

export type DocumentLayoutState = {
  layout?: PagedDisplayList;
  stats?: PreviewStats;
  error?: Error;
  loading: boolean;
};

export function useDocumentLayout(markdown: string, options: EngineOptions = {}): DocumentLayoutState {
  const [state, setState] = useState<DocumentLayoutState>({ loading: true });
  const workerEnabled = options.useWorker !== false && typeof Worker !== "undefined";
  const engine = useMemo(
    () => (workerEnabled ? createWorkerClient(options) : {
      layout(markdownToLayout: string) {
        return layoutWithDomMeasurements(markdownToLayout, options);
      }
    }),
    [workerEnabled, options.pageSize, options.margin, options.theme]
  );

  useEffect(() => {
    let cancelled = false;
    setState((current) => ({ ...current, loading: true, error: undefined }));
    const timeout = window.setTimeout(() => {
      const workerLayout = engine.layout(markdown);
      const layoutPromise = workerEnabled
        ? Promise.race([
            workerLayout,
            new Promise<never>((_, reject) => {
              window.setTimeout(() => reject(new Error("Layout worker timed out")), 1000);
            })
          ])
        : workerLayout;

      layoutPromise
        .then((result) => {
          if (!cancelled) setState({ ...result, loading: false });
        })
        .catch((error: Error) => {
          if (cancelled) return;
          if (workerEnabled) {
            console.warn("[layout-worker-fallback]", error.message);
            layoutWithDomMeasurements(markdown, options)
              .then((result) => {
                if (!cancelled) setState({ ...result, loading: false });
              })
              .catch((fallbackError: Error) => {
                if (!cancelled) setState({ error: fallbackError, loading: false });
              });
            return;
          }
          setState({ error, loading: false });
        });
    }, 80);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [engine, markdown]);

  useEffect(() => {
    return () => {
      if (hasDispose(engine)) engine.dispose();
    };
  }, [engine]);

  return state;
}

async function layoutWithDomMeasurements(
  markdown: string,
  options: EngineOptions
): Promise<{ layout: PagedDisplayList; stats: PreviewStats }> {
  const prepared = prepareMarkdownLayout(markdown, options);
  const requests = collectPreparedMathRequests(prepared);
  const measurements = await measureMathInDom(requests);
  return finishMarkdownLayout(prepared, measurements);
}

function hasDispose(value: unknown): value is { dispose: () => void } {
  return typeof value === "object" && value !== null && "dispose" in value && typeof value.dispose === "function";
}
