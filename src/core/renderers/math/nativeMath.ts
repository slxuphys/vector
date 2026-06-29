import type { DisplayObject } from "../../display-list/displayTypes";
import { escapeXml } from "../../utils/sanitize";
import {
  getNativeGlyphMetrics,
  getNativeGlyphSkew,
  getNativeGlyphTexMetrics,
  type NativeFontRole
} from "./nativeFontMetrics";

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
  sqrtRuleStart: number;
  sqrtOverbarExtra: number;
  accentGap: number;
  displayLargeOperatorSuperscriptBaseline: number;
  displayLargeOperatorSubscriptBaseline: number;
  displayLargeOperatorSuperscriptGap: number;
  displayLargeOperatorSubscriptGap: number;
  displayLimitOperatorSuperscriptBaseline: number;
  displayLimitOperatorSubscriptBaseline: number;
  namedOperatorRightMargin: number;
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
  inlineGlyphGap: 0,
  displayGlyphGap: 0,
  inlineFractionScale: 0.72,
  displayFractionScale: 1,
  fractionGap: 0.2,
  fractionRuleThickness: 0.045,
  fractionSidePadding: 0.55,
  fractionRuleInset: 0.18,
  displayFractionDenominatorBaseline: 0,
  inlineFractionAxisOffset: 0.3,
  sqrtBodyScale: 1,
  sqrtRadicalWidth: 0.8,
  sqrtTopGap: 0.08,
  sqrtRuleThickness: 0.045,
  sqrtRuleStart: 0.98,
  sqrtOverbarExtra: 0.12,
  accentGap: 0.08,
  displayLargeOperatorSuperscriptBaseline: -1.24,
  displayLargeOperatorSubscriptBaseline: 0.97,
  displayLargeOperatorSuperscriptGap: 0.79,
  displayLargeOperatorSubscriptGap: 0.18,
  displayLimitOperatorSuperscriptBaseline: -1.28,
  displayLimitOperatorSubscriptBaseline: 1.11,
  namedOperatorRightMargin: 0.16,
  relationMargin: 0.32,
  binaryMargin: 0.22
};

type GlyphStyle = {
  fontFamily?: string;
  italic?: boolean;
  bold?: boolean;
};

const regularMathFontFamily = "KaTeX_Main, Times New Roman, serif";
const italicMathFontFamily = "KaTeX_Math, KaTeX_Main, Times New Roman, serif";
const largeOperatorFontFamily = "KaTeX_Size2, KaTeX_Size1, KaTeX_Main, Times New Roman, serif";

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
  "\\cdot": "⋅",
  "\\int": "∫",
  "\\sum": "∑",
  "\\prod": "∏",
  "\\arg": "arg",
  "\\max": "max",
  "\\min": "min",
  "\\sup": "sup",
  "\\inf": "inf",
  "\\lim": "lim",
  "\\limsup": "lim sup",
  "\\liminf": "lim inf",
  "\\sin": "sin",
  "\\cos": "cos",
  "\\tan": "tan",
  "\\cot": "cot",
  "\\sec": "sec",
  "\\csc": "csc",
  "\\sinh": "sinh",
  "\\cosh": "cosh",
  "\\tanh": "tanh",
  "\\arcsin": "arcsin",
  "\\arccos": "arccos",
  "\\arctan": "arctan",
  "\\exp": "exp",
  "\\log": "log",
  "\\ln": "ln",
  "\\det": "det",
  "\\dim": "dim",
  "\\gcd": "gcd",
  "\\deg": "deg",
  "\\ker": "ker",
  "\\mod": "mod",
  "\\Pr": "Pr",
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
  "\\partial",
  "\\infty",
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
  "\\arg",
  "\\max",
  "\\min",
  "\\sup",
  "\\inf",
  "\\lim",
  "\\limsup",
  "\\liminf",
  "\\sin",
  "\\cos",
  "\\tan",
  "\\cot",
  "\\sec",
  "\\csc",
  "\\sinh",
  "\\cosh",
  "\\tanh",
  "\\arcsin",
  "\\arccos",
  "\\arctan",
  "\\exp",
  "\\log",
  "\\ln",
  "\\det",
  "\\dim",
  "\\gcd",
  "\\deg",
  "\\ker",
  "\\mod",
  "\\Pr"
]);

const displayLargeOperatorCommands = new Set(["\\int", "\\sum", "\\prod"]);
const displayLimitOperatorCommands = new Set(["\\sum", "\\prod", "\\lim", "\\max", "\\min", "\\sup", "\\inf", "\\limsup", "\\liminf"]);
const namedOperatorCommands = new Set([
  "\\arg",
  "\\max",
  "\\min",
  "\\sup",
  "\\inf",
  "\\lim",
  "\\limsup",
  "\\liminf",
  "\\sin",
  "\\cos",
  "\\tan",
  "\\cot",
  "\\sec",
  "\\csc",
  "\\sinh",
  "\\cosh",
  "\\tanh",
  "\\arcsin",
  "\\arccos",
  "\\arctan",
  "\\exp",
  "\\log",
  "\\ln",
  "\\det",
  "\\dim",
  "\\gcd",
  "\\deg",
  "\\ker",
  "\\mod",
  "\\Pr"
]);
const accentCommands = new Set(["\\bar", "\\hat", "\\tilde", "\\vec", "\\dot", "\\ddot"]);

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
  inkTop: number;
  inkBottom: number;
  nodes: NativeNode[];
};

type LastAtom = {
  x: number;
  width: number;
  ascent: number;
  descent: number;
  scriptAdvance: number;
  displayIntegralOperator?: boolean;
  displayLimitOperator?: boolean;
};

function layoutSequence(input: string, fontSize: number, displayMode: boolean, metrics: NativeMathMetrics): Box {
  const nodes: NativeNode[] = [];
  let x = 0;
  let lastAtom: LastAtom | undefined;
  let maxTop = 0;
  let maxBottom = 0;
  let inkTop = Number.POSITIVE_INFINITY;
  let inkBottom = Number.NEGATIVE_INFINITY;
  let pendingAtomGap = 0;
  const glyphGap = fontSize * (displayMode ? metrics.displayGlyphGap : metrics.inlineGlyphGap);
  const consumePendingAtomGap = () => {
    if (pendingAtomGap <= 0) return;
    x += pendingAtomGap;
    pendingAtomGap = 0;
  };

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
      inkTop = Math.min(inkTop, yShift + scriptBox.inkTop);
      inkBottom = Math.max(inkBottom, yShift + scriptBox.inkBottom);
      const neededAdvance = getScriptAdvance(x, anchor, scriptBox.width, lastAtom);
      x += Math.max(0, neededAdvance - (lastAtom?.scriptAdvance ?? 0));
      if (lastAtom) lastAtom.scriptAdvance = Math.max(lastAtom.scriptAdvance, neededAdvance);
      else lastAtom = { x: anchor, width: scriptBox.width, ascent: scriptBox.ascent, descent: scriptBox.descent, scriptAdvance: 0 };
      maxTop = Math.max(maxTop, Math.max(0, -yShift));
      maxBottom = Math.max(maxBottom, Math.max(0, yShift + scriptBox.baseline + scriptBox.descent));
      index = script.end;
      continue;
    }

    if (char === "\\") {
      const command = readCommand(input, index);
      if (command.name === "\\frac") {
        consumePendingAtomGap();
        const numerator = readArgument(input, command.end + 1);
        const denominator = readArgument(input, numerator.end + 1);
        const frac = layoutFraction(numerator.value, denominator.value, fontSize, displayMode, metrics);
        nodes.push(...translateNodes(frac.nodes, x, -frac.baseline));
        inkTop = Math.min(inkTop, -frac.baseline + frac.inkTop);
        inkBottom = Math.max(inkBottom, -frac.baseline + frac.inkBottom);
        lastAtom = { x, width: frac.width, ascent: frac.ascent, descent: frac.descent, scriptAdvance: 0 };
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
        consumePendingAtomGap();
        const body = input[command.end + 1] === "["
          ? readArgument(input, input.indexOf("]", command.end + 1) + 1)
          : readArgument(input, command.end + 1);
        const sqrt = layoutSqrt(body.value, fontSize, displayMode, metrics);
        nodes.push(...translateNodes(sqrt.nodes, x, -sqrt.baseline));
        inkTop = Math.min(inkTop, -sqrt.baseline + sqrt.inkTop);
        inkBottom = Math.max(inkBottom, -sqrt.baseline + sqrt.inkBottom);
        lastAtom = { x, width: sqrt.width, ascent: sqrt.ascent, descent: sqrt.descent, scriptAdvance: 0 };
        x += sqrt.width + glyphGap;
        maxTop = Math.max(maxTop, sqrt.ascent);
        maxBottom = Math.max(maxBottom, sqrt.descent);
        index = body.end;
        continue;
      }

      if (accentCommands.has(command.name)) {
        consumePendingAtomGap();
        const body = readArgument(input, command.end + 1);
        const accent = layoutAccent(command.name, body.value, fontSize, displayMode, metrics);
        nodes.push(...translateNodes(accent.nodes, x, -accent.baseline));
        inkTop = Math.min(inkTop, -accent.baseline + accent.inkTop);
        inkBottom = Math.max(inkBottom, -accent.baseline + accent.inkBottom);
        lastAtom = { x, width: accent.width, ascent: accent.ascent, descent: accent.descent, scriptAdvance: 0 };
        x += accent.width + glyphGap;
        maxTop = Math.max(maxTop, accent.ascent);
        maxBottom = Math.max(maxBottom, accent.descent);
        index = body.end;
        continue;
      }

      if (command.name === "\\mathbf") {
        consumePendingAtomGap();
        const body = readArgument(input, command.end + 1);
        const text = body.value.replace(/[{}]/g, "");
        const style = { bold: true, italic: false };
        nodes.push(glyph(text, x, 0, fontSize, style));
        const width = measureGlyphWidth(text, fontSize, style);
        const verticalMetrics = measureGlyphVerticalMetrics(text, fontSize, style);
        inkTop = Math.min(inkTop, -verticalMetrics.ascent);
        inkBottom = Math.max(inkBottom, verticalMetrics.descent);
        maxTop = Math.max(maxTop, verticalMetrics.ascent);
        maxBottom = Math.max(maxBottom, verticalMetrics.descent);
        lastAtom = { x, width, ascent: verticalMetrics.ascent, descent: verticalMetrics.descent, scriptAdvance: 0 };
        x += width + glyphGap;
        index = body.end;
        continue;
      }

      if (command.name === "\\begin" || command.name === "\\left" || command.name === "\\right") {
        consumePendingAtomGap();
        const marker = unsupported(command.name);
        const style = { color: "#b42318", italic: false };
        nodes.push(glyph(marker, x, 0, fontSize * 0.86, style));
        const width = measureGlyphWidth(marker, fontSize * 0.86, style);
        const verticalMetrics = measureGlyphVerticalMetrics(marker, fontSize * 0.86, style);
        inkTop = Math.min(inkTop, -verticalMetrics.ascent);
        inkBottom = Math.max(inkBottom, verticalMetrics.descent);
        maxTop = Math.max(maxTop, verticalMetrics.ascent);
        maxBottom = Math.max(maxBottom, verticalMetrics.descent);
        lastAtom = { x, width, ascent: verticalMetrics.ascent, descent: verticalMetrics.descent, scriptAdvance: 0 };
        x += width + glyphGap;
        index = command.end;
        continue;
      }

      const text = commandGlyphs[command.name] ?? unsupported(command.name);
      const isUnsupported = !commandGlyphs[command.name];
      const isDisplayLargeOperator = displayMode && displayLargeOperatorCommands.has(command.name);
      const isDisplayIntegralOperator = isDisplayLargeOperator && command.name === "\\int";
      const isDisplayLimitOperator = displayMode && displayLimitOperatorCommands.has(command.name);
      const namedOperatorGap = namedOperatorCommands.has(command.name)
        ? fontSize * metrics.namedOperatorRightMargin
        : 0;
      const glyphFontSize = fontSize;
      const style = {
        fontFamily: isDisplayLargeOperator ? largeOperatorFontFamily : undefined,
        color: isUnsupported ? "#b42318" : undefined,
        italic: !uprightCommandGlyphs.has(command.name) && !isOperatorText(text)
      };
      consumePendingAtomGap();
      x += operatorLeftMargin(text, fontSize, metrics);
      nodes.push(glyph(text, x, 0, glyphFontSize, style));
      const width = measureGlyphLayoutWidth(text, glyphFontSize, style, isDisplayLimitOperator);
      const verticalMetrics = measureGlyphVerticalMetrics(text, glyphFontSize, style);
      inkTop = Math.min(inkTop, -verticalMetrics.ascent);
      inkBottom = Math.max(inkBottom, verticalMetrics.descent);
      lastAtom = {
        x,
        width,
        ascent: verticalMetrics.ascent,
        descent: verticalMetrics.descent,
        scriptAdvance: 0,
        displayIntegralOperator: isDisplayIntegralOperator,
        displayLimitOperator: isDisplayLimitOperator
      };
      x += width + operatorRightMargin(text, fontSize, metrics) + glyphGap;
      pendingAtomGap = Math.max(pendingAtomGap, namedOperatorGap);
      maxTop = Math.max(maxTop, verticalMetrics.ascent);
      maxBottom = Math.max(maxBottom, verticalMetrics.descent);
      index = skipIgnoredCommandSpaces(input, command.name, command.end);
      continue;
    }

    if (char === " ") continue;

    consumePendingAtomGap();
    const text = normalizeMathGlyph(char === "\n" ? " " : char);
    const style = { italic: shouldItalicize(text) };
    x += operatorLeftMargin(text, fontSize, metrics);
    nodes.push(glyph(text, x, 0, fontSize, style));
    const width = measureGlyphWidth(text, fontSize, style);
    const verticalMetrics = measureGlyphVerticalMetrics(text, fontSize, style);
    inkTop = Math.min(inkTop, -verticalMetrics.ascent);
    inkBottom = Math.max(inkBottom, verticalMetrics.descent);
    lastAtom = { x, width, ascent: verticalMetrics.ascent, descent: verticalMetrics.descent, scriptAdvance: 0 };
    x += width + operatorRightMargin(text, fontSize, metrics) + glyphGap;
    maxTop = Math.max(maxTop, verticalMetrics.ascent);
    maxBottom = Math.max(maxBottom, verticalMetrics.descent);
  }

  if (maxTop === 0 && maxBottom === 0) {
    maxTop = fontSize * 0.9;
    maxBottom = fontSize * 0.3;
  }
  if (!Number.isFinite(inkTop) || !Number.isFinite(inkBottom)) {
    inkTop = -maxTop;
    inkBottom = maxBottom;
  }
  const baseline = maxTop;
  const height = Math.max(maxTop + maxBottom, baseline + maxBottom);
  return {
    width: x,
    height,
    baseline,
    ascent: baseline,
    descent: Math.max(0, height - baseline),
    inkTop: baseline + inkTop,
    inkBottom: baseline + inkBottom,
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
    return getOperatorScriptBaseline(
      scriptChar,
      fontSize,
      metrics.displayLimitOperatorSuperscriptBaseline,
      metrics.displayLimitOperatorSubscriptBaseline,
      lastAtom
    );
  }
  if (lastAtom?.displayIntegralOperator) {
    return getOperatorScriptBaseline(
      scriptChar,
      fontSize,
      metrics.displayLargeOperatorSuperscriptBaseline,
      metrics.displayLargeOperatorSubscriptBaseline,
      lastAtom
    );
  }
  return fontSize * (scriptChar === "^" ? metrics.superscriptBaseline : metrics.subscriptBaseline);
}

function getOperatorScriptBaseline(
  scriptChar: string,
  fontSize: number,
  superscriptBaseline: number,
  subscriptBaseline: number,
  lastAtom: LastAtom
): number {
  if (scriptChar === "^") {
    const top = Math.max(fontSize * 0.9, lastAtom.ascent);
    const gap = fontSize * Math.max(0, Math.abs(superscriptBaseline) - 0.9);
    return -top - gap;
  }

  const bottom = lastAtom.displayLimitOperator ? lastAtom.descent : Math.max(fontSize * 0.3, lastAtom.descent);
  const gap = fontSize * Math.max(0, subscriptBaseline - 0.3);
  return bottom + gap;
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
  const ruleY = numeratorY + numerator.height + gap;
  const denominatorY = ruleY + rule + gap;
  const height = denominatorY + denominator.height;
  const baseline = displayMode
    ? ruleY + rule + gap + denominator.baseline * metrics.displayFractionDenominatorBaseline
    : ruleY + rule / 2 + fontSize * metrics.inlineFractionAxisOffset;
  const ascent = baseline;
  const descent = Math.max(0, height - baseline);
  const inkTop = Math.min(numeratorY + numerator.inkTop, ruleY, denominatorY + denominator.inkTop);
  const inkBottom = Math.max(numeratorY + numerator.inkBottom, ruleY + rule, denominatorY + denominator.inkBottom);
  return {
    width,
    height,
    baseline,
    ascent,
    descent,
    inkTop,
    inkBottom,
    nodes: [
      ...translateNodes(numerator.nodes, numeratorX, numeratorY),
      { type: "rule", x: fontSize * metrics.fractionRuleInset, y: ruleY, width: width - fontSize * metrics.fractionRuleInset * 2, height: rule },
      ...translateNodes(denominator.nodes, denominatorX, denominatorY)
    ]
  };
}

function layoutSqrt(bodyLatex: string, fontSize: number, displayMode: boolean, metrics: NativeMathMetrics): Box {
  const body = layoutSequence(bodyLatex, fontSize * metrics.sqrtBodyScale, displayMode, metrics);
  const bodyInkHeight = Math.max(fontSize * 0.5, body.inkBottom - body.inkTop);
  const radicalHeight = bodyInkHeight + fontSize * metrics.sqrtTopGap;
  const minRadicalWidth = fontSize * metrics.sqrtRadicalWidth * 0.68;
  const radicalWidth = Math.max(minRadicalWidth, radicalHeight * metrics.sqrtRadicalWidth * 0.55);
  const barBodyGap = fontSize * metrics.sqrtTopGap;
  const rule = Math.max(0.6, fontSize * metrics.sqrtRuleThickness);
  const radicalStroke = Math.max(0.6, fontSize * metrics.sqrtRuleThickness);
  const ruleY = 0;
  const bodyInkTopY = ruleY + rule + barBodyGap;
  const bodyY = bodyInkTopY - body.inkTop;
  const bodyInkBottomY = bodyY + body.inkBottom;
  const height = Math.max(bodyY + body.height, bodyInkBottomY);
  const baseline = bodyY + body.baseline;
  const ascent = baseline;
  const descent = Math.max(0, height - baseline);
  const ruleX = radicalWidth * metrics.sqrtRuleStart;
  const radicalBottom = bodyInkBottomY - rule * 0.5;
  const radicalKneeY = radicalBottom - radicalHeight * 0.09;
  const tickY = Math.max(ruleY + rule / 2, radicalBottom - radicalHeight * 0.42);
  const segmentPoints: Array<[number, number]> = [
    [0, tickY + radicalHeight * 0.15],
    [radicalWidth * 0.16, tickY],
    [radicalWidth * 0.56, radicalKneeY],
    [ruleX, ruleY + rule / 2]
  ];
  const radicalInkTop = Math.min(...segmentPoints.map((point) => point[1])) - radicalStroke;
  const radicalInkBottom = Math.max(...segmentPoints.map((point) => point[1])) + radicalStroke;
  const inkTop = Math.min(radicalInkTop, ruleY, bodyY + body.inkTop);
  const inkBottom = Math.max(radicalInkBottom, ruleY + rule, bodyY + body.inkBottom);
  logNativeSqrtBox(bodyLatex, {
    fontSize,
    bodyHeight: body.height,
    bodyBaseline: body.baseline,
    bodyAscent: body.ascent,
    bodyDescent: body.descent,
    bodyInkTop: body.inkTop,
    bodyInkBottom: body.inkBottom,
    ruleY,
    rule,
    bodyY,
    height,
    baseline,
    ascent,
    descent,
    inkTop,
    inkBottom,
    radicalHeight,
    radicalWidth,
    radicalInkTop,
    radicalInkBottom
  });
  return {
    width: radicalWidth + body.width + fontSize * 0.18,
    height,
    baseline,
    ascent,
    descent,
    inkTop,
    inkBottom,
    nodes: [
      ...radicalSegments(segmentPoints, radicalStroke),
      { type: "rule", x: ruleX, y: ruleY, width: body.width + fontSize * metrics.sqrtOverbarExtra, height: rule },
      ...translateNodes(body.nodes, radicalWidth, bodyY)
    ]
  };
}

function layoutAccent(
  command: string,
  bodyLatex: string,
  fontSize: number,
  displayMode: boolean,
  metrics: NativeMathMetrics
): Box {
  const body = layoutSequence(bodyLatex, fontSize, displayMode, metrics);
  const stroke = Math.max(0.55, fontSize * 0.045);
  const bodyInkHeight = Math.max(fontSize * 0.5, body.inkBottom - body.inkTop);
  const width = Math.max(body.width, fontSize * 0.42);
  const bodyX = (width - body.width) / 2;
  const accentSkew = getAccentSkew(bodyLatex, fontSize);
  const centerX = width / 2 + accentSkew;
  const nodes: NativeNode[] = [];

  const accentText = accentGlyphForCommand(command);
  if (accentText) {
    const accentStyle = { italic: false };
    const accentWidth = measureGlyphWidth(accentText, fontSize, accentStyle);
    const accentVertical = measureGlyphVerticalMetrics(accentText, fontSize, accentStyle);
    const accentBaseline = -accentVertical.inkTopOffset;
    const accentInkBottom = accentBaseline + accentVertical.inkBottomOffset;
    const gap = Math.max(0, fontSize * metrics.accentGap);
    const bodyY = accentInkBottom + gap - body.inkTop;
    const baseline = bodyY + body.baseline;
    const accentX = centerX - accentWidth / 2;
    nodes.push(glyph(accentText, accentX, accentBaseline, fontSize, accentStyle));

    return {
      width,
      height: Math.max(bodyY + body.height, bodyY + body.inkBottom, accentInkBottom),
      baseline,
      ascent: baseline,
      descent: Math.max(0, body.height - body.baseline),
      inkTop: Math.min(0, bodyY + body.inkTop),
      inkBottom: Math.max(accentInkBottom, bodyY + body.inkBottom),
      nodes: [
        ...nodes,
        ...translateNodes(body.nodes, bodyX, bodyY)
      ]
    };
  }

  if (command === "\\vec") {
    const gap = Math.max(stroke, bodyInkHeight * 0.08);
    const accentHeight = Math.max(stroke * 2, bodyInkHeight * 0.18);
    const bodyY = accentHeight + gap - body.inkTop;
    const baseline = bodyY + body.baseline;
    const accentWidth = Math.min(width, Math.max(fontSize * 0.24, body.width * 0.58));
    const accentX = centerX - accentWidth / 2;
    const accentY = accentHeight * 0.52;
    const y = accentY;
    nodes.push(radicalPath([
      [accentX, y],
      [accentX + accentWidth, y]
    ], stroke));
    nodes.push(radicalPath([
      [accentX + accentWidth - accentHeight * 0.34, y - accentHeight * 0.22],
      [accentX + accentWidth, y],
      [accentX + accentWidth - accentHeight * 0.34, y + accentHeight * 0.22]
    ], stroke));

    return {
      width,
      height: Math.max(bodyY + body.height, bodyY + body.inkBottom),
      baseline,
      ascent: baseline,
      descent: Math.max(0, body.height - body.baseline),
      inkTop: Math.min(y - accentHeight * 0.22 - stroke, bodyY + body.inkTop),
      inkBottom: Math.max(y + accentHeight * 0.22 + stroke, bodyY + body.inkBottom),
      nodes: [
        ...nodes,
        ...translateNodes(body.nodes, bodyX, bodyY)
      ]
    };
  }

  return body;
}

function accentGlyphForCommand(command: string): string | undefined {
  if (command === "\\bar") return "ˉ";
  if (command === "\\hat") return "^";
  if (command === "\\tilde") return "~";
  if (command === "\\dot") return "˙";
  if (command === "\\ddot") return "¨";
  return undefined;
}

function getAccentSkew(bodyLatex: string, fontSize: number): number {
  const glyphText = getSingleAccentBaseGlyph(bodyLatex);
  if (!glyphText) return 0;

  const style = { italic: shouldItalicize(glyphText) };
  return getNativeGlyphSkew(selectNativeFontRole(style), glyphText, fontSize);
}

function getSingleAccentBaseGlyph(bodyLatex: string): string | undefined {
  const trimmed = bodyLatex.trim();
  if (!trimmed) return undefined;
  if (Array.from(trimmed).length === 1) return normalizeMathGlyph(trimmed);
  if (!trimmed.startsWith("\\")) return undefined;

  const command = readCommand(trimmed, 0);
  if (command.end !== trimmed.length - 1) return undefined;
  return commandGlyphs[command.name];
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
        const fontMetrics = measureGlyphFontMetrics(node.text, node.fontSize, style);
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
          actualLeft: fontMetrics ? roundNumber(fontMetrics.actualLeft) : undefined,
          actualRight: fontMetrics ? roundNumber(fontMetrics.actualRight) : undefined,
          actualAscent: fontMetrics ? roundNumber(fontMetrics.actualAscent) : undefined,
          actualDescent: fontMetrics ? roundNumber(fontMetrics.actualDescent) : undefined,
          actualWidth: fontMetrics ? roundNumber(fontMetrics.actualWidth) : undefined,
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

function logNativeSqrtBox(
  bodyLatex: string,
  box: {
    fontSize: number;
    bodyHeight: number;
    bodyBaseline: number;
    bodyAscent: number;
    bodyDescent: number;
    bodyInkTop: number;
    bodyInkBottom: number;
    ruleY: number;
    rule: number;
    bodyY: number;
    height: number;
    baseline: number;
    ascent: number;
    descent: number;
    inkTop: number;
    inkBottom: number;
    radicalHeight: number;
    radicalWidth: number;
    radicalInkTop: number;
    radicalInkBottom: number;
  }
): void {
  if (typeof console === "undefined") return;
  console.log("[native-math-sqrt-box]", {
    bodyLatex,
    fontSize: roundNumber(box.fontSize),
    bodyHeight: roundNumber(box.bodyHeight),
    bodyBaseline: roundNumber(box.bodyBaseline),
    bodyAscent: roundNumber(box.bodyAscent),
    bodyDescent: roundNumber(box.bodyDescent),
    bodyInkTop: roundNumber(box.bodyInkTop),
    bodyInkBottom: roundNumber(box.bodyInkBottom),
    ruleY: roundNumber(box.ruleY),
    rule: roundNumber(box.rule),
    bodyY: roundNumber(box.bodyY),
    height: roundNumber(box.height),
    baseline: roundNumber(box.baseline),
    ascent: roundNumber(box.ascent),
    descent: roundNumber(box.descent),
    inkTop: roundNumber(box.inkTop),
    inkBottom: roundNumber(box.inkBottom),
    radicalHeight: roundNumber(box.radicalHeight),
    radicalWidth: roundNumber(box.radicalWidth),
    radicalInkTop: roundNumber(box.radicalInkTop),
    radicalInkBottom: roundNumber(box.radicalInkBottom)
  });
}

function measureGlyphWidth(text: string, fontSize: number, style: GlyphStyle = {}): number {
  const cacheKey = `${style.fontFamily ?? ""}:${style.bold ? "700" : "400"}:${style.italic ? "italic" : "normal"}:${fontSize}:${text}`;
  const cached = glyphWidthCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const fontMetrics = measureGlyphFontMetrics(text, fontSize, style);
  if (fontMetrics) {
    glyphWidthCache.set(cacheKey, fontMetrics.advanceWidth);
    return fontMetrics.advanceWidth;
  }

  const texMetrics = getNativeGlyphTexMetrics(selectNativeFontRole(style), text, fontSize);
  if (texMetrics) {
    glyphWidthCache.set(cacheKey, texMetrics.advanceWidth);
    return texMetrics.advanceWidth;
  }

  return estimateWidth(text, fontSize);
}

function measureGlyphLayoutWidth(
  text: string,
  fontSize: number,
  style: GlyphStyle,
  useInkRightEdge = false
): number {
  const advanceWidth = measureGlyphWidth(text, fontSize, style);
  if (!useInkRightEdge) return advanceWidth;

  const fontMetrics = measureGlyphFontMetrics(text, fontSize, style);
  if (!fontMetrics) return advanceWidth;
  return Math.max(advanceWidth, fontMetrics.actualRight);
}

function measureGlyphVerticalMetrics(
  text: string,
  fontSize: number,
  style: GlyphStyle
): { ascent: number; descent: number; inkTopOffset: number; inkBottomOffset: number } {
  const fontMetrics = measureGlyphFontMetrics(text, fontSize, style);
  if (fontMetrics) {
    const ascent = Number.isFinite(fontMetrics.actualAscent) ? fontMetrics.actualAscent : fontSize * 0.9;
    const descent = Number.isFinite(fontMetrics.actualDescent) ? fontMetrics.actualDescent : fontSize * 0.3;
    return {
      ascent,
      descent,
      inkTopOffset: Number.isFinite(fontMetrics.actualTopOffset) ? fontMetrics.actualTopOffset : -ascent,
      inkBottomOffset: Number.isFinite(fontMetrics.actualBottomOffset) ? fontMetrics.actualBottomOffset : descent
    };
  }

  const texMetrics = getNativeGlyphTexMetrics(selectNativeFontRole(style), text, fontSize);
  if (texMetrics) {
    const accentBottomLift = accentGlyphBottomLift(text, fontSize);
    return {
      ascent: texMetrics.actualAscent,
      descent: texMetrics.actualDescent,
      inkTopOffset: -texMetrics.actualAscent,
      inkBottomOffset: accentBottomLift ?? texMetrics.actualDescent
    };
  }

  if (style.fontFamily?.includes("KaTeX_Size2")) {
    return { ascent: fontSize, descent: fontSize * 0.5, inkTopOffset: -fontSize, inkBottomOffset: fontSize * 0.5 };
  }
  return { ascent: fontSize * 0.9, descent: fontSize * 0.3, inkTopOffset: -fontSize * 0.9, inkBottomOffset: fontSize * 0.3 };
}

function measureGlyphFontMetrics(
  text: string,
  fontSize: number,
  style: GlyphStyle
): {
  actualLeft: number;
  actualRight: number;
  actualAscent: number;
  actualDescent: number;
  actualTopOffset: number;
  actualBottomOffset: number;
  actualWidth: number;
  advanceWidth: number;
} | undefined {
  return getNativeGlyphMetrics(selectNativeFontRole(style), text, fontSize);
}

function accentGlyphBottomLift(text: string, fontSize: number): number | undefined {
  const bottomByGlyph: Record<string, number> = {
    "^": -0.531,
    "~": -0.215,
    "ˉ": -0.544,
    "˙": -0.549,
    "¨": -0.554
  };
  const bottom = bottomByGlyph[text];
  return bottom === undefined ? undefined : bottom * fontSize;
}

function selectNativeFontRole(style: GlyphStyle): NativeFontRole {
  if (style.fontFamily?.includes("KaTeX_Size4")) return "size4";
  if (style.fontFamily?.includes("KaTeX_Size3")) return "size3";
  if (style.fontFamily?.includes("KaTeX_Size2")) return "size2";
  if (style.fontFamily?.includes("KaTeX_Size1")) return "size1";
  if (style.bold && style.italic) return "mainBoldItalic";
  if (style.bold) return "mainBold";
  if (style.italic) return "mathItalic";
  return "mainRegular";
}

function estimateWidth(text: string, fontSize: number): number {
  let width = 0;
  for (const char of Array.from(text)) {
    if (char === " ") width += fontSize * 0.28;
    else if (/^[il.,;:|]$/.test(char)) width += fontSize * 0.24;
    else if (/^[=+\-×≤≥→⇒⋅]$/.test(char)) width += fontSize * 0.72;
    else if (/^[A-Z∇∂√∞]$/.test(char)) width += fontSize * 0.72;
    else width += fontSize * 0.52;
  }
  return width;
}

function shouldItalicize(text: string): boolean {
  if (isOperatorText(text) || isBinaryOperator(text) || isRelationOperator(text)) return false;
  return /^[A-Za-zα-ωΑ-Ω]$/.test(text);
}

function normalizeMathGlyph(text: string): string {
  return text === "-" ? "−" : text;
}

function isOperatorText(text: string): boolean {
  return text.trim().length === 0 || /^[=+\-−±×≤≥→⇒∈∞·⋅,(){}\[\]|0-9]+$/.test(text);
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
  return text === "+" || text === "-" || text === "−" || text === "±" || text === "×" || text === "·" || text === "⋅";
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
