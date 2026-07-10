import type { PagedDisplayList } from "../../core/display-list/displayTypes";
import { findSourceAnchor } from "../../core/source/sourceMap";

export function previewScrollTopForSource(
  layout: PagedDisplayList,
  offset: number,
  zoom: number,
  viewportHeight: number,
  pageGap = 24
): { key: string; top: number; source: { start: number; end: number } } | undefined {
  const anchor = findSourceAnchor(layout, offset);
  if (!anchor) return undefined;
  const pageStride = layout.page.height * zoom + pageGap;
  return {
    key: `${anchor.source.start}:${anchor.source.end}:${anchor.page}:${Math.round(anchor.y)}`,
    top: Math.max(0, anchor.page * pageStride + anchor.y * zoom - viewportHeight * 0.35),
    source: anchor.source
  };
}
