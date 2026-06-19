import type { PDFPage, PDFFont } from "pdf-lib";
import type { DisplayObject } from "../../display-list/displayTypes";
import type { PdfFontSet } from "./pdfFonts";
import { hexToRgb } from "./pdfText";

type Matrix = {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
};

type GlyphDrawable = {
  type: "glyph";
  d: string;
  codePoint: number;
  matrix: Matrix;
};

type PathDrawable = {
  type: "path";
  d: string;
  matrix: Matrix;
};

type Drawable = GlyphDrawable | PathDrawable;

const identity: Matrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

export function drawPdfMathGlyphs(
  page: PDFPage,
  object: Extract<DisplayObject, { type: "math" }>,
  fonts: PdfFontSet,
  pageHeight: number
): boolean {
  if (!object.viewBox || !object.svgBody || typeof DOMParser === "undefined") return false;
  if (!canUseGlyphTextPath(object)) return false;

  const drawables = collectDrawables(object.svgBody);
  if (drawables.length === 0) return false;

  const [minX, minY, viewWidth] = object.viewBox.split(/\s+/).map(Number);
  const scale = object.width / (Number.isFinite(viewWidth) && viewWidth > 0 ? viewWidth : 1000);
  const viewMinX = Number.isFinite(minX) ? minX : 0;
  const viewMinY = Number.isFinite(minY) ? minY : 0;
  const x = object.x - viewMinX * scale;
  const y = pageHeight - object.y + viewMinY * scale;
  const color = hexToRgb(object.color);

  for (const drawable of drawables) {
    if (drawable.type === "glyph") {
      const glyph = mapGlyph(drawable.codePoint, fonts);
      if (glyph && canEncode(glyph.font, glyph.text)) {
        const origin = transformPoint({ x: 0, y: 0 }, drawable.matrix);
        const glyphScale = Math.hypot(drawable.matrix.a, drawable.matrix.b) || 1;
        page.drawText(glyph.text, {
          x: x + origin.x * scale,
          y: y - origin.y * scale,
          size: 1000 * scale * glyphScale,
          font: glyph.font,
          color
        });
        continue;
      }
    }

    const d = transformPath(drawable.d, drawable.matrix);
    if (!d) return false;
    page.drawSvgPath(d, { x, y, scale, color });
  }

  return true;
}

function canUseGlyphTextPath(object: Extract<DisplayObject, { type: "math" }>): boolean {
  if (object.displayMode) return false;
  return !/[\\{}]|(?:^|[^a-zA-Z])(frac|sqrt|sum|prod|int|lim|matrix|cases)\b/.test(object.latex);
}

function collectDrawables(svgBody: string): Drawable[] {
  const doc = new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${svgBody}</svg>`, "image/svg+xml");
  const result: Drawable[] = [];

  const walk = (element: Element, matrix: Matrix) => {
    const nextMatrix = multiply(matrix, parseTransform(element.getAttribute("transform")));
    const tagName = element.tagName.toLowerCase();
    if (tagName === "path") {
      const d = element.getAttribute("d");
      const codePoint = Number.parseInt(element.getAttribute("data-c") ?? "", 16);
      if (d && Number.isFinite(codePoint)) result.push({ type: "glyph", d, codePoint, matrix: nextMatrix });
      else if (d) result.push({ type: "path", d, matrix: nextMatrix });
    } else if (tagName === "rect") {
      const d = rectToPath(element);
      if (d) result.push({ type: "path", d, matrix: nextMatrix });
    }
    for (const child of Array.from(element.children)) walk(child, nextMatrix);
  };

  for (const child of Array.from(doc.documentElement.children)) walk(child, identity);
  return result;
}

function mapGlyph(codePoint: number, fonts: PdfFontSet): { text: string; font: PDFFont } | undefined {
  const tex = fonts.tex;
  if (!tex) return undefined;

  const mathItalic = normalizeMathItalic(codePoint);
  if (mathItalic) return { text: mathItalic, font: tex.mathItalic ?? tex.italic };

  const mathDigit = normalizeMathDigit(codePoint);
  if (mathDigit) return { text: mathDigit, font: tex.regular };

  const text = String.fromCodePoint(codePoint);
  if (codePoint === 0x222b) return { text, font: tex.size1 ?? tex.regular };
  if (isAsciiLetter(codePoint)) return { text, font: tex.mathItalic ?? tex.italic };
  return { text, font: tex.regular };
}

function normalizeMathItalic(codePoint: number): string | undefined {
  if (codePoint >= 0x1d434 && codePoint <= 0x1d44d) {
    return String.fromCodePoint(0x41 + codePoint - 0x1d434);
  }
  if (codePoint >= 0x1d44e && codePoint <= 0x1d467) {
    return String.fromCodePoint(0x61 + codePoint - 0x1d44e);
  }
  return undefined;
}

function normalizeMathDigit(codePoint: number): string | undefined {
  if (codePoint >= 0x1d7ce && codePoint <= 0x1d7d7) {
    return String.fromCodePoint(0x30 + codePoint - 0x1d7ce);
  }
  return undefined;
}

function isAsciiLetter(codePoint: number): boolean {
  return (codePoint >= 0x41 && codePoint <= 0x5a) || (codePoint >= 0x61 && codePoint <= 0x7a);
}

function canEncode(font: PDFFont, text: string): boolean {
  try {
    font.encodeText(text);
    return true;
  } catch {
    return false;
  }
}

function rectToPath(element: Element): string | undefined {
  const x = numberAttr(element, "x", 0);
  const y = numberAttr(element, "y", 0);
  const width = numberAttr(element, "width", 0);
  const height = numberAttr(element, "height", 0);
  if (width <= 0 || height <= 0) return undefined;
  return `M ${x} ${y} H ${x + width} V ${y + height} H ${x} Z`;
}

function numberAttr(element: Element, name: string, fallback: number): number {
  const value = Number(element.getAttribute(name));
  return Number.isFinite(value) ? value : fallback;
}

function parseTransform(transform: string | null): Matrix {
  if (!transform) return identity;

  let matrix = identity;
  const matches = transform.matchAll(/(translate|scale)\(([^)]+)\)/g);
  for (const match of matches) {
    const values = match[2].split(/[,\s]+/).filter(Boolean).map(Number);
    if (match[1] === "translate") {
      matrix = multiply(matrix, { a: 1, b: 0, c: 0, d: 1, e: values[0] ?? 0, f: values[1] ?? 0 });
    } else if (match[1] === "scale") {
      const sx = values[0] ?? 1;
      matrix = multiply(matrix, { a: sx, b: 0, c: 0, d: values[1] ?? sx, e: 0, f: 0 });
    }
  }
  return matrix;
}

function multiply(left: Matrix, right: Matrix): Matrix {
  return {
    a: left.a * right.a + left.c * right.b,
    b: left.b * right.a + left.d * right.b,
    c: left.a * right.c + left.c * right.d,
    d: left.b * right.c + left.d * right.d,
    e: left.a * right.e + left.c * right.f + left.e,
    f: left.b * right.e + left.d * right.f + left.f
  };
}

function transformPath(d: string, matrix: Matrix): string | undefined {
  const tokens = d.match(/[a-zA-Z]|[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/g);
  if (!tokens) return undefined;

  const out: string[] = [];
  let index = 0;
  let command = "";
  let x = 0;
  let y = 0;

  while (index < tokens.length) {
    if (/^[a-zA-Z]$/.test(tokens[index])) command = tokens[index++];
    if (!command) return undefined;
    const upper = command.toUpperCase();
    const relative = command !== upper;

    if (upper === "Z") {
      out.push("Z");
      command = "";
      continue;
    }

    const count = ({ M: 2, L: 2, H: 1, V: 1, C: 6, Q: 4 } as Record<string, number>)[upper] ?? 0;
    if (!count) return undefined;
    while (index + count <= tokens.length && !/^[a-zA-Z]$/.test(tokens[index])) {
      const args = tokens.slice(index, index + count).map(Number);
      index += count;
      const baseX = relative ? x : 0;
      const baseY = relative ? y : 0;
      if (upper === "M" || upper === "L") {
        x = baseX + args[0];
        y = baseY + args[1];
        const point = transformPoint({ x, y }, matrix);
        out.push(`${upper === "M" ? "M" : "L"} ${fmt(point.x)} ${fmt(point.y)}`);
        if (upper === "M") command = relative ? "l" : "L";
      } else if (upper === "H") {
        x = baseX + args[0];
        const point = transformPoint({ x, y }, matrix);
        out.push(`L ${fmt(point.x)} ${fmt(point.y)}`);
      } else if (upper === "V") {
        y = baseY + args[0];
        const point = transformPoint({ x, y }, matrix);
        out.push(`L ${fmt(point.x)} ${fmt(point.y)}`);
      } else if (upper === "C") {
        const p1 = transformPoint({ x: baseX + args[0], y: baseY + args[1] }, matrix);
        const p2 = transformPoint({ x: baseX + args[2], y: baseY + args[3] }, matrix);
        x = baseX + args[4];
        y = baseY + args[5];
        const p3 = transformPoint({ x, y }, matrix);
        out.push(`C ${fmt(p1.x)} ${fmt(p1.y)} ${fmt(p2.x)} ${fmt(p2.y)} ${fmt(p3.x)} ${fmt(p3.y)}`);
      } else if (upper === "Q") {
        const p1 = transformPoint({ x: baseX + args[0], y: baseY + args[1] }, matrix);
        x = baseX + args[2];
        y = baseY + args[3];
        const p2 = transformPoint({ x, y }, matrix);
        out.push(`Q ${fmt(p1.x)} ${fmt(p1.y)} ${fmt(p2.x)} ${fmt(p2.y)}`);
      }
    }
  }

  return out.join(" ");
}

function transformPoint(point: { x: number; y: number }, matrix: Matrix) {
  return {
    x: matrix.a * point.x + matrix.c * point.y + matrix.e,
    y: matrix.b * point.x + matrix.d * point.y + matrix.f
  };
}

function fmt(value: number): string {
  return Number(value.toFixed(3)).toString();
}
