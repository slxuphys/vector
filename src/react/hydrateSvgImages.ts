type SvgImageCleanup = () => void;
const pdfPreviewCache = new Map<string, Promise<string>>();

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

  for (const [sourceIndex, source] of sources.entries()) {
    if (disposed()) return;
    const candidateStartedAt = performance.now();
    try {
      const renderStartedAt = performance.now();
      const href = isPdfSource(source)
        ? await renderPdfPreview(source, Number(image.getAttribute("width")) || 300)
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
        error
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
  const cacheKey = `${targetWidth.toFixed(1)}:${source}`;
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
    return await rendering;
  } catch (error) {
    pdfPreviewCache.delete(cacheKey);
    throw error;
  }
}

async function renderPdfPreviewUncached(source: string, targetWidth: number): Promise<string> {
  const { renderPdfPageToDataUrl } = await import("./pdfPreviewRuntime");
  return renderPdfPageToDataUrl(source, targetWidth);
}

function setImageHref(image: SVGImageElement, href: string, disposed: () => boolean): Promise<void> {
  return new Promise((resolve, reject) => {
    const onLoad = () => finish(resolve);
    const onError = () => finish(() => reject(new Error("Could not load figure")));
    const finish = (callback: () => void) => {
      image.removeEventListener("load", onLoad);
      image.removeEventListener("error", onError);
      if (!disposed()) callback();
    };
    image.addEventListener("load", onLoad, { once: true });
    image.addEventListener("error", onError, { once: true });
    image.setAttribute("href", href);
  });
}
