import * as path from "node:path";
import * as vscode from "vscode";
import { initWasm, Resvg } from "@resvg/resvg-wasm";
import resvgWasmUrl from "@resvg/resvg-wasm/index_bg.wasm?url";
import type { PdfImageServices } from "../../src/core/renderers/pdf/pdfImage";

let resvgReady: Promise<void> | undefined;

export function createNodePdfImageServices(document: vscode.TextDocument): PdfImageServices {
  return {
    load: (src) => loadImage(document, src),
    rasterizeSvg
  };
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

function dataUrlBytes(value: string): Uint8Array {
  const encoded = value.slice(value.indexOf(",") + 1);
  return Uint8Array.from(Buffer.from(encoded, "base64"));
}
