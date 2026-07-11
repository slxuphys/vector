import * as vscode from "vscode";
import * as path from "node:path";
import { PageRequestMessage, VectorPreviewPanel } from "./previewPanel";
import { createDocumentEngine, findSourceAnchorInPages, loadNativeMathFonts, renderPageToSvg, renderToPdf } from "./previewBundle";
import type { PagedDisplayList } from "../../src/core/display-list/displayTypes";

const previewDebounceMs = 150;
const pendingUpdates = new Map<number, PreviewTiming>();
let activePreview: ActivePreview | undefined;
let pdfExportInProgress = false;

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
        previewPanel.onSourceReveal((message) => {
          const documentUri = activePreview?.documentUri;
          if (!documentUri) return;
          const editor = vscode.window.visibleTextEditors.find(
            (candidate) => candidate.document.uri.toString() === documentUri
          );
          if (!editor) {
            console.warn("[source-map] Preview target document is not open in a visible text editor.", { documentUri });
            return;
          }
          const start = editor.document.positionAt(message.start);
          editor.selection = new vscode.Selection(start, start);
          editor.revealRange(new vscode.Range(start, start), vscode.TextEditorRevealType.InCenter);
        });
        previewPanel.onExportPdf(() => {
          void exportPdf(previewPanel);
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
      await exportPdf(previewPanel);
    }),
    vscode.commands.registerCommand("vector.revealCursorInPreview", () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || !previewPanel?.alive || !activePreview) return;
      if (editor.document.uri.toString() !== activePreview.documentUri) return;
      const offset = editor.document.offsetAt(editor.selection.active);
      const anchor = findSourceAnchorInPages(activePreview.pages, offset);
      if (anchor) void previewPanel.revealSource(anchor);
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
  createDocumentEngine(options: {
    sourceFormat: "markdown" | "latex";
    mathRenderer: "native-openmath";
    nativeMathProfile: "openmath";
    bibliographyFiles?: Record<string, string>;
  }): {
      layout(source: string): Promise<{
      layout: PagedDisplayList;
      stats: { pageCount: number; totalMs: number; parseMs?: number; layoutMs?: number };
    }>;
  };
  renderPageToSvg(page: DisplayPage, options?: { includeFontCss?: boolean }): string;
  renderToPdf(layout: PagedDisplayList, options?: { mathPdfMode?: "vector"; subsetFonts?: boolean; debugLabel?: string }): Promise<Uint8Array>;
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
    await bundle.loadNativeMathFonts();
    if (timing) timing.fontLoadMs = performance.now() - fontLoadStartedAt;
    const bibliographyFiles = await loadBibliographyFiles(document, sourceFormat);
    const engine = bundle.createDocumentEngine({
      sourceFormat,
      mathRenderer: "native-openmath",
      nativeMathProfile: "openmath",
      bibliographyFiles
    });
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

async function exportPdf(panel?: VectorPreviewPanel): Promise<void> {
  if (pdfExportInProgress) return;
  const document = documentForExport();
  if (!document) return;
  pdfExportInProgress = true;
  const sourceFormat = document.languageId === "latex" || document.fileName.endsWith(".tex") ? "latex" : "markdown";
  await panel?.setExportStatus("pending", "Exporting PDF...");

  try {
    const bundle = loadPreviewBundle();
    await bundle.loadNativeMathFonts();
    const bibliographyFiles = await loadBibliographyFiles(document, sourceFormat);
    const engine = bundle.createDocumentEngine({
      sourceFormat,
      mathRenderer: "native-openmath",
      nativeMathProfile: "openmath",
      bibliographyFiles
    });
    const result = await engine.layout(document.getText());
    const bytes = await bundle.renderToPdf(result.layout, {
      mathPdfMode: "vector",
      subsetFonts: true,
      debugLabel: "vscode"
    });
    const target = await exportTargetFor(document);
    if (!target) {
      await panel?.setExportStatus("complete", "PDF export cancelled");
      return;
    }
    await vscode.workspace.fs.writeFile(target, bytes);
    const filename = path.basename(target.fsPath || target.path);
    await panel?.setExportStatus("complete", "Saved " + filename);
    void vscode.window.showInformationMessage("Vector exported " + filename, "Open PDF").then((action) => {
      if (action === "Open PDF") void vscode.commands.executeCommand("vscode.open", target);
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await panel?.setExportStatus("error", "PDF export failed");
    void vscode.window.showErrorMessage("Vector PDF export failed: " + message);
    console.error("[vector-pdf-export]", error);
  } finally {
    pdfExportInProgress = false;
  }
}

function documentForExport(): vscode.TextDocument | undefined {
  const previewDocument = activePreview
    ? vscode.workspace.textDocuments.find((document) => document.uri.toString() === activePreview?.documentUri)
    : undefined;
  return previewDocument ?? activeTextDocument();
}

async function exportTargetFor(document: vscode.TextDocument): Promise<vscode.Uri | undefined> {
  if (document.uri.scheme === "file") {
    return document.uri.with({ path: document.uri.path.replace(/\.[^.\/\\]+$/, "") + ".pdf" });
  }
  return vscode.window.showSaveDialog({
    defaultUri: document.uri.with({ path: document.uri.path.replace(/\.[^.\/\\]+$/, "") + ".pdf" }),
    filters: { PDF: ["pdf"] },
    title: "Export Vector PDF"
  });
}

async function loadBibliographyFiles(
  document: vscode.TextDocument,
  sourceFormat: "markdown" | "latex"
): Promise<Record<string, string>> {
  const source = document.getText();
  const paths = sourceFormat === "latex"
    ? [...source.matchAll(/\\bibliography\s*\{([^}]+)}/g)].flatMap((match) => match[1].split(","))
    : [source.match(/^---[\s\S]*?^bibliography:\s*["']?([^#\n"']+)/m)?.[1] ?? ""];
  const files: Record<string, string> = {};
  const root = vscode.Uri.file(path.dirname(document.uri.fsPath));

  for (const rawPath of paths) {
    const requested = rawPath.trim();
    if (!requested) continue;
    const candidates = requested.toLowerCase().endsWith(".bib") ? [requested] : [requested, requested + ".bib"];
    for (const candidate of candidates) {
      try {
        const uri = vscode.Uri.joinPath(root, ...candidate.replaceAll("\\", "/").split("/"));
        const content = new TextDecoder().decode(await vscode.workspace.fs.readFile(uri));
        files[requested] = content;
        files[candidate] = content;
        break;
      } catch {
        // The resolver renders unresolved citations in red and keeps the preview usable.
      }
    }
  }

  return files;
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
    findSourceAnchorInPages,
    loadNativeMathFonts,
    renderPageToSvg,
    renderToPdf
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
