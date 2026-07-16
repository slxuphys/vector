import type { PDFDocument, PDFEmbeddedPage, PDFImage, PDFPage } from "pdf-lib";
import { rgb } from "pdf-lib";
import type { DisplayObject } from "../../display-list/displayTypes";
import { sanitizeImageUrl } from "../../utils/sanitize";
import { debugWarn } from "../../utils/debugSettings";
import { svgToDataUrl } from "../../utils/svgDataUrl";
import type { PdfFontSet } from "./pdfFonts";
import { hexToRgb } from "./pdfText";

type ImageObject = Extract<DisplayObject, { type: "image" }>;

export type PdfImageServices = {
  load?: (src: string) => Promise<Uint8Array | undefined>;
  rasterizeSvg?: (svg: Uint8Array, width: number, height: number) => Promise<Uint8Array | undefined>;
};

export type PdfImageContext = {
  bytes: Map<string, Promise<Uint8Array>>;
  assets: Map<string, Promise<EmbeddedImageAsset>>;
};

type EmbeddedImageAsset =
  | { type: "pdf"; value: PDFEmbeddedPage }
  | { type: "image"; value: PDFImage };

export async function drawPdfImage(
  pdf: PDFDocument,
  page: PDFPage,
  object: ImageObject,
  fonts: PdfFontSet,
  pageHeight: number,
  services: PdfImageServices = {},
  context: PdfImageContext = { bytes: new Map(), assets: new Map() }
): Promise<boolean> {
  const sources = (object.sources?.length ? object.sources : [object.src])
    .map(sanitizeImageUrl)
    .filter((source): source is string => source !== undefined);
  if (sources.length === 0) {
    drawImagePlaceholder(page, object, fonts, pageHeight);
    return false;
  }

  for (const src of sources) {
    try {
      const asset = await loadEmbeddedAsset(pdf, src, object, services, context);
      if (asset.type === "pdf") {
        const fitted = fitContain(asset.value.width, asset.value.height, object.width, object.height);
        page.drawPage(asset.value, {
          x: object.x + fitted.x,
          y: pageHeight - object.y - fitted.y - fitted.height,
          width: fitted.width,
          height: fitted.height
        });
        return true;
      }
      const fitted = fitContain(asset.value.width, asset.value.height, object.width, object.height);
      page.drawImage(asset.value, {
        x: object.x + fitted.x,
        y: pageHeight - object.y - fitted.y - fitted.height,
        width: fitted.width,
        height: fitted.height
      });
      return true;
    } catch (error) {
      debugWarn("pdf", "[pdf-image-candidate-failed]", { src, error });
    }
  }
  drawImagePlaceholder(page, object, fonts, pageHeight);
  return false;
}

async function loadEmbeddedAsset(
  pdf: PDFDocument,
  src: string,
  object: ImageObject,
  services: PdfImageServices,
  context: PdfImageContext
): Promise<EmbeddedImageAsset> {
  const bytes = await loadImageBytesCached(src, services, context);
  const svg = isSvg(bytes, src);
  const cacheKey = svg ? `svg:${object.width}x${object.height}:${src}` : src;
  const cached = context.assets.get(cacheKey);
  if (cached) return cached;
  const loading = (async (): Promise<EmbeddedImageAsset> => {
    if (isPdf(bytes, src)) {
      const [pdfPage] = await pdf.embedPdf(bytes, [0]);
      if (!pdfPage) throw new Error("PDF figure has no pages");
      return { type: "pdf", value: pdfPage };
    }
    const imageBytes = svg
      ? await services.rasterizeSvg?.(bytes, object.width, object.height)
        ?? await rasterizeSvgBytes(bytes, object.width, object.height)
      : bytes;
    if (isSvg(imageBytes, src)) throw new Error("SVG rasterization is unavailable in this runtime");
    const image = isJpeg(imageBytes, src)
      ? await pdf.embedJpg(imageBytes)
      : isPng(imageBytes, src) || svg
        ? await pdf.embedPng(imageBytes)
        : undefined;
    if (!image) throw new Error(`Unsupported image format: ${src}`);
    return { type: "image", value: image };
  })();
  context.assets.set(cacheKey, loading);
  try {
    return await loading;
  } catch (error) {
    context.assets.delete(cacheKey);
    throw error;
  }
}

async function loadImageBytesCached(
  src: string,
  services: PdfImageServices,
  context: PdfImageContext
): Promise<Uint8Array> {
  const cached = context.bytes.get(src);
  if (cached) return cached;
  const loading = Promise.resolve(services.load?.(src)).then((loaded) => loaded ?? loadImageBytes(src));
  context.bytes.set(src, loading);
  try {
    return await loading;
  } catch (error) {
    context.bytes.delete(src);
    throw error;
  }
}

async function loadImageBytes(src: string): Promise<Uint8Array> {
  const response = await fetch(src);
  if (!response.ok) throw new Error(`Could not load image: ${src}`);
  return new Uint8Array(await response.arrayBuffer());
}

function isSvg(bytes: Uint8Array, src: string): boolean {
  if (/^data:image\/svg\+xml[;,]/i.test(src) || /\.svg(?:[?#]|$)/i.test(src)) return true;
  const head = new TextDecoder().decode(bytes.slice(0, Math.min(bytes.length, 256))).trimStart();
  return head.startsWith("<svg") || head.startsWith("<?xml");
}

function isPdf(bytes: Uint8Array, src: string): boolean {
  return /^data:application\/pdf[;,]/i.test(src) || /\.pdf(?:[?#]|$)/i.test(src) || (
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d
  );
}

async function rasterizeSvgBytes(bytes: Uint8Array, width: number, height: number): Promise<Uint8Array> {
  if (typeof document === "undefined" || typeof Image === "undefined") return bytes;
  const svg = new TextDecoder().decode(bytes);
  const scale = 3;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(width * scale));
  canvas.height = Math.max(1, Math.ceil(height * scale));
  const context = canvas.getContext("2d");
  if (!context) return bytes;

  const image = await loadImage(svgToDataUrl(svg));
  context.setTransform(scale, 0, 0, scale, 0, 0);
  const fitted = fitContain(image.naturalWidth || width, image.naturalHeight || height, width, height);
  context.drawImage(image, fitted.x, fitted.y, fitted.width, fitted.height);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) return bytes;
  return new Uint8Array(await blob.arrayBuffer());
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not rasterize SVG image"));
    image.src = src;
  });
}

function isPng(bytes: Uint8Array, src: string): boolean {
  return /\.png(?:[?#]|$)/i.test(src) || (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  );
}

function isJpeg(bytes: Uint8Array, src: string): boolean {
  return /\.jpe?g(?:[?#]|$)/i.test(src) || (bytes[0] === 0xff && bytes[1] === 0xd8);
}

function fitContain(sourceWidth: number, sourceHeight: number, boxWidth: number, boxHeight: number): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  if (sourceWidth <= 0 || sourceHeight <= 0 || boxWidth <= 0 || boxHeight <= 0) {
    return { x: 0, y: 0, width: boxWidth, height: boxHeight };
  }
  const scale = Math.min(boxWidth / sourceWidth, boxHeight / sourceHeight);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  return {
    x: (boxWidth - width) / 2,
    y: (boxHeight - height) / 2,
    width,
    height
  };
}

function drawImagePlaceholder(page: PDFPage, object: ImageObject, fonts: PdfFontSet, pageHeight: number): void {
  const y = pageHeight - object.y - object.height;
  page.drawRectangle({
    x: object.x,
    y,
    width: object.width,
    height: object.height,
    color: rgb(0.96, 0.97, 0.98),
    borderColor: hexToRgb("#cfd7df"),
    borderWidth: 0.7
  });
  page.drawText("Fail to load", {
    x: object.x + 8,
    y: y + object.height / 2 - 4,
    size: 9,
    font: fonts.italic,
    color: hexToRgb("#667085"),
    maxWidth: Math.max(0, object.width - 16)
  });
}
