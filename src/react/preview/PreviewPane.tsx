import { useEffect, useRef, useState, type ReactNode } from "react";
import { previewFontFaceCss } from "../../core/renderers/svg/previewFontCss";
import { SvgPagedPreview } from "../SvgPagedPreview";
import type { DocumentLayoutState } from "../useDocumentLayout";
import { previewScrollTopForSource } from "../navigation/previewSourceNavigation";
import { FileQuestion } from "lucide-react";
import { PreviewSurface } from "./PreviewSurface";

const previewFontCss = previewFontFaceCss();
const sourceHighlightCss = `
@keyframes vector-source-highlight-pulse {
  0% { filter: drop-shadow(0 0 0 rgba(37, 99, 235, 0)); }
  20% { filter: drop-shadow(0 0 5px rgba(37, 99, 235, 0.95)); }
  70% { filter: drop-shadow(0 0 3px rgba(37, 99, 235, 0.65)); }
  100% { filter: drop-shadow(0 0 0 rgba(37, 99, 235, 0)); }
}
.vector-source-highlight { animation: vector-source-highlight-pulse 1.15s ease-out; }
`;

export type PreviewPaneProps = {
  layoutState: DocumentLayoutState;
  zoom: number;
  printing?: boolean;
  overscanPages?: number;
  sourceOffset?: number;
  sourceNavigationId?: number;
  onSourceClick?: (source: { start: number; end: number }) => void;
  toolbar?: ReactNode;
  unavailableMessage?: string;
};

export function PreviewPane({
  layoutState,
  zoom,
  printing = false,
  overscanPages = 2,
  sourceOffset,
  sourceNavigationId,
  onSourceClick,
  toolbar,
  unavailableMessage
}: PreviewPaneProps) {
  const previewPaneRef = useRef<HTMLDivElement | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [sourceHighlight, setSourceHighlight] = useState<{ start: number; end: number; id: number } | undefined>(undefined);

  useEffect(() => {
    const pane = previewPaneRef.current;
    const layout = layoutState.layout;
    if (!pane || !layout || sourceOffset === undefined) return;
    const target = previewScrollTopForSource(layout, sourceOffset, zoom, pane.clientHeight);
    if (!target) return;
    setSourceHighlight({ ...target.source, id: sourceNavigationId ?? 0 });
    pane.scrollTo({ top: target.top, behavior: "auto" });
  }, [layoutState.layout, sourceNavigationId, sourceOffset, zoom]);

  useEffect(() => {
    if (!sourceHighlight) return undefined;
    const highlightId = sourceHighlight.id;
    const timeout = window.setTimeout(() => {
      setSourceHighlight((current) => current?.id === highlightId ? undefined : current);
    }, 1200);
    return () => window.clearTimeout(timeout);
  }, [sourceHighlight]);

  useEffect(() => {
    const pane = previewPaneRef.current;
    const layout = layoutState.layout;
    if (!pane || !layout) return;

    let frame = 0;
    const updateCurrentPage = () => {
      frame = 0;
      const pageHeight = layout.page.height * zoom;
      const pageStride = pageHeight + 24;
      const page = Math.max(0, Math.floor(Math.max(0, pane.scrollTop - 28) / pageStride));
      setCurrentPage(Math.min(page, layout.pages.length - 1));
    };
    const scheduleUpdate = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(updateCurrentPage);
    };

    updateCurrentPage();
    pane.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      pane.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
    };
  }, [layoutState.layout, zoom]);

  return (
    <PreviewSurface toolbar={toolbar} ref={previewPaneRef}>
        <style>{previewFontCss + sourceHighlightCss}</style>
        {unavailableMessage ? (
          <div className="svg-md-preview-unavailable">
            <FileQuestion size={30} aria-hidden="true" />
            <strong>Preview not available</strong>
            <span>{unavailableMessage}</span>
          </div>
        ) : null}
        {!unavailableMessage && layoutState.error ? <div className="svg-md-error">{layoutState.error.message}</div> : null}
        {!unavailableMessage && layoutState.layout ? (
          <SvgPagedPreview
            layout={layoutState.layout}
            zoom={printing ? 1 : zoom}
            currentPage={currentPage}
            overscanPages={overscanPages}
            renderAllPages={printing}
            timing={layoutState.timing}
            onSourceClick={onSourceClick}
            sourceHighlight={sourceHighlight}
          />
        ) : null}
    </PreviewSurface>
  );
}
