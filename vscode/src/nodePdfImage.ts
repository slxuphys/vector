import * as path from "node:path";
import * as vscode from "vscode";
import { initWasm, Resvg } from "@resvg/resvg-wasm";
import resvgWasmUrl from "@resvg/resvg-wasm/index_bg.wasm?url";
import type { DisplayPage } from "../../src/core/display-list/displayTypes";
import type { PdfImageServices } from "../../src/core/renderers/pdf/pdfImage";

let resvgReady: Promise<void> | undefined;

export function createNodePdfImageServices(document: vscode.TextDocument): PdfImageServices {
  return {
    load: (src) => loadImage(document, src),
    rasterizeSvg
  };
}

export async function prepareNodePreviewPage(document: vscode.TextDocument, page: DisplayPage): Promise<DisplayPage> {
  const objects = await Promise.all(page.objects.map(async (object) => {
    if (object.type !== "image") return object;
    const sources = object.sources?.length ? object.sources : [object.src];
    for (const source of sources) {
      try {
        if (/^data:image\//i.test(source)) return { ...object, src: source, sources: [source] };
        if (/^https?:/i.test(source)) return object;
        const bytes = await loadImage(document, source);
        if (!bytes) continue;
        const dataUrl = bytesToDataUrl(bytes, isPdf(bytes, source) ? "application/pdf" : mimeType(bytes, source));
        return { ...object, src: dataUrl, sources: [dataUrl] };
      } catch {
        // Match LaTeX lookup semantics by trying the next graphicspath/extension candidate.
      }
    }
    return object;
  }));
  return { ...page, objects };
}

async function loadImage(document: vscode.TextDocument, src: string): Promise<Uint8Array | undefined> {
  if (/^(?:data:|https?:)/i.test(src)) return undefined;
  if (document.uri.scheme !== "file") return undefined;
  const clean = decodeURIComponent(src.split(/[?#]/, 1)[0]);
  const target = path.isAbsolute(clean)
    ? vscode.Uri.file(clean)
    : vscode.Uri.file(path.resolve(path.dirname(document.uri.fsPath), clean));
  return vscode.workspace.fs.readFile(target);
}

async function rasterizeSvg(svg: Uint8Array, width: number, height: number): Promise<Uint8Array> {
  resvgReady ??= initWasm(dataUrlBytes(resvgWasmUrl));
  await resvgReady;
  const renderer = new Resvg(svg, {
    fitTo: { mode: "width", value: Math.max(1, Math.ceil(width * 3)) },
    background: "rgba(255,255,255,0)"
  });
  const rendered = renderer.render();
  try {
    return new Uint8Array(rendered.asPng());
  } finally {
    rendered.free();
    renderer.free();
  }
}

function isPdf(bytes: Uint8Array, src: string): boolean {
  return /\.pdf(?:[?#]|$)/i.test(src) || (
    bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d
  );
}

function mimeType(bytes: Uint8Array, src: string): string {
  if (/\.svg(?:[?#]|$)/i.test(src)) return "image/svg+xml";
  if (/\.jpe?g(?:[?#]|$)/i.test(src) || (bytes[0] === 0xff && bytes[1] === 0xd8)) return "image/jpeg";
  return "image/png";
}

function bytesToDataUrl(bytes: Uint8Array, mime: string): string {
  return `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;
}

function dataUrlBytes(value: string): Uint8Array {
  const encoded = value.slice(value.indexOf(",") + 1);
  return Uint8Array.from(Buffer.from(encoded, "base64"));
}
