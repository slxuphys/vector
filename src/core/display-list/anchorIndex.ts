import type { DisplayObject, DisplayPage, PagedDisplayList } from "./displayTypes";

export type DisplayAnchorLocation = {
  id: string;
  page: number;
  y: number;
};

export function collectDisplayAnchors(
  layoutOrPages: PagedDisplayList | DisplayPage[]
): DisplayAnchorLocation[] {
  const pages = Array.isArray(layoutOrPages) ? layoutOrPages : layoutOrPages.pages;
  const seen = new Set<string>();
  const anchors: DisplayAnchorLocation[] = [];

  for (const page of pages) {
    for (const object of page.objects) {
      if (!object.anchorId || seen.has(object.anchorId)) continue;
      seen.add(object.anchorId);
      anchors.push({ id: object.anchorId, page: page.index, y: displayObjectTop(object) });
    }
  }

  return anchors;
}

export function indexDisplayAnchors(
  layoutOrPages: PagedDisplayList | DisplayPage[]
): Map<string, DisplayAnchorLocation> {
  return new Map(collectDisplayAnchors(layoutOrPages).map((anchor) => [anchor.id, anchor]));
}

function displayObjectTop(object: DisplayObject): number {
  if (object.type === "line") return Math.min(object.y1, object.y2);
  if (object.type === "text") return Math.max(0, object.y - object.fontSize);
  return object.y;
}
