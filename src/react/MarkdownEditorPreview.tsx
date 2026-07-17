import { useCallback, useEffect, useLayoutEffect, useRef, useState, type MutableRefObject, type ReactNode } from "react";
import type { EngineOptions } from "../core/engine/engineTypes";
import { debugError, debugLog, isDebugLogEnabled } from "../core/utils/debugSettings";
import { MarkdownEditor, type MarkdownEditorController } from "./editor/MarkdownEditor";
import { PreviewPane } from "./preview/PreviewPane";
import { PreviewToolbar } from "./preview/PreviewToolbar";
import { useDocumentLayout, type PreviewUpdateTiming } from "./useDocumentLayout";

export type MarkdownEditorPreviewProps = {
  initialMarkdown?: string;
  options?: EngineOptions;
  sidePanel?: ReactNode;
  leftPanel?: ReactNode;
  bottomPanel?: ReactNode;
  toolbarPlacement?: "top" | "preview";
  onSourceChange?: (source: string) => void;
  layoutMode?: WorkspaceLayoutMode;
  leftPanelCompact?: boolean;
  editorTheme?: "light" | "dark";
  editorSourceFormat?: "markdown" | "latex" | "text";
  previewAvailable?: boolean;
  previewUnavailableMessage?: string;
  documentKey?: string;
};

export type WorkspaceLayoutMode = "split" | "editor" | "preview";

type PreviewRequest = {
  markdown: string;
  timing?: PreviewUpdateTiming;
};

export function MarkdownEditorPreview({
  initialMarkdown = "",
  options = {},
  sidePanel,
  leftPanel,
  bottomPanel,
  toolbarPlacement = "top",
  onSourceChange,
  layoutMode = "split",
  leftPanelCompact = false,
  editorTheme = "light",
  editorSourceFormat,
  previewAvailable = true,
  previewUnavailableMessage,
  documentKey
}: MarkdownEditorPreviewProps) {
  const [previewRequest, setPreviewRequest] = useState<PreviewRequest>({ markdown: initialMarkdown });
  const [zoom, setZoom] = useState(0.9);
  const [pdfPending, setPdfPending] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [sourceNavigation, setSourceNavigation] = useState<{ offset: number; id: number } | undefined>(undefined);
  const sourceNavigationIdRef = useRef(0);
  const editorControllerRef = useRef<MarkdownEditorController | undefined>(undefined);
  const previewUpdateIdRef = useRef(0);
  const startupLogRef = useRef({ editor: false, preview: false });
  const documentKeyRef = useRef(documentKey);
  const layoutState = useDocumentLayout(previewAvailable ? previewRequest.markdown : "", options, previewRequest.timing);

  useLayoutEffect(() => {
    if (documentKeyRef.current !== documentKey) {
      documentKeyRef.current = documentKey;
      setPreviewRequest({ markdown: initialMarkdown });
      setSourceNavigation(undefined);
      startupLogRef.current = { editor: false, preview: false };
      return;
    }
    setPreviewRequest((current) => current.markdown === initialMarkdown
      ? current
      : { markdown: initialMarkdown });
  }, [documentKey, initialMarkdown]);

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
    if (!previewAvailable || !layout || pdfPending) return;
    setPdfPending(true);
    window.setTimeout(() => {
      void import("../core/renderers/pdf/renderToPdf")
        .then(({ downloadPdf }) => downloadPdf(layout, "document.pdf", { subsetFonts: true, debugLabel: "playground" }))
        .catch((error) => {
          debugError("pdf", "[PDF export] failed", error);
        })
        .finally(() => setPdfPending(false));
    }, 150);
  };

  const toolbar = (
    <PreviewToolbar
      layoutState={layoutState}
      zoom={zoom}
      onZoomChange={setZoom}
      pdfPending={pdfPending}
      onDownloadPdf={handleDownloadPdf}
      variant={toolbarPlacement === "preview" ? "preview" : "lab"}
      previewAvailable={previewAvailable}
    />
  );
  const workspaceFrameClasses = [
    "svg-md-workspace-frame",
    leftPanel ? "svg-md-workspace-frame-with-left-panel" : "",
    leftPanel && leftPanelCompact ? "svg-md-workspace-frame-left-compact" : ""
  ].filter(Boolean).join(" ");
  const workspaceClasses = [
    "svg-md-workspace",
    sidePanel ? "svg-md-workspace-with-panel" : "",
    `svg-md-workspace-layout-${layoutMode}`
  ].filter(Boolean).join(" ");

  return (
    <div className="svg-md-shell">
      {toolbarPlacement === "top" ? toolbar : null}
      <div className="svg-md-workspace-stack">
        <div className={workspaceFrameClasses}>
          {leftPanel ? <aside className="svg-md-file-panel">{leftPanel}</aside> : null}
          <div className="svg-md-work-area">
            <div className={workspaceClasses}>
              <MarkdownEditor
                key={documentKey}
                initialMarkdown={initialMarkdown}
                sourceFormat={editorSourceFormat ?? (options.sourceFormat === "latex" ? "latex" : "markdown")}
                theme={editorTheme}
                onReady={handleEditorReady}
                onDebouncedChange={handleDebouncedChange}
                onChange={onSourceChange}
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
                toolbar={toolbarPlacement === "preview" ? toolbar : undefined}
                unavailableMessage={previewAvailable ? undefined : previewUnavailableMessage ?? "This file type does not have a document preview."}
              />
              {sidePanel ? <aside className="svg-md-side-panel">{sidePanel}</aside> : null}
            </div>
            {bottomPanel}
          </div>
        </div>
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
  debugLog("preview", "[startup]", {
    milestone,
    elapsedMs: Math.round(elapsedMs * 10) / 10
  });
}
