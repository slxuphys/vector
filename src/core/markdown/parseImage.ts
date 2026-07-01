import type { ImageAlign, ImageLength, ImageNode } from "./markdownTypes";

export function parseImageBlock(line: string): ImageNode | undefined {
  const match = line.trim().match(/^!\[([^\]]*)]\((\S+?)(?:\s+"([^"]*)")?\)\s*(\{[^}]*})?\s*$/);
  if (!match) return undefined;

  const attributes = parseImageAttributes(match[4]);
  return {
    type: "image",
    alt: match[1],
    src: stripAngleBrackets(match[2]),
    caption: match[3],
    width: attributes.width,
    height: attributes.height,
    align: attributes.align
  };
}

function parseImageAttributes(raw: string | undefined): {
  width?: ImageLength;
  height?: ImageLength;
  align?: ImageAlign;
} {
  if (!raw) return {};
  const body = raw.replace(/^\{\s*/, "").replace(/\s*}$/, "");
  const attributes: ReturnType<typeof parseImageAttributes> = {};
  const pattern = /([a-zA-Z][\w-]*)\s*=\s*("[^"]*"|'[^']*'|[^\s]+)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(body))) {
    const key = match[1].toLowerCase();
    const value = unquote(match[2]);
    if (key === "width") attributes.width = parseLength(value);
    else if (key === "height") attributes.height = parseLength(value);
    else if (key === "align" && isImageAlign(value)) attributes.align = value;
  }
  return attributes;
}

function parseLength(value: string): ImageLength | undefined {
  const trimmed = value.trim();
  if (/^\d+(?:\.\d+)?%$/.test(trimmed)) {
    return { value: Number(trimmed.slice(0, -1)), unit: "percent" };
  }
  if (/^\d+(?:\.\d+)?(?:px)?$/.test(trimmed)) {
    return { value: Number(trimmed.replace(/px$/, "")), unit: "px" };
  }
  return undefined;
}

function isImageAlign(value: string): value is ImageAlign {
  return value === "left" || value === "center" || value === "right";
}

function unquote(value: string): string {
  return value.replace(/^["']/, "").replace(/["']$/, "");
}

function stripAngleBrackets(value: string): string {
  return value.replace(/^</, "").replace(/>$/, "");
}
