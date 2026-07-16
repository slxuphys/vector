import { PDFDocument } from "pdf-lib";
import type { PagedDisplayList } from "../../display-list/displayTypes";
import { isDebugLogEnabled } from "../../utils/debugSettings";
import { now } from "../../utils/timing";
import { loadPdfFonts, selectPdfTextFontFallbacks } from "./pdfFonts";
import { drawPdfShape } from "./pdfShapes";
import { drawPdfText } from "./pdfText";
import { drawPdfKatexDomGlyphs } from "./pdfKatexDom";
import { drawPdfMathArtifact, type PdfMathArtifactContext, type PdfMathArtifactStats } from "./pdfMathArtifact";
import { drawPdfMathGlyphs } from "./pdfMathGlyph";
import { drawPdfMathJaxVector } from "./pdfMathJax";
import { drawPdfNativeMath } from "./pdfNativeMath";
import { drawPdfImage, type PdfImageContext, type PdfImageServices } from "./pdfImage";
import { drawPdfGraphSX } from "./pdfGraphSX";
import { isNativeMathRenderer } from "../math/nativeMath";
import { collectPdfLinkTargets } from "./pdfLinks";

export type PdfRenderOptions = {
  rasterizeMath?: boolean;
  mathPdfMode?: "raster" | "vector" | "glyph";
  subsetFonts?: boolean;
  debugLabel?: string;
  imageServices?: PdfImageServices;
};

export async function renderToPdf(layout: PagedDisplayList, options: PdfRenderOptions = {}): Promise<Uint8Array> {
  if (isDebugLogEnabled("pdf")) logPdfDisplayList(layout, options.debugLabel ?? "unknown");
  const subsetFonts = options.subsetFonts ?? false;
  if (!subsetFonts) return renderToPdfAttempt(layout, options, false);

  try {
    return await renderToPdfAttempt(layout, options, true);
  } catch (error) {
    if (!isFontSubsetError(error)) throw error;
    if (isDebugLogEnabled("pdf")) {
      console.warn("[pdf-export] font subsetting failed; retrying with full fonts", error);
    }
    return renderToPdfAttempt(layout, options, false, "subset-fallback");
  }
}

function logPdfDisplayList(layout: PagedDisplayList, source: string): void {
  const serialized = JSON.stringify(layout);
  const pdfComparable = JSON.stringify({
    ...layout,
    theme: { ...layout.theme, fontFaceCss: undefined },
    pages: layout.pages.map(({ fontFaceCss: _fontFaceCss, ...page }) => page)
  });
  const summary = {
    source,
    signature: displayListSignature(serialized),
    bytes: serialized.length,
    pdfSignature: displayListSignature(pdfComparable),
    pdfComparableBytes: pdfComparable.length,
    pages: layout.pages.length,
    pageSignatures: layout.pages.map((page, index) => {
      const value = JSON.stringify(page);
      return { index, signature: displayListSignature(value), bytes: value.length };
    })
  };

  if (source === "vscode") {
    // Extension Host drops large object arguments before they reach its console.
    console.log("[pdf-display-list]", JSON.stringify(summary));
    console.log("[pdf-display-list-pdf-comparable]", pdfComparable);
    return;
  }

  console.log("[pdf-display-list]", {
    ...summary,
    layout
  });
}

function displayListSignature(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

async function renderToPdfAttempt(
  layout: PagedDisplayList,
  options: PdfRenderOptions,
  subsetFonts: boolean,
  fontSubsetFallback?: "subset-fallback"
): Promise<Uint8Array> {
  const start = now();
  const mathPdfMode = options.mathPdfMode ?? (options.rasterizeMath ?? true ? "raster" : "vector");
  const fontStart = now();
  const pdf = await PDFDocument.create();

  const fonts = await loadPdfFonts(pdf, layout, mathPdfMode, subsetFonts);
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
  const imageContext: PdfImageContext = { bytes: new Map(), assets: new Map() };
  const objectCounts = {
    text: 0,
    math: 0,
    image: 0,
    graphsx: 0,
    shape: 0
  };

  const pages = layout.pages.map((displayPage) => pdf.addPage([displayPage.width, displayPage.height]));
  const linkTargets = collectPdfLinkTargets(layout, pages);

  for (let pageIndex = 0; pageIndex < layout.pages.length; pageIndex += 1) {
    const displayPage = layout.pages[pageIndex];
    const page = pages[pageIndex];
    for (const object of displayPage.objects) {
      if (object.type === "text") {
        objectCounts.text += 1;
        drawPdfText(page, object, selectPdfTextFontFallbacks(object, fonts), displayPage.height, linkTargets);
      } else if (object.type === "math") {
        objectCounts.math += 1;
        let drewArtifact = false;
        if (isNativeMathRenderer(object.renderer)) {
          drewArtifact = drawPdfNativeMath(page, object, fonts, displayPage.height);
        } else if (mathPdfMode === "raster") {
          drewArtifact = await drawPdfMathArtifact(pdf, page, object, displayPage.height, mathContext);
        } else if (mathPdfMode === "glyph" && object.renderer === "katex-glyph") {
          drewArtifact = await drawPdfKatexDomGlyphs(page, object, fonts, displayPage.height);
        } else if (mathPdfMode === "glyph" && object.renderer === "mathjax-glyph") {
          drewArtifact = drawPdfMathGlyphs(page, object, fonts, displayPage.height);
        } else if (object.renderer === "mathjax-vector" || object.renderer === "mathjax-glyph") {
          drewArtifact = drawPdfMathJaxVector(page, object, displayPage.height);
        }
        if (!drewArtifact) {
          logUndrawnMath(object.renderer, object.latex);
        }
      } else if (object.type === "image") {
        objectCounts.image += 1;
        await drawPdfImage(pdf, page, object, fonts, displayPage.height, options.imageServices, imageContext);
      } else if (object.type === "graphsx") {
        objectCounts.graphsx += 1;
        drawPdfGraphSX(page, object, fonts, displayPage.height);
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
  if (isDebugLogEnabled("pdf")) console.log("[pdf-export]", {
    totalMs: round(totalMs),
    fontMs: round(fontMs),
    drawMs: round(drawMs),
    saveMs: round(saveMs),
    pages: layout.pages.length,
    bytes: bytes.byteLength,
    mathMode: mathPdfMode === "raster" ? "rasterized-artifact" : mathPdfMode === "glyph" ? "pdf-glyph" : "pdf-vector",
    fontSubset: fontSubsetFallback ?? (subsetFonts ? "subset" : "full"),
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

function logUndrawnMath(renderer: string | undefined, latex: string): void {
  if (!isDebugLogEnabled("pdf")) return;
  console.warn("[pdf-math-undrawn]", {
    renderer,
    latex
  });
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

function isFontSubsetError(error: unknown): boolean {
  const value = error as { name?: unknown; message?: unknown; stack?: unknown };
  const message = [
    typeof value?.name === "string" ? value.name : "",
    typeof value?.message === "string" ? value.message : "",
    typeof value?.stack === "string" ? value.stack : "",
    String(error)
  ].join("\n");
  return /fontkit|CFFSubset|EncodeStream|writeUInt8|out of bounds|subset/i.test(message);
}
