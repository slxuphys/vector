import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import { Download, LoaderCircle, ZoomIn, ZoomOut } from "lucide-react";
import { hydrateSvgImages } from "../../../src/react/hydrateSvgImages";
import { PreviewSurface } from "../../../src/react/preview/PreviewSurface";
import { vscode } from "./vscodeBridge";

type PageMeta = { index: number; width: number; height: number };
type Stats = { pageCount: number; totalMs: number };
type PagePayload = { index: number; svg: string };
type PreviewState = {
  updateId: number;
  pageMeta: PageMeta[];
  stats: Stats;
  pages: Map<number, string>;
};
type PendingPreview = Omit<PreviewState, "pages"> & { requested: Set<number> };

export function VsCodePreviewApp() {
  const [preview, setPreview] = useState<PreviewState | undefined>(undefined);
  const [zoom, setZoom] = useState(1);
  const [status, setStatus] = useState("Vector preview is ready.");
  const [error, setError] = useState<string | undefined>(undefined);
  const [exporting, setExporting] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const previewRef = useRef<PreviewState | undefined>(undefined);
  const pendingRef = useRef<PendingPreview | undefined>(undefined);
  const requestedRef = useRef(new Set<number>());

  useEffect(() => {
    previewRef.current = preview;
  }, [preview]);

  const requestPages = useCallback((updateId: number, indexes: number[]) => {
    if (indexes.length === 0) return;
    vscode.postMessage({ type: "requestPages", updateId, indexes });
  }, []);

  const requestVisiblePages = useCallback(() => {
    const active = previewRef.current;
    const pane = scrollRef.current;
    if (!active || !pane) return;
    const paneRect = pane.getBoundingClientRect();
    const buffer = Math.max(pane.clientHeight * 1.25, 900);
    const indexes: number[] = [];
    for (const meta of active.pageMeta) {
      if (active.pages.has(meta.index) || requestedRef.current.has(meta.index)) continue;
      const page = pane.querySelector<HTMLElement>(`.vector-preview-page[data-index="${meta.index}"]`);
      if (!page) continue;
      const rect = page.getBoundingClientRect();
      if (rect.bottom >= paneRect.top - buffer && rect.top <= paneRect.bottom + buffer) {
        requestedRef.current.add(meta.index);
        indexes.push(meta.index);
      }
    }
    requestPages(active.updateId, indexes);
  }, [requestPages]);

  useEffect(() => {
    const pane = scrollRef.current;
    if (!pane) return;
    let frame = 0;
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        requestVisiblePages();
      });
    };
    pane.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    schedule();
    return () => {
      if (frame) cancelAnimationFrame(frame);
      pane.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [preview, requestVisiblePages, zoom]);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container || !preview) return undefined;
    return hydrateSvgImages(container);
  }, [preview, zoom]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const message = event.data;
      if (message.type === "loading") {
        setStatus(`Updating ${message.sourceFormat} document (${message.sourceLength} chars)`);
        return;
      }
      if (message.type === "error") {
        setError(String(message.message));
        setStatus("Preview failed");
        return;
      }
      if (message.type === "exportStatus") {
        setExporting(message.state === "pending");
        setStatus(message.message ?? (message.state === "pending" ? "Exporting PDF..." : "PDF exported"));
        return;
      }
      if (message.type === "preview") {
        const pageMeta = (message.pageMeta ?? []) as PageMeta[];
        const pending: PendingPreview = {
          updateId: Number(message.updateId),
          pageMeta,
          stats: message.stats,
          requested: new Set()
        };
        pendingRef.current = pending;
        setError(undefined);
        setStatus(`${message.stats.pageCount} pages, laid out in ${message.stats.totalMs.toFixed(1)} ms`);
        const initial = visibleIndexesForMeta(pageMeta, scrollRef.current, zoom);
        initial.forEach((index) => pending.requested.add(index));
        requestPages(pending.updateId, initial);
        return;
      }
      if (message.type === "previewPages") {
        const payloads = (message.pages ?? []) as PagePayload[];
        const receivedAt = performance.now();
        const receivedEpochMs = Date.now();
        const pending = pendingRef.current;
        if (pending && Number(message.updateId) === pending.updateId) {
          const pages = new Map(payloads.map((payload) => [payload.index, payload.svg]));
          const next = { updateId: pending.updateId, pageMeta: pending.pageMeta, stats: pending.stats, pages };
          requestedRef.current = new Set(pending.requested);
          pendingRef.current = undefined;
          previewRef.current = next;
          setPreview(next);
          acknowledge(message, payloads, pending.pageMeta.length, receivedAt, receivedEpochMs);
          return;
        }
        const active = previewRef.current;
        if (!active || Number(message.updateId) !== active.updateId) return;
        const pages = new Map(active.pages);
        payloads.forEach((payload) => {
          pages.set(payload.index, payload.svg);
          requestedRef.current.delete(payload.index);
        });
        const next = { ...active, pages };
        previewRef.current = next;
        setPreview(next);
        acknowledge(message, payloads, active.pageMeta.length, receivedAt, receivedEpochMs);
        return;
      }
      if (message.type === "revealSource") {
        revealSource(Number(message.page), Number(message.y), Number(message.start), Number(message.end));
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [requestPages, zoom]);

  const revealSource = (pageIndex: number, y: number, start: number, end: number) => {
    const pane = scrollRef.current;
    if (!pane) return;
    const page = pane.querySelector<HTMLElement>(`.vector-preview-page[data-index="${pageIndex}"]`);
    if (page) pane.scrollTo({ top: Math.max(0, page.offsetTop + y * zoom - pane.clientHeight * 0.35) });
    requestAnimationFrame(() => {
      const selector = `[data-vector-source-start="${start}"][data-vector-source-end="${end}"]`;
      pane.querySelectorAll(selector).forEach((target) => {
        target.classList.remove("vector-source-highlight");
        target.getBoundingClientRect();
        target.classList.add("vector-source-highlight");
        window.setTimeout(() => target.classList.remove("vector-source-highlight"), 1200);
      });
    });
  };

  const onSourceClick = (event: MouseEvent<HTMLDivElement>) => {
    const element = event.target instanceof Element ? event.target : undefined;
    if (!element) return;

    if (event.ctrlKey || event.metaKey) {
      const target = element.closest<HTMLElement>("[data-vector-source-start]");
      const start = Number(target?.dataset.vectorSourceStart);
      const end = Number(target?.dataset.vectorSourceEnd);
      if (Number.isInteger(start) && Number.isInteger(end)) {
        event.preventDefault();
        vscode.postMessage({ type: "revealSource", start, end });
      }
      return;
    }

    const link = element.closest<SVGAElement>("a[href]");
    const href = link?.getAttribute("href");
    if (!href?.startsWith("#")) return;
    event.preventDefault();
    revealRenderedAnchor(href.slice(1));
  };

  const revealRenderedAnchor = (encodedId: string) => {
    const pane = scrollRef.current;
    if (!pane) return;
    const id = decodeFragmentId(encodedId);
    const target = pane.querySelector<SVGElement>(`#${CSS.escape(id)}`);
    if (!target) return;
    const paneRect = pane.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    pane.scrollTo({
      top: Math.max(0, pane.scrollTop + targetRect.top - paneRect.top - pane.clientHeight * 0.35)
    });
  };

  const toolbar = (
    <div className="vector-webview-toolbar">
      <div className="vector-webview-actions">
        <button
          type="button"
          className="vector-webview-icon-button"
          onClick={() => {
            setExporting(true);
            vscode.postMessage({ type: "exportPdf" });
          }}
          disabled={exporting || !preview}
          title="Export PDF"
          aria-label="Export PDF"
        >
          {exporting ? <LoaderCircle className="vector-webview-spin" size={17} /> : <Download size={17} />}
        </button>
      </div>
      <div className="vector-webview-zoom">
        <button type="button" onClick={() => setZoom((value) => Math.max(0.5, value - 0.05))} title="Zoom out" aria-label="Zoom out"><ZoomOut size={17} /></button>
        <input aria-label="Preview zoom" type="range" min="0.5" max="2" step="0.05" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} />
        <button type="button" onClick={() => setZoom((value) => Math.min(2, value + 0.05))} title="Zoom in" aria-label="Zoom in"><ZoomIn size={17} /></button>
        <span>{Math.round(zoom * 100)}%</span>
      </div>
      <span className="vector-webview-status">{status}</span>
    </div>
  );

  return (
    <PreviewSurface toolbar={toolbar} ref={scrollRef} className="vector-vscode-preview" onClick={onSourceClick}>
      {error ? <div className="vector-webview-error">{error}</div> : null}
      {!preview && !error ? <div className="vector-webview-pending">{status}</div> : null}
      {preview ? (
        <div className="vector-preview-pages">
          {preview.pageMeta.map((meta) => (
            <div
              className="vector-preview-page"
              data-index={meta.index}
              key={meta.index}
              style={{ width: meta.width * zoom, height: meta.height * zoom }}
            >
              <div className="vector-preview-page-sheet">
                {preview.pages.has(meta.index) ? (
                  <div
                    className="vector-webview-page-svg"
                    style={{ width: meta.width * zoom, height: meta.height * zoom }}
                    dangerouslySetInnerHTML={{ __html: scaleSvg(preview.pages.get(meta.index)!, meta, zoom) }}
                  />
                ) : null}
              </div>
              <div className="vector-preview-page-number" aria-label={`Page ${meta.index + 1}`}>
                {meta.index + 1}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </PreviewSurface>
  );
}

function scaleSvg(svg: string, meta: PageMeta, zoom: number): string {
  return svg.replace(/<svg\b([^>]*)>/, (_match, attrs: string) => {
    const withoutSize = attrs.replace(/\s(?:width|height)="[^"]*"/g, "");
    return `<svg${withoutSize} width="${meta.width * zoom}" height="${meta.height * zoom}">`;
  });
}

function decodeFragmentId(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function visibleIndexesForMeta(metaList: PageMeta[], pane: HTMLDivElement | null, zoom: number): number[] {
  if (metaList.length === 0) return [];
  if (!pane) return metaList.slice(0, Math.min(3, metaList.length)).map((meta) => meta.index);

  const viewportTop = pane.scrollTop;
  const viewportBottom = viewportTop + pane.clientHeight;
  const buffer = Math.max(pane.clientHeight * 1.25, 900);
  const indexes: number[] = [];
  let pageTop = 28;

  for (const meta of metaList) {
    const pageHeight = meta.height * zoom;
    const pageBottom = pageTop + pageHeight;
    if (pageBottom >= viewportTop - buffer && pageTop <= viewportBottom + buffer) indexes.push(meta.index);
    pageTop = pageBottom + 24;
  }

  if (indexes.length > 0) return indexes;

  let nearestIndex = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;
  pageTop = 28;
  for (const meta of metaList) {
    const distance = Math.abs(pageTop - viewportTop);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = meta.index;
    }
    pageTop += meta.height * zoom + 24;
  }
  return [nearestIndex];
}

function acknowledge(message: any, payloads: PagePayload[], totalPages: number, receivedAt: number, receivedEpochMs: number) {
  requestAnimationFrame(() => vscode.postMessage({
    type: "previewShown",
    updateId: message.updateId,
    sentAtEpochMs: message.sentAtEpochMs,
    receivedEpochMs,
    receivedAt,
    shownAt: performance.now(),
    shownEpochMs: Date.now(),
    pages: payloads.length,
    totalPages,
    indexes: payloads.map((payload) => payload.index)
  }));
}
