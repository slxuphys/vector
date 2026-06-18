import { markdown as markdownLanguage } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { useEffect, useMemo, useRef, useState } from "react";
import type { EngineOptions } from "../core/engine/workerProtocol";
import { downloadPdf } from "../core/renderers/pdf/renderToPdf";
import { SvgPagedPreview } from "./SvgPagedPreview";
import { useDocumentLayout, type PreviewUpdateTiming } from "./useDocumentLayout";

export type MarkdownEditorPreviewProps = {
  initialMarkdown?: string;
  options?: EngineOptions;
};

type PreviewRequest = {
  markdown: string;
  timing?: PreviewUpdateTiming;
};

export function MarkdownEditorPreview({ initialMarkdown = "", options = {} }: MarkdownEditorPreviewProps) {
  const [previewRequest, setPreviewRequest] = useState<PreviewRequest>({ markdown: initialMarkdown });
  const [zoom, setZoom] = useState(0.9);
  const [currentPage, setCurrentPage] = useState(0);
  const [pdfPending, setPdfPending] = useState(false);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const previewPaneRef = useRef<HTMLDivElement | null>(null);
  const previewUpdateRef = useRef<number | undefined>(undefined);
  const previewUpdateIdRef = useRef(0);
  const layoutState = useDocumentLayout(previewRequest.markdown, options, previewRequest.timing);

  const extensions = useMemo(
    () => [
      history(),
      markdownLanguage(),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      EditorView.lineWrapping,
      EditorView.updateListener.of((update) => {
        if (!update.docChanged) return;
        const doc = update.state.doc;
        const editedAt = performance.now();
        window.clearTimeout(previewUpdateRef.current);
        previewUpdateRef.current = window.setTimeout(() => {
          const debounceFinishedAt = performance.now();
          setPreviewRequest({
            markdown: doc.toString(),
            timing: {
              id: ++previewUpdateIdRef.current,
              editedAt,
              debounceFinishedAt,
              debounceMs: debounceFinishedAt - editedAt
            }
          });
        }, 150);
      })
    ],
    []
  );

  useEffect(() => {
    if (!editorRef.current) return;
    const view = new EditorView({
      parent: editorRef.current,
      state: EditorState.create({ doc: initialMarkdown, extensions })
    });
    return () => {
      window.clearTimeout(previewUpdateRef.current);
      view.destroy();
    };
  }, [extensions, initialMarkdown]);

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

  const handleDownloadPdf = async () => {
    if (!layoutState.layout || pdfPending) return;
    setPdfPending(true);
    try {
      await downloadPdf(layoutState.layout, "document.pdf");
    } finally {
      setPdfPending(false);
    }
  };

  return (
    <div className="svg-md-shell">
      <div className="svg-md-toolbar">
        <button
          type="button"
          className="svg-md-download-button"
          disabled={!layoutState.layout || pdfPending}
          onClick={handleDownloadPdf}
        >
          {pdfPending ? <span className="svg-md-spinner" aria-hidden="true" /> : null}
          <span>{pdfPending ? "Generating PDF" : "Download PDF"}</span>
        </button>
        <label>
          Zoom
          <input
            type="range"
            min="0.55"
            max="1.4"
            step="0.05"
            value={zoom}
            onChange={(event) => setZoom(Number(event.target.value))}
          />
        </label>
        <span>{layoutState.stats ? `${layoutState.stats.pageCount} pages` : "Laying out..."}</span>
      </div>
      <div className="svg-md-workspace">
        <div className="svg-md-editor" ref={editorRef} />
        <div className="svg-md-preview-pane" ref={previewPaneRef}>
          {layoutState.error ? <div className="svg-md-error">{layoutState.error.message}</div> : null}
          {layoutState.layout ? (
            <SvgPagedPreview
              layout={layoutState.layout}
              zoom={zoom}
              currentPage={currentPage}
              overscanPages={2}
              timing={layoutState.timing}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
