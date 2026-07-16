import { debugGroup } from "../core/utils/debugSettings";
import { BoundedStringCache } from "./boundedStringCache";

type SvgImageCleanup = () => void;
const pdfPreviewCache = new Map<string, Promise<string>>();
const maxCompletedPdfPreviews = 12;
const maxCompletedPdfPreviewChars = 24 * 1024 * 1024;
const completedPdfPreviewCache = new BoundedStringCache(maxCompletedPdfPreviews, maxCompletedPdfPreviewChars);

export function hydrateSvgImages(container: Element): SvgImageCleanup {
  let disposed = false;
  const images = Array.from(container.querySelectorAll<SVGImageElement>("image[data-fallback-id]"));

  for (const image of images) {
    void loadSvgImageCandidates(container, image, () => disposed);
  }

  return () => {
    disposed = true;
  };
}

async function loadSvgImageCandidates(
  container: Element,
  image: SVGImageElement,
  disposed: () => boolean
): Promise<void> {
  const startedAt = performance.now();
  const fallbackId = image.dataset.fallbackId;
  const fallback = fallbackId
    ? container.querySelector<SVGGElement>(`#${CSS.escape(fallbackId)}`)
    : undefined;
  const sources = parseSources(image.dataset.imageSources);
  const failures: Array<{ source: string; error: ReturnType<typeof describeError> }> = [];

  for (const [sourceIndex, source] of sources.entries()) {
    if (disposed()) return;
    const candidateStartedAt = performance.now();
    try {
      const targetWidth = Number(image.getAttribute("width")) || 300;
      const completedPdfPreview = isPdfSource(source)
        ? getCompletedPdfPreview(getPdfPreviewCacheKey(source, targetWidth))
        : undefined;
      if (completedPdfPreview) {
        image.setAttribute("href", completedPdfPreview);
        if (fallback) fallback.style.display = "none";
        return;
      }
      const renderStartedAt = performance.now();
      const href = isPdfSource(source)
        ? await renderPdfPreview(source, targetWidth)
        : source;
      const renderMs = performance.now() - renderStartedAt;
      const insertStartedAt = performance.now();
      await setImageHref(image, href, disposed);
      const imageLoadMs = performance.now() - insertStartedAt;
      if (!disposed() && fallback) fallback.style.display = "none";
      debugGroup("assets", `[figure] loaded ${isPdfSource(source) ? "PDF" : "image"}`, () => [
        ["source", describeSource(source)],
        ["selection", { candidate: sourceIndex + 1, candidates: sources.length, failures }],
        ["size", {
          sourceKB: Math.round(source.length / 10.24) / 100,
          renderedKB: Math.round(href.length / 10.24) / 100,
          width: image.getAttribute("width"),
          height: image.getAttribute("height")
        }],
        ["timing", {
          renderMs: Math.round(renderMs * 10) / 10,
          imageLoadMs: Math.round(imageLoadMs * 10) / 10,
          candidateMs: Math.round((performance.now() - candidateStartedAt) * 10) / 10,
          totalMs: Math.round((performance.now() - startedAt) * 10) / 10
        }]
      ]);
      return;
    } catch (error) {
      failures.push({ source: describeSource(source), error: describeError(error) });
      // Continue through LaTeX's graphicspath/extension candidates.
    }
  }

  if (!disposed() && fallback) fallback.style.display = "";
  debugGroup("assets", "[figure] failed to load", () => [
    ["figure", { fallbackId, width: image.getAttribute("width"), height: image.getAttribute("height") }],
    ["candidates", sources.map(describeSource)],
    ["failures", failures],
    ["timing", { totalMs: Math.round((performance.now() - startedAt) * 10) / 10 }]
  ], "warn");
}

function describeSource(source: string): string {
  if (source.startsWith("blob:")) return `${source.slice(0, 64)}${source.length > 64 ? "..." : ""}`;
  if (source.startsWith("data:")) return `${source.slice(0, 48)}... (${source.length} chars)`;
  return source;
}

function describeError(error: unknown): { name: string; message: string; stack?: string } {
  if (error instanceof Error) return { name: error.name, message: error.message, stack: error.stack };
  return { name: typeof error, message: String(error) };
}

function parseSources(value: string | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function isPdfSource(source: string): boolean {
  return /^data:application\/pdf[;,]/i.test(source) || /\.pdf(?:[?#]|$)/i.test(source);
}

async function renderPdfPreview(source: string, targetWidth: number): Promise<string> {
  const cacheKey = getPdfPreviewCacheKey(source, targetWidth);
  const completed = getCompletedPdfPreview(cacheKey);
  if (completed) return completed;
  const cached = pdfPreviewCache.get(cacheKey);
  if (cached) {
    return cached;
  }
  const rendering = renderPdfPreviewUncached(source, targetWidth);
  pdfPreviewCache.set(cacheKey, rendering);
  try {
    const result = await rendering;
    setCompletedPdfPreview(cacheKey, result);
    return result;
  } finally {
    pdfPreviewCache.delete(cacheKey);
  }
}

function getPdfPreviewCacheKey(source: string, targetWidth: number): string {
  return `${targetWidth.toFixed(1)}:${source.length}:${hashString(source)}`;
}

function getCompletedPdfPreview(key: string): string | undefined {
  return completedPdfPreviewCache.get(key);
}

function setCompletedPdfPreview(key: string, value: string): void {
  completedPdfPreviewCache.set(key, value);
}

function hashString(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

async function renderPdfPreviewUncached(source: string, targetWidth: number): Promise<string> {
  const { renderPdfPageToDataUrl } = await import("./pdfPreviewRuntime");
  return renderPdfPageToDataUrl(source, targetWidth);
}

function setImageHref(image: SVGImageElement, href: string, disposed: () => boolean): Promise<void> {
  return new Promise((resolve, reject) => {
    const onLoad = () => finish(resolve);
    const onError = () => finish(() => reject(new Error(`Could not insert rendered figure: ${describeSource(href)}`)));
    const finish = (callback: () => void) => {
      image.removeEventListener("load", onLoad);
      image.removeEventListener("error", onError);
      if (disposed()) resolve();
      else callback();
    };
    image.addEventListener("load", onLoad, { once: true });
    image.addEventListener("error", onError, { once: true });
    image.setAttribute("href", href);
  });
}
