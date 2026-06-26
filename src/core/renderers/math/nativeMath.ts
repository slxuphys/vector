import type { DisplayObject } from "../../display-list/displayTypes";
import { escapeXml } from "../../utils/sanitize";

type NativeMathObject = Extract<DisplayObject, { type: "math" }>;

export type NativeGlyph = {
  type: "glyph";
  text: string;
  x: number;
  y: number;
  fontSize: number;
  italic?: boolean;
  bold?: boolean;
  color?: string;
};

export type NativeRule = {
  type: "rule";
  x: number;
  y: number;
  width: number;
  height: number;
};

export type NativeNode = NativeGlyph | NativeRule;

export type NativeMathLayout = {
  width: number;
  height: number;
  baseline: number;
  advance: number;
  nodes: NativeNode[];
};

export type NativeMathMetrics = {
  inlinePadding: number;
  displayPadding: number;
  inlineBaseline: number;
  scriptScale: number;
  superscriptBaseline: number;
  subscriptBaseline: number;
  scriptGap: number;
  inlineGlyphGap: number;
  displayGlyphGap: number;
  inlineFractionScale: number;
  displayFractionScale: number;
  fractionGap: number;
  fractionRuleThickness: number;
  fractionSidePadding: number;
  fractionRuleInset: number;
  displayFractionDenominatorBaseline: number;
  inlineFractionAxisOffset: number;
  sqrtBodyScale: number;
  sqrtRadicalWidth: number;
  sqrtTopGap: number;
  sqrtRuleThickness: number;
  sqrtGlyphScale: number;
  sqrtRuleStart: number;
  sqrtOverbarExtra: number;
  relationMargin: number;
  binaryMargin: number;
};

export const defaultNativeMathMetrics: NativeMathMetrics = {
  inlinePadding: 0.08,
  displayPadding: 0.25,
  inlineBaseline: 0.905,
  scriptScale: 0.68,
  superscriptBaseline: -0.37,
  subscriptBaseline: 0.28,
  scriptGap: 0.06,
  inlineGlyphGap: 0.155,
  displayGlyphGap: 0.155,
  inlineFractionScale: 0.72,
  displayFractionScale: 0.82,
  fractionGap: 0.05,
  fractionRuleThickness: 0.045,
  fractionSidePadding: 0.55,
  fractionRuleInset: 0.18,
  displayFractionDenominatorBaseline: 0,
  inlineFractionAxisOffset: 0.3,
  sqrtBodyScale: 0.92,
  sqrtRadicalWidth: 0.72,
  sqrtTopGap: 0.12,
  sqrtRuleThickness: 0.045,
  sqrtGlyphScale: 1.16,
  sqrtRuleStart: 0.72,
  sqrtOverbarExtra: 0.12,
  relationMargin: 0.32,
  binaryMargin: 0.32
};

type GlyphStyle = {
  italic?: boolean;
  bold?: boolean;
};

let measureCanvas: HTMLCanvasElement | undefined;
let measureContext: CanvasRenderingContext2D | undefined | null;
const glyphWidthCache = new Map<string, number>();

const commandGlyphs: Record<string, string> = {
  "\\alpha": "α",
  "\\beta": "β",
  "\\gamma": "γ",
  "\\delta": "δ",
  "\\Gamma": "Γ",
  "\\Delta": "Δ",
  "\\Theta": "Θ",
  "\\Lambda": "Λ",
  "\\Xi": "Ξ",
  "\\Pi": "Π",
  "\\Sigma": "Σ",
  "\\Upsilon": "Υ",
  "\\Phi": "Φ",
  "\\Psi": "Ψ",
  "\\Omega": "Ω",
  "\\epsilon": "ϵ",
  "\\varepsilon": "ε",
  "\\zeta": "ζ",
  "\\eta": "η",
  "\\theta": "θ",
  "\\lambda": "λ",
  "\\mu": "μ",
  "\\pi": "π",
  "\\rho": "ρ",
  "\\sigma": "σ",
  "\\omega": "ω",
  "\\nabla": "∇",
  "\\partial": "∂",
  "\\cdot": "·",
  "\\times": "×",
  "\\le": "≤",
  "\\ge": "≥",
  "\\in": "∈",
  "\\to": "→",
  "\\Rightarrow": "⇒",
  "\\infty": "∞",
  "\\qquad": "    ",
  "\\quad": "  ",
  "\\,": " ",
  "\\;": " "
};

const uprightCommandGlyphs = new Set([
  "\\nabla",
  "\\Gamma",
  "\\Delta",
  "\\Theta",
  "\\Lambda",
  "\\Xi",
  "\\Pi",
  "\\Sigma",
  "\\Upsilon",
  "\\Phi",
  "\\Psi",
  "\\Omega"
]);

export function layoutNativeMath(
  latex: string,
  displayMode: boolean,
  fontSize: number,
  metrics: NativeMathMetrics = defaultNativeMathMetrics
): NativeMathLayout {
  const layout = layoutSequence(latex.trim(), fontSize, displayMode, metrics);
  const padding = fontSize * (displayMode ? metrics.displayPadding : metrics.inlinePadding);
  return {
    width: Math.max(1, layout.width + padding * 2),
    height: Math.max(fontSize * 1.2, layout.height + padding * 2),
    baseline: layout.baseline + padding,
    advance: layout.width + padding * 2,
    nodes: translateNodes(layout.nodes, padding, padding)
  };
}

export function renderNativeMathSvg(object: NativeMathObject): string {
  const layout = layoutNativeMath(object.latex, object.displayMode, object.fontSize, object.nativeMetrics);
  const body = layout.nodes.map((node) => {
    if (node.type === "rule") {
      return `<rect x="${round(object.x + node.x)}" y="${round(object.y + node.y)}" width="${round(node.width)}" height="${round(node.height)}" fill="${escapeXml(object.color)}" />`;
    }

    const style = [
      `font-family:${node.italic ? "KaTeX_Math, KaTeX_Main, Times New Roman, serif" : "KaTeX_Main, Times New Roman, serif"}`,
      node.italic ? "font-style:italic" : "",
      node.bold ? "font-weight:700" : "",
      `font-size:${round(node.fontSize)}px`,
      `fill:${escapeXml(node.color ?? object.color)}`
    ].filter(Boolean).join(";");
    return `<text x="${round(object.x + node.x)}" y="${round(object.y + node.y)}" style="${style}" xml:space="preserve">${escapeXml(node.text)}</text>`;
  }).join("");
  return `<g class="svg-md-native-math">${body}</g>`;
}

type Box = {
  width: number;
  height: number;
  baseline: number;
  nodes: NativeNode[];
};

function layoutSequence(input: string, fontSize: number, displayMode: boolean, metrics: NativeMathMetrics): Box {
  const nodes: NativeNode[] = [];
  let x = 0;
  let lastAtom: { x: number; width: number; scriptAdvance: number } | undefined;
  let maxTop = fontSize * 0.9;
  let maxBottom = fontSize * 0.3;
  const glyphGap = fontSize * (displayMode ? metrics.displayGlyphGap : metrics.inlineGlyphGap);

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (char === "{" || char === "}") continue;
    if (char === "^" || char === "_") {
      const script = readArgument(input, index + 1);
      const scriptBox = layoutSequence(script.value, fontSize * metrics.scriptScale, false, metrics);
      const scriptBaseline = fontSize * (char === "^" ? metrics.superscriptBaseline : metrics.subscriptBaseline);
      const yShift = scriptBaseline - scriptBox.baseline;
      const scriptGap = fontSize * metrics.scriptGap;
      const anchor = lastAtom ? lastAtom.x + lastAtom.width + scriptGap : x;
      nodes.push(...translateNodes(scriptBox.nodes, anchor, yShift));
      const neededAdvance = Math.max(0, anchor + scriptBox.width - x);
      x += Math.max(0, neededAdvance - (lastAtom?.scriptAdvance ?? 0));
      if (lastAtom) lastAtom.scriptAdvance = Math.max(lastAtom.scriptAdvance, neededAdvance);
      else lastAtom = { x: anchor, width: scriptBox.width, scriptAdvance: 0 };
      maxTop = Math.max(maxTop, Math.max(0, -yShift));
      maxBottom = Math.max(maxBottom, Math.max(0, yShift + scriptBox.height));
      index = script.end;
      continue;
    }

    if (char === "\\") {
      const command = readCommand(input, index);
      if (command.name === "\\frac") {
        const numerator = readArgument(input, command.end + 1);
        const denominator = readArgument(input, numerator.end + 1);
        const frac = layoutFraction(numerator.value, denominator.value, fontSize, displayMode, metrics);
        nodes.push(...translateNodes(frac.nodes, x, -frac.baseline));
        lastAtom = { x, width: frac.width, scriptAdvance: 0 };
        x += frac.width + glyphGap;
        const axisOffsetDelta = displayMode
          ? 0
          : fontSize * (metrics.inlineFractionAxisOffset - defaultNativeMathMetrics.inlineFractionAxisOffset);
        maxTop = Math.max(maxTop, frac.baseline - axisOffsetDelta);
        maxBottom = Math.max(maxBottom, frac.height - frac.baseline + axisOffsetDelta);
        index = denominator.end;
        continue;
      }

      if (command.name === "\\sqrt") {
        const body = input[command.end + 1] === "["
          ? readArgument(input, input.indexOf("]", command.end + 1) + 1)
          : readArgument(input, command.end + 1);
        const sqrt = layoutSqrt(body.value, fontSize, displayMode, metrics);
        nodes.push(...translateNodes(sqrt.nodes, x, -sqrt.baseline));
        lastAtom = { x, width: sqrt.width, scriptAdvance: 0 };
        x += sqrt.width + glyphGap;
        maxTop = Math.max(maxTop, sqrt.baseline);
        maxBottom = Math.max(maxBottom, sqrt.height - sqrt.baseline);
        index = body.end;
        continue;
      }

      if (command.name === "\\mathbf") {
        const body = readArgument(input, command.end + 1);
        const text = body.value.replace(/[{}]/g, "");
        const style = { bold: true, italic: false };
        nodes.push(glyph(text, x, 0, fontSize, style));
        const width = measureGlyphWidth(text, fontSize, style);
        lastAtom = { x, width, scriptAdvance: 0 };
        x += width + glyphGap;
        index = body.end;
        continue;
      }

      if (command.name === "\\begin" || command.name === "\\left" || command.name === "\\right") {
        const marker = unsupported(command.name);
        const style = { color: "#b42318", italic: false };
        nodes.push(glyph(marker, x, 0, fontSize * 0.86, style));
        const width = measureGlyphWidth(marker, fontSize * 0.86, style);
        lastAtom = { x, width, scriptAdvance: 0 };
        x += width + glyphGap;
        index = command.end;
        continue;
      }

      const text = commandGlyphs[command.name] ?? unsupported(command.name);
      const isUnsupported = !commandGlyphs[command.name];
      const style = {
        color: isUnsupported ? "#b42318" : undefined,
        italic: !uprightCommandGlyphs.has(command.name) && !isOperatorText(text)
      };
      x += operatorLeftMargin(text, fontSize, metrics);
      nodes.push(glyph(text, x, 0, fontSize, style));
      const width = measureGlyphWidth(text, fontSize, style);
      lastAtom = { x, width, scriptAdvance: 0 };
      x += width + operatorRightMargin(text, fontSize, metrics) + glyphGap;
      index = skipIgnoredCommandSpaces(input, command.name, command.end);
      continue;
    }

    if (char === " ") continue;

    const text = normalizeMathGlyph(char === "\n" ? " " : char);
    const style = { italic: shouldItalicize(text) };
    x += operatorLeftMargin(text, fontSize, metrics);
    nodes.push(glyph(text, x, 0, fontSize, style));
    const width = measureGlyphWidth(text, fontSize, style);
    lastAtom = { x, width, scriptAdvance: 0 };
    x += width + operatorRightMargin(text, fontSize, metrics) + glyphGap;
  }

  const baseline = displayMode ? maxTop : fontSize * metrics.inlineBaseline;
  return {
    width: x,
    height: Math.max(maxTop + maxBottom, baseline + maxBottom),
    baseline,
    nodes: translateNodes(nodes, 0, baseline)
  };
}

function layoutFraction(
  numeratorLatex: string,
  denominatorLatex: string,
  fontSize: number,
  displayMode: boolean,
  metrics: NativeMathMetrics
): Box {
  const childSize = fontSize * (displayMode ? metrics.displayFractionScale : metrics.inlineFractionScale);
  const numerator = layoutSequence(numeratorLatex, childSize, false, metrics);
  const denominator = layoutSequence(denominatorLatex, childSize, false, metrics);
  const gap = fontSize * metrics.fractionGap;
  const rule = Math.max(0.6, fontSize * metrics.fractionRuleThickness);
  const width = Math.max(numerator.width, denominator.width) + fontSize * metrics.fractionSidePadding;
  const numeratorX = (width - numerator.width) / 2;
  const denominatorX = (width - denominator.width) / 2;
  const numeratorY = 0;
  const ruleY = numerator.height + gap;
  const denominatorY = ruleY + rule + gap;
  const height = denominatorY + denominator.height;
  const baseline = displayMode
    ? ruleY + rule + gap + denominator.baseline * metrics.displayFractionDenominatorBaseline
    : ruleY + rule / 2 + fontSize * metrics.inlineFractionAxisOffset;
  return {
    width,
    height,
    baseline,
    nodes: [
      ...translateNodes(numerator.nodes, numeratorX, numeratorY),
      { type: "rule", x: fontSize * metrics.fractionRuleInset, y: ruleY, width: width - fontSize * metrics.fractionRuleInset * 2, height: rule },
      ...translateNodes(denominator.nodes, denominatorX, denominatorY)
    ]
  };
}

function layoutSqrt(bodyLatex: string, fontSize: number, displayMode: boolean, metrics: NativeMathMetrics): Box {
  const body = layoutSequence(bodyLatex, fontSize * metrics.sqrtBodyScale, displayMode, metrics);
  const radicalWidth = fontSize * metrics.sqrtRadicalWidth;
  const top = fontSize * metrics.sqrtTopGap;
  const rule = Math.max(0.6, fontSize * metrics.sqrtRuleThickness);
  const height = Math.max(body.height + top + rule, fontSize * 1.35);
  const baseline = top + rule + body.baseline;
  return {
    width: radicalWidth + body.width + fontSize * 0.18,
    height,
    baseline,
    nodes: [
      glyph("√", 0, baseline, fontSize * metrics.sqrtGlyphScale, { italic: false }),
      { type: "rule", x: radicalWidth * metrics.sqrtRuleStart, y: top, width: body.width + fontSize * metrics.sqrtOverbarExtra, height: rule },
      ...translateNodes(body.nodes, radicalWidth, top + rule)
    ]
  };
}

function glyph(
  text: string,
  x: number,
  baselineOffset: number,
  fontSize: number,
  options: { italic?: boolean; bold?: boolean; color?: string } = {}
): NativeGlyph {
  return {
    type: "glyph",
    text,
    x,
    y: baselineOffset,
    fontSize,
    italic: options.italic,
    bold: options.bold,
    color: options.color
  };
}

function readCommand(input: string, start: number): { name: string; end: number } {
  const match = input.slice(start).match(/^\\[a-zA-Z]+|^\\./);
  if (!match) return { name: input[start], end: start };
  return { name: match[0], end: start + match[0].length - 1 };
}

function skipIgnoredCommandSpaces(input: string, commandName: string, commandEnd: number): number {
  if (!/^\\[a-zA-Z]+$/.test(commandName)) return commandEnd;
  let index = commandEnd;
  while (input[index + 1] === " ") index += 1;
  return index;
}

function readArgument(input: string, start: number): { value: string; end: number } {
  while (input[start] === " ") start += 1;
  if (input[start] !== "{") return { value: input[start] ?? "", end: start };

  let depth = 0;
  for (let index = start; index < input.length; index += 1) {
    if (input[index] === "{") depth += 1;
    if (input[index] === "}") depth -= 1;
    if (depth === 0) return { value: input.slice(start + 1, index), end: index };
  }
  return { value: input.slice(start + 1), end: input.length - 1 };
}

function translateNodes(nodes: NativeNode[], dx: number, dy: number): NativeNode[] {
  return nodes.map((node) => ({ ...node, x: node.x + dx, y: node.y + dy }));
}

function measureGlyphWidth(text: string, fontSize: number, style: GlyphStyle = {}): number {
  const cacheKey = `${style.bold ? "700" : "400"}:${style.italic ? "italic" : "normal"}:${fontSize}:${text}`;
  const cached = glyphWidthCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const measured = measureGlyphWidthInCanvas(text, fontSize, style) ?? estimateWidth(text, fontSize);
  glyphWidthCache.set(cacheKey, measured);
  return measured;
}

function measureGlyphWidthInCanvas(text: string, fontSize: number, style: GlyphStyle): number | undefined {
  if (typeof document === "undefined") return undefined;
  if (!measureCanvas) measureCanvas = document.createElement("canvas");
  if (!measureContext) measureContext = measureCanvas.getContext("2d");
  if (!measureContext) return undefined;

  const fontStyle = style.italic ? "italic" : "normal";
  const fontWeight = style.bold ? "700" : "400";
  const family = style.italic ? "KaTeX_Math, KaTeX_Main, Times New Roman, serif" : "KaTeX_Main, Times New Roman, serif";
  measureContext.font = `${fontStyle} ${fontWeight} ${fontSize}px ${family}`;
  return measureContext.measureText(text).width;
}

function estimateWidth(text: string, fontSize: number): number {
  let width = 0;
  for (const char of Array.from(text)) {
    if (char === " ") width += fontSize * 0.28;
    else if (/^[il.,;:|]$/.test(char)) width += fontSize * 0.24;
    else if (/^[=+\-×≤≥→⇒]$/.test(char)) width += fontSize * 0.72;
    else if (/^[A-Z∇∂√]$/.test(char)) width += fontSize * 0.72;
    else width += fontSize * 0.52;
  }
  return width;
}

function shouldItalicize(text: string): boolean {
  return /^[A-Za-zα-ωΑ-Ω]$/.test(text);
}

function normalizeMathGlyph(text: string): string {
  return text === "-" ? "−" : text;
}

function isOperatorText(text: string): boolean {
  return text.trim().length === 0 || /^[=+\-−×≤≥→⇒∈·,(){}\[\]|0-9]+$/.test(text);
}

function operatorLeftMargin(text: string, fontSize: number, metrics: NativeMathMetrics): number {
  if (isRelationOperator(text)) return fontSize * metrics.relationMargin;
  if (isBinaryOperator(text)) return fontSize * metrics.binaryMargin;
  return 0;
}

function operatorRightMargin(text: string, fontSize: number, metrics: NativeMathMetrics): number {
  if (isRelationOperator(text)) return fontSize * metrics.relationMargin;
  if (isBinaryOperator(text)) return fontSize * metrics.binaryMargin;
  return 0;
}

function isRelationOperator(text: string): boolean {
  return text === "=" || text === "≤" || text === "≥" || text === "∈" || text === "→" || text === "⇒";
}

function isBinaryOperator(text: string): boolean {
  return text === "+" || text === "-" || text === "−" || text === "×" || text === "·";
}

function unsupported(command: string): string {
  return `⟦${command.slice(1)}⟧`;
}

function round(value: number): string {
  return Number(value.toFixed(2)).toString();
}
