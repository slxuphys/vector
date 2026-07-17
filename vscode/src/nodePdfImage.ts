import { initWasm, Resvg } from "@resvg/resvg-wasm";
import resvgWasmUrl from "@resvg/resvg-wasm/index_bg.wasm?url";
import type { DisplayPage } from "../../src/core/display-list/displayTypes";
import type { PdfImageServices } from "../../src/core/renderers/pdf/pdfImage";
import type { DocumentResourceProvider } from "../../src/core/resources";

let resvgReady: Promise<void> | undefined;
const previewAssetCache = new Map<string, PreviewAssetCacheEntry>();
const maxPreviewAssetEntries = 48;
const maxPreviewAssetChars = 32 * 1024 * 1024;
let previewAssetChars = 0;

type PreviewAssetCacheEntry = {
  bytes: Uint8Array;
  dataUrl: string;
};

export function createNodePdfImageServices(resources: DocumentResourceProvider): PdfImageServices {
  return {
    load: (src) => resources.readBinary(src),
    rasterizeSvg
  };
}

export async function prepareNodePreviewPage(resources: DocumentResourceProvider, page: DisplayPage): Promise<DisplayPage> {
  const objects = await Promise.all(page.objects.map(async (object) => {
    if (object.type !== "image") return object;
    const sources = object.sources?.length ? object.sources : [object.src];
    for (const source of sources) {
      try {
        if (/^data:/i.test(source)) return { ...object, src: source, sources: [source] };
        if (/^https?:/i.test(source)) return object;
        const dataUrl = await loadPreviewAssetDataUrl(resources, source);
        if (!dataUrl) continue;
        return { ...object, src: dataUrl, sources: [dataUrl] };
      } catch {
        // Match LaTeX lookup semantics by trying the next graphicspath/extension candidate.
      }
    }
    return object;
  }));
  return { ...page, objects };
}

async function loadPreviewAssetDataUrl(resources: DocumentResourceProvider, src: string): Promise<string | undefined> {
  const bytes = await resources.readBinary(src);
  if (!bytes) return undefined;
  const key = resources.resolve(src);
  const cached = previewAssetCache.get(key);
  if (cached?.bytes === bytes) {
    previewAssetCache.delete(key);
    previewAssetCache.set(key, cached);
    return cached.dataUrl;
  }
  const dataUrl = bytesToDataUrl(bytes, isPdf(bytes, src) ? "application/pdf" : mimeType(bytes, src));
  setPreviewAssetCache(key, { bytes, dataUrl });
  return dataUrl;
}

function setPreviewAssetCache(key: string, entry: PreviewAssetCacheEntry): void {
  const previous = previewAssetCache.get(key);
  if (previous) previewAssetChars -= previous.dataUrl.length;
  previewAssetCache.delete(key);
  previewAssetCache.set(key, entry);
  previewAssetChars += entry.dataUrl.length;
  while (previewAssetCache.size > maxPreviewAssetEntries || previewAssetChars > maxPreviewAssetChars) {
    const oldestKey = previewAssetCache.keys().next().value as string | undefined;
    if (!oldestKey) break;
    const oldest = previewAssetCache.get(oldestKey);
    previewAssetCache.delete(oldestKey);
    previewAssetChars -= oldest?.dataUrl.length ?? 0;
  }
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
