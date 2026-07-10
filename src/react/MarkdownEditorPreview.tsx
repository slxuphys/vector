import { useCallback, useEffect, useRef, useState, type MutableRefObject, type ReactNode } from "react";
import type { EngineOptions } from "../core/engine/engineTypes";
import { warmPdfMathArtifactCache } from "../core/renderers/pdf/pdfMathArtifact";
import { downloadPdf } from "../core/renderers/pdf/renderToPdf";
import { isDebugLogEnabled } from "../core/utils/debugSettings";
import { MarkdownEditor, type MarkdownEditorController } from "./editor/MarkdownEditor";
import { PreviewPane } from "./preview/PreviewPane";
import { PreviewToolbar } from "./preview/PreviewToolbar";
import { useDocumentLayout, type PreviewUpdateTiming } from "./useDocumentLayout";

export type MarkdownEditorPreviewProps = {
  initialMarkdown?: string;
  options?: EngineOptions;
  sidePanel?: ReactNode;
};

type PreviewRequest = {
  markdown: string;
  timing?: PreviewUpdateTiming;
};

export function MarkdownEditorPreview({ initialMarkdown = "", options = {}, sidePanel }: MarkdownEditorPreviewProps) {
  const [previewRequest, setPreviewRequest] = useState<PreviewRequest>({ markdown: initialMarkdown });
  const [zoom, setZoom] = useState(0.9);
  const [pdfPending, setPdfPending] = useState(false);
  const [experimentalVectorMath, setExperimentalVectorMath] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [sourceNavigation, setSourceNavigation] = useState<{ offset: number; id: number } | undefined>(undefined);
  const sourceNavigationIdRef = useRef(0);
  const editorControllerRef = useRef<MarkdownEditorController | undefined>(undefined);
  const previewUpdateIdRef = useRef(0);
  const startupLogRef = useRef({ editor: false, preview: false });
  const layoutState = useDocumentLayout(previewRequest.markdown, options, previewRequest.timing);
  const usingKatexGlyph = options.mathRenderer === "katex-glyph";
  const usingKatexRaster = options.mathRenderer === "katex-raster" || options.mathRenderer === undefined;
  const usingMathJaxVector = options.mathRenderer === "mathjax-vector";
  const usingMathJaxGlyph = options.mathRenderer === "mathjax-glyph";
  const usingGlyphPdf = usingKatexGlyph || usingMathJaxGlyph;

  const handleEditorReady = useCallback(() => {
    logStartupMilestone("editor", startupLogRef);
  }, []);

  const handlePreviewSourceClick = useCallback((source: { start: number; end: number }) => {
    editorControllerRef.current?.revealSource(source);
  }, []);

  const handleEditorSourceNavigation = useCallback((offset: number) => {
    setSourceNavigation({ offset, id: ++sourceNavigationIdRef.current });
  }, []);

  const handleDebouncedChange = useCallback((markdown: string, timing: Omit<PreviewUpdateTiming, "id">) => {
    setPreviewRequest({
      markdown,
      timing: {
        id: ++previewUpdateIdRef.current,
        ...timing
      }
    });
  }, []);

  useEffect(() => {
    if (!layoutState.layout) return;
    logStartupMilestone("preview", startupLogRef);
  }, [layoutState.layout]);

  useEffect(() => {
    if (!layoutState.layout || !usingKatexRaster || experimentalVectorMath) return;
    let cancelled = false;
    const timeout = window.setTimeout(() => {
      if (!cancelled && layoutState.layout) void warmPdfMathArtifactCache(layoutState.layout);
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [experimentalVectorMath, layoutState.layout, usingKatexRaster]);

  useEffect(() => {
    const printQuery = window.matchMedia("print");
    const handleBeforePrint = () => setPrinting(true);
    const handleAfterPrint = () => setPrinting(false);
    const handlePrintQuery = (event: MediaQueryListEvent) => setPrinting(event.matches);

    window.addEventListener("beforeprint", handleBeforePrint);
    window.addEventListener("afterprint", handleAfterPrint);
    printQuery.addEventListener("change", handlePrintQuery);
    return () => {
      window.removeEventListener("beforeprint", handleBeforePrint);
      window.removeEventListener("afterprint", handleAfterPrint);
      printQuery.removeEventListener("change", handlePrintQuery);
    };
  }, []);

  const handleDownloadPdf = () => {
    const layout = layoutState.layout;
    if (!layout || pdfPending) return;
    setPdfPending(true);
    window.setTimeout(() => {
      const mathPdfMode = usingGlyphPdf ? "glyph" : usingMathJaxVector || experimentalVectorMath ? "vector" : "raster";
      void downloadPdf(layout, "document.pdf", { mathPdfMode, subsetFonts: true })
        .catch((error) => {
          console.error("[pdf-export] failed", error);
        })
        .finally(() => setPdfPending(false));
    }, 150);
  };

  return (
    <div className="svg-md-shell">
      <PreviewToolbar
        layoutState={layoutState}
        zoom={zoom}
        onZoomChange={setZoom}
        pdfPending={pdfPending}
        onDownloadPdf={handleDownloadPdf}
        mathRenderer={options.mathRenderer}
        experimentalVectorMath={experimentalVectorMath}
        onExperimentalVectorMathChange={setExperimentalVectorMath}
      />
      <div className={sidePanel ? "svg-md-workspace svg-md-workspace-with-panel" : "svg-md-workspace"}>
        <MarkdownEditor
          initialMarkdown={initialMarkdown}
          onReady={handleEditorReady}
          onDebouncedChange={handleDebouncedChange}
          onSelectionChange={handleEditorSourceNavigation}
          onControllerReady={(controller) => {
            editorControllerRef.current = controller;
          }}
        />
        <PreviewPane
          layoutState={layoutState}
          zoom={zoom}
          printing={printing}
          sourceOffset={sourceNavigation?.offset}
          sourceNavigationId={sourceNavigation?.id}
          onSourceClick={handlePreviewSourceClick}
        />
        {sidePanel ? <aside className="svg-md-side-panel">{sidePanel}</aside> : null}
      </div>
    </div>
  );
}

function logStartupMilestone(
  milestone: "editor" | "preview",
  ref: MutableRefObject<{ editor: boolean; preview: boolean }>
): void {
  if (ref.current[milestone]) return;
  ref.current[milestone] = true;
  if (!isDebugLogEnabled("preview")) return;
  const startedAt = (globalThis as { __SVG_MD_PLAYGROUND_STARTED_AT__?: number }).__SVG_MD_PLAYGROUND_STARTED_AT__;
  if (startedAt === undefined) return;
  const elapsedMs = performance.now() - startedAt;
  console.log("[startup]", {
    milestone,
    elapsedMs: Math.round(elapsedMs * 10) / 10
  });
}
