import type { PDFDocument, PDFPage } from "pdf-lib";
import type { DisplayObject } from "../../display-list/displayTypes";
import { svgToDataUrl } from "../math/renderKatex";

export async function drawPdfMathArtifact(
  pdf: PDFDocument,
  page: PDFPage,
  object: Extract<DisplayObject, { type: "math" }>,
  pageHeight: number
): Promise<boolean> {
  const pngBytes = await rasterizeSvg(object.svg, object.width, object.height);
  if (!pngBytes) return false;

  const image = await pdf.embedPng(pngBytes);
  page.drawImage(image, {
    x: object.x,
    y: pageHeight - object.y - object.height,
    width: object.width,
    height: object.height
  });
  return true;
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
