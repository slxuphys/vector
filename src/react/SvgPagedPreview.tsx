import { useEffect, useMemo, useRef } from "react";
import type { PagedDisplayList } from "../core/display-list/displayTypes";
import { PageViewport } from "./PageViewport";

export type SvgPagedPreviewProps = {
  layout: PagedDisplayList;
  zoom?: number | "fit-width";
  currentPage?: number;
  overscanPages?: number;
  timingLabel?: string;
};

export function SvgPagedPreview({
  layout,
  zoom = 1,
  currentPage,
  overscanPages = 2,
  timingLabel
}: SvgPagedPreviewProps) {
  const numericZoom = zoom === "fit-width" ? 1 : zoom;
  const start = currentPage === undefined ? 0 : Math.max(0, currentPage - overscanPages);
  const end = currentPage === undefined
    ? layout.pages.length
    : Math.min(layout.pages.length, currentPage + overscanPages + 1);
  const renderIdRef = useRef(0);
  const renderLabel = useMemo(() => {
    renderIdRef.current += 1;
    return timingLabel ? `${timingLabel}#${renderIdRef.current}` : undefined;
  }, [layout, timingLabel]);

  if (renderLabel) console.time(renderLabel);

  useEffect(() => {
    if (!renderLabel) return;
    requestAnimationFrame(() => {
      console.timeEnd(renderLabel);
    });
  }, [renderLabel]);

  return (
    <div className="svg-md-preview" data-page-count={layout.pages.length}>
      {layout.pages.slice(start, end).map((page) => (
        <PageViewport key={page.index} page={page} zoom={numericZoom} timingLabel={renderLabel} />
      ))}
    </div>
  );
}
