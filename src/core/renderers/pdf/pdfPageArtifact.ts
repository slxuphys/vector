import type { PDFDocument } from "pdf-lib";
import type { PagedDisplayList } from "../../display-list/displayTypes";
import { renderPageToSvg } from "../svg/renderPageToSvg";
import { svgToDataUrl } from "../math/renderKatex";

export async function renderPreviewPagesToPdf(pdf: PDFDocument, layout: PagedDisplayList): Promise<boolean> {
  if (typeof document === "undefined" || typeof Image === "undefined") return false;

  try {
    for (const displayPage of layout.pages) {
      const page = pdf.addPage([displayPage.width, displayPage.height]);
      const svg = renderPageToSvg(displayPage);
      const pngBytes = await rasterizeSvg(svg, displayPage.width, displayPage.height);
      const image = await pdf.embedPng(pngBytes);
      page.drawImage(image, {
        x: 0,
        y: 0,
        width: displayPage.width,
        height: displayPage.height
      });
    }
    return true;
  } catch {
    return false;
  }
}

async function rasterizeSvg(svg: string, width: number, height: number): Promise<Uint8Array> {
  const scale = 3;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(width * scale));
  canvas.height = Math.max(1, Math.ceil(height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D context is unavailable");

  const image = await loadImage(svgToDataUrl(svg));
  context.setTransform(scale, 0, 0, scale, 0, 0);
  context.drawImage(image, 0, 0, width, height);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Could not rasterize preview page");
  return new Uint8Array(await blob.arrayBuffer());
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not load preview page SVG"));
    image.src = src;
  });
}
