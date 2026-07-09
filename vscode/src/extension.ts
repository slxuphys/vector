import * as vscode from "vscode";
import { PageRequestMessage, VectorPreviewPanel } from "./previewPanel";
import { createDocumentEngine, loadNativeMathFonts, renderPageToSvg } from "./previewBundle";

const previewDebounceMs = 150;
const pendingUpdates = new Map<number, PreviewTiming>();
let activePreview: ActivePreview | undefined;

export function activate(context: vscode.ExtensionContext) {
  let previewPanel: VectorPreviewPanel | undefined;
  let previewTimer: ReturnType<typeof setTimeout> | undefined;

  const scheduleRender = (document: vscode.TextDocument, delayMs = previewDebounceMs) => {
    if (!previewPanel?.alive) return;
    const editedAt = performance.now();
    previewPanel.setLoading(document);
    const serial = ++currentSerial;
    pendingUpdates.set(serial, {
      update: serial,
      editedAt,
      debounceMs: delayMs
    });
    if (previewTimer) clearTimeout(previewTimer);
    previewTimer = setTimeout(() => {
      previewTimer = undefined;
      if (!previewPanel?.alive) return;
      void renderPreview(context, previewPanel, document, serial);
    }, delayMs);
  };

  context.subscriptions.push(
    vscode.commands.registerCommand("vector.openPreview", () => {
      const document = activeTextDocument();
      if (!document) return;
      if (!previewPanel?.alive) {
        previewPanel = VectorPreviewPanel.create(context.extensionUri, () => {
          previewPanel = undefined;
          activePreview = undefined;
        });
        previewPanel.onPageRequest((message) => {
          void sendRequestedPages(previewPanel, message);
        });
        previewPanel.onPreviewShown((message) => {
          if (message.updateId === undefined) return;
          const timing = pendingUpdates.get(message.updateId);
          if (!timing) return;
          pendingUpdates.delete(message.updateId);
          const acknowledgedAt = performance.now();
          console.log("[vscode-preview-update]", {
            update: message.updateId,
            debounceMs: round(timing.debounceMs),
            timerDelayMs: round((timing.renderStartedAt ?? timing.editedAt) - timing.editedAt - timing.debounceMs),
            fontLoadMs: round(timing.fontLoadMs ?? 0),
            parseMs: round(timing.parseMs ?? 0),
            layoutMs: round(timing.layoutMs ?? 0),
            engineTotalMs: round(timing.engineTotalMs ?? 0),
            svgRenderMs: round(timing.svgRenderMs ?? 0),
            metadataPostMessageResolveMs: round(timing.metadataPostMessageResolveMs ?? 0),
            hostPostMessageMs: round((timing.previewSentAt ?? acknowledgedAt) - (timing.svgFinishedAt ?? timing.editedAt)),
            postMessageResolveMs: round(timing.postMessageResolveMs ?? 0),
            hostToWebviewMs: message.sentAtEpochMs !== undefined && message.receivedEpochMs !== undefined
              ? message.receivedEpochMs - message.sentAtEpochMs
              : undefined,
            webviewInsertMs: round(message.shownAt - message.receivedAt),
            webviewTotalMs: message.sentAtEpochMs !== undefined && message.shownEpochMs !== undefined
              ? message.shownEpochMs - message.sentAtEpochMs
              : undefined,
            ackDelayMs: round(acknowledgedAt - (timing.previewSentAt ?? acknowledgedAt)),
            totalUntilSvgMs: round(acknowledgedAt - timing.editedAt),
            rawSvgKB: round((timing.rawSvgBytes ?? 0) / 1024),
            sentSvgKB: round((timing.sentSvgBytes ?? 0) / 1024),
            fontCssKB: round((timing.fontCssBytes ?? 0) / 1024),
            pageSvgKB: timing.pageSvgBytes?.map((entry) => ({
              page: entry.page,
              kb: round(entry.bytes / 1024)
            })) ?? [],
            renderedPages: message.pages,
            totalPages: timing.totalPages ?? message.totalPages
          });
        });
      }
      previewPanel.show(document);
      scheduleRender(document, 0);
    }),
    vscode.commands.registerCommand("vector.exportPdf", async () => {
      const document = activeTextDocument();
      if (!document) return;
      const target = document.uri.with({
        path: document.uri.path.replace(/\.[^.\/\\]+$/, "") + ".pdf"
      });
      await vscode.window.showInformationMessage(`Vector PDF export shell is ready: ${target.fsPath.split(/[\\/]/).pop() ?? "document.pdf"}`);
    }),
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (previewPanel?.alive && event.document === vscode.window.activeTextEditor?.document) {
        scheduleRender(event.document);
      }
    }),
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (previewPanel?.alive && editor?.document) {
        scheduleRender(editor.document, 0);
      }
    })
  );
}

export function deactivate() {
  // VS Code disposes subscriptions registered in activate.
}

function activeTextDocument(): vscode.TextDocument | undefined {
  const document = vscode.window.activeTextEditor?.document;
  if (!document) {
    void vscode.window.showWarningMessage("Open a Markdown or LaTeX document before starting Vector preview.");
    return undefined;
  }
  return document;
}

type VectorPreviewBundle = {
  loadNativeMathFonts(): Promise<void>;
  createDocumentEngine(options: { sourceFormat: "markdown" | "latex" }): {
      layout(source: string): Promise<{
      layout: { pages: DisplayPage[] };
      stats: { pageCount: number; totalMs: number; parseMs?: number; layoutMs?: number };
    }>;
  };
  renderPageToSvg(page: DisplayPage, options?: { includeFontCss?: boolean }): string;
};

async function renderPreview(
  context: vscode.ExtensionContext,
  panel: VectorPreviewPanel,
  document: vscode.TextDocument,
  serial: number
): Promise<void> {
  try {
    const timing = pendingUpdates.get(serial);
    if (timing) timing.renderStartedAt = performance.now();
    const bundle = loadPreviewBundle();
    const sourceFormat = document.languageId === "latex" || document.fileName.endsWith(".tex") ? "latex" : "markdown";
    const fontLoadStartedAt = performance.now();
    if (sourceFormat === "latex") await bundle.loadNativeMathFonts();
    if (timing) timing.fontLoadMs = performance.now() - fontLoadStartedAt;
    const engine = bundle.createDocumentEngine({ sourceFormat });
    const result = await engine.layout(document.getText());
    if (timing) {
      timing.parseMs = result.stats.parseMs ?? 0;
      timing.layoutMs = result.stats.layoutMs ?? 0;
      timing.engineTotalMs = result.stats.totalMs;
      timing.totalPages = result.layout.pages.length;
    }
    if (!panel.alive || serial !== latestSerial()) return;
    activePreview = {
      updateId: serial,
      documentUri: document.uri.toString(),
      pages: result.layout.pages,
      stats: result.stats,
      pageMeta: result.layout.pages.map((page, index) => ({
        index,
        width: page.width,
        height: page.height
      })),
      renderedCache: new Map()
    };
    const postStartedAt = performance.now();
    await panel.setPreviewMetadata(document, activePreview.pageMeta, result.stats, serial);
    if (timing) timing.metadataPostMessageResolveMs = performance.now() - postStartedAt;
  } catch (error) {
    if (!panel.alive || serial !== latestSerial()) return;
    panel.setError(document, error instanceof Error ? error.message : String(error));
  }
}

async function sendRequestedPages(panel: VectorPreviewPanel | undefined, message: PageRequestMessage): Promise<void> {
  if (!panel?.alive || !activePreview || message.updateId !== activePreview.updateId) return;
  const uniqueIndexes = [...new Set(message.indexes)]
    .filter((index) => Number.isInteger(index) && index >= 0 && index < activePreview!.pages.length);
  if (uniqueIndexes.length === 0) return;

  const timing = pendingUpdates.get(message.updateId);
  const svgStartedAt = performance.now();
  let rawSvgBytes = 0;
  let sentSvgBytes = 0;
  let fontCssBytes = 0;
  const pages: RenderedPagePayload[] = [];
  const pageSvgBytes: Array<{ page: number; bytes: number }> = [];

  for (const index of uniqueIndexes) {
    const cached = activePreview.renderedCache.get(index);
    if (cached !== undefined) {
      pages.push({ index, svg: cached });
      sentSvgBytes += cached.length;
      pageSvgBytes.push({ page: index, bytes: cached.length });
      continue;
    }
    const rawSvg = renderPageToSvg(activePreview.pages[index], { includeFontCss: false });
    rawSvgBytes += rawSvg.length;
    const svg = rawSvg;
    sentSvgBytes += svg.length;
    pageSvgBytes.push({ page: index, bytes: svg.length });
    activePreview.renderedCache.set(index, svg);
    pages.push({ index, svg });
  }

  if (timing && timing.svgFinishedAt === undefined) {
    timing.svgRenderMs = performance.now() - svgStartedAt;
    timing.svgFinishedAt = performance.now();
    timing.rawSvgBytes = rawSvgBytes;
    timing.sentSvgBytes = sentSvgBytes;
    timing.fontCssBytes = fontCssBytes;
    timing.pageSvgBytes = pageSvgBytes;
    timing.previewSentAt = performance.now();
  }

  const postStartedAt = performance.now();
  await panel.setPreviewPages(message.updateId, pages);
  if (timing && timing.postMessageResolveMs === undefined) {
    timing.postMessageResolveMs = performance.now() - postStartedAt;
  }
}

function latestSerial(): number {
  return currentSerial;
}

let currentSerial = 0;

type PreviewTiming = {
  update: number;
  editedAt: number;
  debounceMs: number;
  renderStartedAt?: number;
  fontLoadMs?: number;
  parseMs?: number;
  layoutMs?: number;
  engineTotalMs?: number;
  svgRenderMs?: number;
  svgFinishedAt?: number;
  previewSentAt?: number;
  postMessageResolveMs?: number;
  metadataPostMessageResolveMs?: number;
  rawSvgBytes?: number;
  sentSvgBytes?: number;
  fontCssBytes?: number;
  totalPages?: number;
  pageSvgBytes?: Array<{ page: number; bytes: number }>;
};

type DisplayPage = Parameters<typeof renderPageToSvg>[0];

type ActivePreview = {
  updateId: number;
  documentUri: string;
  pages: DisplayPage[];
  stats: { pageCount: number; totalMs: number; parseMs?: number; layoutMs?: number };
  pageMeta: PageMeta[];
  renderedCache: Map<number, string>;
};

type PageMeta = {
  index: number;
  width: number;
  height: number;
};

type RenderedPagePayload = {
  index: number;
  svg: string;
};

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function loadPreviewBundle(): VectorPreviewBundle {
  return {
    createDocumentEngine,
    loadNativeMathFonts,
    renderPageToSvg
  };
}

function stripSvgFontStyles(pages: string[]): { pages: string[]; fontCss: string } {
  const styles = new Set<string>();
  const strippedPages = pages.map((page) => page.replace(/<style>([\s\S]*?)<\/style>/g, (_match, css: string) => {
    styles.add(css);
    return "";
  }));
  return {
    pages: strippedPages,
    fontCss: [...styles].join("\n")
  };
}
