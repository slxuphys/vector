import type { NativeFontRole } from "./nativeFontMetrics";
import {
  getOpenMathFontProfile,
  openMathFontFaceCss,
  openMathFontStack,
  type OpenMathFontProfileName
} from "./openMathFont";

export type NativeMathFontProfileName = "katex" | "openmath" | "openmath-libertinus" | "openmath-new-computer-modern";

export type NativeGlyphStyle = {
  fontFamily?: string;
  italic?: boolean;
  bold?: boolean;
};

export type NativeMathProfile = {
  name: NativeMathFontProfileName;
  isOpenMath?: boolean;
  openMathProfileName?: OpenMathFontProfileName;
  openMathRole?: NativeFontRole;
  svgFontFaceCss: string;
  layoutFontFamily?: string;
  largeOperatorFontFamily: string;
  renderFontFamily: (italic: boolean) => string;
  mapGlyph: (text: string, options?: { upright?: boolean }) => string;
  mapBoldGlyph: (text: string) => { text: string; bold: boolean };
  mapCaligraphicGlyph: (text: string) => { text: string; italic: boolean };
  mapBlackboardGlyph: (text: string) => { text: string; italic: boolean };
  shouldItalicize: (rawText: string, mappedText: string, options?: { upright?: boolean }) => boolean;
};

const regularMathFontFamily = "KaTeX_Main, Times New Roman, serif";
const italicMathFontFamily = "KaTeX_Math, KaTeX_Main, Times New Roman, serif";
const largeOperatorFontFamily = "KaTeX_Size2, KaTeX_Size1, KaTeX_Main, Times New Roman, serif";

export const katexNativeMathProfile: NativeMathProfile = {
  name: "katex",
  svgFontFaceCss: "",
  largeOperatorFontFamily,
  renderFontFamily: (italic) => italic ? italicMathFontFamily : regularMathFontFamily,
  mapGlyph: (text) => text,
  mapBoldGlyph: (text) => ({ text, bold: true }),
  mapCaligraphicGlyph: (text) => ({ text, italic: false }),
  mapBlackboardGlyph: (text) => ({ text: Array.from(text).map((char) => openMathDoubleStruckGlyph(char)).join(""), italic: false }),
  shouldItalicize: (rawText, mappedText, options) => !options?.upright && shouldItalicizeMathText(rawText) && !isOperatorText(mappedText)
};

export const openTypeNativeMathProfile: NativeMathProfile = {
  name: "openmath",
  isOpenMath: true,
  openMathProfileName: "latin-modern",
  openMathRole: "openMath",
  svgFontFaceCss: openMathFontFaceCss(),
  layoutFontFamily: openMathFontStack,
  largeOperatorFontFamily: openMathFontStack,
  renderFontFamily: () => openMathFontStack,
  mapGlyph: (text, options) => options?.upright ? text : Array.from(text).map((char) => openMathItalicGlyph(char)).join(""),
  mapBoldGlyph: (text) => ({ text: Array.from(text).map((char) => openMathBoldGlyph(char)).join(""), bold: false }),
  mapCaligraphicGlyph: (text) => ({ text: Array.from(text).map((char) => openMathScriptGlyph(char)).join(""), italic: false }),
  mapBlackboardGlyph: (text) => ({ text: Array.from(text).map((char) => openMathDoubleStruckGlyph(char)).join(""), italic: false }),
  shouldItalicize: () => false
};

export const libertinusOpenTypeNativeMathProfile: NativeMathProfile = {
  ...openTypeNativeMathProfile,
  name: "openmath-libertinus",
  openMathProfileName: "libertinus",
  openMathRole: "openMathLibertinus",
  svgFontFaceCss: openMathFontFaceCss("libertinus"),
  layoutFontFamily: getOpenMathFontProfile("libertinus").stack,
  largeOperatorFontFamily: getOpenMathFontProfile("libertinus").stack,
  renderFontFamily: () => getOpenMathFontProfile("libertinus").stack
};

export const newComputerModernOpenTypeNativeMathProfile: NativeMathProfile = {
  ...openTypeNativeMathProfile,
  name: "openmath-new-computer-modern",
  openMathProfileName: "new-computer-modern",
  openMathRole: "openMathNewComputerModern",
  svgFontFaceCss: openMathFontFaceCss("new-computer-modern"),
  layoutFontFamily: getOpenMathFontProfile("new-computer-modern").stack,
  largeOperatorFontFamily: getOpenMathFontProfile("new-computer-modern").stack,
  renderFontFamily: () => getOpenMathFontProfile("new-computer-modern").stack
};

export function getNativeMathProfile(name: NativeMathFontProfileName): NativeMathProfile {
  if (name === "openmath-new-computer-modern") return newComputerModernOpenTypeNativeMathProfile;
  if (name === "openmath-libertinus") return libertinusOpenTypeNativeMathProfile;
  return name === "openmath" ? openTypeNativeMathProfile : katexNativeMathProfile;
}

export function isOpenMathFontFamily(fontFamily: string | undefined): boolean {
  return Boolean(
    fontFamily?.includes("Latin Modern Math")
    || fontFamily?.includes("Libertinus Math")
    || fontFamily?.includes("New Computer Modern Math")
  );
}

export function selectNativeFontRole(style: NativeGlyphStyle): NativeFontRole {
  if (style.fontFamily?.includes("New Computer Modern Math")) return "openMathNewComputerModern";
  if (style.fontFamily?.includes("Libertinus Math")) return "openMathLibertinus";
  if (style.fontFamily?.includes("Latin Modern Math")) return "openMath";
  if (style.fontFamily?.includes("KaTeX_Size4")) return "size4";
  if (style.fontFamily?.includes("KaTeX_Size3")) return "size3";
  if (style.fontFamily?.includes("KaTeX_Size2")) return "size2";
  if (style.fontFamily?.includes("KaTeX_Size1")) return "size1";
  if (style.bold && style.italic) return "mainBoldItalic";
  if (style.bold) return "mainBold";
  if (style.italic) return "mathItalic";
  return "mainRegular";
}

export function shouldItalicizeMathText(text: string): boolean {
  if (isOperatorText(text) || isBinaryOperator(text) || isRelationOperator(text)) return false;
  return /^[A-Za-zα-ωΑ-Ω]$/.test(text);
}

export function isOperatorText(text: string): boolean {
  return isRelationOperator(text) || isBinaryOperator(text) || /^[∫∑∏∇∂∞]$/.test(text);
}

export function isRelationOperator(text: string): boolean {
  return ["=", "≈", "≤", "≥", "≠", "≫", "≪", "<", ">", "←", "→", "↑", "↓", "⇒", "∈", "⟂"].includes(text);
}

export function isBinaryOperator(text: string): boolean {
  return ["+", "−", "±", "×", "⋅", "⊗", "∘"].includes(text);
}

function openMathItalicGlyph(char: string): string {
  const codePoint = char.codePointAt(0);
  if (codePoint === undefined) return char;

  if (codePoint >= 0x41 && codePoint <= 0x5a) {
    return String.fromCodePoint(0x1d434 + codePoint - 0x41);
  }
  if (codePoint >= 0x61 && codePoint <= 0x7a) {
    if (char === "h") return "\u210e";
    return String.fromCodePoint(0x1d44e + codePoint - 0x61);
  }
  const greekItalic = openMathGreekItalicGlyph(char);
  if (greekItalic) return greekItalic;
  return char;
}

function openMathGreekItalicGlyph(char: string): string | undefined {
  const lowercaseGreek: Record<string, string> = {
    "α": "𝛼",
    "β": "𝛽",
    "γ": "𝛾",
    "δ": "𝛿",
    "ϵ": "𝜖",
    "ε": "𝜀",
    "ζ": "𝜁",
    "η": "𝜂",
    "θ": "𝜃",
    "ϑ": "𝜗",
    "ι": "𝜄",
    "κ": "𝜅",
    "ϰ": "𝜘",
    "λ": "𝜆",
    "μ": "𝜇",
    "ν": "𝜈",
    "ξ": "𝜉",
    "ο": "𝜊",
    "π": "𝜋",
    "ϖ": "𝜛",
    "ρ": "𝜌",
    "ϱ": "𝜚",
    "σ": "𝜎",
    "ς": "𝜍",
    "τ": "𝜏",
    "υ": "𝜐",
    "φ": "𝜑",
    "ϕ": "𝜙",
    "χ": "𝜒",
    "ψ": "𝜓",
    "ω": "𝜔"
  };
  return lowercaseGreek[char];
}

function openMathBoldGlyph(char: string): string {
  const codePoint = char.codePointAt(0);
  if (codePoint === undefined) return char;

  if (codePoint >= 0x41 && codePoint <= 0x5a) {
    return String.fromCodePoint(0x1d400 + codePoint - 0x41);
  }
  if (codePoint >= 0x61 && codePoint <= 0x7a) {
    return String.fromCodePoint(0x1d41a + codePoint - 0x61);
  }
  if (codePoint >= 0x30 && codePoint <= 0x39) {
    return String.fromCodePoint(0x1d7ce + codePoint - 0x30);
  }
  const greekBold = openMathGreekBoldGlyph(char);
  if (greekBold) return greekBold;
  return char;
}

function openMathScriptGlyph(char: string): string {
  const script: Record<string, string> = {
    A: "𝒜",
    B: "ℬ",
    C: "𝒞",
    D: "𝒟",
    E: "ℰ",
    F: "ℱ",
    G: "𝒢",
    H: "ℋ",
    I: "ℐ",
    J: "𝒥",
    K: "𝒦",
    L: "ℒ",
    M: "ℳ",
    N: "𝒩",
    O: "𝒪",
    P: "𝒫",
    Q: "𝒬",
    R: "ℛ",
    S: "𝒮",
    T: "𝒯",
    U: "𝒰",
    V: "𝒱",
    W: "𝒲",
    X: "𝒳",
    Y: "𝒴",
    Z: "𝒵",
    a: "𝒶",
    b: "𝒷",
    c: "𝒸",
    d: "𝒹",
    e: "ℯ",
    f: "𝒻",
    g: "ℊ",
    h: "𝒽",
    i: "𝒾",
    j: "𝒿",
    k: "𝓀",
    l: "𝓁",
    m: "𝓂",
    n: "𝓃",
    o: "ℴ",
    p: "𝓅",
    q: "𝓆",
    r: "𝓇",
    s: "𝓈",
    t: "𝓉",
    u: "𝓊",
    v: "𝓋",
    w: "𝓌",
    x: "𝓍",
    y: "𝓎",
    z: "𝓏"
  };
  return script[char] ?? char;
}

function openMathDoubleStruckGlyph(char: string): string {
  const uppercase: Record<string, string> = {
    C: "ℂ",
    H: "ℍ",
    N: "ℕ",
    P: "ℙ",
    Q: "ℚ",
    R: "ℝ",
    Z: "ℤ"
  };
  if (uppercase[char]) return uppercase[char];

  const codePoint = char.codePointAt(0);
  if (codePoint === undefined) return char;
  if (codePoint >= 0x41 && codePoint <= 0x5a) {
    return String.fromCodePoint(0x1d538 + codePoint - 0x41);
  }
  if (codePoint >= 0x61 && codePoint <= 0x7a) {
    return String.fromCodePoint(0x1d552 + codePoint - 0x61);
  }
  if (codePoint >= 0x30 && codePoint <= 0x39) {
    return String.fromCodePoint(0x1d7d8 + codePoint - 0x30);
  }
  return char;
}

function openMathGreekBoldGlyph(char: string): string | undefined {
  const greek: Record<string, string> = {
    "Α": "𝚨",
    "Β": "𝚩",
    "Γ": "𝚪",
    "Δ": "𝚫",
    "Ε": "𝚬",
    "Ζ": "𝚭",
    "Η": "𝚮",
    "Θ": "𝚯",
    "Ι": "𝚰",
    "Κ": "𝚱",
    "Λ": "𝚲",
    "Μ": "𝚳",
    "Ν": "𝚴",
    "Ξ": "𝚵",
    "Ο": "𝚶",
    "Π": "𝚷",
    "Ρ": "𝚸",
    "Σ": "𝚺",
    "Τ": "𝚻",
    "Υ": "𝚼",
    "Φ": "𝚽",
    "Χ": "𝚾",
    "Ψ": "𝚿",
    "Ω": "𝛀",
    "α": "𝛂",
    "β": "𝛃",
    "γ": "𝛄",
    "δ": "𝛅",
    "ϵ": "𝛜",
    "ε": "𝛆",
    "ζ": "𝛇",
    "η": "𝛈",
    "θ": "𝛉",
    "ϑ": "𝛝",
    "ι": "𝛊",
    "κ": "𝛋",
    "ϰ": "𝛞",
    "λ": "𝛌",
    "μ": "𝛍",
    "ν": "𝛎",
    "ξ": "𝛏",
    "ο": "𝛐",
    "π": "𝛑",
    "ϖ": "𝛡",
    "ρ": "𝛒",
    "ϱ": "𝛠",
    "σ": "𝛔",
    "ς": "𝛓",
    "τ": "𝛕",
    "υ": "𝛖",
    "φ": "𝛗",
    "ϕ": "𝛟",
    "χ": "𝛘",
    "ψ": "𝛙",
    "ω": "𝛚",
    "∂": "𝛛"
  };
  return greek[char];
}
