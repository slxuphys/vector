import type { PDFFont, PDFPage } from "pdf-lib";
import type { DisplayObject } from "../../display-list/displayTypes";
import { hexToRgb } from "./pdfText";

type MathFonts = {
  regular: PDFFont;
  italic: PDFFont;
};

type MathToken = {
  text: string;
  script?: "super" | "sub";
};

const commandText: Record<string, string> = {
  "\\alpha": "alpha",
  "\\beta": "beta",
  "\\gamma": "gamma",
  "\\delta": "delta",
  "\\theta": "theta",
  "\\lambda": "lambda",
  "\\mu": "mu",
  "\\pi": "pi",
  "\\sigma": "sigma",
  "\\int": "int",
  "\\sum": "sum",
  "\\frac": "/"
};

export function drawPdfMath(
  page: PDFPage,
  object: Extract<DisplayObject, { type: "math" }>,
  fonts: MathFonts,
  pageHeight: number
): void {
  const tokens = tokenizeLatex(object.latex);
  const baseSize = object.fontSize;
  const scriptSize = baseSize * 0.68;
  const baseline = pageHeight - (object.y + (object.displayMode ? baseSize * 1.9 : baseSize));
  let x = object.x;

  for (const token of tokens) {
    const size = token.script ? scriptSize : baseSize;
    const y = token.script === "super"
      ? baseline + baseSize * 0.42
      : token.script === "sub"
        ? baseline - baseSize * 0.28
        : baseline;
    const font = token.script ? fonts.regular : fonts.italic;
    page.drawText(token.text, {
      x,
      y,
      size,
      font,
      color: hexToRgb(object.color)
    });
    x += font.widthOfTextAtSize(token.text, size);
  }
}

export function tokenizeLatex(latex: string): MathToken[] {
  const normalized = latex
    .replaceAll("\\,", " ")
    .replaceAll("\\;", " ")
    .replaceAll("\\quad", " ")
    .replaceAll("\\cdot", " * ")
    .replaceAll("\\times", " x ")
    .replace(/\s*([=+\-/])\s*/g, " $1 ")
    .replace(/\s+/g, " ")
    .trim();
  const tokens: MathToken[] = [];

  for (let i = 0; i < normalized.length; i += 1) {
    const char = normalized[i];
    if (char === "^" || char === "_") {
      const result = readScript(normalized, i + 1);
      tokens.push({ text: result.text, script: char === "^" ? "super" : "sub" });
      i = result.end;
      continue;
    }

    if (char === "\\") {
      const match = normalized.slice(i).match(/^\\[a-zA-Z]+/);
      if (match) {
        tokens.push({ text: commandText[match[0]] ?? match[0].slice(1) });
        i += match[0].length - 1;
        continue;
      }
    }

    tokens.push({ text: char });
  }

  return mergeTextTokens(tokens);
}

function readScript(input: string, start: number): { text: string; end: number } {
  if (input[start] === "{") {
    const end = input.indexOf("}", start + 1);
    if (end !== -1) return { text: input.slice(start + 1, end), end };
  }

  return { text: input[start] ?? "", end: start };
}

function mergeTextTokens(tokens: MathToken[]): MathToken[] {
  const merged: MathToken[] = [];
  for (const token of tokens) {
    const last = merged.at(-1);
    if (last && last.script === token.script) last.text += token.text;
    else merged.push({ ...token });
  }
  return merged.filter((token) => token.text.length > 0);
}
