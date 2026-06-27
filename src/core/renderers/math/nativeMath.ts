import type { DisplayObject } from "../../display-list/displayTypes";
import { escapeXml } from "../../utils/sanitize";

type NativeMathObject = Extract<DisplayObject, { type: "math" }>;

export type NativeGlyph = {
  type: "glyph";
  text: string;
  x: number;
  y: number;
  fontSize: number;
  fontFamily?: string;
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

export type NativePath = {
  type: "path";
  d: string;
  points: Array<[number, number]>;
  x: number;
  y: number;
  strokeWidth: number;
  color?: string;
};

export type NativeNode = NativeGlyph | NativeRule | NativePath;

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
  displayLargeOperatorSuperscriptBaseline: number;
  displayLargeOperatorSubscriptBaseline: number;
  displayLargeOperatorSuperscriptGap: number;
  displayLargeOperatorSubscriptGap: number;
  displayLimitOperatorSuperscriptBaseline: number;
  displayLimitOperatorSubscriptBaseline: number;
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
  displayFractionScale: 1,
  fractionGap: 0.05,
  fractionRuleThickness: 0.045,
  fractionSidePadding: 0.55,
  fractionRuleInset: 0.18,
  displayFractionDenominatorBaseline: 0,
  inlineFractionAxisOffset: 0.3,
  sqrtBodyScale: 1,
  sqrtRadicalWidth: 0.8,
  sqrtTopGap: 0.12,
  sqrtRuleThickness: 0.045,
  sqrtGlyphScale: 1.16,
  sqrtRuleStart: 0.98,
  sqrtOverbarExtra: 0.12,
  displayLargeOperatorSuperscriptBaseline: -1.24,
  displayLargeOperatorSubscriptBaseline: 0.97,
  displayLargeOperatorSuperscriptGap: 0.79,
  displayLargeOperatorSubscriptGap: 0.18,
  displayLimitOperatorSuperscriptBaseline: -1.28,
  displayLimitOperatorSubscriptBaseline: 1.11,
  relationMargin: 0.32,
  binaryMargin: 0.32
};

type GlyphStyle = {
  fontFamily?: string;
  italic?: boolean;
  bold?: boolean;
};

const regularMathFontFamily = "KaTeX_Main, Times New Roman, serif";
const italicMathFontFamily = "KaTeX_Math, KaTeX_Main, Times New Roman, serif";
const largeOperatorFontFamily = "KaTeX_Size2, KaTeX_Size1, KaTeX_Main, Times New Roman, serif";
const displayLargeOperatorTop = 1.25;
const displayLargeOperatorBottom = 0.45;

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
  "\\int": "∫",
  "\\sum": "∑",
  "\\prod": "∏",
  "\\lim": "lim",
  "\\pm": "±",
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
  "\\Omega",
  "\\int",
  "\\sum",
  "\\prod",
  "\\lim"
]);

const displayLargeOperatorCommands = new Set(["\\int", "\\sum", "\\prod"]);

export function layoutNativeMath(
  latex: string,
  displayMode: boolean,
  fontSize: number,
  metrics: NativeMathMetrics = defaultNativeMathMetrics
): NativeMathLayout {
  const layout = layoutSequence(latex.trim(), fontSize, displayMode, metrics);
  const padding = fontSize * (displayMode ? metrics.displayPadding : metrics.inlinePadding);
  const result = {
    width: Math.max(1, layout.width + padding * 2),
    height: Math.max(fontSize * 1.2, layout.height + padding * 2),
    baseline: layout.baseline + padding,
    advance: layout.width + padding * 2,
    nodes: translateNodes(layout.nodes, padding, padding)
  };
  logNativeMathParse(latex, displayMode, fontSize, result);
  return result;
}

export function renderNativeMathSvg(object: NativeMathObject): string {
  const layout = layoutNativeMath(object.latex, object.displayMode, object.fontSize, object.nativeMetrics);
  const body = layout.nodes.map((node) => {
    if (node.type === "rule") {
      return `<rect x="${round(object.x + node.x)}" y="${round(object.y + node.y)}" width="${round(node.width)}" height="${round(node.height)}" fill="${escapeXml(object.color)}" />`;
    }

    if (node.type === "path") {
      return `<path d="${escapeXml(node.d)}" transform="translate(${round(object.x + node.x)} ${round(object.y + node.y)})" fill="none" stroke="${escapeXml(node.color ?? object.color)}" stroke-width="${round(node.strokeWidth)}" stroke-linecap="round" stroke-linejoin="round" />`;
    }

    const style = [
      `font-family:${node.fontFamily ?? (node.italic ? italicMathFontFamily : regularMathFontFamily)}`,
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
  ascent: number;
  descent: number;
  nodes: NativeNode[];
};

type LastAtom = {
  x: number;
  width: number;
  scriptAdvance: number;
  displayIntegralOperator?: boolean;
  displayLimitOperator?: boolean;
};

function layoutSequence(input: string, fontSize: number, displayMode: boolean, metrics: NativeMathMetrics): Box {
  const nodes: NativeNode[] = [];
  let x = 0;
  let lastAtom: LastAtom | undefined;
  let maxTop = fontSize * 0.9;
  let maxBottom = fontSize * 0.3;
  const glyphGap = fontSize * (displayMode ? metrics.displayGlyphGap : metrics.inlineGlyphGap);

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (char === "{" || char === "}") continue;
    if (char === "^" || char === "_") {
      const script = readArgument(input, index + 1);
      const scriptBox = layoutSequence(script.value, fontSize * metrics.scriptScale, false, metrics);
      const scriptBaseline = getScriptBaseline(char, fontSize, metrics, lastAtom);
      const yShift = scriptBaseline - scriptBox.baseline;
      const anchor = getScriptAnchor(char, x, scriptBox.width, fontSize, metrics, lastAtom);
      nodes.push(...translateNodes(scriptBox.nodes, anchor, yShift));
      const neededAdvance = getScriptAdvance(x, anchor, scriptBox.width, fontSize, displayMode, metrics, lastAtom);
      x += Math.max(0, neededAdvance - (lastAtom?.scriptAdvance ?? 0));
      if (lastAtom) lastAtom.scriptAdvance = Math.max(lastAtom.scriptAdvance, neededAdvance);
      else lastAtom = { x: anchor, width: scriptBox.width, scriptAdvance: 0 };
      maxTop = Math.max(maxTop, Math.max(0, -yShift));
      maxBottom = Math.max(maxBottom, Math.max(0, yShift + scriptBox.baseline + scriptBox.descent));
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
        maxTop = Math.max(maxTop, frac.ascent - axisOffsetDelta);
        maxBottom = Math.max(maxBottom, frac.descent + axisOffsetDelta);
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
        maxTop = Math.max(maxTop, sqrt.ascent);
        maxBottom = Math.max(maxBottom, sqrt.descent);
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
      const isDisplayLargeOperator = displayMode && displayLargeOperatorCommands.has(command.name);
      const isDisplayIntegralOperator = isDisplayLargeOperator && command.name === "\\int";
      const isDisplayLimitOperator = isDisplayLargeOperator && command.name !== "\\int";
      const glyphFontSize = fontSize;
      const style = {
        fontFamily: isDisplayLargeOperator ? largeOperatorFontFamily : undefined,
        color: isUnsupported ? "#b42318" : undefined,
        italic: !uprightCommandGlyphs.has(command.name) && !isOperatorText(text)
      };
      x += operatorLeftMargin(text, fontSize, metrics);
      nodes.push(glyph(text, x, 0, glyphFontSize, style));
      const width = measureGlyphLayoutWidth(text, glyphFontSize, style, isDisplayLimitOperator);
      lastAtom = {
        x,
        width,
        scriptAdvance: 0,
        displayIntegralOperator: isDisplayIntegralOperator,
        displayLimitOperator: isDisplayLimitOperator
      };
      x += width + operatorRightMargin(text, fontSize, metrics) + glyphGap;
      maxTop = Math.max(maxTop, glyphFontSize * (isDisplayLargeOperator ? displayLargeOperatorTop : 0.9));
      maxBottom = Math.max(maxBottom, glyphFontSize * (isDisplayLargeOperator ? displayLargeOperatorBottom : 0.3));
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
  const height = Math.max(maxTop + maxBottom, baseline + maxBottom);
  return {
    width: x,
    height,
    baseline,
    ascent: baseline,
    descent: Math.max(0, height - baseline),
    nodes: translateNodes(nodes, 0, baseline)
  };
}

function getScriptBaseline(
  scriptChar: string,
  fontSize: number,
  metrics: NativeMathMetrics,
  lastAtom: LastAtom | undefined
): number {
  if (lastAtom?.displayLimitOperator) {
    return fontSize * (
      scriptChar === "^"
        ? metrics.displayLimitOperatorSuperscriptBaseline
        : metrics.displayLimitOperatorSubscriptBaseline
    );
  }
  if (lastAtom?.displayIntegralOperator) {
    return fontSize * (
      scriptChar === "^"
        ? metrics.displayLargeOperatorSuperscriptBaseline
        : metrics.displayLargeOperatorSubscriptBaseline
    );
  }
  return fontSize * (scriptChar === "^" ? metrics.superscriptBaseline : metrics.subscriptBaseline);
}

function getScriptAnchor(
  scriptChar: string,
  cursorX: number,
  scriptWidth: number,
  fontSize: number,
  metrics: NativeMathMetrics,
  lastAtom: LastAtom | undefined
): number {
  if (!lastAtom) return cursorX;
  if (lastAtom.displayLimitOperator) {
    return lastAtom.x + (lastAtom.width - scriptWidth) / 2;
  }
  const scriptGap = fontSize * (
    lastAtom.displayIntegralOperator
      ? scriptChar === "^"
        ? metrics.displayLargeOperatorSuperscriptGap
        : metrics.displayLargeOperatorSubscriptGap
      : metrics.scriptGap
  );
  return lastAtom.x + lastAtom.width + scriptGap;
}

function getScriptAdvance(
  cursorX: number,
  scriptX: number,
  scriptWidth: number,
  fontSize: number,
  displayMode: boolean,
  metrics: NativeMathMetrics,
  lastAtom: LastAtom | undefined
): number {
  if (!lastAtom) return Math.max(0, scriptX + scriptWidth - cursorX);
  if (lastAtom.displayLimitOperator) {
    const rightEdge = Math.max(lastAtom.x + lastAtom.width, scriptX + scriptWidth);
    return Math.max(0, rightEdge - cursorX);
  }
  return Math.max(0, scriptX + scriptWidth - cursorX);
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
  const ruleY = numerator.baseline + numerator.descent + gap;
  const denominatorY = ruleY + rule + gap;
  const height = denominatorY + denominator.height;
  const baseline = displayMode
    ? ruleY + rule + gap + denominator.baseline * metrics.displayFractionDenominatorBaseline
    : ruleY + rule / 2 + fontSize * metrics.inlineFractionAxisOffset;
  const ascent = baseline;
  const descent = Math.max(0, height - baseline);
  return {
    width,
    height,
    baseline,
    ascent,
    descent,
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
  const top = Math.max(fontSize * metrics.sqrtTopGap, body.ascent * metrics.sqrtTopGap);
  const rule = Math.max(0.6, Math.max(fontSize, body.height) * metrics.sqrtRuleThickness);
  const radicalStroke = Math.max(0.6, fontSize * metrics.sqrtRuleThickness);
  const ruleY = top;
  const bodyY = ruleY + rule;
  const height = Math.max(bodyY + body.height, fontSize * 1.35);
  const baseline = bodyY + body.baseline;
  const ascent = baseline;
  const descent = Math.max(0, height - baseline);
  const ruleX = radicalWidth * metrics.sqrtRuleStart;
  const radicalBottom = Math.min(height - rule * 0.5, bodyY + body.height - rule * 0.5);
  const radicalKneeY = radicalBottom - fontSize * 0.12;
  const tickY = Math.max(ruleY + rule / 2, baseline - fontSize * 0.22);
  return {
    width: radicalWidth + body.width + fontSize * 0.18,
    height,
    baseline,
    ascent,
    descent,
    nodes: [
      ...radicalSegments([
        [0, tickY + fontSize * 0.2],
        [radicalWidth * 0.16, tickY],
        [radicalWidth * 0.56, radicalKneeY],
        [ruleX, ruleY + rule / 2]
      ], radicalStroke),
      { type: "rule", x: ruleX, y: ruleY, width: body.width + fontSize * metrics.sqrtOverbarExtra, height: rule },
      ...translateNodes(body.nodes, radicalWidth, bodyY)
    ]
  };
}

function radicalSegments(points: Array<[number, number]>, strokeWidth: number): NativePath[] {
  return points.slice(1).map((point, index) => {
    const start = points[index];
    const segmentStrokeWidth = index === 1 ? strokeWidth * 1.75 : strokeWidth;
    return radicalPath([start, point], segmentStrokeWidth);
  });
}

function radicalPath(points: Array<[number, number]>, strokeWidth: number): NativePath {
  const [first, ...rest] = points;
  return {
    type: "path",
    d: `M ${round(first[0])} ${round(first[1])} ${rest.map(([x, y]) => `L ${round(x)} ${round(y)}`).join(" ")}`,
    points,
    x: 0,
    y: 0,
    strokeWidth
  };
}

function glyph(
  text: string,
  x: number,
  baselineOffset: number,
  fontSize: number,
  options: { fontFamily?: string; italic?: boolean; bold?: boolean; color?: string } = {}
): NativeGlyph {
  return {
    type: "glyph",
    text,
    x,
    y: baselineOffset,
    fontSize,
    fontFamily: options.fontFamily,
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

function logNativeMathParse(
  latex: string,
  displayMode: boolean,
  fontSize: number,
  layout: NativeMathLayout
): void {
  if (typeof console === "undefined") return;
  console.log("[native-math-parse]", {
    latex,
    displayMode,
    fontSize,
    width: roundNumber(layout.width),
    height: roundNumber(layout.height),
    baseline: roundNumber(layout.baseline),
    advance: roundNumber(layout.advance),
    nodes: layout.nodes.map((node) => {
      if (node.type === "glyph") {
        const style = {
          fontFamily: node.fontFamily,
          italic: node.italic,
          bold: node.bold
        };
        const canvasMetrics = measureGlyphCanvasMetrics(node.text, node.fontSize, style);
        return {
          type: node.type,
          text: node.text,
          x: roundNumber(node.x),
          y: roundNumber(node.y),
          fontSize: roundNumber(node.fontSize),
          advanceWidth: roundNumber(measureGlyphWidth(node.text, node.fontSize, style)),
          layoutWidth: roundNumber(measureGlyphLayoutWidth(
            node.text,
            node.fontSize,
            style,
            node.fontFamily === largeOperatorFontFamily && (node.text === "∑" || node.text === "∏")
          )),
          actualLeft: canvasMetrics ? roundNumber(canvasMetrics.actualLeft) : undefined,
          actualRight: canvasMetrics ? roundNumber(canvasMetrics.actualRight) : undefined,
          actualAscent: canvasMetrics ? roundNumber(canvasMetrics.actualAscent) : undefined,
          actualDescent: canvasMetrics ? roundNumber(canvasMetrics.actualDescent) : undefined,
          actualWidth: canvasMetrics ? roundNumber(canvasMetrics.actualWidth) : undefined,
          layoutHeight: roundNumber(node.fontSize * 1.2),
          fontFamily: node.fontFamily,
          italic: node.italic,
          bold: node.bold
        };
      }
      if (node.type === "rule") {
        return {
          type: node.type,
          x: roundNumber(node.x),
          y: roundNumber(node.y),
          width: roundNumber(node.width),
          height: roundNumber(node.height)
        };
      }
      return {
        type: node.type,
        x: roundNumber(node.x),
        y: roundNumber(node.y),
        strokeWidth: roundNumber(node.strokeWidth),
        points: node.points.map(([x, y]) => [roundNumber(x), roundNumber(y)])
      };
    })
  });
}

function measureGlyphWidth(text: string, fontSize: number, style: GlyphStyle = {}): number {
  const cacheKey = `${style.fontFamily ?? ""}:${style.bold ? "700" : "400"}:${style.italic ? "italic" : "normal"}:${fontSize}:${text}`;
  const cached = glyphWidthCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const measured = measureGlyphWidthInCanvas(text, fontSize, style) ?? estimateWidth(text, fontSize);
  glyphWidthCache.set(cacheKey, measured);
  return measured;
}

function measureGlyphLayoutWidth(
  text: string,
  fontSize: number,
  style: GlyphStyle,
  useInkRightEdge = false
): number {
  const advanceWidth = measureGlyphWidth(text, fontSize, style);
  if (!useInkRightEdge) return advanceWidth;

  const canvasMetrics = measureGlyphCanvasMetrics(text, fontSize, style);
  if (!canvasMetrics) return advanceWidth;
  return Math.max(advanceWidth, canvasMetrics.actualRight);
}

function measureGlyphWidthInCanvas(text: string, fontSize: number, style: GlyphStyle): number | undefined {
  if (typeof document === "undefined") return undefined;
  if (!measureCanvas) measureCanvas = document.createElement("canvas");
  if (!measureContext) measureContext = measureCanvas.getContext("2d");
  if (!measureContext) return undefined;

  const fontStyle = style.italic ? "italic" : "normal";
  const fontWeight = style.bold ? "700" : "400";
  const family = style.fontFamily ?? (style.italic ? italicMathFontFamily : regularMathFontFamily);
  measureContext.font = `${fontStyle} ${fontWeight} ${fontSize}px ${family}`;
  return measureContext.measureText(text).width;
}

function measureGlyphCanvasMetrics(
  text: string,
  fontSize: number,
  style: GlyphStyle
): {
  actualLeft: number;
  actualRight: number;
  actualAscent: number;
  actualDescent: number;
  actualWidth: number;
} | undefined {
  if (typeof document === "undefined") return undefined;
  if (!measureCanvas) measureCanvas = document.createElement("canvas");
  if (!measureContext) measureContext = measureCanvas.getContext("2d");
  if (!measureContext) return undefined;

  const fontStyle = style.italic ? "italic" : "normal";
  const fontWeight = style.bold ? "700" : "400";
  const family = style.fontFamily ?? (style.italic ? italicMathFontFamily : regularMathFontFamily);
  measureContext.font = `${fontStyle} ${fontWeight} ${fontSize}px ${family}`;
  const metrics = measureContext.measureText(text);
  return {
    actualLeft: metrics.actualBoundingBoxLeft,
    actualRight: metrics.actualBoundingBoxRight,
    actualAscent: metrics.actualBoundingBoxAscent,
    actualDescent: metrics.actualBoundingBoxDescent,
    actualWidth: metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight
  };
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
  return text === "+" || text === "-" || text === "−" || text === "±" || text === "×" || text === "·";
}

function unsupported(command: string): string {
  return `⟦${command.slice(1)}⟧`;
}

function round(value: number): string {
  return Number(value.toFixed(2)).toString();
}

function roundNumber(value: number): number {
  return Number(value.toFixed(3));
}
