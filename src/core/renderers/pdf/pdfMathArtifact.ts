import type { PDFDocument, PDFImage, PDFPage } from "pdf-lib";
import type { DisplayObject } from "../../display-list/displayTypes";
import { now } from "../../utils/timing";
import { svgToDataUrl } from "../math/renderKatex";

export type PdfMathArtifactStats = {
  attempted: number;
  drawn: number;
  failed: number;
  imageCacheHits: number;
  imageCacheMisses: number;
  rasterCacheHits: number;
  rasterCacheMisses: number;
  rasterMs: number;
  embedMs: number;
};

export type PdfMathArtifactContext = {
  stats: PdfMathArtifactStats;
  imageCache: Map<string, PDFImage>;
};

const rasterCache = new Map<string, Uint8Array>();

export async function drawPdfMathArtifact(
  pdf: PDFDocument,
  page: PDFPage,
  object: Extract<DisplayObject, { type: "math" }>,
  pageHeight: number,
  context?: PdfMathArtifactContext
): Promise<boolean> {
  const stats = context?.stats;
  if (stats) stats.attempted += 1;
  const cacheKey = mathArtifactCacheKey(object);
  let image = context?.imageCache.get(cacheKey);

  if (image) {
    if (stats) stats.imageCacheHits += 1;
  } else {
    if (stats) stats.imageCacheMisses += 1;
    let pngBytes = rasterCache.get(cacheKey);
    if (pngBytes) {
      if (stats) stats.rasterCacheHits += 1;
    } else {
      if (stats) stats.rasterCacheMisses += 1;
      const rasterStart = now();
      pngBytes = await rasterizeSvg(object.svg, object.width, object.height);
      if (stats) stats.rasterMs += now() - rasterStart;
    }
    if (!pngBytes) {
      if (stats) stats.failed += 1;
      return false;
    }
    rasterCache.set(cacheKey, pngBytes);

    const embedStart = now();
    image = await pdf.embedPng(pngBytes);
    if (stats) stats.embedMs += now() - embedStart;
    context?.imageCache.set(cacheKey, image);
  }

  page.drawImage(image, {
    x: object.x,
    y: pageHeight - object.y - object.height,
    width: object.width,
    height: object.height
  });
  if (stats) stats.drawn += 1;
  return true;
}

function mathArtifactCacheKey(object: Extract<DisplayObject, { type: "math" }>): string {
  return `${roundKey(object.width)}:${roundKey(object.height)}:${object.svg}`;
}

function roundKey(value: number): string {
  return value.toFixed(2);
}

async function rasterizeSvg(svg: string, width: number, height: number): Promise<Uint8Array | undefined> {
  if (typeof document === "undefined" || typeof Image === "undefined") return undefined;

  const scale = 3;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(width * scale));
  canvas.height = Math.max(1, Math.ceil(height * scale));
  const context = canvas.getContext("2d");
  if (!context) return undefined;

  const image = await loadImage(svgToDataUrl(svg));
  context.setTransform(scale, 0, 0, scale, 0, 0);
  context.drawImage(image, 0, 0, width, height);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) return undefined;
  return new Uint8Array(await blob.arrayBuffer());
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not rasterize math SVG"));
    image.src = src;
  });
}
