import { PDFDocument } from "pdf-lib";
import type { PagedDisplayList } from "../../display-list/displayTypes";
import { now } from "../../utils/timing";
import { loadPdfFonts, selectPdfTextFont } from "./pdfFonts";
import { drawPdfShape } from "./pdfShapes";
import { drawPdfText } from "./pdfText";
import { drawPdfKatexDomGlyphs } from "./pdfKatexDom";
import { drawPdfMath } from "./pdfMath";
import { drawPdfMathArtifact, type PdfMathArtifactContext, type PdfMathArtifactStats } from "./pdfMathArtifact";
import { drawPdfMathGlyphs } from "./pdfMathGlyph";
import { drawPdfMathJaxVector } from "./pdfMathJax";

export type PdfRenderOptions = {
  rasterizeMath?: boolean;
  mathPdfMode?: "raster" | "vector" | "glyph";
};

export async function renderToPdf(layout: PagedDisplayList, options: PdfRenderOptions = {}): Promise<Uint8Array> {
  const start = now();
  const mathPdfMode = options.mathPdfMode ?? (options.rasterizeMath ?? true ? "raster" : "vector");
  const fontStart = now();
  const pdf = await PDFDocument.create();

  const fonts = await loadPdfFonts(pdf);
  const fontMs = now() - fontStart;
  const drawStart = now();
  const mathStats: PdfMathArtifactStats = {
    attempted: 0,
    drawn: 0,
    failed: 0,
    imageCacheHits: 0,
    imageCacheMisses: 0,
    rasterCacheHits: 0,
    rasterCacheMisses: 0,
    rasterMs: 0,
    embedMs: 0
  };
  const mathContext: PdfMathArtifactContext = {
    stats: mathStats,
    imageCache: new Map()
  };
  const objectCounts = {
    text: 0,
    math: 0,
    shape: 0
  };

  for (const displayPage of layout.pages) {
    const page = pdf.addPage([displayPage.width, displayPage.height]);
    for (const object of displayPage.objects) {
      if (object.type === "text") {
        objectCounts.text += 1;
        drawPdfText(page, object, selectPdfTextFont(object, fonts), displayPage.height);
      } else if (object.type === "math") {
        objectCounts.math += 1;
        let drewArtifact = false;
        if (mathPdfMode === "raster") {
          drewArtifact = await drawPdfMathArtifact(pdf, page, object, displayPage.height, mathContext);
        } else if (mathPdfMode === "glyph" && object.renderer === "katex-glyph") {
          drewArtifact = await drawPdfKatexDomGlyphs(page, object, fonts, displayPage.height);
          if (!drewArtifact) drewArtifact = await drawPdfMathArtifact(pdf, page, object, displayPage.height, mathContext);
        } else if (mathPdfMode === "glyph" && object.renderer === "mathjax-glyph") {
          drewArtifact = drawPdfMathGlyphs(page, object, fonts, displayPage.height);
          if (!drewArtifact) drewArtifact = drawPdfMathJaxVector(page, object, displayPage.height);
        } else if (object.renderer === "mathjax-vector" || object.renderer === "mathjax-glyph") {
          drewArtifact = drawPdfMathJaxVector(page, object, displayPage.height);
        }
        if (!drewArtifact) {
          const mathFonts = fonts.tex ?? fonts;
          drawPdfMath(page, object, { regular: mathFonts.regular, italic: mathFonts.italic }, displayPage.height);
        }
      } else {
        objectCounts.shape += 1;
        drawPdfShape(page, object, displayPage.height);
      }
    }
  }

  const drawMs = now() - drawStart;
  const saveStart = now();
  const bytes = await pdf.save();
  const saveMs = now() - saveStart;
  const totalMs = now() - start;
  console.log("[pdf-export]", {
    totalMs: round(totalMs),
    fontMs: round(fontMs),
    drawMs: round(drawMs),
    saveMs: round(saveMs),
    pages: layout.pages.length,
    bytes: bytes.byteLength,
    mathMode: mathPdfMode === "raster" ? "rasterized-artifact" : mathPdfMode === "glyph" ? "pdf-glyph" : "pdf-vector",
    objects: objectCounts,
    mathArtifacts: {
      attempted: mathStats.attempted,
      drawn: mathStats.drawn,
      failed: mathStats.failed,
      imageCacheHits: mathStats.imageCacheHits,
      imageCacheMisses: mathStats.imageCacheMisses,
      rasterCacheHits: mathStats.rasterCacheHits,
      rasterCacheMisses: mathStats.rasterCacheMisses,
      rasterMs: round(mathStats.rasterMs),
      embedMs: round(mathStats.embedMs)
    }
  });
  Object.defineProperty(bytes, "__pdfMs", { value: totalMs, enumerable: false });
  return bytes;
}

export async function downloadPdf(layout: PagedDisplayList, filename: string, options: PdfRenderOptions = {}): Promise<void> {
  const bytes = await renderToPdf(layout, options);
  const data = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(data).set(bytes);
  const blob = new Blob([data], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
