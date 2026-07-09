import * as vscode from "vscode";
import { vectorWebviewFontCss } from "./webviewFonts";

export class VectorPreviewPanel {
  private readonly panel: vscode.WebviewPanel;
  private documentUri: vscode.Uri | undefined;
  private disposed = false;
  private previewShownHandlers: Array<(message: PreviewShownMessage) => void> = [];
  private pageRequestHandlers: Array<(message: PageRequestMessage) => void> = [];

  private constructor(extensionUri: vscode.Uri, onDispose: () => void) {
    this.panel = vscode.window.createWebviewPanel(
      "vectorPreview",
      "Vector Preview",
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        localResourceRoots: [extensionUri]
      }
    );
    this.panel.onDidDispose(() => {
      this.disposed = true;
      onDispose();
    });
    this.panel.webview.onDidReceiveMessage((message: unknown) => {
      if (isPreviewShownMessage(message)) {
        for (const handler of this.previewShownHandlers) handler(message);
        return;
      }
      if (isPageRequestMessage(message)) {
        for (const handler of this.pageRequestHandlers) handler(message);
      }
    });
    this.panel.webview.html = this.html();
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
    this.documentUri = document.uri;
    this.panel.title = `Vector Preview: ${document.fileName.split(/[\\/]/).pop() ?? "document"}`;
    this.panel.webview.postMessage({
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

  setPreviewMetadata(
    document: vscode.TextDocument,
    pageMeta: PageMeta[],
    stats: { pageCount: number; totalMs: number },
    updateId?: number
  ): Thenable<boolean> {
    if (this.disposed) return Promise.resolve(false);
    this.documentUri = document.uri;
    this.panel.title = `Vector Preview: ${document.fileName.split(/[\\/]/).pop() ?? "document"}`;
    return this.panel.webview.postMessage({
      type: "preview",
      pageMeta,
      stats,
      updateId,
      sentAtEpochMs: Date.now()
    });
  }

  setPreviewPages(updateId: number, pages: RenderedPagePayload[]): Thenable<boolean> {
    if (this.disposed) return Promise.resolve(false);
    return this.panel.webview.postMessage({
      type: "previewPages",
      updateId,
      pages,
      sentAtEpochMs: Date.now()
    });
  }

  setError(document: vscode.TextDocument, message: string): void {
    if (this.disposed) return;
    this.documentUri = document.uri;
    this.panel.title = `Vector Preview: ${document.fileName.split(/[\\/]/).pop() ?? "document"}`;
    this.panel.webview.postMessage({
      type: "error",
      message
    });
  }

  private html(): string {
    const nonce = randomNonce();
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: vscode-resource: https:; font-src data:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Vector Preview</title>
    <style id="vector-svg-fonts">${vectorWebviewFontCss}</style>
    <style>
      body { margin: 0; font-family: ui-sans-serif, system-ui, sans-serif; color: var(--vscode-foreground); background: var(--vscode-editor-background); }
      #root { min-height: 100vh; padding: 24px; box-sizing: border-box; }
      .pending { color: var(--vscode-descriptionForeground); }
      .error { color: var(--vscode-errorForeground); white-space: pre-wrap; }
      .toolbar { margin: 0 auto 16px; max-width: 900px; color: var(--vscode-descriptionForeground); font-size: 12px; display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: 16px; }
      .status { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: right; }
      .zoom-control { display: inline-flex; align-items: center; gap: 8px; flex: 0 0 auto; }
      .zoom-control input { width: 130px; }
      .zoom-value { min-width: 42px; text-align: right; font-variant-numeric: tabular-nums; }
      .pages { display: grid; gap: 24px; justify-content: center; }
      .page { background: white; box-shadow: 0 8px 30px rgba(0,0,0,.28); line-height: 0; overflow: hidden; transform-origin: top center; }
      .page.pending-page { background: #fff; }
      .page svg { display: block; user-select: text; }
    </style>
  </head>
  <body>
    <div id="root"><div class="pending">Vector preview webview shell is connected.</div></div>
    <script nonce="${nonce}">
      const vscode = acquireVsCodeApi();
      let hasPreview = false;
      let zoom = 1;
      let activeUpdateId = undefined;
      let pageMeta = [];
      let activeStats = undefined;
      let pendingPreview = undefined;
      let loadedPages = new Set();
      let requestedPages = new Set();
      let visibleRequestTimer = undefined;
      function applyZoom() {
        const pages = document.querySelectorAll(".page");
        for (const page of pages) {
          const svg = page.querySelector("svg");
          const index = Number(page.dataset.index);
          const meta = pageMeta[index] || {};
          const width = Number(svg?.getAttribute("width")) || meta.width || 612;
          const height = Number(svg?.getAttribute("height")) || meta.height || 792;
          page.style.width = (width * zoom) + "px";
          page.style.height = (height * zoom) + "px";
          if (svg) {
            svg.style.width = (width * zoom) + "px";
            svg.style.height = (height * zoom) + "px";
          }
        }
        const value = document.querySelector(".zoom-value");
        if (value) value.textContent = Math.round(zoom * 100) + "%";
      }
      function scheduleVisibleRequest() {
        if (visibleRequestTimer !== undefined) return;
        visibleRequestTimer = window.setTimeout(() => {
          visibleRequestTimer = undefined;
          requestVisiblePages();
        }, 30);
      }
      function requestVisiblePages() {
        if (activeUpdateId === undefined) return;
        const pages = [...document.querySelectorAll(".page")];
        const viewportTop = window.scrollY;
        const viewportBottom = viewportTop + window.innerHeight;
        const buffer = Math.max(window.innerHeight * 1.25, 900);
        const indexes = [];
        for (const page of pages) {
          const index = Number(page.dataset.index);
          if (!Number.isInteger(index) || loadedPages.has(index) || requestedPages.has(index)) continue;
          const rect = page.getBoundingClientRect();
          const top = rect.top + window.scrollY;
          const bottom = top + rect.height;
          if (bottom >= viewportTop - buffer && top <= viewportBottom + buffer) {
            indexes.push(index);
          }
        }
        if (indexes.length === 0) return;
        for (const index of indexes) requestedPages.add(index);
        vscode.postMessage({
          type: "requestPages",
          updateId: activeUpdateId,
          indexes
        });
      }
      function requestPendingVisiblePages() {
        if (!pendingPreview) return;
        const indexes = visibleIndexesForMeta(pendingPreview.pageMeta)
          .filter((index) => !pendingPreview.requestedPages.has(index));
        if (indexes.length === 0 && pendingPreview.pageMeta.length > 0) indexes.push(0);
        if (indexes.length === 0) return;
        for (const index of indexes) pendingPreview.requestedPages.add(index);
        vscode.postMessage({
          type: "requestPages",
          updateId: pendingPreview.updateId,
          indexes
        });
      }
      function visibleIndexesForMeta(metaList) {
        const viewportTop = window.scrollY;
        const viewportBottom = viewportTop + window.innerHeight;
        const buffer = Math.max(window.innerHeight * 1.25, 900);
        const rootTop = rootOffsetTop();
        const gap = 24;
        const indexes = [];
        let y = rootTop + 40;
        for (const meta of metaList) {
          const height = (meta.height || 792) * zoom;
          const top = y;
          const bottom = top + height;
          if (bottom >= viewportTop - buffer && top <= viewportBottom + buffer) {
            indexes.push(meta.index);
          }
          y += height + gap;
        }
        return indexes;
      }
      function rootOffsetTop() {
        const root = document.getElementById("root");
        return root ? root.getBoundingClientRect().top + window.scrollY : 0;
      }
      function createToolbar(stats) {
        const toolbar = document.createElement("div");
        toolbar.className = "toolbar";
        const status = document.createElement("div");
        status.className = "status";
        status.textContent = stats.pageCount + ' page(s), laid out in ' + stats.totalMs.toFixed(1) + ' ms';
        const zoomControl = document.createElement("label");
        zoomControl.className = "zoom-control";
        const zoomText = document.createElement("span");
        zoomText.textContent = "Zoom";
        const zoomInput = document.createElement("input");
        zoomInput.type = "range";
        zoomInput.min = "50";
        zoomInput.max = "200";
        zoomInput.step = "5";
        zoomInput.value = String(Math.round(zoom * 100));
        const zoomValue = document.createElement("span");
        zoomValue.className = "zoom-value";
        zoomValue.textContent = Math.round(zoom * 100) + "%";
        zoomInput.addEventListener("input", () => {
          zoom = Number(zoomInput.value) / 100;
          applyZoom();
          scheduleVisibleRequest();
        });
        zoomControl.append(zoomText, zoomInput, zoomValue);
        toolbar.append(zoomControl, status);
        return toolbar;
      }
      function createPages(metaList) {
        const pages = document.createElement("div");
        pages.className = "pages";
        for (const meta of metaList) {
          const page = document.createElement("div");
          page.className = "page pending-page";
          page.dataset.index = String(meta.index);
          page.style.width = (meta.width * zoom) + "px";
          page.style.height = (meta.height * zoom) + "px";
          pages.appendChild(page);
        }
        return pages;
      }
      function activatePreview(updateId, metaList, stats, firstPages) {
        const root = document.getElementById("root");
        activeUpdateId = updateId;
        pageMeta = metaList;
        activeStats = stats;
        loadedPages = new Set();
        requestedPages = new Set();
        const toolbar = createToolbar(stats);
        const pages = createPages(metaList);
        root.replaceChildren(toolbar, pages);
        hasPreview = true;
        insertPagePayloads(firstPages || []);
        applyZoom();
      }
      function insertPagePayloads(payloads) {
        const insertedIndexes = [];
        for (const payload of payloads || []) {
          const page = document.querySelector('.page[data-index="' + payload.index + '"]');
          if (!page) continue;
          page.classList.remove("pending-page");
          page.innerHTML = payload.svg;
          loadedPages.add(payload.index);
          requestedPages.delete(payload.index);
          insertedIndexes.push(payload.index);
        }
        return insertedIndexes;
      }
      window.addEventListener("scroll", scheduleVisibleRequest, { passive: true });
      window.addEventListener("resize", () => {
        applyZoom();
        scheduleVisibleRequest();
      });
      window.addEventListener("message", (event) => {
        const message = event.data;
        const root = document.getElementById("root");
        if (message.type === "loading") {
          if (hasPreview) {
            const toolbar = root.querySelector(".toolbar");
            if (toolbar) {
              toolbar.classList.add("updating");
              const status = toolbar.querySelector(".status");
              if (status) status.textContent = message.sourceFormat + ' document (' + message.sourceLength + ' chars)';
            }
          } else {
            root.innerHTML = '<div class="pending">Rendering ' + message.sourceFormat + ' document (' + message.sourceLength + ' chars)...</div>';
          }
          return;
        }
        if (message.type === "error") {
          if (hasPreview) {
            const toolbar = root.querySelector(".toolbar");
            if (toolbar) {
              toolbar.classList.remove("updating");
              const status = toolbar.querySelector(".status");
              if (status) status.textContent = message.message;
            }
          } else {
            root.innerHTML = '<div class="error"></div>';
            root.querySelector(".error").textContent = message.message;
          }
          return;
        }
        if (message.type === "previewPages") {
          if (pendingPreview && message.updateId === pendingPreview.updateId) {
            const receivedAt = performance.now();
            const receivedEpochMs = Date.now();
            activatePreview(pendingPreview.updateId, pendingPreview.pageMeta, pendingPreview.stats, message.pages || []);
            const insertedIndexes = (message.pages || []).map((payload) => payload.index);
            pendingPreview = undefined;
            requestAnimationFrame(() => {
              vscode.postMessage({
                type: "previewShown",
                updateId: message.updateId,
                sentAtEpochMs: message.sentAtEpochMs,
                receivedEpochMs,
                receivedAt,
                shownAt: performance.now(),
                shownEpochMs: Date.now(),
                pages: insertedIndexes.length,
                totalPages: pageMeta.length,
                indexes: insertedIndexes
              });
              scheduleVisibleRequest();
            });
            return;
          }
          if (message.updateId !== activeUpdateId) return;
          const receivedAt = performance.now();
          const receivedEpochMs = Date.now();
          const insertedIndexes = insertPagePayloads(message.pages || []);
          applyZoom();
          requestAnimationFrame(() => {
            vscode.postMessage({
              type: "previewShown",
              updateId: message.updateId,
              sentAtEpochMs: message.sentAtEpochMs,
              receivedEpochMs,
              receivedAt,
              shownAt: performance.now(),
              shownEpochMs: Date.now(),
              pages: insertedIndexes.length,
              totalPages: pageMeta.length,
              indexes: insertedIndexes
            });
            scheduleVisibleRequest();
          });
          return;
        }
        if (message.type !== "preview") return;
        const nextMeta = message.pageMeta || [];
        if (hasPreview) {
          pendingPreview = {
            updateId: message.updateId,
            pageMeta: nextMeta,
            stats: message.stats,
            requestedPages: new Set()
          };
          const toolbar = root.querySelector(".toolbar");
          if (toolbar) {
            const status = toolbar.querySelector(".status");
            if (status) status.textContent = message.stats.pageCount + ' page(s), laid out in ' + message.stats.totalMs.toFixed(1) + ' ms';
          }
          requestPendingVisiblePages();
          return;
        }
        activatePreview(message.updateId, nextMeta, message.stats, []);
        applyZoom();
        scheduleVisibleRequest();
      });
    </script>
  </body>
</html>`;
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

export type PageRequestMessage = {
  type: "requestPages";
  updateId: number;
  indexes: number[];
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

function isPreviewShownMessage(message: unknown): message is PreviewShownMessage {
  if (!message || typeof message !== "object") return false;
  const record = message as Record<string, unknown>;
  return record.type === "previewShown" &&
    typeof record.receivedAt === "number" &&
    typeof record.shownAt === "number" &&
    typeof record.pages === "number";
}

function isPageRequestMessage(message: unknown): message is PageRequestMessage {
  if (!message || typeof message !== "object") return false;
  const record = message as Record<string, unknown>;
  return record.type === "requestPages" &&
    typeof record.updateId === "number" &&
    Array.isArray(record.indexes) &&
    record.indexes.every((index) => typeof index === "number");
}

function randomNonce(): string {
  let value = "";
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let index = 0; index < 32; index += 1) {
    value += chars[Math.floor(Math.random() * chars.length)];
  }
  return value;
}
