import type { DisplayObject } from "../../display-list/displayTypes";
import { escapeXml, sanitizeImageUrl } from "../../utils/sanitize";

type ImageObject = Extract<DisplayObject, { type: "image" }>;

export function renderSvgImage(object: ImageObject): string {
  const sources = (object.sources?.length ? object.sources : [object.src])
    .map(sanitizeImageUrl)
    .filter((source): source is string => source !== undefined);
  const href = sources[0];
  const fallbackId = imageFallbackId(object);
  const fallback = renderSvgImageFallback(object, fallbackId);
  if (!href) return fallback;
  const initialHref = isPdfSource(href) ? "" : href;
  return `${fallback}<image href="${escapeXml(initialHref)}" x="${round(object.x)}" y="${round(object.y)}" width="${round(object.width)}" height="${round(object.height)}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${escapeXml(object.alt)}" data-fallback-id="${escapeXml(fallbackId)}" data-image-sources="${escapeXml(JSON.stringify(sources))}"/>`;
}

function isPdfSource(source: string): boolean {
  return /^data:application\/pdf[;,]/i.test(source) || /\.pdf(?:[?#]|$)/i.test(source);
}

function renderSvgImageFallback(object: ImageObject, id: string): string {
  const padding = Math.min(12, Math.max(4, object.width * 0.04));
  const message = imageFailureMessage(object);
  const textX = object.x + padding;
  const textY = object.y + object.height / 2;
  return [
    `<g id="${escapeXml(id)}" class="svg-md-image-fallback">`,
    `<rect x="${round(object.x)}" y="${round(object.y)}" width="${round(object.width)}" height="${round(object.height)}" fill="#f6f8fa" stroke="#cfd7df" stroke-width="0.7"/>`,
    `<text x="${round(textX)}" y="${round(textY)}" font-family="Arial, Helvetica, sans-serif" font-size="10" fill="#667085" dominant-baseline="middle">${escapeXml(message)}</text>`,
    "</g>"
  ].join("");
}

function imageFallbackId(object: ImageObject): string {
  const raw = `${object.x}:${object.y}:${object.width}:${object.height}:${object.src}`;
  let hash = 0;
  for (let index = 0; index < raw.length; index += 1) {
    hash = (hash * 31 + raw.charCodeAt(index)) >>> 0;
  }
  return `svg-md-image-fallback-${hash.toString(16)}`;
}

function imageFailureMessage(object: ImageObject): string {
  return "Fail to load";
}

function round(value: number): string {
  return Number(value.toFixed(2)).toString();
}
