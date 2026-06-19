import type { PDFPage } from "pdf-lib";
import type { DisplayObject } from "../../display-list/displayTypes";
import { hexToRgb } from "./pdfText";

type Matrix = {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
};

type PathState = {
  x: number;
  y: number;
  lastQx?: number;
  lastQy?: number;
};

type SvgDrawable = {
  d: string;
  matrix: Matrix;
};

const identity: Matrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

export function drawPdfMathJaxVector(
  page: PDFPage,
  object: Extract<DisplayObject, { type: "math" }>,
  pageHeight: number
): boolean {
  if (!object.viewBox || !object.svgBody || typeof DOMParser === "undefined") return false;

  const drawables = collectDrawables(object.svgBody);
  if (drawables.length === 0) return false;

  const [minX, minY, viewWidth] = object.viewBox.split(/\s+/).map(Number);
  const scale = object.width / (Number.isFinite(viewWidth) && viewWidth > 0 ? viewWidth : 1000);
  const viewMinX = Number.isFinite(minX) ? minX : 0;
  const viewMinY = Number.isFinite(minY) ? minY : 0;
  const x = object.x - viewMinX * scale;
  const y = pageHeight - object.y + viewMinY * scale;

  for (const drawable of drawables) {
    const d = transformPath(drawable.d, drawable.matrix);
    if (!d) return false;
    page.drawSvgPath(d, {
      x,
      y,
      scale,
      color: hexToRgb(object.color)
    });
  }

  return true;
}

function collectDrawables(svgBody: string): SvgDrawable[] {
  const doc = new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${svgBody}</svg>`, "image/svg+xml");
  const result: SvgDrawable[] = [];

  const walk = (element: Element, matrix: Matrix) => {
    const nextMatrix = multiply(matrix, parseTransform(element.getAttribute("transform")));
    const tagName = element.tagName.toLowerCase();
    if (tagName === "path") {
      const d = element.getAttribute("d");
      if (d) result.push({ d, matrix: nextMatrix });
    } else if (tagName === "rect") {
      const d = rectToPath(element);
      if (d) result.push({ d, matrix: nextMatrix });
    }
    for (const child of Array.from(element.children)) walk(child, nextMatrix);
  };

  for (const child of Array.from(doc.documentElement.children)) walk(child, identity);
  return result;
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
  const state: PathState = { x: 0, y: 0 };
  let index = 0;
  let command = "";

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

    const count = argCount(upper);
    if (!count) return undefined;
    while (index + count <= tokens.length && !/^[a-zA-Z]$/.test(tokens[index])) {
      const args = tokens.slice(index, index + count).map(Number);
      index += count;
      emitCommand(out, upper, args, relative, state, matrix);
      if (upper === "M") command = relative ? "l" : "L";
    }
  }

  return out.join(" ");
}

function argCount(command: string): number {
  return ({ M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2 } as Record<string, number>)[command] ?? 0;
}

function emitCommand(out: string[], command: string, args: number[], relative: boolean, state: PathState, matrix: Matrix) {
  if (command === "H") {
    const x = relative ? state.x + args[0] : args[0];
    emitLine(out, x, state.y, state, matrix);
    return;
  }
  if (command === "V") {
    const y = relative ? state.y + args[0] : args[0];
    emitLine(out, state.x, y, state, matrix);
    return;
  }

  const point = (offset: number) => ({
    x: (relative ? state.x : 0) + args[offset],
    y: (relative ? state.y : 0) + args[offset + 1]
  });

  if (command === "M") {
    const p = transformPoint(point(0), matrix);
    out.push(`M ${fmt(p.x)} ${fmt(p.y)}`);
    state.x = point(0).x;
    state.y = point(0).y;
    return;
  }
  if (command === "L") {
    const p = point(0);
    emitLine(out, p.x, p.y, state, matrix);
    return;
  }
  if (command === "C") {
    const p1 = transformPoint(point(0), matrix);
    const p2 = transformPoint(point(2), matrix);
    const p3Raw = point(4);
    const p3 = transformPoint(p3Raw, matrix);
    out.push(`C ${fmt(p1.x)} ${fmt(p1.y)} ${fmt(p2.x)} ${fmt(p2.y)} ${fmt(p3.x)} ${fmt(p3.y)}`);
    state.x = p3Raw.x;
    state.y = p3Raw.y;
    return;
  }
  if (command === "Q") {
    const p1Raw = point(0);
    const p1 = transformPoint(p1Raw, matrix);
    const p2Raw = point(2);
    const p2 = transformPoint(p2Raw, matrix);
    out.push(`Q ${fmt(p1.x)} ${fmt(p1.y)} ${fmt(p2.x)} ${fmt(p2.y)}`);
    state.lastQx = p1Raw.x;
    state.lastQy = p1Raw.y;
    state.x = p2Raw.x;
    state.y = p2Raw.y;
    return;
  }
  if (command === "T") {
    const cx = state.lastQx === undefined ? state.x : 2 * state.x - state.lastQx;
    const cy = state.lastQy === undefined ? state.y : 2 * state.y - state.lastQy;
    const control = transformPoint({ x: cx, y: cy }, matrix);
    const endRaw = point(0);
    const end = transformPoint(endRaw, matrix);
    out.push(`Q ${fmt(control.x)} ${fmt(control.y)} ${fmt(end.x)} ${fmt(end.y)}`);
    state.lastQx = cx;
    state.lastQy = cy;
    state.x = endRaw.x;
    state.y = endRaw.y;
  }
}

function emitLine(out: string[], x: number, y: number, state: PathState, matrix: Matrix) {
  const p = transformPoint({ x, y }, matrix);
  out.push(`L ${fmt(p.x)} ${fmt(p.y)}`);
  state.x = x;
  state.y = y;
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
