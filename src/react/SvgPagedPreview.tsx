import { useEffect, useMemo, useRef } from "react";
import type { PagedDisplayList } from "../core/display-list/displayTypes";
import { renderPageToSvg } from "../core/renderers/svg/renderPageToSvg";
import { debugLog, isDebugLogEnabled } from "../core/utils/debugSettings";
import { PageViewport } from "./PageViewport";
import type { CompletedPreviewUpdateTiming } from "./useDocumentLayout";

export type SvgPagedPreviewProps = {
  layout: PagedDisplayList;
  zoom?: number | "fit-width";
  currentPage?: number;
  overscanPages?: number;
  renderAllPages?: boolean;
  timing?: CompletedPreviewUpdateTiming;
  onSourceClick?: (source: { start: number; end: number }) => void;
  onInternalLinkClick?: (id: string) => void;
  sourceHighlight?: { start: number; end: number; id: number };
};

export function SvgPagedPreview({
  layout,
  zoom = 1,
  currentPage,
  overscanPages = 2,
  renderAllPages = false,
  timing,
  onSourceClick,
  onInternalLinkClick,
  sourceHighlight
}: SvgPagedPreviewProps) {
  const numericZoom = zoom === "fit-width" ? 1 : zoom;
  const start = renderAllPages || currentPage === undefined ? 0 : Math.max(0, currentPage - overscanPages);
  const end = renderAllPages || currentPage === undefined
    ? layout.pages.length
    : Math.min(layout.pages.length, currentPage + overscanPages + 1);
  const renderIdRef = useRef(0);
  const visiblePages = useMemo(() => {
    const startedAt = performance.now();
    const pages = layout.pages.map((page, index) => {
      if (index < start || index >= end) return undefined;
      return {
        page,
        svg: renderPageToSvg(page, {
          className: "svg-md-page-svg",
          includeFontCss: false
        })
      };
    });
    const finishedAt = performance.now();
    renderIdRef.current += 1;
    return {
      id: renderIdRef.current,
      startedAt,
      finishedAt,
      svgStringMs: finishedAt - startedAt,
      svgBytes: pages.reduce((sum, entry) => sum + (entry?.svg.length ?? 0), 0),
      pages
    };
  }, [layout, start, end]);
  const loggedUpdateIdRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!timing) return;
    if (!isDebugLogEnabled("preview")) return;
    if (loggedUpdateIdRef.current === timing.id) return;
    loggedUpdateIdRef.current = timing.id;
    requestAnimationFrame(() => {
      const paintedAt = performance.now();
      const renderMs = paintedAt - visiblePages.startedAt;
      const paintMs = paintedAt - visiblePages.finishedAt;
      const totalMs = timing.debounceMs + timing.layoutDelayMs + timing.layoutMs + renderMs;
      debugLog(
        "preview",
        `[preview-update] total ${totalMs.toFixed(1)} ms`,
        {
          update: timing.id,
          debounceMs: round(timing.debounceMs),
          layoutDelayMs: round(timing.layoutDelayMs),
          layoutMs: round(timing.layoutMs),
          renderMs: round(renderMs),
          svgStringMs: round(visiblePages.svgStringMs),
          paintMs: round(paintMs),
          svgKB: round(visiblePages.svgBytes / 1024),
          pageSvgKB: visiblePages.pages
            .map((entry, index) => entry ? { page: index, kb: round(entry.svg.length / 1024) } : undefined)
            .filter(Boolean),
          totalPages: layout.pages.length,
          renderedPages: end - start
        }
      );
    });
  }, [end, layout.pages.length, start, timing, visiblePages]);

  return (
    <div className="svg-md-preview" data-page-count={layout.pages.length}>
      {layout.pages.map((page, index) => (
        index >= start && index < end
          ? <PageViewport key={page.index} page={page} svg={visiblePages.pages[index]?.svg ?? ""} zoom={numericZoom} onSourceClick={onSourceClick} onInternalLinkClick={onInternalLinkClick} sourceHighlight={sourceHighlight} />
          : (
            <div
              key={page.index}
              className="svg-md-page-item"
              aria-hidden="true"
              style={{
                width: page.width * numericZoom,
                height: page.height * numericZoom,
                position: "relative"
              }}
            >
              <div className="svg-md-page-placeholder" style={{ width: "100%", height: "100%" }} />
              <div className="svg-md-page-number">{page.index + 1}</div>
            </div>
          )
      ))}
    </div>
  );
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
