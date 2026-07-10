import type { DisplayObject, PagedDisplayList } from "../display-list/displayTypes";
import { sourceSpanContains, sourceSpanLength, type SourceSpan } from "./sourceTypes";

export type SourceAnchor = {
  source: SourceSpan;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

export function findSourceAnchor(layout: PagedDisplayList, offset: number): SourceAnchor | undefined {
  return findSourceAnchorInPages(layout.pages, offset);
}

export function findSourceAnchorInPages(layout: PagedDisplayList["pages"], offset: number): SourceAnchor | undefined {
  const anchors = collectSourceAnchorsFromPages(layout);
  const containing = anchors
    .filter((anchor) => sourceSpanContains(anchor.source, offset))
    .sort((left, right) => sourceSpanLength(left.source) - sourceSpanLength(right.source));
  if (containing.length) return containing[0];

  const following = anchors
    .filter((anchor) => anchor.source.start >= offset)
    .sort((left, right) => left.source.start - right.source.start);
  if (following.length) return following[0];

  return anchors
    .filter((anchor) => anchor.source.end <= offset)
    .sort((left, right) => right.source.end - left.source.end)[0];
}

export function collectSourceAnchors(layout: PagedDisplayList): SourceAnchor[] {
  return collectSourceAnchorsFromPages(layout.pages);
}

function collectSourceAnchorsFromPages(pages: PagedDisplayList["pages"]): SourceAnchor[] {
  return pages.flatMap((page) => page.objects.flatMap((object) => {
    if (!object.sourceSpan) return [];
    const bounds = objectBounds(object);
    return [{ source: object.sourceSpan, page: page.index, ...bounds }];
  }));
}

function objectBounds(object: DisplayObject): { x: number; y: number; width: number; height: number } {
  if (object.type === "line") {
    return {
      x: Math.min(object.x1, object.x2),
      y: Math.min(object.y1, object.y2),
      width: Math.abs(object.x2 - object.x1),
      height: Math.abs(object.y2 - object.y1)
    };
  }
  if (object.type === "text") {
    return {
      x: object.x,
      y: object.y - object.fontSize,
      width: object.width ?? 0,
      height: object.fontSize * 1.2
    };
  }
  return { x: object.x, y: object.y, width: object.width, height: object.height };
}
