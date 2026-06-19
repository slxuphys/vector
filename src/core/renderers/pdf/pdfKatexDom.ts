import type { PDFPage, PDFFont } from "pdf-lib";
import type { DisplayObject } from "../../display-list/displayTypes";
import { katexCssWithInlineFonts } from "../math/katexFontCss";
import type { PdfFontSet } from "./pdfFonts";
import { hexToRgb } from "./pdfText";

type MathObject = Extract<DisplayObject, { type: "math" }>;

type TextRun = {
  text: string;
  x: number;
  baseline: number;
  fontSize: number;
  font: PDFFont;
};

let root: HTMLDivElement | undefined;

export async function drawPdfKatexDomGlyphs(
  page: PDFPage,
  object: MathObject,
  fonts: PdfFontSet,
  pageHeight: number
): Promise<boolean> {
  if (typeof document === "undefined" || !object.html || !fonts.tex) return false;
  if (object.html.includes("<svg")) return false;

  const container = createContainer(object);
  getRoot().appendChild(container);
  await waitForFonts(object.fontSize);

  const katexHtml = container.querySelector(".katex-html");
  if (!katexHtml) {
    container.remove();
    return false;
  }

  const containerRect = container.getBoundingClientRect();
  drawRules(page, katexHtml, containerRect, object, pageHeight);
  drawTextRuns(page, collectTextRuns(katexHtml, containerRect, object, fonts), object, pageHeight);
  container.remove();
  return true;
}

function collectTextRuns(
  rootElement: Element,
  containerRect: DOMRect,
  object: MathObject,
  fonts: PdfFontSet
): TextRun[] {
  const runs: TextRun[] = [];
  const walker = document.createTreeWalker(rootElement, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  let node = walker.nextNode();
  while (node) {
    const text = node.textContent ?? "";
    if (text.trim()) {
      range.selectNodeContents(node);
      const rect = range.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        const parent = node.parentElement;
        const style = parent ? getComputedStyle(parent) : getComputedStyle(rootElement);
        const fontSize = numberFromPx(style.fontSize, object.fontSize);
        const font = selectKatexFont(style.fontFamily, style.fontStyle, style.fontWeight, fonts);
        const encodedText = filterEncodableText(font, text);
        if (encodedText) {
          const baseline = measureTextBaseline(node, containerRect);
          const relX = rect.left - containerRect.left;
          runs.push({ text: encodedText, x: relX, baseline, fontSize, font });
        }
      }
    }
    node = walker.nextNode();
  }
  range.detach();
  return mergeTextRuns(runs);
}

function drawTextRuns(page: PDFPage, runs: TextRun[], object: MathObject, pageHeight: number) {
  for (const run of runs) {
    page.drawText(run.text, {
      x: object.x + run.x,
      y: pageHeight - object.y - run.baseline,
      size: run.fontSize,
      font: run.font,
      color: hexToRgb(object.color)
    });
  }
}

function mergeTextRuns(runs: TextRun[]): TextRun[] {
  const merged: TextRun[] = [];
  for (const run of runs) {
    const previous = merged.at(-1);
    if (previous && canMergeTextRuns(previous, run)) {
      previous.text += run.text;
    } else {
      merged.push({ ...run });
    }
  }
  return merged;
}

function canMergeTextRuns(left: TextRun, right: TextRun): boolean {
  if (left.font !== right.font) return false;
  if (Math.abs(left.fontSize - right.fontSize) > 0.1) return false;
  if (Math.abs(left.baseline - right.baseline) > 0.5) return false;

  const expectedRight = left.x + left.font.widthOfTextAtSize(left.text, left.fontSize);
  const gap = right.x - expectedRight;
  return gap >= -left.fontSize * 0.05 && gap <= left.fontSize * 0.08;
}

function measureTextBaseline(node: Node, containerRect: DOMRect): number {
  const marker = document.createElement("span");
  marker.style.display = "inline-block";
  marker.style.width = "0";
  marker.style.height = "0";
  marker.style.padding = "0";
  marker.style.margin = "0";
  marker.style.border = "0";
  marker.style.verticalAlign = "baseline";

  const parent = node.parentNode;
  if (!parent) return 0;
  parent.insertBefore(marker, node.nextSibling);
  const markerRect = marker.getBoundingClientRect();
  marker.remove();
  return markerRect.top - containerRect.top;
}

function drawRules(page: PDFPage, rootElement: Element, containerRect: DOMRect, object: MathObject, pageHeight: number) {
  for (const element of Array.from(rootElement.querySelectorAll("*"))) {
    const style = getComputedStyle(element);
    const borderBottomWidth = numberFromPx(style.borderBottomWidth, 0);
    if (borderBottomWidth <= 0 || style.borderBottomStyle === "none") continue;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0) continue;
    const relX = rect.left - containerRect.left;
    const relY = rect.bottom - containerRect.top - borderBottomWidth;
    page.drawRectangle({
      x: object.x + relX,
      y: pageHeight - object.y - relY - borderBottomWidth,
      width: rect.width,
      height: borderBottomWidth,
      color: hexToRgb(object.color)
    });
  }
}

function createContainer(object: MathObject): HTMLDivElement {
  const container = document.createElement("div");
  container.className = "svg-md-katex-pdf-measure";
  container.style.width = `${object.width}px`;
  container.style.height = `${object.height}px`;
  container.style.fontSize = `${object.fontSize}px`;
  container.style.color = object.color;
  container.style.display = "flex";
  container.style.alignItems = object.displayMode ? "center" : "flex-start";
  container.style.justifyContent = object.displayMode ? "center" : "flex-start";
  container.style.overflow = "hidden";
  container.innerHTML = object.html;
  return container;
}

function selectKatexFont(fontFamily: string, fontStyle: string, fontWeight: string, fonts: PdfFontSet): PDFFont {
  const tex = fonts.tex;
  if (!tex) return fonts.regular;
  if (fontFamily.includes("KaTeX_Size4")) return tex.size4 ?? tex.size3 ?? tex.size2 ?? tex.size1 ?? tex.regular;
  if (fontFamily.includes("KaTeX_Size3")) return tex.size3 ?? tex.size2 ?? tex.size1 ?? tex.regular;
  if (fontFamily.includes("KaTeX_Size2")) return tex.size2 ?? tex.size1 ?? tex.regular;
  if (fontFamily.includes("KaTeX_Size1")) return tex.size1 ?? tex.regular;
  if (fontFamily.includes("KaTeX_Math")) return tex.mathItalic ?? tex.italic;
  if (fontWeight === "700" || Number(fontWeight) >= 600) return fontStyle === "italic" ? tex.boldItalic : tex.bold;
  if (fontStyle === "italic") return tex.italic;
  return tex.regular;
}

function filterEncodableText(font: PDFFont, text: string): string {
  let result = "";
  for (const char of text) {
    try {
      font.encodeText(char);
      result += char;
    } catch {
      // Unsupported glyphs are skipped in this first DOM extraction pass.
    }
  }
  return result;
}

async function waitForFonts(fontSize: number): Promise<void> {
  if (!document.fonts) return;
  await Promise.race([
    Promise.allSettled([
      document.fonts.load(`${fontSize}px "KaTeX_Main"`),
      document.fonts.load(`${fontSize}px "KaTeX_Math"`),
      document.fonts.load(`${fontSize}px "KaTeX_Size1"`),
      document.fonts.load(`${fontSize}px "KaTeX_Size2"`),
      document.fonts.load(`${fontSize}px "KaTeX_Size3"`),
      document.fonts.load(`${fontSize}px "KaTeX_Size4"`)
    ]),
    new Promise((resolve) => window.setTimeout(resolve, 100))
  ]);
}

function getRoot(): HTMLDivElement {
  if (root) return root;

  root = document.createElement("div");
  root.setAttribute("aria-hidden", "true");
  root.style.position = "absolute";
  root.style.left = "-10000px";
  root.style.top = "0";
  root.style.opacity = "0";
  root.style.pointerEvents = "none";
  root.style.whiteSpace = "nowrap";

  const style = document.createElement("style");
  style.textContent = `${katexCssWithInlineFonts}
.svg-md-katex-pdf-measure .katex-display{margin:0;}
`;
  root.appendChild(style);
  document.body.appendChild(root);
  return root;
}

function numberFromPx(value: string, fallback: number): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
