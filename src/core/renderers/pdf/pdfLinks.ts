import { PDFName, PDFPage, PDFString } from "pdf-lib";
import type { DisplayObject, PagedDisplayList } from "../../display-list/displayTypes";
import { sanitizeUrl } from "../../utils/sanitize";
import { isDebugLogEnabled } from "../../utils/debugSettings";

export type PdfLinkTarget = {
  page: PDFPage;
  x: number;
  y: number;
};

export type PdfLinkTargets = Map<string, PdfLinkTarget>;

export type PdfLinkRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export function collectPdfLinkTargets(layout: PagedDisplayList, pages: PDFPage[]): PdfLinkTargets {
  const targets: PdfLinkTargets = new Map();
  layout.pages.forEach((displayPage, pageIndex) => {
    const page = pages[pageIndex];
    if (!page) return;
    for (const object of displayPage.objects) {
      if (!object.anchorId) continue;
      const point = objectAnchorPoint(object);
      targets.set(object.anchorId, {
        page,
        x: point.x,
        y: displayPage.height - point.y
      });
    }
  });
  return targets;
}

export function addPdfLinkAnnotation(
  page: PDFPage,
  rect: PdfLinkRect,
  href: string,
  targets?: PdfLinkTargets
): void {
  const safeHref = sanitizeUrl(href);
  if (!safeHref || rect.width <= 0 || rect.height <= 0) return;

  const context = page.doc.context;
  const common = {
    Type: PDFName.of("Annot"),
    Subtype: PDFName.of("Link"),
    Rect: [rect.x, rect.y, rect.x + rect.width, rect.y + rect.height],
    Border: [0, 0, 0]
  };
  const annotation = safeHref.startsWith("#")
    ? internalLinkAnnotation(common, safeHref.slice(1), targets)
    : context.obj({
        ...common,
        A: {
          Type: PDFName.of("Action"),
          S: PDFName.of("URI"),
          URI: PDFString.of(safeHref)
        }
      });

  if (!annotation) return;
  page.node.addAnnot(context.register(annotation));
}

function internalLinkAnnotation(
  common: Record<string, unknown>,
  targetId: string,
  targets?: PdfLinkTargets
) {
  const target = targets?.get(targetId);
  if (!target) {
    if (isDebugLogEnabled("pdf")) console.warn("[pdf-link-missing-target]", { targetId });
    return undefined;
  }
  return target.page.doc.context.obj({
    ...common,
    Dest: [target.page.ref, PDFName.of("XYZ"), target.x, target.y, 0]
  });
}

function objectAnchorPoint(object: DisplayObject): { x: number; y: number } {
  if ("x" in object && "y" in object) return { x: object.x, y: object.y };
  if (object.type === "line") {
    return {
      x: Math.min(object.x1, object.x2),
      y: Math.min(object.y1, object.y2)
    };
  }
  return { x: 0, y: 0 };
}
