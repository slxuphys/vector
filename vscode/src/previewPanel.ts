import * as vscode from "vscode";
import { vectorWebviewFontCss } from "./webviewFonts";

export class VectorPreviewPanel {
  private readonly panel: vscode.WebviewPanel;
  private disposed = false;
  private previewShownHandlers: Array<(message: PreviewShownMessage) => void> = [];
  private pageRequestHandlers: Array<(message: PageRequestMessage) => void> = [];
  private sourceRevealHandlers: Array<(message: SourceRevealMessage) => void> = [];
  private exportHandlers: Array<() => void> = [];
  private debugLogHandlers: Array<(message: WebviewDebugLogMessage) => void> = [];

  private constructor(extensionUri: vscode.Uri, onDispose: () => void) {
    this.panel = vscode.window.createWebviewPanel(
      "vectorPreview",
      "Vector Preview",
      vscode.ViewColumn.Beside,
      { enableScripts: true, localResourceRoots: [extensionUri] }
    );
    this.panel.onDidDispose(() => {
      this.disposed = true;
      onDispose();
    });
    this.panel.webview.onDidReceiveMessage((message: unknown) => {
      if (isPreviewShownMessage(message)) {
        this.previewShownHandlers.forEach((handler) => handler(message));
      } else if (isPageRequestMessage(message)) {
        this.pageRequestHandlers.forEach((handler) => handler(message));
      } else if (isSourceRevealMessage(message)) {
        this.sourceRevealHandlers.forEach((handler) => handler(message));
      } else if (isExportPdfMessage(message)) {
        this.exportHandlers.forEach((handler) => handler());
      } else if (isWebviewDebugLogMessage(message)) {
        this.debugLogHandlers.forEach((handler) => handler(message));
      }
    });
    this.panel.webview.html = webviewHtml(this.panel.webview, extensionUri);
  }

  static create(extensionUri: vscode.Uri, onDispose: () => void): VectorPreviewPanel {
    return new VectorPreviewPanel(extensionUri, onDispose);
  }

  get alive(): boolean {
    return !this.disposed;
  }

  show(document: vscode.TextDocument): void {
    if (this.disposed) return;
    this.panel.reveal(vscode.ViewColumn.Beside);
    this.setLoading(document);
  }

  setLoading(document: vscode.TextDocument): void {
    if (this.disposed) return;
    this.setTitle(document);
    void this.panel.webview.postMessage({
      type: "loading",
      sourceLength: document.getText().length,
      sourceFormat: document.languageId === "latex" || document.fileName.endsWith(".tex") ? "latex" : "markdown",
      uri: document.uri.toString()
    });
  }

  onPreviewShown(handler: (message: PreviewShownMessage) => void): void {
    this.previewShownHandlers.push(handler);
  }

  onPageRequest(handler: (message: PageRequestMessage) => void): void {
    this.pageRequestHandlers.push(handler);
  }

  onSourceReveal(handler: (message: SourceRevealMessage) => void): void {
    this.sourceRevealHandlers.push(handler);
  }

  onExportPdf(handler: () => void): void {
    this.exportHandlers.push(handler);
  }

  onDebugLog(handler: (message: WebviewDebugLogMessage) => void): void {
    this.debugLogHandlers.push(handler);
  }

  setExportStatus(state: "pending" | "complete" | "error", message?: string): Thenable<boolean> {
    if (this.disposed) return Promise.resolve(false);
    return this.panel.webview.postMessage({ type: "exportStatus", state, message });
  }

  setDebugSettings(settings: { pdf: boolean; assets: boolean }): Thenable<boolean> {
    if (this.disposed) return Promise.resolve(false);
    return this.panel.webview.postMessage({ type: "debugSettings", settings });
  }

  revealSource(anchor: { page: number; y: number; source: { start: number; end: number } }): Thenable<boolean> {
    if (this.disposed) return Promise.resolve(false);
    return this.panel.webview.postMessage({
      type: "revealSource",
      page: anchor.page,
      y: anchor.y,
      start: anchor.source.start,
      end: anchor.source.end
    });
  }

  setPreviewMetadata(
    document: vscode.TextDocument,
    pageMeta: PageMeta[],
    stats: { pageCount: number; totalMs: number },
    updateId?: number
  ): Thenable<boolean> {
    if (this.disposed) return Promise.resolve(false);
    this.setTitle(document);
    return this.panel.webview.postMessage({ type: "preview", pageMeta, stats, updateId, sentAtEpochMs: Date.now() });
  }

  setPreviewPages(updateId: number, pages: RenderedPagePayload[]): Thenable<boolean> {
    if (this.disposed) return Promise.resolve(false);
    return this.panel.webview.postMessage({ type: "previewPages", updateId, pages, sentAtEpochMs: Date.now() });
  }

  setError(document: vscode.TextDocument, message: string): void {
    if (this.disposed) return;
    this.setTitle(document);
    void this.panel.webview.postMessage({ type: "error", message });
  }

  private setTitle(document: vscode.TextDocument): void {
    this.panel.title = `Vector Preview: ${document.fileName.split(/[\\/]/).pop() ?? "document"}`;
  }
}

export type PreviewShownMessage = {
  type: "previewShown";
  updateId?: number;
  sentAtEpochMs?: number;
  receivedEpochMs?: number;
  receivedAt: number;
  shownAt: number;
  shownEpochMs?: number;
  pages: number;
  totalPages?: number;
  indexes?: number[];
};

export type PageRequestMessage = { type: "requestPages"; updateId: number; indexes: number[] };
export type SourceRevealMessage = { type: "revealSource"; start: number; end: number };
export type WebviewDebugLogMessage = {
  type: "debugLog";
  entry: {
    key: string;
    level: "log" | "warn" | "error";
    label: string;
    details?: unknown;
  };
};
type ExportPdfMessage = { type: "exportPdf" };
type PageMeta = { index: number; width: number; height: number };
type RenderedPagePayload = { index: number; svg: string };

function webviewHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const nonce = randomNonce();
  const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "webview-dist", "webview.js"));
  const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "webview-dist", "webview.css"));
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: ${webview.cspSource} https:; font-src data: ${webview.cspSource}; style-src 'unsafe-inline' ${webview.cspSource}; script-src 'nonce-${nonce}' ${webview.cspSource}; worker-src ${webview.cspSource} blob:;" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Vector Preview</title>
    <link rel="stylesheet" href="${styleUri}" />
    <style id="vector-svg-fonts">${vectorWebviewFontCss}</style>
  </head>
  <body>
    <div id="root"></div>
    <script nonce="${nonce}" type="module" src="${scriptUri}"></script>
  </body>
</html>`;
}

function isPreviewShownMessage(message: unknown): message is PreviewShownMessage {
  if (!message || typeof message !== "object") return false;
  const record = message as Record<string, unknown>;
  return record.type === "previewShown" && typeof record.receivedAt === "number" && typeof record.shownAt === "number" && typeof record.pages === "number";
}

function isPageRequestMessage(message: unknown): message is PageRequestMessage {
  if (!message || typeof message !== "object") return false;
  const record = message as Record<string, unknown>;
  return record.type === "requestPages" && typeof record.updateId === "number" && Array.isArray(record.indexes) && record.indexes.every((index) => typeof index === "number");
}

function isSourceRevealMessage(message: unknown): message is SourceRevealMessage {
  if (!message || typeof message !== "object") return false;
  const record = message as Record<string, unknown>;
  return record.type === "revealSource" && typeof record.start === "number" && typeof record.end === "number";
}

function isExportPdfMessage(message: unknown): message is ExportPdfMessage {
  return Boolean(message && typeof message === "object" && (message as Record<string, unknown>).type === "exportPdf");
}

function isWebviewDebugLogMessage(message: unknown): message is WebviewDebugLogMessage {
  if (!message || typeof message !== "object") return false;
  const record = message as Record<string, unknown>;
  if (record.type !== "debugLog" || !record.entry || typeof record.entry !== "object") return false;
  const entry = record.entry as Record<string, unknown>;
  return typeof entry.key === "string"
    && (entry.level === "log" || entry.level === "warn" || entry.level === "error")
    && typeof entry.label === "string";
}

function randomNonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let value = "";
  for (let index = 0; index < 32; index += 1) value += chars[Math.floor(Math.random() * chars.length)];
  return value;
}
