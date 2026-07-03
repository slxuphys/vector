import { useEffect, useMemo, useRef } from "react";
import type { PagedDisplayList } from "../core/display-list/displayTypes";
import { isDebugLogEnabled } from "../core/utils/debugSettings";
import { PageViewport } from "./PageViewport";
import type { CompletedPreviewUpdateTiming } from "./useDocumentLayout";

export type SvgPagedPreviewProps = {
  layout: PagedDisplayList;
  zoom?: number | "fit-width";
  currentPage?: number;
  overscanPages?: number;
  renderAllPages?: boolean;
  timing?: CompletedPreviewUpdateTiming;
};

export function SvgPagedPreview({
  layout,
  zoom = 1,
  currentPage,
  overscanPages = 2,
  renderAllPages = false,
  timing
}: SvgPagedPreviewProps) {
  const numericZoom = zoom === "fit-width" ? 1 : zoom;
  const start = renderAllPages || currentPage === undefined ? 0 : Math.max(0, currentPage - overscanPages);
  const end = renderAllPages || currentPage === undefined
    ? layout.pages.length
    : Math.min(layout.pages.length, currentPage + overscanPages + 1);
  const renderIdRef = useRef(0);
  const refresh = useMemo(() => {
    renderIdRef.current += 1;
    return {
      id: renderIdRef.current,
      startedAt: performance.now()
    };
  }, [layout, numericZoom, start, end]);

  useEffect(() => {
    if (!timing) return;
    if (!isDebugLogEnabled("preview")) return;
    requestAnimationFrame(() => {
      const paintedAt = performance.now();
      const renderMs = paintedAt - refresh.startedAt;
      const totalMs = paintedAt - timing.editedAt;
      console.log(
        `[preview-update] total ${totalMs.toFixed(1)} ms`,
        {
          update: timing.id,
          debounceMs: round(timing.debounceMs),
          layoutDelayMs: round(timing.layoutDelayMs),
          layoutMs: round(timing.layoutMs),
          renderMs: round(renderMs),
          totalPages: layout.pages.length,
          renderedPages: end - start
        }
      );
    });
  }, [end, layout.pages.length, refresh, start, timing]);

  return (
    <div className="svg-md-preview" data-page-count={layout.pages.length}>
      {layout.pages.map((page, index) => (
        index >= start && index < end
          ? <PageViewport key={page.index} page={page} zoom={numericZoom} />
          : (
            <div
              key={page.index}
              className="svg-md-page-placeholder"
              aria-hidden="true"
              style={{
                width: page.width * numericZoom,
                height: page.height * numericZoom
              }}
            />
          )
      ))}
    </div>
  );
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
