import { getDocument, PDFWorker } from "pdfjs-dist/legacy/build/pdf.mjs";
import PdfJsWorker from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?worker&inline";

let sharedWorker: PDFWorker | undefined;
let sharedWorkerReady: Promise<void> | undefined;

export async function renderPdfPageToDataUrl(source: string, targetWidth: number): Promise<string> {
  const totalStartedAt = performance.now();
  const bytesStartedAt = performance.now();
  const bytes = await loadBytes(source);
  const loadBytesMs = performance.now() - bytesStartedAt;
  const pdfBytes = bytes.byteLength;
  const workerStartedAt = performance.now();
  const { worker, coldStart } = await getSharedWorker();
  const workerMs = performance.now() - workerStartedAt;
  const documentStartedAt = performance.now();
  const document = await getDocument({ data: bytes, worker }).promise;
  const documentMs = performance.now() - documentStartedAt;
  let getPageMs = 0;
  let renderMs = 0;
  let encodeMs = 0;
  let destroyMs = 0;
  let naturalWidth = 0;
  let naturalHeight = 0;
  let scale = 1;
  let canvasWidth = 0;
  let canvasHeight = 0;
  let resultBytes = 0;
  try {
    const pageStartedAt = performance.now();
    const page = await document.getPage(1);
    getPageMs = performance.now() - pageStartedAt;
    const natural = page.getViewport({ scale: 1 });
    naturalWidth = natural.width;
    naturalHeight = natural.height;
    scale = Math.max(1, Math.min(4, targetWidth * 2 / Math.max(1, natural.width)));
    const viewport = page.getViewport({ scale });
    const canvas = window.document.createElement("canvas");
    canvas.width = Math.max(1, Math.ceil(viewport.width));
    canvas.height = Math.max(1, Math.ceil(viewport.height));
    canvasWidth = canvas.width;
    canvasHeight = canvas.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas is unavailable");
    const renderStartedAt = performance.now();
    await page.render({ canvas, canvasContext: context, viewport }).promise;
    renderMs = performance.now() - renderStartedAt;
    const encodeStartedAt = performance.now();
    const result = canvas.toDataURL("image/png");
    encodeMs = performance.now() - encodeStartedAt;
    resultBytes = result.length;
    return result;
  } finally {
    const destroyStartedAt = performance.now();
    await document.destroy();
    destroyMs = performance.now() - destroyStartedAt;
    console.log("[pdf-figure-preview] conversion", {
      sourceKB: Math.round(source.length / 10.24) / 100,
      pdfKB: Math.round(pdfBytes / 10.24) / 100,
      targetWidth,
      naturalWidth: Math.round(naturalWidth * 10) / 10,
      naturalHeight: Math.round(naturalHeight * 10) / 10,
      scale: Math.round(scale * 1000) / 1000,
      canvasWidth,
      canvasHeight,
      pngKB: Math.round(resultBytes / 10.24) / 100,
      loadBytesMs: Math.round(loadBytesMs * 10) / 10,
      workerColdStart: coldStart,
      workerMs: Math.round(workerMs * 10) / 10,
      workerMode: "inline-blob",
      documentMs: Math.round(documentMs * 10) / 10,
      getPageMs: Math.round(getPageMs * 10) / 10,
      renderMs: Math.round(renderMs * 10) / 10,
      encodeMs: Math.round(encodeMs * 10) / 10,
      destroyMs: Math.round(destroyMs * 10) / 10,
      totalMs: Math.round((performance.now() - totalStartedAt) * 10) / 10
    });
  }
}

async function getSharedWorker(): Promise<{ worker: PDFWorker; coldStart: boolean }> {
  const coldStart = !sharedWorker;
  if (!sharedWorker) {
    const startedAt = performance.now();
    const port = new PdfJsWorker();
    sharedWorker = PDFWorker.create({ port });
    sharedWorkerReady = sharedWorker.promise.then(() => {
      console.log("[pdf-figure-preview] worker ready", {
        workerMode: "inline-blob",
        startupMs: Math.round((performance.now() - startedAt) * 10) / 10,
        port: sharedWorker?.port?.constructor?.name ?? "unknown"
      });
    });
  }
  await sharedWorkerReady;
  return { worker: sharedWorker, coldStart };
}

async function loadBytes(source: string): Promise<Uint8Array> {
  if (/^data:application\/pdf[;,]/i.test(source)) return decodeDataUrl(source);
  const response = await fetch(source);
  if (!response.ok) throw new Error(`Could not load PDF figure: ${source}`);
  return new Uint8Array(await response.arrayBuffer());
}

function decodeDataUrl(source: string): Uint8Array {
  const comma = source.indexOf(",");
  if (comma < 0) throw new Error("Invalid PDF data URL");
  const metadata = source.slice(0, comma);
  const payload = source.slice(comma + 1);
  if (/;base64(?:;|$)/i.test(metadata)) {
    const binary = atob(payload);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  }
  return new TextEncoder().encode(decodeURIComponent(payload));
}
