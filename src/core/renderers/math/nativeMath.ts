import type { GraphSXDisplayList } from "@slxu/graphsx";
import type { DisplayObject } from "../../display-list/displayTypes";
import { defaultTheme } from "../../theme/defaultTheme";
import { isDebugLogEnabled } from "../../utils/debugSettings";
import { escapeXml } from "../../utils/sanitize";
import {
  getNativeGlyphMetrics,
  getNativeGlyphId,
  getNativeGlyphOutline,
  getNativeGlyphSkew,
  getNativeGlyphTexMetrics,
  getOpenTypeMathConstants,
  getOpenTypeMathHorizontalGlyphVariant,
  getOpenTypeMathGlyphVariant,
  getOpenTypeMathGlyphInfo,
  getOpenTypeMathRadicalVariant,
  setActiveOpenMathFontProfile
} from "./nativeFontMetrics";
import {
  getNativeMathProfile,
  isBinaryOperator,
  isOpenMathFontFamily,
  isOperatorText,
  isRelationOperator,
  selectNativeFontRole,
  shouldItalicizeMathText,
  type NativeGlyphStyle,
  type NativeMathFontProfileName,
  type NativeMathProfile
} from "./nativeMathProfiles";
import { renderGraphSX } from "../graphsx/renderGraphSX";

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

export type NativeGlyphPath = {
  type: "glyphPath";
  d: string;
  x: number;
  y: number;
  scale: number;
  width: number;
  height: number;
  inkTopOffset: number;
  inkBottomOffset: number;
  color?: string;
};

export type NativeGraphSX = {
  type: "graphsx";
  source: string;
  svgBody: string;
  summary: string;
  displayList: GraphSXDisplayList;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type NativeNode = NativeGlyph | NativeRule | NativePath | NativeGlyphPath | NativeGraphSX;

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
  fractionNumeratorShiftUp: number;
  fractionNumeratorDisplayShiftUp: number;
  fractionDenominatorShiftDown: number;
  fractionDenominatorDisplayShiftDown: number;
  fractionNumeratorGap: number;
  fractionNumeratorDisplayGap: number;
  fractionDenominatorGap: number;
  fractionDenominatorDisplayGap: number;
  fractionAxisOffset: number;
  fractionRuleThickness: number;
  fractionSidePadding: number;
  fractionRuleInset: number;
  displayFractionDenominatorBaseline: number;
  inlineFractionAxisOffset: number;
  sqrtBodyScale: number;
  sqrtRadicalWidth: number;
  sqrtTopGap: number;
  displaySqrtTopGap: number;
  sqrtMinBodyAscent: number;
  sqrtMinBodyDescent: number;
  sqrtRuleThickness: number;
  sqrtRuleStart: number;
  sqrtOverbarExtra: number;
  sqrtVariantTolerance: number;
  accentGap: number;
  integralSideSuperscriptBaseline: number;
  integralSideSubscriptBaseline: number;
  integralSideSuperscriptGap: number;
  integralSideSubscriptGap: number;
  integralSideSuperscriptAttachment: number;
  integralSideSubscriptAttachment: number;
  displayLimitOperatorSuperscriptBaseline: number;
  displayLimitOperatorSubscriptBaseline: number;
  displayLimitOperatorSuperscriptGap: number;
  displayLimitOperatorSubscriptGap: number;
  thinMathSpace: number;
  relationMargin: number;
  binaryMargin: number;
};

export type NativeMathFontProfile = NativeMathFontProfileName;

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
  fractionNumeratorShiftUp: 0.8,
  fractionNumeratorDisplayShiftUp: 1,
  fractionDenominatorShiftDown: 0.72,
  fractionDenominatorDisplayShiftDown: 0.92,
  fractionNumeratorGap: 0.2,
  fractionNumeratorDisplayGap: 0.2,
  fractionDenominatorGap: 0.2,
  fractionDenominatorDisplayGap: 0.2,
  fractionAxisOffset: 0.3,
  fractionRuleThickness: 0.045,
  fractionSidePadding: 0.55,
  fractionRuleInset: 0.18,
  displayFractionDenominatorBaseline: 0,
  inlineFractionAxisOffset: 0.3,
  sqrtBodyScale: 1,
  sqrtRadicalWidth: 0.8,
  sqrtTopGap: 0.1,
  displaySqrtTopGap: 0.12,
  sqrtMinBodyAscent: 0.6,
  sqrtMinBodyDescent: 0,
  sqrtRuleThickness: 0.045,
  sqrtRuleStart: 0.98,
  sqrtOverbarExtra: 0.12,
  sqrtVariantTolerance: 0.08,
  accentGap: 0.08,
  integralSideSuperscriptBaseline: -0.37,
  integralSideSubscriptBaseline: 0.28,
  integralSideSuperscriptGap: 0,
  integralSideSubscriptGap: 0.5,
  integralSideSuperscriptAttachment: 0.12,
  integralSideSubscriptAttachment: -0.05,
  displayLimitOperatorSuperscriptBaseline: -1.28,
  displayLimitOperatorSubscriptBaseline: 1.11,
  displayLimitOperatorSuperscriptGap: 0.18,
  displayLimitOperatorSubscriptGap: 0.18,
  thinMathSpace: 0.16,
  relationMargin: 0.32,
  binaryMargin: 0.22
};

export const defaultOpenMathMetrics: NativeMathMetrics = {
  ...defaultNativeMathMetrics,
  inlinePadding: 0.04,
  displayPadding: 0.16,
  fractionSidePadding: 0.28,
  fractionRuleInset: 0.08,
  sqrtTopGap: 0.1,
  displaySqrtTopGap: 0.08,
  sqrtMinBodyAscent: 0.6,
  sqrtMinBodyDescent: 0,
  sqrtOverbarExtra: 0.04,
  sqrtVariantTolerance: 0.08,
  accentGap: 0.03,
  thinMathSpace: 0.08,
  relationMargin: 0.16,
  binaryMargin: 0.14
};

export function getDefaultOpenMathMetrics(): NativeMathMetrics {
  const constants = getOpenTypeMathConstants();
  return constants ? openMathMetricsFromConstants(constants) : defaultOpenMathMetrics;
}

export function getDefaultOpenMathMetricsForProfile(profileName: NativeMathFontProfile = "openmath"): NativeMathMetrics {
  const profile = getNativeMathProfile(profileName);
  setActiveOpenMathFontProfile(profile.openMathProfileName);
  return getDefaultOpenMathMetrics();
}

export function openMathMetricsFromConstants(constants: NonNullable<ReturnType<typeof getOpenTypeMathConstants>>): NativeMathMetrics {
  const unit = (value: number) => value / constants.unitsPerEm;
  const fractionGap = Math.max(
    unit(constants.fractionNumeratorGapMin),
    unit(constants.fractionDenominatorGapMin)
  );
  const displayLimitGap = Math.max(
    unit(constants.upperLimitGapMin),
    unit(constants.lowerLimitGapMin)
  );

  return {
    ...defaultOpenMathMetrics,
    scriptScale: constants.scriptPercentScaleDown / 100,
    superscriptBaseline: -unit(constants.superscriptShiftUp),
    subscriptBaseline: unit(constants.subscriptShiftDown),
    scriptGap: unit(constants.spaceAfterScript || constants.subSuperscriptGapMin),
    fractionGap,
    fractionNumeratorShiftUp: unit(constants.fractionNumeratorShiftUp),
    fractionNumeratorDisplayShiftUp: unit(constants.fractionNumeratorDisplayStyleShiftUp),
    fractionDenominatorShiftDown: unit(constants.fractionDenominatorShiftDown),
    fractionDenominatorDisplayShiftDown: unit(constants.fractionDenominatorDisplayStyleShiftDown),
    fractionNumeratorGap: unit(constants.fractionNumeratorGapMin),
    fractionNumeratorDisplayGap: unit(constants.fractionNumDisplayStyleGapMin),
    fractionDenominatorGap: unit(constants.fractionDenominatorGapMin),
    fractionDenominatorDisplayGap: unit(constants.fractionDenomDisplayStyleGapMin),
    fractionAxisOffset: unit(constants.axisHeight),
    fractionRuleThickness: unit(constants.fractionRuleThickness),
    sqrtTopGap: defaultOpenMathMetrics.sqrtTopGap,
    displaySqrtTopGap: unit(constants.radicalDisplayStyleVerticalGap),
    sqrtRuleThickness: unit(constants.radicalRuleThickness),
    sqrtOverbarExtra: unit(constants.radicalExtraAscender),
    integralSideSuperscriptBaseline: -unit(constants.superscriptShiftUp),
    integralSideSubscriptBaseline: unit(constants.subscriptShiftDown),
    integralSideSuperscriptGap: defaultOpenMathMetrics.integralSideSuperscriptGap,
    integralSideSubscriptGap: defaultOpenMathMetrics.integralSideSubscriptGap,
    displayLimitOperatorSuperscriptBaseline: -unit(constants.upperLimitBaselineRiseMin),
    displayLimitOperatorSubscriptBaseline: unit(constants.lowerLimitBaselineDropMin),
    displayLimitOperatorSuperscriptGap: unit(constants.upperLimitGapMin),
    displayLimitOperatorSubscriptGap: unit(constants.lowerLimitGapMin),
    displayFractionScale: 1,
    inlineFractionScale: Math.max(0.5, Math.min(0.9, constants.scriptPercentScaleDown / 100)),
    displayFractionDenominatorBaseline: unit(constants.fractionDenominatorDisplayStyleShiftDown),
    inlineFractionAxisOffset: unit(constants.axisHeight),
    fractionSidePadding: Math.max(defaultOpenMathMetrics.fractionSidePadding, fractionGap),
    fractionRuleInset: Math.max(defaultOpenMathMetrics.fractionRuleInset, unit(constants.fractionRuleThickness)),
    accentGap: unit(constants.overbarVerticalGap || constants.radicalVerticalGap),
    displayPadding: Math.max(defaultOpenMathMetrics.displayPadding, displayLimitGap)
  };
}

export function isNativeMathRenderer(renderer: string | undefined): renderer is "native" | "native-openmath" {
  return renderer === "native" || renderer === "native-openmath";
}

export function nativeMathProfileForRenderer(renderer: string | undefined): NativeMathFontProfile {
  return renderer === "native-openmath" ? "openmath" : "katex";
}

const largeOperatorFontFamily = "KaTeX_Size2, KaTeX_Size1, KaTeX_Main, Times New Roman, serif";

const glyphWidthCache = new Map<string, number>();
let nativeMathLayoutCallCount = 0;

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
  "\\vartheta": "ϑ",
  "\\iota": "ι",
  "\\kappa": "κ",
  "\\varkappa": "ϰ",
  "\\lambda": "λ",
  "\\mu": "μ",
  "\\nu": "ν",
  "\\xi": "ξ",
  "\\omicron": "ο",
  "\\pi": "π",
  "\\varpi": "ϖ",
  "\\rho": "ρ",
  "\\varrho": "ϱ",
  "\\sigma": "σ",
  "\\varsigma": "ς",
  "\\tau": "τ",
  "\\upsilon": "υ",
  "\\phi": "ϕ",
  "\\varphi": "φ",
  "\\chi": "χ",
  "\\psi": "ψ",
  "\\omega": "ω",
  "\\nabla": "∇",
  "\\partial": "∂",
  "\\cdot": "⋅",
  "\\cdots": "⋯",
  "\\approx": "≈",
  "\\otimes": "⊗",
  "\\circ": "∘",
  "\\dagger": "†",
  "\\perp": "⟂",
  "\\uparrow": "↑",
  "\\downarrow": "↓",
  "\\leftarrow": "←",
  "\\rightarrow": "→",
  "\\{": "{",
  "\\}": "}",
  "\\langle": "⟨",
  "\\rangle": "⟩",
  "\\vert": "|",
  "\\Vert": "‖",
  "\\mid": "|",
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
  "\\leq": "≤",
  "\\ge": "≥",
  "\\geq": "≥",
  "\\neq": "≠",
  "\\gg": "≫",
  "\\ll": "≪",
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
  "\\cdots",
  "\\approx",
  "\\otimes",
  "\\circ",
  "\\dagger",
  "\\perp",
  "\\le",
  "\\leq",
  "\\ge",
  "\\geq",
  "\\neq",
  "\\gg",
  "\\ll",
  "\\uparrow",
  "\\downarrow",
  "\\leftarrow",
  "\\rightarrow",
  "\\{",
  "\\}",
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
  metrics: NativeMathMetrics = defaultNativeMathMetrics,
  profileName: NativeMathFontProfile = "katex"
): NativeMathLayout {
  const profile = getNativeMathProfile(profileName);
  if (profile.isOpenMath) setActiveOpenMathFontProfile(profile.openMathProfileName);
  const layout = layoutSequence(latex.trim(), fontSize, displayMode, metrics, profile);
  const padding = fontSize * (displayMode ? metrics.displayPadding : metrics.inlinePadding);
  const result = {
    width: Math.max(1, layout.width + padding * 2),
    height: Math.max(fontSize * 1.2, layout.height + padding * 2),
    baseline: layout.baseline + padding,
    advance: layout.width + padding * 2,
    nodes: translateNodes(layout.nodes, padding, padding)
  };
  nativeMathLayoutCallCount += 1;
  logNativeMathParse(nativeMathLayoutCallCount, latex, displayMode, fontSize, result);
  return result;
}

export function renderNativeMathSvg(object: NativeMathObject, options: { includeFontCss?: boolean } = {}): string {
  const profileName = object.nativeMathProfile ?? nativeMathProfileForRenderer(object.renderer);
  const profile = getNativeMathProfile(profileName);
  const layout = object.nativeLayout ?? layoutNativeMath(object.latex, object.displayMode, object.fontSize, object.nativeMetrics, profileName);
  const includeFontCss = options.includeFontCss ?? true;
  const fontFace = includeFontCss && profile.svgFontFaceCss ? `<style>${profile.svgFontFaceCss}</style>` : "";
  const body = layout.nodes.map((node) => {
    if (node.type === "rule") {
      return `<rect x="${round(object.x + node.x)}" y="${round(object.y + node.y)}" width="${round(node.width)}" height="${round(node.height)}" fill="${escapeXml(object.color)}" />`;
    }

    if (node.type === "path") {
      return `<path d="${escapeXml(node.d)}" transform="translate(${round(object.x + node.x)} ${round(object.y + node.y)})" fill="none" stroke="${escapeXml(node.color ?? object.color)}" stroke-width="${round(node.strokeWidth)}" stroke-linecap="round" stroke-linejoin="round" />`;
    }

    if (node.type === "glyphPath") {
      return `<path d="${escapeXml(node.d)}" transform="translate(${round(object.x + node.x)} ${round(object.y + node.y)}) scale(${roundScale(node.scale)} ${roundScale(-node.scale)})" fill="${escapeXml(node.color ?? object.color)}" />`;
    }

    if (node.type === "graphsx") {
      return `<g transform="translate(${round(object.x + node.x)} ${round(object.y + node.y)})">${node.svgBody}</g>`;
    }

    const style = [
      `font-family:${node.fontFamily ?? profile.renderFontFamily(Boolean(node.italic))}`,
      node.italic ? "font-style:italic" : "",
      node.bold ? "font-weight:700" : "",
      `font-size:${round(node.fontSize)}px`,
      `fill:${escapeXml(node.color ?? object.color)}`
    ].filter(Boolean).join(";");
    return `<text x="${round(object.x + node.x)}" y="${round(object.y + node.y)}" style="${style}" xml:space="preserve">${escapeXml(node.text)}</text>`;
  }).join("");
  return `<g class="svg-md-native-math">${fontFace}${body}</g>`;
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
  italicCorrection: number;
  mathClass: MathAtomClass;
  operator?: OperatorLayoutInfo;
};

type OperatorLayoutInfo = {
  kind: "integral" | "limits";
  inkTop: number;
  inkBottom: number;
  inkLeft: number;
  inkRight: number;
  centerX: number;
  rightEdge: number;
  glyphId?: number;
};

type MathAtomClass = "mord" | "mop" | "mbin" | "mrel" | "mopen" | "mclose" | "mpunct" | "minner";
type MathSpacingKind = "thin" | "medium" | "thick";

const mathAtomSpacing: Partial<Record<MathAtomClass, Partial<Record<MathAtomClass, MathSpacingKind>>>> = {
  mord: { mop: "thin", mbin: "medium", mrel: "thick", minner: "thin" },
  mop: { mord: "thin", mop: "thin", mrel: "thick", minner: "thin" },
  mbin: { mord: "medium", mop: "medium", mopen: "medium", minner: "medium" },
  mrel: { mord: "thick", mop: "thick", mopen: "thick", minner: "thick" },
  mopen: {},
  mclose: { mop: "thin", mbin: "medium", mrel: "thick", minner: "thin" },
  mpunct: { mord: "thin", mop: "thin", mrel: "thick", mopen: "thin", mclose: "thin", mpunct: "thin", minner: "thin" },
  minner: { mord: "thin", mop: "thin", mbin: "medium", mrel: "thick", mopen: "thin", mpunct: "thin", minner: "thin" }
};

const binLeftCanceller = new Set<MathAtomClass>(["mbin", "mopen", "mrel", "mop", "mpunct"]);
const binRightCanceller = new Set<MathAtomClass>(["mrel", "mclose", "mpunct"]);
const knownEnvironmentNames = new Set([
  "matrix",
  "pmatrix",
  "bmatrix",
  "Bmatrix",
  "vmatrix",
  "Vmatrix",
  "array",
  "aligned",
  "align",
  "align*",
  "gathered",
  "gather",
  "gather*",
  "cases",
  "smallmatrix",
  "tikzpicture"
]);
const environmentDelimiters: Record<string, [string, string]> = {
  pmatrix: ["(", ")"],
  bmatrix: ["[", "]"],
  Bmatrix: ["{", "}"],
  vmatrix: ["|", "|"],
  Vmatrix: ["‖", "‖"],
  cases: ["{", ""]
};
const matrixEnvironmentNames = new Set([
  "matrix",
  "pmatrix",
  "bmatrix",
  "Bmatrix",
  "vmatrix",
  "Vmatrix",
  "array",
  "smallmatrix",
  "cases"
]);
const alignedEnvironmentNames = new Set(["aligned", "align", "align*"]);

function layoutSequence(
  input: string,
  fontSize: number,
  displayMode: boolean,
  metrics: NativeMathMetrics,
  profile: NativeMathProfile,
  rootDisplayMode = displayMode
): Box {
  const nodes: NativeNode[] = [];
  let x = 0;
  let lastAtom: LastAtom | undefined;
  let maxTop = 0;
  let maxBottom = 0;
  let inkTop = Number.POSITIVE_INFINITY;
  let inkBottom = Number.NEGATIVE_INFINITY;
  const glyphGap = fontSize * (displayMode ? metrics.displayGlyphGap : metrics.inlineGlyphGap);
  const applyAtomSpacing = (nextClass: MathAtomClass): MathAtomClass => {
    const resolvedNextClass = resolveNextAtomClass(lastAtom?.mathClass, nextClass);
    if (!lastAtom) return resolvedNextClass;
    x += mathAtomSpacingSize(lastAtom.mathClass, resolvedNextClass, fontSize, metrics);
    return resolvedNextClass;
  };

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (char === "{" || char === "}") continue;
    if (char === "^" || char === "_") {
      const script = readScriptArgument(input, index + 1);
      const scriptBox = layoutSequence(script.value, fontSize * metrics.scriptScale, false, metrics, profile, false);
      const scriptBaseline = getScriptBaseline(char, fontSize, metrics, lastAtom, scriptBox);
      const yShift = scriptBaseline - scriptBox.baseline;
      const anchor = getScriptAnchor(char, x, scriptBox.width, scriptBaseline, fontSize, metrics, lastAtom);
      nodes.push(...translateNodes(scriptBox.nodes, anchor, yShift));
      inkTop = Math.min(inkTop, yShift + scriptBox.inkTop);
      inkBottom = Math.max(inkBottom, yShift + scriptBox.inkBottom);
      const neededAdvance = getScriptAdvance(x, anchor, scriptBox.width, lastAtom);
      x += neededAdvance;
      if (lastAtom) lastAtom.scriptAdvance = Math.max(lastAtom.scriptAdvance, neededAdvance);
      else lastAtom = { x: anchor, width: scriptBox.width, ascent: scriptBox.ascent, descent: scriptBox.descent, scriptAdvance: 0, italicCorrection: 0, mathClass: "mord" };
      maxTop = Math.max(maxTop, Math.max(0, -yShift));
      maxBottom = Math.max(maxBottom, Math.max(0, yShift + scriptBox.baseline + scriptBox.descent));
      index = script.end;
      continue;
    }

    if (char === "\\") {
      const command = readCommand(input, index);
      if (command.name === "\\frac") {
        const mathClass = applyAtomSpacing("mord");
        const numerator = readArgument(input, command.end + 1);
        const denominator = readArgument(input, numerator.end + 1);
        const frac = layoutFraction(numerator.value, denominator.value, fontSize, displayMode, metrics, profile);
        nodes.push(...translateNodes(frac.nodes, x, -frac.baseline));
        inkTop = Math.min(inkTop, -frac.baseline + frac.inkTop);
        inkBottom = Math.max(inkBottom, -frac.baseline + frac.inkBottom);
        lastAtom = { x, width: frac.width, ascent: frac.ascent, descent: frac.descent, scriptAdvance: 0, italicCorrection: 0, mathClass };
        x += frac.width + glyphGap;
        maxTop = Math.max(maxTop, frac.ascent);
        maxBottom = Math.max(maxBottom, frac.descent);
        index = denominator.end;
        continue;
      }

      if (command.name === "\\sqrt") {
        const mathClass = applyAtomSpacing("mord");
        const body = input[command.end + 1] === "["
          ? readArgument(input, input.indexOf("]", command.end + 1) + 1)
          : readArgument(input, command.end + 1);
        const sqrt = layoutSqrt(body.value, fontSize, rootDisplayMode, metrics, profile);
        nodes.push(...translateNodes(sqrt.nodes, x, -sqrt.baseline));
        inkTop = Math.min(inkTop, -sqrt.baseline + sqrt.inkTop);
        inkBottom = Math.max(inkBottom, -sqrt.baseline + sqrt.inkBottom);
        lastAtom = { x, width: sqrt.width, ascent: sqrt.ascent, descent: sqrt.descent, scriptAdvance: 0, italicCorrection: 0, mathClass };
        x += sqrt.width + glyphGap;
        maxTop = Math.max(maxTop, sqrt.ascent);
        maxBottom = Math.max(maxBottom, sqrt.descent);
        index = body.end;
        continue;
      }

      if (accentCommands.has(command.name)) {
        const mathClass = applyAtomSpacing("mord");
        const body = readArgument(input, command.end + 1);
        const accent = layoutAccent(command.name, body.value, fontSize, displayMode, metrics, profile);
        nodes.push(...translateNodes(accent.nodes, x, -accent.baseline));
        inkTop = Math.min(inkTop, -accent.baseline + accent.inkTop);
        inkBottom = Math.max(inkBottom, -accent.baseline + accent.inkBottom);
        lastAtom = { x, width: accent.width, ascent: accent.ascent, descent: accent.descent, scriptAdvance: 0, italicCorrection: 0, mathClass };
        x += accent.width + glyphGap;
        maxTop = Math.max(maxTop, accent.ascent);
        maxBottom = Math.max(maxBottom, accent.descent);
        index = body.end;
        continue;
      }

      if (command.name === "\\left") {
        const delimited = readLeftRight(input, command.end);
        const mathClass = applyAtomSpacing("minner");
        const body = layoutSequence(delimited.body, fontSize, displayMode, metrics, profile);
        const box = wrapBoxWithDelimiters(body, [delimited.left, delimited.right], fontSize, profile);
        nodes.push(...translateNodes(box.nodes, x, -box.baseline));
        inkTop = Math.min(inkTop, -box.baseline + box.inkTop);
        inkBottom = Math.max(inkBottom, -box.baseline + box.inkBottom);
        lastAtom = { x, width: box.width, ascent: box.ascent, descent: box.descent, scriptAdvance: 0, italicCorrection: 0, mathClass };
        x += box.width + glyphGap;
        maxTop = Math.max(maxTop, box.ascent);
        maxBottom = Math.max(maxBottom, box.descent);
        index = delimited.end;
        continue;
      }

      if (command.name === "\\begin") {
        const environment = readEnvironment(input, command.end);
        const mathClass = applyAtomSpacing("minner");
        const box = layoutEnvironment(environment, fontSize, displayMode, metrics, profile);
        nodes.push(...translateNodes(box.nodes, x, -box.baseline));
        inkTop = Math.min(inkTop, -box.baseline + box.inkTop);
        inkBottom = Math.max(inkBottom, -box.baseline + box.inkBottom);
        lastAtom = { x, width: box.width, ascent: box.ascent, descent: box.descent, scriptAdvance: 0, italicCorrection: 0, mathClass };
        x += box.width + glyphGap;
        maxTop = Math.max(maxTop, box.ascent);
        maxBottom = Math.max(maxBottom, box.descent);
        index = environment.end;
        continue;
      }

      if (command.name === "\\bra" || command.name === "\\ket") {
        const mathClass = applyAtomSpacing("minner");
        const bodyArg = readArgument(input, command.end + 1);
        const body = layoutSequence(bodyArg.value, fontSize, displayMode, metrics, profile);
        const delimiters: [string, string] = command.name === "\\bra" ? ["⟨", "|"] : ["|", "⟩"];
        const box = wrapBoxWithDelimiters(body, delimiters, fontSize, profile, {
          verticalBarsAsGlyphs: true,
          stableInlineBaseline: true,
          delimiterGap: 0,
          useDelimiterVariants: false
        });
        nodes.push(...translateNodes(box.nodes, x, -box.baseline));
        inkTop = Math.min(inkTop, -box.baseline + box.inkTop);
        inkBottom = Math.max(inkBottom, -box.baseline + box.inkBottom);
        lastAtom = { x, width: box.width, ascent: box.ascent, descent: box.descent, scriptAdvance: 0, italicCorrection: 0, mathClass };
        x += box.width + glyphGap;
        maxTop = Math.max(maxTop, box.ascent);
        maxBottom = Math.max(maxBottom, box.descent);
        index = bodyArg.end;
        continue;
      }

      if (command.name === "\\mathbf") {
        const mathClass = applyAtomSpacing("mord");
        const body = readArgument(input, command.end + 1);
        const mapped = profile.mapBoldGlyph(body.value.replace(/[{}]/g, ""));
        const text = mapped.text;
        const style = { bold: mapped.bold, italic: false, fontFamily: profile.layoutFontFamily };
        nodes.push(glyph(text, x, 0, fontSize, style));
        const width = measureGlyphWidth(text, fontSize, style);
        const verticalMetrics = measureGlyphVerticalMetrics(text, fontSize, style);
        inkTop = Math.min(inkTop, -verticalMetrics.ascent);
        inkBottom = Math.max(inkBottom, verticalMetrics.descent);
        maxTop = Math.max(maxTop, verticalMetrics.ascent);
        maxBottom = Math.max(maxBottom, verticalMetrics.descent);
        lastAtom = { x, width, ascent: verticalMetrics.ascent, descent: verticalMetrics.descent, scriptAdvance: 0, italicCorrection: 0, mathClass };
        x += width + glyphGap;
        index = body.end;
        continue;
      }

      if (command.name === "\\mathcal") {
        const mathClass = applyAtomSpacing("mord");
        const body = readArgument(input, command.end + 1);
        const mapped = profile.mapCaligraphicGlyph(body.value.replace(/[{}]/g, ""));
        const text = mapped.text;
        const style = { italic: mapped.italic, fontFamily: profile.layoutFontFamily };
        nodes.push(glyph(text, x, 0, fontSize, style));
        const width = measureGlyphWidth(text, fontSize, style);
        const verticalMetrics = measureGlyphVerticalMetrics(text, fontSize, style);
        inkTop = Math.min(inkTop, -verticalMetrics.ascent);
        inkBottom = Math.max(inkBottom, verticalMetrics.descent);
        maxTop = Math.max(maxTop, verticalMetrics.ascent);
        maxBottom = Math.max(maxBottom, verticalMetrics.descent);
        lastAtom = { x, width, ascent: verticalMetrics.ascent, descent: verticalMetrics.descent, scriptAdvance: 0, italicCorrection: 0, mathClass };
        x += width + glyphGap;
        index = body.end;
        continue;
      }

      if (command.name === "\\mathrm") {
        const mathClass = applyAtomSpacing("mord");
        const body = readArgument(input, command.end + 1);
        const text = plainTextArgument(body.value);
        const style = { italic: false, fontFamily: profile.layoutFontFamily };
        nodes.push(glyph(text, x, 0, fontSize, style));
        const width = measureGlyphWidth(text, fontSize, style);
        const verticalMetrics = measureGlyphVerticalMetrics(text, fontSize, style);
        inkTop = Math.min(inkTop, -verticalMetrics.ascent);
        inkBottom = Math.max(inkBottom, verticalMetrics.descent);
        maxTop = Math.max(maxTop, verticalMetrics.ascent);
        maxBottom = Math.max(maxBottom, verticalMetrics.descent);
        lastAtom = { x, width, ascent: verticalMetrics.ascent, descent: verticalMetrics.descent, scriptAdvance: 0, italicCorrection: 0, mathClass };
        x += width + glyphGap;
        index = body.end;
        continue;
      }

      if (command.name === "\\mathbb") {
        const mathClass = applyAtomSpacing("mord");
        const body = readArgument(input, command.end + 1);
        const mapped = profile.mapBlackboardGlyph(body.value.replace(/[{}]/g, ""));
        const text = mapped.text;
        const style = { italic: mapped.italic, fontFamily: profile.layoutFontFamily };
        nodes.push(glyph(text, x, 0, fontSize, style));
        const width = measureGlyphWidth(text, fontSize, style);
        const verticalMetrics = measureGlyphVerticalMetrics(text, fontSize, style);
        inkTop = Math.min(inkTop, -verticalMetrics.ascent);
        inkBottom = Math.max(inkBottom, verticalMetrics.descent);
        maxTop = Math.max(maxTop, verticalMetrics.ascent);
        maxBottom = Math.max(maxBottom, verticalMetrics.descent);
        lastAtom = { x, width, ascent: verticalMetrics.ascent, descent: verticalMetrics.descent, scriptAdvance: 0, italicCorrection: 0, mathClass };
        x += width + glyphGap;
        index = body.end;
        continue;
      }

      if (command.name === "\\text") {
        const mathClass = applyAtomSpacing("mord");
        const body = readArgument(input, command.end + 1);
        const text = plainTextArgument(body.value);
        const style = { italic: false, fontFamily: profile.layoutFontFamily };
        nodes.push(glyph(text, x, 0, fontSize, style));
        const width = measureGlyphWidth(text, fontSize, style);
        const verticalMetrics = measureGlyphVerticalMetrics(text, fontSize, style);
        inkTop = Math.min(inkTop, -verticalMetrics.ascent);
        inkBottom = Math.max(inkBottom, verticalMetrics.descent);
        maxTop = Math.max(maxTop, verticalMetrics.ascent);
        maxBottom = Math.max(maxBottom, verticalMetrics.descent);
        lastAtom = { x, width, ascent: verticalMetrics.ascent, descent: verticalMetrics.descent, scriptAdvance: 0, italicCorrection: 0, mathClass };
        x += width + glyphGap;
        index = body.end;
        continue;
      }

      if (command.name === "\\end" || command.name === "\\right") {
        const mathClass = applyAtomSpacing("mord");
        const marker = unsupported(command.name);
        const style = { color: "#b42318", italic: false };
        nodes.push(glyph(marker, x, 0, fontSize * 0.86, style));
        const width = measureGlyphWidth(marker, fontSize * 0.86, style);
        const verticalMetrics = measureGlyphVerticalMetrics(marker, fontSize * 0.86, style);
        inkTop = Math.min(inkTop, -verticalMetrics.ascent);
        inkBottom = Math.max(inkBottom, verticalMetrics.descent);
        maxTop = Math.max(maxTop, verticalMetrics.ascent);
        maxBottom = Math.max(maxBottom, verticalMetrics.descent);
        lastAtom = { x, width, ascent: verticalMetrics.ascent, descent: verticalMetrics.descent, scriptAdvance: 0, italicCorrection: 0, mathClass };
        x += width + glyphGap;
        index = command.end;
        continue;
      }

      const rawText = commandGlyphs[command.name] ?? unsupported(command.name);
      const isUnsupported = !commandGlyphs[command.name];
      const commandIsUpright = uprightCommandGlyphs.has(command.name) || isUnsupported;
      const text = profile.mapGlyph(rawText, { upright: commandIsUpright });
      const isIntegralOperator = command.name === "\\int";
      const isDisplayLargeOperator = displayMode && displayLargeOperatorCommands.has(command.name);
      const isDisplayLimitOperator = displayMode && displayLimitOperatorCommands.has(command.name);
      const useInkRightEdge = isDisplayLimitOperator && !namedOperatorCommands.has(command.name);
      const mathClass = applyAtomSpacing(mathAtomClassForCommand(command.name, text));
      const glyphFontSize = fontSize;
      const commandItalic = profile.shouldItalicize(rawText, text, { upright: commandIsUpright });
      const style = {
        fontFamily: isDisplayLargeOperator ? profile.largeOperatorFontFamily : profile.layoutFontFamily,
        color: isUnsupported ? "#b42318" : undefined,
        italic: commandItalic
      };
      const largeOperatorPath = isDisplayLargeOperator && profile.isOpenMath
        ? layoutOpenMathOperatorGlyph(text, glyphFontSize, profile)
        : undefined;
      const operatorGlyphId = largeOperatorPath?.glyphId ?? (
        profile.isOpenMath && isIntegralOperator
          ? getNativeGlyphId(profile.openMathRole ?? "openMath", text)
          : undefined
      );
      const fontMetrics = largeOperatorPath ? undefined : measureGlyphFontMetrics(text, glyphFontSize, style);
      const width = largeOperatorPath?.width ?? measureGlyphLayoutWidth(text, glyphFontSize, style, useInkRightEdge);
      const verticalMetrics = largeOperatorPath
        ? {
          ascent: Math.max(0, -(largeOperatorPath.y + largeOperatorPath.inkTopOffset)),
          descent: Math.max(0, largeOperatorPath.y + largeOperatorPath.inkBottomOffset),
          inkTopOffset: largeOperatorPath.y + largeOperatorPath.inkTopOffset,
          inkBottomOffset: largeOperatorPath.y + largeOperatorPath.inkBottomOffset
        }
        : measureGlyphVerticalMetrics(text, glyphFontSize, style);
      if (largeOperatorPath) {
        nodes.push(glyphPath(
          largeOperatorPath.d,
          x,
          largeOperatorPath.y,
          largeOperatorPath.scale,
          largeOperatorPath.width,
          largeOperatorPath.height,
          largeOperatorPath.inkTopOffset,
          largeOperatorPath.inkBottomOffset
        ));
      } else {
        nodes.push(glyph(text, x, 0, glyphFontSize, style));
      }
      inkTop = Math.min(inkTop, -verticalMetrics.ascent);
      inkBottom = Math.max(inkBottom, verticalMetrics.descent);
      const operator = buildOperatorLayoutInfo(
        isIntegralOperator ? "integral" : isDisplayLimitOperator ? "limits" : undefined,
        x,
        width,
        verticalMetrics,
        fontMetrics,
        operatorGlyphId
      );
      lastAtom = {
        x,
        width,
        ascent: verticalMetrics.ascent,
        descent: verticalMetrics.descent,
        scriptAdvance: 0,
        italicCorrection: largeOperatorPath?.italicCorrection ?? measureGlyphMathInfo(text, glyphFontSize, style).italicCorrection ?? 0,
        mathClass,
        operator
      };
      x += width + glyphGap;
      maxTop = Math.max(maxTop, verticalMetrics.ascent);
      maxBottom = Math.max(maxBottom, verticalMetrics.descent);
      index = skipIgnoredCommandSpaces(input, command.name, command.end);
      continue;
    }

    if (char === " ") continue;

    const rawText = normalizeMathGlyph(char === "\n" ? " " : char);
    const text = profile.mapGlyph(rawText);
    const italic = profile.shouldItalicize(rawText, text);
    const style = { italic, fontFamily: profile.layoutFontFamily };
    const mathClass = applyAtomSpacing(mathAtomClassForText(rawText, text));
    nodes.push(glyph(text, x, 0, fontSize, style));
    const width = measureGlyphWidth(text, fontSize, style);
    const verticalMetrics = measureGlyphVerticalMetrics(text, fontSize, style);
    inkTop = Math.min(inkTop, -verticalMetrics.ascent);
    inkBottom = Math.max(inkBottom, verticalMetrics.descent);
    lastAtom = {
      x,
      width,
      ascent: verticalMetrics.ascent,
      descent: verticalMetrics.descent,
      scriptAdvance: 0,
      italicCorrection: measureGlyphMathInfo(text, fontSize, style).italicCorrection ?? 0,
      mathClass
    };
    x += width + glyphGap;
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

function buildOperatorLayoutInfo(
  kind: OperatorLayoutInfo["kind"] | undefined,
  x: number,
  width: number,
  verticalMetrics: { ascent: number; descent: number; inkTopOffset: number; inkBottomOffset: number },
  fontMetrics?: {
    actualLeft: number;
    actualRight: number;
  },
  glyphId?: number
): OperatorLayoutInfo | undefined {
  if (!kind) return undefined;
  const inkLeft = fontMetrics ? x - fontMetrics.actualLeft : x;
  const inkRight = fontMetrics ? x + fontMetrics.actualRight : x + width;
  return {
    kind,
    inkTop: verticalMetrics.inkTopOffset,
    inkBottom: verticalMetrics.inkBottomOffset,
    inkLeft,
    inkRight,
    centerX: (inkLeft + inkRight) / 2,
    rightEdge: Math.max(x + width, inkRight),
    glyphId
  };
}

function getScriptBaseline(
  scriptChar: string,
  fontSize: number,
  metrics: NativeMathMetrics,
  lastAtom: LastAtom | undefined,
  scriptBox: Box
): number {
  if (lastAtom?.operator?.kind === "limits") {
    return getLimitScriptBaseline(
      scriptChar,
      fontSize,
      metrics.displayLimitOperatorSuperscriptBaseline,
      metrics.displayLimitOperatorSubscriptBaseline,
      metrics.displayLimitOperatorSuperscriptGap,
      metrics.displayLimitOperatorSubscriptGap,
      scriptBox,
      lastAtom
    );
  }
  if (lastAtom?.operator?.kind === "integral") {
    return getOperatorScriptBaseline(
      scriptChar,
      fontSize,
      metrics.integralSideSuperscriptBaseline,
      metrics.integralSideSubscriptBaseline,
      metrics.integralSideSuperscriptAttachment,
      metrics.integralSideSubscriptAttachment,
      lastAtom
    );
  }
  const defaultBaseline = fontSize * (scriptChar === "^" ? metrics.superscriptBaseline : metrics.subscriptBaseline);
  const tallThreshold = fontSize * 1.15;
  if (lastAtom && lastAtom.ascent + lastAtom.descent > tallThreshold) {
    const gap = fontSize * metrics.scriptGap;
    if (scriptChar === "^") {
      return Math.min(defaultBaseline, -lastAtom.ascent - gap - scriptBox.descent);
    }
    return Math.max(defaultBaseline, lastAtom.descent + gap + scriptBox.ascent);
  }
  return defaultBaseline;
}

function getOperatorScriptBaseline(
  scriptChar: string,
  fontSize: number,
  superscriptBaseline: number,
  subscriptBaseline: number,
  superscriptAttachment: number,
  subscriptAttachment: number,
  lastAtom: LastAtom
): number {
  const preferredBaseline = fontSize * (scriptChar === "^" ? superscriptBaseline : subscriptBaseline);
  if (!lastAtom.operator) return preferredBaseline;

  const operatorTop = lastAtom.operator.inkTop;
  const operatorBottom = lastAtom.operator.inkBottom;
  const operatorHeight = Math.max(0, operatorBottom - operatorTop);
  if (scriptChar === "^") {
    const attachmentBaseline = operatorTop + operatorHeight * superscriptAttachment;
    return Math.min(preferredBaseline, attachmentBaseline);
  }

  const attachmentBaseline = operatorBottom - operatorHeight * subscriptAttachment;
  return Math.max(preferredBaseline, attachmentBaseline);
}

function getLimitScriptBaseline(
  scriptChar: string,
  fontSize: number,
  superscriptBaseline: number,
  subscriptBaseline: number,
  superscriptGap: number,
  subscriptGap: number,
  scriptBox: Box,
  lastAtom: LastAtom
): number {
  if (scriptChar === "^") {
    const baselineFromRise = -fontSize * Math.abs(superscriptBaseline);
    const operatorTop = lastAtom.operator?.inkTop ?? -lastAtom.ascent;
    const baselineFromGap = operatorTop - fontSize * superscriptGap - scriptBox.descent;
    return Math.min(baselineFromRise, baselineFromGap);
  }

  const baselineFromDrop = fontSize * subscriptBaseline;
  const operatorBottom = lastAtom.operator?.inkBottom ?? lastAtom.descent;
  const baselineFromGap = operatorBottom + fontSize * subscriptGap + scriptBox.ascent;
  return Math.max(baselineFromDrop, baselineFromGap);
}

function getScriptAnchor(
  scriptChar: string,
  cursorX: number,
  scriptWidth: number,
  scriptBaseline: number,
  fontSize: number,
  metrics: NativeMathMetrics,
  lastAtom: LastAtom | undefined
): number {
  if (!lastAtom) return cursorX;
  if (lastAtom.operator?.kind === "limits") {
    return lastAtom.operator.centerX - scriptWidth / 2;
  }
  const scriptGap = fontSize * (
    lastAtom.operator?.kind === "integral"
      ? scriptChar === "^"
        ? metrics.integralSideSuperscriptGap
        : metrics.integralSideSubscriptGap
      : metrics.scriptGap
  );
  const italicCorrection = scriptChar === "^" ? lastAtom.italicCorrection : 0;
  if (lastAtom.operator?.kind === "integral") {
    const attachmentX = scriptChar === "^" ? lastAtom.operator.inkRight : lastAtom.operator.inkLeft;
    return attachmentX + scriptGap;
  }
  return lastAtom.x + lastAtom.width + italicCorrection + scriptGap;
}

function getScriptAdvance(
  cursorX: number,
  scriptX: number,
  scriptWidth: number,
  lastAtom: LastAtom | undefined
): number {
  if (!lastAtom) return Math.max(0, scriptX + scriptWidth - cursorX);
  if (lastAtom.operator?.kind === "limits" || lastAtom.operator?.kind === "integral") {
    const rightEdge = Math.max(lastAtom.operator.rightEdge, scriptX + scriptWidth);
    return Math.max(0, rightEdge - cursorX);
  }
  return Math.max(0, scriptX + scriptWidth - cursorX);
}

function layoutFraction(
  numeratorLatex: string,
  denominatorLatex: string,
  fontSize: number,
  displayMode: boolean,
  metrics: NativeMathMetrics,
  profile: NativeMathProfile
): Box {
  const childSize = fontSize * (displayMode ? metrics.displayFractionScale : metrics.inlineFractionScale);
  const numerator = layoutSequence(numeratorLatex, childSize, false, metrics, profile, displayMode);
  const denominator = layoutSequence(denominatorLatex, childSize, false, metrics, profile, displayMode);
  const rule = Math.max(0.6, fontSize * metrics.fractionRuleThickness);
  const width = Math.max(numerator.width, denominator.width) + fontSize * metrics.fractionSidePadding;
  const numeratorX = (width - numerator.width) / 2;
  const denominatorX = (width - denominator.width) / 2;
  const axisOffset = fontSize * metrics.fractionAxisOffset;
  const numeratorShift = fontSize * (displayMode
    ? metrics.fractionNumeratorDisplayShiftUp
    : metrics.fractionNumeratorShiftUp);
  const denominatorShift = fontSize * (displayMode
    ? metrics.fractionDenominatorDisplayShiftDown
    : metrics.fractionDenominatorShiftDown);
  const numeratorGap = fontSize * (displayMode
    ? metrics.fractionNumeratorDisplayGap
    : metrics.fractionNumeratorGap);
  const denominatorGap = fontSize * (displayMode
    ? metrics.fractionDenominatorDisplayGap
    : metrics.fractionDenominatorGap);
  const ruleYFromBaseline = -axisOffset - rule / 2;
  const ruleTop = ruleYFromBaseline;
  const ruleBottom = ruleYFromBaseline + rule;
  let numeratorYFromBaseline = -numeratorShift - numerator.baseline;
  let denominatorYFromBaseline = denominatorShift - denominator.baseline;
  const numeratorInkBottom = numeratorYFromBaseline + numerator.inkBottom;
  const denominatorInkTop = denominatorYFromBaseline + denominator.inkTop;

  if (ruleTop - numeratorInkBottom < numeratorGap) {
    numeratorYFromBaseline -= numeratorGap - (ruleTop - numeratorInkBottom);
  }
  if (denominatorInkTop - ruleBottom < denominatorGap) {
    denominatorYFromBaseline += denominatorGap - (denominatorInkTop - ruleBottom);
  }

  const minY = Math.min(
    numeratorYFromBaseline + numerator.inkTop,
    ruleTop,
    denominatorYFromBaseline + denominator.inkTop
  );
  const maxY = Math.max(
    numeratorYFromBaseline + numerator.inkBottom,
    ruleBottom,
    denominatorYFromBaseline + denominator.inkBottom
  );
  const baseline = -minY;
  const numeratorY = numeratorYFromBaseline + baseline;
  const ruleY = ruleYFromBaseline + baseline;
  const denominatorY = denominatorYFromBaseline + baseline;
  const height = maxY - minY;
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

function layoutSqrt(
  bodyLatex: string,
  fontSize: number,
  displayMode: boolean,
  metrics: NativeMathMetrics,
  profile: NativeMathProfile
): Box {
  const body = layoutSequence(bodyLatex, fontSize * metrics.sqrtBodyScale, displayMode, metrics, profile);
  const minBodyInkTop = body.baseline - fontSize * metrics.sqrtMinBodyAscent;
  const minBodyInkBottom = body.baseline + fontSize * metrics.sqrtMinBodyDescent;
  const bodyRootInkTop = Math.min(body.inkTop, minBodyInkTop);
  const bodyRootInkBottom = Math.max(body.inkBottom, minBodyInkBottom);
  const bodyInkHeight = Math.max(fontSize * 0.5, bodyRootInkBottom - bodyRootInkTop);
  const topGap = displayMode ? metrics.displaySqrtTopGap : metrics.sqrtTopGap;
  const radicalHeight = bodyInkHeight + fontSize * topGap;
  const minRadicalWidth = fontSize * metrics.sqrtRadicalWidth * 0.68;
  const radicalWidth = Math.max(minRadicalWidth, radicalHeight * metrics.sqrtRadicalWidth * 0.55);
  const barBodyGap = fontSize * topGap;
  const rule = Math.max(0.6, fontSize * metrics.sqrtRuleThickness);
  const radicalStroke = Math.max(0.6, fontSize * metrics.sqrtRuleThickness);
  const ruleY = 0;
  const bodyInkTopY = ruleY + rule + barBodyGap;
  const bodyY = bodyInkTopY - bodyRootInkTop;
  const bodyInkBottomY = bodyY + bodyRootInkBottom;
  const height = Math.max(bodyY + body.height, bodyInkBottomY);
  const baseline = bodyY + body.baseline;
  const ascent = baseline;
  const descent = Math.max(0, height - baseline);
  const openMathRadical = profile.isOpenMath
    ? layoutOpenMathRadicalGlyph(
      bodyInkBottomY - ruleY + fontSize * metrics.sqrtOverbarExtra,
      fontSize,
      profile,
      fontSize * metrics.sqrtVariantTolerance
    )
    : undefined;
  if (openMathRadical) {
    const ruleX = openMathRadical.width * metrics.sqrtRuleStart;
    const radicalInkTop = openMathRadical.y + openMathRadical.inkTopOffset;
    const radicalInkBottom = openMathRadical.y + openMathRadical.inkBottomOffset;
    const glyphHeight = Math.max(height, radicalInkBottom);
    const glyphInkTop = Math.min(radicalInkTop, ruleY, bodyY + body.inkTop);
    const glyphInkBottom = Math.max(radicalInkBottom, ruleY + rule, bodyY + body.inkBottom);
    logNativeSqrtBox(bodyLatex, {
      fontSize,
      bodyHeight: body.height,
      bodyBaseline: body.baseline,
      bodyAscent: body.ascent,
      bodyDescent: body.descent,
      bodyInkTop: bodyRootInkTop,
      bodyInkBottom: bodyRootInkBottom,
      ruleY,
      rule,
      bodyY,
      height: glyphHeight,
      baseline,
      ascent,
      descent: Math.max(0, glyphHeight - baseline),
      inkTop: glyphInkTop,
      inkBottom: glyphInkBottom,
      radicalHeight: openMathRadical.height,
      radicalWidth: openMathRadical.width,
      radicalInkTop,
      radicalInkBottom
    });
    return {
      width: openMathRadical.width + body.width + fontSize * 0.18,
      height: glyphHeight,
      baseline,
      ascent,
      descent: Math.max(0, glyphHeight - baseline),
      inkTop: glyphInkTop,
      inkBottom: glyphInkBottom,
      nodes: [
        glyphPath(
          openMathRadical.d,
          0,
          openMathRadical.y,
          openMathRadical.scale,
          openMathRadical.width,
          openMathRadical.height,
          openMathRadical.inkTopOffset,
          openMathRadical.inkBottomOffset
        ),
        { type: "rule", x: ruleX, y: ruleY, width: body.width + fontSize * metrics.sqrtOverbarExtra, height: rule },
        ...translateNodes(body.nodes, openMathRadical.width, bodyY)
      ]
    };
  }

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
    bodyInkTop: bodyRootInkTop,
    bodyInkBottom: bodyRootInkBottom,
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

function layoutOpenMathRadicalGlyph(
  targetHeight: number,
  fontSize: number,
  profile: NativeMathProfile,
  tolerance = 0
): {
  glyphId: number;
  d: string;
  width: number;
  height: number;
  y: number;
  scale: number;
  inkTopOffset: number;
  inkBottomOffset: number;
} | undefined {
  const variant = getOpenTypeMathRadicalVariant(targetHeight, fontSize, tolerance);
  if (!variant) return undefined;

  const outline = getNativeGlyphOutline(profile.openMathRole ?? "openMath", variant.glyphId);
  if (!outline) return undefined;

  const scale = fontSize / outline.unitsPerEm;
  const actualRight = Math.max(outline.advanceWidth, outline.bbox.maxX);
  const actualAscent = Math.max(0, outline.bbox.maxY * scale);
  const actualDescent = Math.max(0, -outline.bbox.minY * scale);
  const y = actualAscent;
  return {
    glyphId: variant.glyphId,
    d: outline.path,
    width: actualRight * scale,
    height: actualAscent + actualDescent,
    y,
    scale,
    inkTopOffset: -actualAscent,
    inkBottomOffset: actualDescent
  };
}

function layoutOpenMathOperatorGlyph(
  text: string,
  fontSize: number,
  profile: NativeMathProfile
): {
  glyphId: number;
  d: string;
  width: number;
  height: number;
  y: number;
  scale: number;
  inkTopOffset: number;
  inkBottomOffset: number;
  italicCorrection: number;
} | undefined {
  const constants = getOpenTypeMathConstants();
  const targetHeight = constants
    ? fontSize * constants.displayOperatorMinHeight / constants.unitsPerEm
    : fontSize * 1.6;
  const variant = getOpenTypeMathGlyphVariant(text, targetHeight, fontSize);
  if (!variant) return undefined;

  const outline = getNativeGlyphOutline(profile.openMathRole ?? "openMath", variant.glyphId);
  if (!outline) return undefined;

  const scale = fontSize / outline.unitsPerEm;
  const actualRight = Math.max(outline.advanceWidth, outline.bbox.maxX);
  const actualAscent = Math.max(0, outline.bbox.maxY * scale);
  const actualDescent = Math.max(0, -outline.bbox.minY * scale);
  const axisHeight = constants ? constants.axisHeight * scale : fontSize * 0.25;
  const y = -axisHeight + (actualAscent - actualDescent) / 2;
  return {
    glyphId: variant.glyphId,
    d: outline.path,
    width: actualRight * scale,
    height: actualAscent + actualDescent,
    y,
    scale,
    inkTopOffset: -actualAscent,
    inkBottomOffset: actualDescent,
    italicCorrection: getOpenTypeMathGlyphInfo(text, fontSize)?.italicCorrection ?? 0
  };
}

function layoutOpenMathAccentGlyph(
  command: string,
  targetWidth: number,
  fontSize: number,
  profile: NativeMathProfile
): {
  d: string;
  xOffset: number;
  y: number;
  scale: number;
  width: number;
  height: number;
  inkTopOffset: number;
  inkBottomOffset: number;
} | undefined {
  const accentText = openMathStretchyAccentGlyph(command);
  if (!accentText) return undefined;

  const variant = getOpenTypeMathHorizontalGlyphVariant(accentText, targetWidth, fontSize);
  if (!variant) return undefined;

  const outline = getNativeGlyphOutline(profile.openMathRole ?? "openMath", variant.glyphId);
  if (!outline) return undefined;

  const scale = fontSize / outline.unitsPerEm;
  const actualAscent = outline.bbox.maxY * scale;
  const actualBottomOffset = -outline.bbox.minY * scale;
  const width = Math.max(0, (outline.bbox.maxX - outline.bbox.minX) * scale);
  return {
    d: outline.path,
    xOffset: -outline.bbox.minX * scale,
    y: actualAscent,
    scale,
    width,
    height: Math.max(0, (outline.bbox.maxY - outline.bbox.minY) * scale),
    inkTopOffset: -actualAscent,
    inkBottomOffset: actualBottomOffset
  };
}

function layoutAccent(
  command: string,
  bodyLatex: string,
  fontSize: number,
  displayMode: boolean,
  metrics: NativeMathMetrics,
  profile: NativeMathProfile
): Box {
  const body = layoutSequence(bodyLatex, fontSize, displayMode, metrics, profile);
  const stroke = Math.max(0.55, fontSize * 0.045);
  const bodyInkHeight = Math.max(fontSize * 0.5, body.inkBottom - body.inkTop);
  const width = Math.max(body.width, fontSize * 0.42);
  const bodyX = (width - body.width) / 2;
  const accentSkew = getAccentSkew(bodyLatex, fontSize, profile);
  const topAccentAttachment = getTopAccentAttachment(bodyLatex, fontSize, profile);
  const centerX = topAccentAttachment === undefined
    ? width / 2 + accentSkew
    : bodyX + topAccentAttachment;
  const nodes: NativeNode[] = [];

  const openMathAccentPath = profile.isOpenMath
    ? layoutOpenMathAccentGlyph(command, getSingleAccentBaseGlyph(bodyLatex, profile) ? 0 : body.width, fontSize, profile)
    : undefined;
  const accentText = accentGlyphForCommand(command, profile);
  if (accentText || openMathAccentPath) {
    const accentStyle = { italic: false, fontFamily: profile.layoutFontFamily };
    const accentWidth = openMathAccentPath?.width ?? (accentText ? measureGlyphWidth(accentText, fontSize, accentStyle) : 0);
    const accentVertical = openMathAccentPath
      ? {
        ascent: -openMathAccentPath.inkTopOffset,
        descent: openMathAccentPath.inkBottomOffset,
        inkTopOffset: openMathAccentPath.inkTopOffset,
        inkBottomOffset: openMathAccentPath.inkBottomOffset
      }
      : measureAccentGlyphVerticalMetrics(accentText ?? "", fontSize, accentStyle);
    const accentBaseline = openMathAccentPath?.y ?? -accentVertical.inkTopOffset;
    const accentInkBottom = accentBaseline + accentVertical.inkBottomOffset;
    const gap = Math.max(0, fontSize * metrics.accentGap);
    const bodyY = accentInkBottom + gap - body.inkTop;
    const baseline = bodyY + body.baseline;
    const accentX = centerX - accentWidth / 2;
    if (openMathAccentPath) {
      nodes.push(glyphPath(
        openMathAccentPath.d,
        accentX + openMathAccentPath.xOffset,
        openMathAccentPath.y,
        openMathAccentPath.scale,
        openMathAccentPath.width,
        openMathAccentPath.height,
        openMathAccentPath.inkTopOffset,
        openMathAccentPath.inkBottomOffset
      ));
    } else if (accentText) {
      nodes.push(glyph(accentText, accentX, accentBaseline, fontSize, accentStyle));
    }

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

function accentGlyphForCommand(command: string, profile: NativeMathProfile): string | undefined {
  if (command === "\\bar") return profile.isOpenMath ? "¯" : "ˉ";
  if (command === "\\hat") return "^";
  if (command === "\\tilde") return "~";
  if (command === "\\dot") return "˙";
  if (command === "\\ddot") return "¨";
  return undefined;
}

function openMathStretchyAccentGlyph(command: string): string | undefined {
  if (command === "\\hat") return "\u0302";
  if (command === "\\tilde") return "\u0303";
  if (command === "\\vec") return "\u20d7";
  return undefined;
}

function getAccentSkew(bodyLatex: string, fontSize: number, profile: NativeMathProfile): number {
  if (profile.isOpenMath) return 0;
  const glyphText = getSingleAccentBaseGlyph(bodyLatex);
  if (!glyphText) return 0;

  const style = { italic: shouldItalicizeMathText(glyphText) };
  return getNativeGlyphSkew(selectNativeFontRole(style), glyphText, fontSize);
}

function getTopAccentAttachment(
  bodyLatex: string,
  fontSize: number,
  profile: NativeMathProfile
): number | undefined {
  if (!profile.isOpenMath) return undefined;
  const glyphText = getSingleAccentBaseGlyph(bodyLatex, profile);
  if (!glyphText) return undefined;
  return getOpenTypeMathGlyphInfo(glyphText, fontSize)?.topAccentAttachment;
}

function getSingleAccentBaseGlyph(bodyLatex: string, profile: NativeMathProfile = getNativeMathProfile("katex")): string | undefined {
  const trimmed = bodyLatex.trim();
  if (!trimmed) return undefined;
  if (Array.from(trimmed).length === 1) return profile.mapGlyph(normalizeMathGlyph(trimmed));
  if (!trimmed.startsWith("\\")) return undefined;

  const command = readCommand(trimmed, 0);
  if (command.end !== trimmed.length - 1) return undefined;
  const glyphText = commandGlyphs[command.name];
  return glyphText ? profile.mapGlyph(glyphText, { upright: uprightCommandGlyphs.has(command.name) }) : undefined;
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

function glyphPath(
  d: string,
  x: number,
  baselineOffset: number,
  scale: number,
  width: number,
  height: number,
  inkTopOffset: number,
  inkBottomOffset: number,
  color?: string
): NativeGlyphPath {
  return {
    type: "glyphPath",
    d,
    x,
    y: baselineOffset,
    scale,
    width,
    height,
    inkTopOffset,
    inkBottomOffset,
    color
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

function plainTextArgument(value: string): string {
  return value
    .replace(/\\ /g, " ")
    .replace(/\\([{}_$%&#])/g, "$1")
    .replace(/[{}]/g, "");
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

const scriptGroupedCommandArgs: Record<string, number> = {
  "\\bar": 1,
  "\\bra": 1,
  "\\ddot": 1,
  "\\dot": 1,
  "\\frac": 2,
  "\\hat": 1,
  "\\ket": 1,
  "\\left": 1,
  "\\mathcal": 1,
  "\\mathbb": 1,
  "\\mathbf": 1,
  "\\mathrm": 1,
  "\\sqrt": 1,
  "\\text": 1,
  "\\vec": 1
};

function readScriptArgument(input: string, start: number): { value: string; end: number } {
  while (input[start] === " ") start += 1;
  if (input[start] !== "\\") return readArgument(input, start);

  const command = readCommand(input, start);
  let end = command.end;
  const argCount = scriptGroupedCommandArgs[command.name] ?? 0;
  for (let argIndex = 0; argIndex < argCount; argIndex += 1) {
    const arg = readArgument(input, end + 1);
    if (arg.end < end + 1) break;
    end = arg.end;
  }
  return { value: input.slice(start, end + 1), end };
}

type DelimiterToken = {
  value: string;
  end: number;
};

type LeftRightGroup = {
  left: string;
  right: string;
  body: string;
  end: number;
  closed: boolean;
};

function readLeftRight(input: string, leftCommandEnd: number): LeftRightGroup {
  const left = readDelimiterToken(input, leftCommandEnd + 1);
  const bodyStart = left.end + 1;
  const right = findMatchingRight(input, bodyStart);
  return {
    left: left.value,
    right: right.delimiter,
    body: input.slice(bodyStart, right.bodyEnd),
    end: right.end,
    closed: right.closed
  };
}

function findMatchingRight(input: string, bodyStart: number): { delimiter: string; bodyEnd: number; end: number; closed: boolean } {
  let depth = 0;
  for (let index = bodyStart; index < input.length; index += 1) {
    if (input[index] !== "\\") continue;
    const command = readCommand(input, index);
    if (command.name === "\\left") {
      depth += 1;
      const delimiter = readDelimiterToken(input, command.end + 1);
      index = delimiter.end;
      continue;
    }
    if (command.name !== "\\right") {
      index = command.end;
      continue;
    }
    if (depth > 0) {
      depth -= 1;
      const delimiter = readDelimiterToken(input, command.end + 1);
      index = delimiter.end;
      continue;
    }

    const delimiter = readDelimiterToken(input, command.end + 1);
    return { delimiter: delimiter.value, bodyEnd: index, end: delimiter.end, closed: true };
  }

  return { delimiter: "", bodyEnd: input.length, end: input.length - 1, closed: false };
}

function readDelimiterToken(input: string, start: number): DelimiterToken {
  while (input[start] === " ") start += 1;
  if (input[start] === "\\") {
    const command = readCommand(input, start);
    return { value: normalizeDelimiterToken(command.name), end: command.end };
  }
  return { value: normalizeDelimiterToken(input[start] ?? ""), end: start };
}

function normalizeDelimiterToken(token: string): string {
  const delimiters: Record<string, string> = {
    ".": "",
    "\\.": "",
    "\\{": "{",
    "\\}": "}",
    "\\lbrace": "{",
    "\\rbrace": "}",
    "\\langle": "⟨",
    "\\rangle": "⟩",
    "\\vert": "|",
    "\\Vert": "‖",
    "\\mid": "|",
    "<": "⟨",
    ">": "⟩"
  };
  return delimiters[token] ?? token;
}

type ParsedEnvironment = {
  name: string;
  body: string;
  end: number;
  known: boolean;
  closed: boolean;
};

function readEnvironment(input: string, beginCommandEnd: number): ParsedEnvironment {
  const nameArg = readArgument(input, beginCommandEnd + 1);
  const name = nameArg.value.trim();
  const bodyStart = nameArg.end + 1;
  const endToken = findEnvironmentEnd(input, bodyStart, name);
  const body = input.slice(bodyStart, endToken.bodyEnd);
  return {
    name,
    body,
    end: endToken.end,
    known: knownEnvironmentNames.has(name),
    closed: endToken.closed
  };
}

function findEnvironmentEnd(input: string, bodyStart: number, name: string): { bodyEnd: number; end: number; closed: boolean } {
  if (!name) return { bodyEnd: bodyStart, end: bodyStart, closed: false };

  let depth = 0;
  for (let index = bodyStart; index < input.length; index += 1) {
    if (input[index] !== "\\") continue;
    const command = readCommand(input, index);
    if (command.name !== "\\begin" && command.name !== "\\end") {
      index = command.end;
      continue;
    }

    const nameArg = readArgument(input, command.end + 1);
    if (nameArg.value.trim() !== name) {
      index = Math.max(command.end, nameArg.end);
      continue;
    }

    if (command.name === "\\begin") depth += 1;
    else if (depth > 0) depth -= 1;
    else return { bodyEnd: index, end: nameArg.end, closed: true };

    index = nameArg.end;
  }

  return { bodyEnd: input.length, end: input.length - 1, closed: false };
}

function layoutEnvironment(
  environment: ParsedEnvironment,
  fontSize: number,
  displayMode: boolean,
  metrics: NativeMathMetrics,
  profile: NativeMathProfile
): Box {
  if (!environment.known) {
    return errorMarkerBox(unknownEnvironmentMessage(environment.name), fontSize, profile);
  }

  if (environment.name === "tikzpicture") {
    return layoutTikzEnvironment(environment, fontSize, metrics, profile);
  }

  const body = environment.known && matrixEnvironmentNames.has(environment.name)
    ? layoutMatrixEnvironment(environment, fontSize, displayMode, metrics, profile)
    : environment.known && alignedEnvironmentNames.has(environment.name)
      ? layoutAlignedEnvironment(environment, fontSize, displayMode, metrics, profile)
      : layoutSequence(normalizeEnvironmentBody(environment.body), fontSize, displayMode, metrics, profile);
  const delimiter = environmentDelimiters[environment.name];
  const bodyBox = delimiter ? wrapBoxWithDelimiters(body, delimiter, fontSize, profile) : body;
  if (environment.known && environment.closed) return bodyBox;

  const message = `environment not closed: ${environment.name || "?"}`;
  return prependErrorMarker(message, bodyBox, fontSize, profile);
}

function layoutTikzEnvironment(
  environment: ParsedEnvironment,
  fontSize: number,
  metrics: NativeMathMetrics,
  profile: NativeMathProfile
): Box {
  const source = `\\begin{tikzpicture}${environment.body}\\end{tikzpicture}`;
  const artifact = renderGraphSX(source, defaultTheme, profile.name, "tikz");
  const baseline = artifact.height / 2 + fontSize * metrics.fractionAxisOffset;
  const ascent = baseline;
  const descent = Math.max(0, artifact.height - baseline);
  return {
    width: artifact.width,
    height: artifact.height,
    baseline,
    ascent,
    descent,
    inkTop: 0,
    inkBottom: artifact.height,
    nodes: [{
      type: "graphsx",
      source,
      svgBody: artifact.svgBody,
      summary: artifact.summary,
      displayList: artifact.displayList,
      x: 0,
      y: 0,
      width: artifact.width,
      height: artifact.height
    }]
  };
}

function unknownEnvironmentMessage(name: string): string {
  if (name === "tikzpicture") return "unsupported TikZ";
  return `unknown environment: ${name || "?"}`;
}

function normalizeEnvironmentBody(body: string): string {
  return body
    .replace(/\\\\/g, " ; ")
    .replace(/&/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function layoutMatrixEnvironment(
  environment: ParsedEnvironment,
  fontSize: number,
  displayMode: boolean,
  metrics: NativeMathMetrics,
  profile: NativeMathProfile
): Box {
  const rows = splitEnvironmentRows(environment.body).map((row) => splitEnvironmentColumns(row));
  const normalizedRows = rows.length ? rows : [[""]];
  const columnCount = Math.max(1, ...normalizedRows.map((row) => row.length));
  const cellFontSize = environment.name === "smallmatrix" ? fontSize * metrics.scriptScale : fontSize;
  const cellRows = normalizedRows.map((row) => (
    Array.from({ length: columnCount }, (_, columnIndex) => (
      layoutSequence((row[columnIndex] ?? "").trim(), cellFontSize, false, metrics, profile)
    ))
  ));
  const columnWidths = Array.from({ length: columnCount }, (_, columnIndex) => (
    Math.max(...cellRows.map((row) => row[columnIndex]?.width ?? 0), 0)
  ));
  const rowAscents = cellRows.map((row) => Math.max(...row.map((cell) => cell.ascent), cellFontSize * 0.75));
  const rowDescents = cellRows.map((row) => Math.max(...row.map((cell) => cell.descent), cellFontSize * 0.25));
  const columnGap = cellFontSize * (environment.name === "smallmatrix" ? 0.55 : 1.05);
  const rowGap = cellFontSize * (environment.name === "smallmatrix" ? 0.18 : 0.38);
  const contentWidth = columnWidths.reduce((sum, width) => sum + width, 0) + columnGap * Math.max(0, columnCount - 1);
  const totalHeight = rowAscents.reduce((sum, ascent) => sum + ascent, 0)
    + rowDescents.reduce((sum, descent) => sum + descent, 0)
    + rowGap * Math.max(0, cellRows.length - 1);
  const baseline = totalHeight / 2 + fontSize * 0.18;
  const nodes: NativeNode[] = [];
  let y = 0;
  let inkTop = Number.POSITIVE_INFINITY;
  let inkBottom = Number.NEGATIVE_INFINITY;

  for (let rowIndex = 0; rowIndex < cellRows.length; rowIndex += 1) {
    const rowBaseline = y + rowAscents[rowIndex];
    let x = 0;
    for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
      const cell = cellRows[rowIndex][columnIndex];
      const columnWidth = columnWidths[columnIndex];
      const cellX = x + (columnWidth - cell.width) / 2;
      const cellY = rowBaseline - cell.baseline;
      nodes.push(...translateNodes(cell.nodes, cellX, cellY));
      inkTop = Math.min(inkTop, cellY + cell.inkTop);
      inkBottom = Math.max(inkBottom, cellY + cell.inkBottom);
      x += columnWidth + columnGap;
    }
    y += rowAscents[rowIndex] + rowDescents[rowIndex] + rowGap;
  }

  if (!Number.isFinite(inkTop) || !Number.isFinite(inkBottom)) {
    inkTop = 0;
    inkBottom = totalHeight;
  }

  return {
    width: contentWidth,
    height: totalHeight,
    baseline,
    ascent: baseline,
    descent: Math.max(0, totalHeight - baseline),
    inkTop,
    inkBottom,
    nodes
  };
}

function layoutAlignedEnvironment(
  environment: ParsedEnvironment,
  fontSize: number,
  displayMode: boolean,
  metrics: NativeMathMetrics,
  profile: NativeMathProfile
): Box {
  const rows = splitEnvironmentRows(environment.body).map((row) => splitEnvironmentColumns(row));
  const normalizedRows = rows.length ? rows : [[""]];
  const columnCount = Math.max(1, ...normalizedRows.map((row) => row.length));
  const cellRows = normalizedRows.map((row) => (
    Array.from({ length: columnCount }, (_, columnIndex) => (
      layoutSequence((row[columnIndex] ?? "").trim(), fontSize, displayMode, metrics, profile)
    ))
  ));
  const columnWidths = Array.from({ length: columnCount }, (_, columnIndex) => (
    Math.max(...cellRows.map((row) => row[columnIndex]?.width ?? 0), 0)
  ));
  const columnGaps = Array.from({ length: Math.max(0, columnCount - 1) }, (_, columnIndex) => (
    fontSize * (columnIndex % 2 === 0 ? metrics.relationMargin : 1.5)
  ));
  const rowAscents = cellRows.map((row) => Math.max(...row.map((cell) => cell.ascent), fontSize * 0.75));
  const rowDescents = cellRows.map((row) => Math.max(...row.map((cell) => cell.descent), fontSize * 0.25));
  const rowGap = fontSize * 0.38;
  const contentWidth = columnWidths.reduce((sum, width) => sum + width, 0)
    + columnGaps.reduce((sum, gap) => sum + gap, 0);
  const totalHeight = rowAscents.reduce((sum, ascent) => sum + ascent, 0)
    + rowDescents.reduce((sum, descent) => sum + descent, 0)
    + rowGap * Math.max(0, cellRows.length - 1);
  const baseline = totalHeight / 2 + fontSize * 0.18;
  const nodes: NativeNode[] = [];
  let y = 0;
  let inkTop = Number.POSITIVE_INFINITY;
  let inkBottom = Number.NEGATIVE_INFINITY;

  for (let rowIndex = 0; rowIndex < cellRows.length; rowIndex += 1) {
    const rowBaseline = y + rowAscents[rowIndex];
    let x = 0;
    for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
      const cell = cellRows[rowIndex][columnIndex];
      const columnWidth = columnWidths[columnIndex];
      const cellX = x + (columnIndex % 2 === 0 ? columnWidth - cell.width : 0);
      const cellY = rowBaseline - cell.baseline;
      nodes.push(...translateNodes(cell.nodes, cellX, cellY));
      inkTop = Math.min(inkTop, cellY + cell.inkTop);
      inkBottom = Math.max(inkBottom, cellY + cell.inkBottom);
      x += columnWidth + (columnGaps[columnIndex] ?? 0);
    }
    y += rowAscents[rowIndex] + rowDescents[rowIndex] + rowGap;
  }

  if (!Number.isFinite(inkTop) || !Number.isFinite(inkBottom)) {
    inkTop = 0;
    inkBottom = totalHeight;
  }

  return {
    width: contentWidth,
    height: totalHeight,
    baseline,
    ascent: baseline,
    descent: Math.max(0, totalHeight - baseline),
    inkTop,
    inkBottom,
    nodes
  };
}

function splitEnvironmentRows(body: string): string[] {
  return splitEnvironmentBody(body, "\\\\");
}

function splitEnvironmentColumns(row: string): string[] {
  return splitEnvironmentBody(row, "&");
}

function splitEnvironmentBody(input: string, separator: "\\\\" | "&"): string[] {
  const parts: string[] = [];
  let start = 0;
  let braceDepth = 0;
  let environmentDepth = 0;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (char === "{") braceDepth += 1;
    else if (char === "}") braceDepth = Math.max(0, braceDepth - 1);

    if (char === "\\") {
      const command = readCommand(input, index);
      if (command.name === "\\begin" || command.name === "\\end") {
        const name = readArgument(input, command.end + 1);
        environmentDepth += command.name === "\\begin" ? 1 : -1;
        environmentDepth = Math.max(0, environmentDepth);
        index = Math.max(command.end, name.end);
        continue;
      }
    }

    if (braceDepth !== 0 || environmentDepth !== 0) continue;
    if (separator === "&" && char === "&") {
      parts.push(input.slice(start, index));
      start = index + 1;
      continue;
    }
    if (separator === "\\\\" && char === "\\" && input[index + 1] === "\\") {
      parts.push(input.slice(start, index));
      start = index + 2;
      index += 1;
    }
  }

  parts.push(input.slice(start));
  return parts.map((part) => part.trim()).filter((part, index, list) => part.length > 0 || list.length === 1 || index < list.length - 1);
}

function wrapBoxWithDelimiters(
  body: Box,
  delimiters: [string, string],
  fontSize: number,
  profile: NativeMathProfile,
  options: { verticalBarsAsGlyphs?: boolean; stableInlineBaseline?: boolean; delimiterGap?: number; useDelimiterVariants?: boolean } = {}
): Box {
  const [left, right] = delimiters;
  const style = { italic: false, fontFamily: profile.layoutFontFamily };
  const delimiterFontSize = Math.max(fontSize, body.height * 0.88);
  const targetHeight = delimiterTargetHeight(body, fontSize);
  const leftVariant = left ? layoutOpenMathDelimiterGlyph(left, targetHeight, fontSize, body, profile, options) : undefined;
  const rightVariant = right ? layoutOpenMathDelimiterGlyph(right, targetHeight, fontSize, body, profile, options) : undefined;
  const leftWidth = left ? leftVariant?.width ?? delimiterWidth(left, delimiterFontSize, style, options) : 0;
  const rightWidth = right ? rightVariant?.width ?? delimiterWidth(right, delimiterFontSize, style, options) : 0;
  const gap = options.delimiterGap ?? fontSize * 0.18;
  const bodyX = left ? leftWidth + gap : 0;
  const rightX = bodyX + body.width + (right ? gap : 0);
  const nodes: NativeNode[] = [];
  let maxAscent = body.ascent;
  let maxDescent = body.descent;
  let inkTop = body.inkTop;
  let inkBottom = body.inkBottom;

  if (left) {
    if (leftVariant) {
      nodes.push(glyphPath(
        leftVariant.d,
        0,
        leftVariant.y,
        leftVariant.scale,
        leftVariant.width,
        leftVariant.height,
        leftVariant.inkTopOffset,
        leftVariant.inkBottomOffset
      ));
    } else {
      nodes.push(...delimiterNodes(left, 0, body, delimiterFontSize, style, options));
    }
    maxAscent = Math.max(maxAscent, body.baseline);
    maxDescent = Math.max(maxDescent, body.height - body.baseline);
    inkTop = Math.min(inkTop, leftVariant?.inkTop ?? 0);
    inkBottom = Math.max(inkBottom, leftVariant?.inkBottom ?? body.height);
  }

  nodes.push(...translateNodes(body.nodes, bodyX, 0));

  if (right) {
    if (rightVariant) {
      nodes.push(glyphPath(
        rightVariant.d,
        rightX,
        rightVariant.y,
        rightVariant.scale,
        rightVariant.width,
        rightVariant.height,
        rightVariant.inkTopOffset,
        rightVariant.inkBottomOffset
      ));
    } else {
      nodes.push(...delimiterNodes(right, rightX, body, delimiterFontSize, style, options));
    }
    maxAscent = Math.max(maxAscent, body.baseline);
    maxDescent = Math.max(maxDescent, body.height - body.baseline);
    inkTop = Math.min(inkTop, rightVariant?.inkTop ?? 0);
    inkBottom = Math.max(inkBottom, rightVariant?.inkBottom ?? body.height);
  }

  const width = right ? rightX + rightWidth : bodyX + body.width;
  return {
    width,
    height: Math.max(maxAscent + maxDescent, body.height),
    baseline: body.baseline,
    ascent: maxAscent,
    descent: maxDescent,
    inkTop,
    inkBottom,
    nodes
  };
}

function delimiterTargetHeight(body: Box, fontSize: number): number {
  const constants = getOpenTypeMathConstants();
  const fontMinimum = constants
    ? fontSize * constants.delimitedSubFormulaMinHeight / constants.unitsPerEm
    : fontSize * 1.5;
  return Math.max(body.height, fontMinimum);
}

function layoutOpenMathDelimiterGlyph(
  text: string,
  targetHeight: number,
  fontSize: number,
  body: Box,
  profile: NativeMathProfile,
  options: { verticalBarsAsGlyphs?: boolean; useDelimiterVariants?: boolean } = {}
): {
  d: string;
  width: number;
  height: number;
  y: number;
  scale: number;
  inkTopOffset: number;
  inkBottomOffset: number;
  inkTop: number;
  inkBottom: number;
} | undefined {
  if (options.useDelimiterVariants === false) return undefined;
  if (!profile.isOpenMath) return undefined;
  if (options.verticalBarsAsGlyphs && (text === "|" || text === "‖")) return undefined;

  const variant = getOpenTypeMathGlyphVariant(text, targetHeight, fontSize);
  if (!variant) return undefined;

  const outline = getNativeGlyphOutline(profile.openMathRole ?? "openMath", variant.glyphId);
  if (!outline) return undefined;

  const scale = fontSize / outline.unitsPerEm;
  const actualAscent = Math.max(0, outline.bbox.maxY * scale);
  const actualDescent = Math.max(0, -outline.bbox.minY * scale);
  const width = Math.max(outline.advanceWidth, outline.bbox.maxX) * scale;
  const height = actualAscent + actualDescent;
  const y = (body.height + actualAscent - actualDescent) / 2;
  return {
    d: outline.path,
    width,
    height,
    y,
    scale,
    inkTopOffset: -actualAscent,
    inkBottomOffset: actualDescent,
    inkTop: y - actualAscent,
    inkBottom: y + actualDescent
  };
}

function delimiterWidth(
  text: string,
  fontSize: number,
  style: NativeGlyphStyle,
  options: { verticalBarsAsGlyphs?: boolean } = {}
): number {
  if ((text === "|" || text === "‖") && !options.verticalBarsAsGlyphs) return text === "‖" ? fontSize * 0.36 : fontSize * 0.18;
  return measureGlyphWidth(text, fontSize, style);
}

function delimiterNodes(
  text: string,
  x: number,
  body: Box,
  fontSize: number,
  style: NativeGlyphStyle,
  options: { verticalBarsAsGlyphs?: boolean; stableInlineBaseline?: boolean } = {}
): NativeNode[] {
  if ((text === "|" || text === "‖") && !options.verticalBarsAsGlyphs) {
    const ruleWidth = Math.max(0.5, fontSize * 0.045);
    const gap = text === "‖" ? ruleWidth * 2.4 : 0;
    const first: NativeRule = { type: "rule", x, y: 0, width: ruleWidth, height: body.height };
    return text === "‖"
      ? [first, { type: "rule", x: x + gap, y: 0, width: ruleWidth, height: body.height }]
      : [first];
  }

  const metrics = measureGlyphVerticalMetrics(text, fontSize, style);
  const normalHeight = fontSize * 1.35;
  const baseline = options.stableInlineBaseline && body.height <= normalHeight
    ? body.baseline
    : (body.height + metrics.ascent - metrics.descent) / 2;
  return [glyph(text, x, baseline, fontSize, style)];
}

function prependErrorMarker(
  message: string,
  body: Box,
  fontSize: number,
  profile: NativeMathProfile
): Box {
  const style = { color: "#b42318", italic: false, fontFamily: profile.layoutFontFamily };
  const text = `⟦${message}⟧`;
  const markerSize = fontSize * 0.72;
  const markerWidth = measureGlyphWidth(text, markerSize, style);
  const markerMetrics = measureGlyphVerticalMetrics(text, markerSize, style);
  const gap = fontSize * 0.28;
  const nodes = [
    glyph(text, 0, body.baseline, markerSize, style),
    ...translateNodes(body.nodes, markerWidth + gap, 0)
  ];
  const ascent = Math.max(body.ascent, markerMetrics.ascent);
  const descent = Math.max(body.descent, markerMetrics.descent);
  return {
    width: markerWidth + gap + body.width,
    height: Math.max(body.height, ascent + descent),
    baseline: body.baseline,
    ascent,
    descent,
    inkTop: Math.min(body.inkTop, body.baseline - markerMetrics.ascent),
    inkBottom: Math.max(body.inkBottom, body.baseline + markerMetrics.descent),
    nodes
  };
}

function errorMarkerBox(message: string, fontSize: number, profile: NativeMathProfile): Box {
  const style = { color: "#b42318", italic: false, fontFamily: profile.layoutFontFamily };
  const text = `⟦${message}⟧`;
  const markerSize = fontSize * 0.72;
  const markerWidth = measureGlyphWidth(text, markerSize, style);
  const markerMetrics = measureGlyphVerticalMetrics(text, markerSize, style);
  const ascent = markerMetrics.ascent;
  const descent = markerMetrics.descent;
  return {
    width: markerWidth,
    height: ascent + descent,
    baseline: ascent,
    ascent,
    descent,
    inkTop: 0,
    inkBottom: ascent + descent,
    nodes: [glyph(text, 0, ascent, markerSize, style)]
  };
}

function translateNodes(nodes: NativeNode[], dx: number, dy: number): NativeNode[] {
  return nodes.map((node) => ({ ...node, x: node.x + dx, y: node.y + dy }));
}

function logNativeMathParse(
  call: number,
  latex: string,
  displayMode: boolean,
  fontSize: number,
  layout: NativeMathLayout
): void {
  if (typeof console === "undefined") return;
  if (!isDebugLogEnabled("math")) return;
  console.log("[native-math-parse]", {
    call,
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
      if (node.type === "glyphPath") {
        return {
          type: node.type,
          x: roundNumber(node.x),
          y: roundNumber(node.y),
          scale: roundNumber(node.scale),
          width: roundNumber(node.width),
          height: roundNumber(node.height),
          actualAscent: roundNumber(-node.inkTopOffset),
          actualDescent: roundNumber(node.inkBottomOffset)
        };
      }
      if (node.type === "graphsx") {
        return {
          type: node.type,
          x: roundNumber(node.x),
          y: roundNumber(node.y),
          width: roundNumber(node.width),
          height: roundNumber(node.height),
          summary: node.summary
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
  if (!isDebugLogEnabled("math")) return;
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

function measureGlyphWidth(text: string, fontSize: number, style: NativeGlyphStyle = {}): number {
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
  style: NativeGlyphStyle,
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
  style: NativeGlyphStyle
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

function measureAccentGlyphVerticalMetrics(
  text: string,
  fontSize: number,
  style: NativeGlyphStyle
): { ascent: number; descent: number; inkTopOffset: number; inkBottomOffset: number } {
  if (isOpenMathFontFamily(style.fontFamily)) {
    const fontMetrics = getNativeGlyphMetrics(selectNativeFontRole(style), text, fontSize);
    if (fontMetrics) {
      return {
        ascent: fontMetrics.actualAscent,
        descent: fontMetrics.actualDescent,
        inkTopOffset: fontMetrics.actualTopOffset,
        inkBottomOffset: fontMetrics.actualBottomOffset
      };
    }
  }
  return measureGlyphVerticalMetrics(text, fontSize, style);
}

function measureGlyphMathInfo(
  text: string,
  fontSize: number,
  style: NativeGlyphStyle
): { italicCorrection?: number; topAccentAttachment?: number } {
  if (!isOpenMathFontFamily(style.fontFamily)) return {};
  return getOpenTypeMathGlyphInfo(text, fontSize) ?? {};
}

function measureGlyphFontMetrics(
  text: string,
  fontSize: number,
  style: NativeGlyphStyle
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

function estimateWidth(text: string, fontSize: number): number {
  let width = 0;
  for (const char of Array.from(text)) {
    if (char === " ") width += fontSize * 0.28;
    else if (/^[il.,;:|]$/.test(char)) width += fontSize * 0.24;
    else if (/^[=+\-×≤≥≠≫≪→⇒⋅⟂]$/.test(char)) width += fontSize * 0.72;
    else if (/^[A-Z∇∂√∞]$/.test(char)) width += fontSize * 0.72;
    else width += fontSize * 0.52;
  }
  return width;
}

function normalizeMathGlyph(text: string): string {
  return text === "-" ? "−" : text;
}

function resolveNextAtomClass(previousClass: MathAtomClass | undefined, nextClass: MathAtomClass): MathAtomClass {
  if (nextClass === "mbin" && (!previousClass || binLeftCanceller.has(previousClass))) {
    return "mord";
  }
  return nextClass;
}

function mathAtomSpacingSize(
  previousClass: MathAtomClass,
  nextClass: MathAtomClass,
  fontSize: number,
  metrics: NativeMathMetrics
): number {
  const resolvedPreviousClass = previousClass === "mbin" && binRightCanceller.has(nextClass)
    ? "mord"
    : previousClass;
  const kind = mathAtomSpacing[resolvedPreviousClass]?.[nextClass];
  if (!kind) return 0;

  return fontSize * mathSpacingUnit(kind, metrics);
}

function mathSpacingUnit(kind: MathSpacingKind, metrics: NativeMathMetrics): number {
  if (kind === "thin") return metrics.thinMathSpace;
  if (kind === "medium") return metrics.binaryMargin;
  return metrics.relationMargin;
}

function mathAtomClassForCommand(command: string, text: string): MathAtomClass {
  if (namedOperatorCommands.has(command) || command === "\\int" || command === "\\sum" || command === "\\prod") {
    return "mop";
  }
  return mathAtomClassForText(commandGlyphs[command] ?? text, text);
}

function mathAtomClassForText(rawText: string, text: string): MathAtomClass {
  if (isRelationOperator(text)) return "mrel";
  if (isBinaryOperator(text)) return "mbin";
  if (isOpenDelimiter(rawText) || isOpenDelimiter(text)) return "mopen";
  if (isCloseDelimiter(rawText) || isCloseDelimiter(text)) return "mclose";
  if (isPunctuationAtom(rawText) || isPunctuationAtom(text)) return "mpunct";
  if (isOperatorText(text) && /^[∫∑∏]$/.test(text)) return "mop";
  return "mord";
}

function isOpenDelimiter(text: string): boolean {
  return ["(", "[", "{"].includes(text);
}

function isCloseDelimiter(text: string): boolean {
  return [")", "]", "}"].includes(text);
}

function isPunctuationAtom(text: string): boolean {
  return [",", ";", ":"].includes(text);
}

function unsupported(command: string): string {
  return `⟦${command.slice(1)}⟧`;
}

function round(value: number): string {
  return Number(value.toFixed(2)).toString();
}

function roundScale(value: number): string {
  return Number(value.toFixed(5)).toString();
}

function roundNumber(value: number): number {
  return Number(value.toFixed(3));
}
