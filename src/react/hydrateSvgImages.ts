type SvgImageCleanup = () => void;
const pdfPreviewCache = new Map<string, Promise<string>>();
const completedPdfPreviewCache = new Map<string, string>();

export function hydrateSvgImages(container: Element): SvgImageCleanup {
  let disposed = false;
  const images = Array.from(container.querySelectorAll<SVGImageElement>("image[data-fallback-id]"));

  console.log("[figure-preview] hydrate", {
    figures: images.length
  });

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
  console.log("[figure-preview] candidates", {
    fallbackId,
    width: image.getAttribute("width"),
    height: image.getAttribute("height"),
    sources: sources.map(describeSource)
  });

  for (const [sourceIndex, source] of sources.entries()) {
    if (disposed()) return;
    const candidateStartedAt = performance.now();
    try {
      const targetWidth = Number(image.getAttribute("width")) || 300;
      const completedPdfPreview = isPdfSource(source)
        ? completedPdfPreviewCache.get(getPdfPreviewCacheKey(source, targetWidth))
        : undefined;
      if (completedPdfPreview) {
        image.setAttribute("href", completedPdfPreview);
        if (fallback) fallback.style.display = "none";
        console.log("[figure-preview] restored cached PDF", {
          fallbackId,
          targetWidth,
          candidate: sourceIndex + 1
        });
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
      console.log("[figure-preview] loaded", {
        fallbackId,
        kind: isPdfSource(source) ? "pdf" : "image",
        candidate: sourceIndex + 1,
        candidates: sources.length,
        sourceKB: Math.round(source.length / 10.24) / 100,
        renderedKB: Math.round(href.length / 10.24) / 100,
        renderMs: Math.round(renderMs * 10) / 10,
        imageLoadMs: Math.round(imageLoadMs * 10) / 10,
        candidateMs: Math.round((performance.now() - candidateStartedAt) * 10) / 10,
        totalMs: Math.round((performance.now() - startedAt) * 10) / 10
      });
      return;
    } catch (error) {
      console.warn("[figure-preview] candidate failed", {
        fallbackId,
        kind: isPdfSource(source) ? "pdf" : "image",
        candidate: sourceIndex + 1,
        candidates: sources.length,
        sourceKB: Math.round(source.length / 10.24) / 100,
        candidateMs: Math.round((performance.now() - candidateStartedAt) * 10) / 10,
        source: describeSource(source),
        error: describeError(error)
      });
      // Continue through LaTeX's graphicspath/extension candidates.
    }
  }

  if (!disposed() && fallback) fallback.style.display = "";
  console.warn("[figure-preview] all candidates failed", {
    fallbackId,
    candidates: sources.length,
    totalMs: Math.round((performance.now() - startedAt) * 10) / 10
  });
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
  const completed = completedPdfPreviewCache.get(cacheKey);
  if (completed) return completed;
  const cached = pdfPreviewCache.get(cacheKey);
  if (cached) {
    const startedAt = performance.now();
    const result = await cached;
    console.log("[pdf-figure-preview] cache hit", {
      targetWidth,
      waitMs: Math.round((performance.now() - startedAt) * 10) / 10
    });
    return result;
  }
  const rendering = renderPdfPreviewUncached(source, targetWidth);
  pdfPreviewCache.set(cacheKey, rendering);
  try {
    const result = await rendering;
    completedPdfPreviewCache.set(cacheKey, result);
    return result;
  } catch (error) {
    pdfPreviewCache.delete(cacheKey);
    throw error;
  }
}

function getPdfPreviewCacheKey(source: string, targetWidth: number): string {
  return `${targetWidth.toFixed(1)}:${source}`;
}

async function renderPdfPreviewUncached(source: string, targetWidth: number): Promise<string> {
  console.log("[pdf-figure-preview] importing runtime", {
    source: describeSource(source),
    targetWidth
  });
  const { renderPdfPageToDataUrl } = await import("./pdfPreviewRuntime");
  console.log("[pdf-figure-preview] runtime imported", {
    source: describeSource(source)
  });
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
