import { useEffect, useRef, useState } from "react";
import { previewFontFaceCss } from "../../core/renderers/svg/previewFontCss";
import { SvgPagedPreview } from "../SvgPagedPreview";
import type { DocumentLayoutState } from "../useDocumentLayout";

const previewFontCss = previewFontFaceCss();

export type PreviewPaneProps = {
  layoutState: DocumentLayoutState;
  zoom: number;
  printing?: boolean;
  overscanPages?: number;
};

export function PreviewPane({
  layoutState,
  zoom,
  printing = false,
  overscanPages = 2
}: PreviewPaneProps) {
  const previewPaneRef = useRef<HTMLDivElement | null>(null);
  const [currentPage, setCurrentPage] = useState(0);

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
    <div className="svg-md-preview-pane" ref={previewPaneRef}>
      <style>{previewFontCss}</style>
      {layoutState.error ? <div className="svg-md-error">{layoutState.error.message}</div> : null}
      {layoutState.layout ? (
        <SvgPagedPreview
          layout={layoutState.layout}
          zoom={printing ? 1 : zoom}
          currentPage={currentPage}
          overscanPages={overscanPages}
          renderAllPages={printing}
          timing={layoutState.timing}
        />
      ) : null}
    </div>
  );
}
