import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import {
  drawPdfImage,
  type PdfImageContext
} from "../src/core/renderers/pdf/pdfImage";
import type { PdfFontSet } from "../src/core/renderers/pdf/pdfFonts";

describe("PDF image export cache", () => {
  it("loads and embeds a repeated image once per document", async () => {
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([200, 200]);
    const sourcePdf = await PDFDocument.create();
    sourcePdf.addPage([10, 10]);
    const sourceBytes = await sourcePdf.save();
    const context: PdfImageContext = { bytes: new Map(), assets: new Map() };
    let loadCount = 0;
    const services = {
      load: async () => {
        loadCount += 1;
        return sourceBytes;
      }
    };
    const image = {
      type: "image" as const,
      src: "https://example.test/figure.pdf",
      sources: ["https://example.test/figure.pdf"],
      alt: "test",
      x: 10,
      y: 10,
      width: 20,
      height: 20
    };

    expect(await drawPdfImage(pdf, page, image, {} as PdfFontSet, 200, services, context)).toBe(true);
    expect(await drawPdfImage(pdf, page, { ...image, x: 40 }, {} as PdfFontSet, 200, services, context)).toBe(true);
    expect(loadCount).toBe(1);
    expect(context.bytes.size).toBe(1);
    expect(context.assets.size).toBe(1);
  });
});
