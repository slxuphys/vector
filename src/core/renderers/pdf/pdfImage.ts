import type { PDFDocument, PDFPage } from "pdf-lib";
import { rgb } from "pdf-lib";
import type { DisplayObject } from "../../display-list/displayTypes";
import { sanitizeImageUrl } from "../../utils/sanitize";
import type { PdfFontSet } from "./pdfFonts";
import { hexToRgb } from "./pdfText";

type ImageObject = Extract<DisplayObject, { type: "image" }>;

export async function drawPdfImage(
  pdf: PDFDocument,
  page: PDFPage,
  object: ImageObject,
  fonts: PdfFontSet,
  pageHeight: number
): Promise<boolean> {
  const src = sanitizeImageUrl(object.src);
  if (!src) {
    drawImagePlaceholder(page, object, fonts, pageHeight);
    return false;
  }

  try {
    const bytes = await loadImageBytes(src);
    const image = isJpeg(bytes, src)
      ? await pdf.embedJpg(bytes)
      : isPng(bytes, src)
        ? await pdf.embedPng(bytes)
        : undefined;
    if (!image) {
      drawImagePlaceholder(page, object, fonts, pageHeight);
      return false;
    }
    page.drawImage(image, {
      x: object.x,
      y: pageHeight - object.y - object.height,
      width: object.width,
      height: object.height
    });
    return true;
  } catch {
    drawImagePlaceholder(page, object, fonts, pageHeight);
    return false;
  }
}

async function loadImageBytes(src: string): Promise<Uint8Array> {
  const response = await fetch(src);
  if (!response.ok) throw new Error(`Could not load image: ${src}`);
  return new Uint8Array(await response.arrayBuffer());
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
  page.drawText(object.alt || "Image", {
    x: object.x + 8,
    y: y + object.height / 2 - 4,
    size: 9,
    font: fonts.italic,
    color: hexToRgb("#667085"),
    maxWidth: Math.max(0, object.width - 16)
  });
}
