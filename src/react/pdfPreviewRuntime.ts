import { getDocument, GlobalWorkerOptions, VerbosityLevel } from "pdfjs-dist/build/pdf.mjs";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { debugGroup } from "../core/utils/debugSettings";

let pdfRuntimeConfigured = false;

export async function renderPdfPageToDataUrl(source: string, targetWidth: number): Promise<string> {
  const totalStartedAt = performance.now();
  const bytesStartedAt = performance.now();
  const bytes = await loadBytes(source);
  const loadBytesMs = performance.now() - bytesStartedAt;
  const pdfBytes = bytes.byteLength;
  const pdfSignature = bytePrefix(bytes);
  const runtimeStartedAt = performance.now();
  const coldStart = !pdfRuntimeConfigured;
  configurePdfRuntime();
  const runtimeMs = performance.now() - runtimeStartedAt;
  const documentStartedAt = performance.now();
  const document = await getDocument({
    data: bytes,
    verbosity: VerbosityLevel.ERRORS
  }).promise;
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
    const result = await canvasToDataUrl(canvas);
    encodeMs = performance.now() - encodeStartedAt;
    resultBytes = result.length;
    return result;
  } finally {
    const destroyStartedAt = performance.now();
    await document.destroy();
    destroyMs = performance.now() - destroyStartedAt;
    debugGroup("assets", "[PDF figure] converted first page", () => [
      ["source", {
        value: describeSource(source),
        sourceKB: Math.round(source.length / 10.24) / 100,
        pdfKB: Math.round(pdfBytes / 10.24) / 100,
        signature: pdfSignature
      }],
      ["output", {
        targetWidth,
        naturalWidth: Math.round(naturalWidth * 10) / 10,
        naturalHeight: Math.round(naturalHeight * 10) / 10,
        scale: Math.round(scale * 1000) / 1000,
        canvasWidth,
        canvasHeight,
        pngKB: Math.round(resultBytes / 10.24) / 100
      }],
      ["timing", {
        loadBytesMs: Math.round(loadBytesMs * 10) / 10,
        runtimeColdStart: coldStart,
        runtimeMs: Math.round(runtimeMs * 10) / 10,
        workerMode: "worker",
        documentMs: Math.round(documentMs * 10) / 10,
        getPageMs: Math.round(getPageMs * 10) / 10,
        renderMs: Math.round(renderMs * 10) / 10,
        encodeMs: Math.round(encodeMs * 10) / 10,
        destroyMs: Math.round(destroyMs * 10) / 10,
        totalMs: Math.round((performance.now() - totalStartedAt) * 10) / 10
      }]
    ]);
  }
}

function configurePdfRuntime(): void {
  if (pdfRuntimeConfigured) return;
  GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  pdfRuntimeConfigured = true;
}

async function canvasToDataUrl(canvas: HTMLCanvasElement): Promise<string> {
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Could not encode PDF figure preview")), "image/png");
  });
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Could not read PDF figure preview"));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read PDF figure preview"));
    reader.readAsDataURL(blob);
  });
}

async function loadBytes(source: string): Promise<Uint8Array> {
  const bytes = /^data:application\/pdf[;,]/i.test(source)
    ? decodeDataUrl(source)
    : await fetchBytes(source);
  const validSignature = hasPdfSignature(bytes);
  if (!validSignature) throw new Error(`Figure source is not a PDF: ${describeSource(source)}`);
  return bytes;
}

async function fetchBytes(source: string): Promise<Uint8Array> {
  const response = await fetch(source);
  if (!response.ok) throw new Error(`Could not load PDF figure: ${source}`);
  return new Uint8Array(await response.arrayBuffer());
}

function bytePrefix(bytes: Uint8Array): string {
  return Array.from(bytes.slice(0, 12))
    .map((value) => value >= 0x20 && value <= 0x7e ? String.fromCharCode(value) : `\\x${value.toString(16).padStart(2, "0")}`)
    .join("");
}

function describeSource(source: string): string {
  if (source.startsWith("blob:")) return `${source.slice(0, 64)}${source.length > 64 ? "..." : ""}`;
  if (source.startsWith("data:")) return `${source.slice(0, 48)}... (${source.length} chars)`;
  return source;
}

function hasPdfSignature(bytes: Uint8Array): boolean {
  return bytes.length >= 5
    && bytes[0] === 0x25
    && bytes[1] === 0x50
    && bytes[2] === 0x44
    && bytes[3] === 0x46
    && bytes[4] === 0x2d;
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
