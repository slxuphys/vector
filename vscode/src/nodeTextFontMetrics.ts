import fontkit from "@pdf-lib/fontkit";
import type { TextStyle } from "../../src/core/layout/measureText";
import type { DocumentTheme } from "../../src/core/theme/themeTypes";
import {
  latinModernRomanFontFamily,
  latinModernRomanFontUrls,
  libertinusSerifFontFamily,
  libertinusSerifFontUrls,
  newComputerModernFontFamily,
  newComputerModernFontUrls
} from "../../src/core/renderers/text/latinModernRomanFont";

type TextFontFamily = "latin-modern" | "libertinus" | "new-computer-modern";
type TextFontStyle = "regular" | "bold" | "italic" | "boldItalic";
type TextFontKey = `${TextFontFamily}:${TextFontStyle}`;

type FontkitGlyph = {
  id: number;
  path: { toSVG(): string };
};

type FontkitGlyphRun = {
  glyphs: FontkitGlyph[];
  positions: Array<{ xAdvance: number; yAdvance: number; xOffset?: number; yOffset?: number }>;
};

type FontkitFont = {
  unitsPerEm: number;
  layout(text: string): FontkitGlyphRun;
  getGlyph(glyphId: number): FontkitGlyph;
};

export type ShapedGlyph = {
  glyphId: number;
  cluster: number;
  xAdvance: number;
  yAdvance: number;
  xOffset: number;
  yOffset: number;
};

export type ShapedTextRun = {
  key: TextFontKey;
  text: string;
  fontSize: number;
  unitsPerEm: number;
  glyphs: ShapedGlyph[];
  width: number;
};

export type ShapedGlyphPath = ShapedGlyph & {
  d: string;
  x: number;
  y: number;
  scale: number;
};

const fontkitApi = fontkit as unknown as {
  create(bytes: Uint8Array): FontkitFont;
};

const textFontUrls: Record<TextFontKey, string> = {
  "latin-modern:regular": latinModernRomanFontUrls.regular,
  "latin-modern:bold": latinModernRomanFontUrls.bold,
  "latin-modern:italic": latinModernRomanFontUrls.italic,
  "latin-modern:boldItalic": latinModernRomanFontUrls.boldItalic,
  "libertinus:regular": libertinusSerifFontUrls.regular,
  "libertinus:bold": libertinusSerifFontUrls.bold,
  "libertinus:italic": libertinusSerifFontUrls.italic,
  "libertinus:boldItalic": libertinusSerifFontUrls.boldItalic,
  "new-computer-modern:regular": newComputerModernFontUrls.regular,
  "new-computer-modern:bold": newComputerModernFontUrls.bold,
  "new-computer-modern:italic": newComputerModernFontUrls.italic,
  "new-computer-modern:boldItalic": newComputerModernFontUrls.boldItalic
};

const fontCache = new Map<TextFontKey, FontkitFont>();
const loadPromises = new Map<TextFontKey, Promise<void>>();
const shapedCache = new Map<string, ShapedTextRun>();
const glyphPathCache = new Map<string, string>();

export async function loadTextFontsForTheme(theme: DocumentTheme): Promise<void> {
  const family = textFontFamilyForCss(theme.fontFamily);
  if (!family) return;
  await Promise.all([
    loadTextFont(`${family}:regular`),
    loadTextFont(`${family}:bold`),
    loadTextFont(`${family}:italic`),
    loadTextFont(`${family}:boldItalic`)
  ]);
}

export async function loadHarfbuzzTextShaper(): Promise<void> {
  // The VS Code extension host uses a Node-targeted bundle and fontkit shaping.
}

export function loadTextFontFromBytes(key: TextFontKey, bytes: Uint8Array): void {
  fontCache.set(key, fontkitApi.create(bytes));
  shapedCache.clear();
  glyphPathCache.clear();
}

export function measureTextWithFontFile(text: string, style: TextStyle): number | undefined {
  return shapeTextWithFontFile(text, style)?.width;
}

export function shapeTextWithFontFile(text: string, style: TextStyle): ShapedTextRun | undefined {
  if (!text) {
    const key = textFontKeyForStyle(style);
    return key ? { key, text, fontSize: style.fontSize, unitsPerEm: 1000, glyphs: [], width: 0 } : undefined;
  }
  if (style.code) return undefined;
  const key = textFontKeyForStyle(style);
  if (!key) return undefined;
  const font = fontCache.get(key);
  if (!font) return undefined;

  const cacheKey = `${key}:${style.fontSize}:${style.bold ? "b" : ""}${style.italic ? "i" : ""}:${text}`;
  const cached = shapedCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const run = font.layout(text);
  const glyphs = run.positions.map((position, index) => ({
    glyphId: run.glyphs[index]?.id ?? 0,
    cluster: index,
    xAdvance: position.xAdvance,
    yAdvance: position.yAdvance,
    xOffset: position.xOffset ?? 0,
    yOffset: position.yOffset ?? 0
  }));
  const designWidth = glyphs.reduce((sum, glyph) => sum + glyph.xAdvance, 0);
  const width = designWidth * style.fontSize / font.unitsPerEm;
  const shaped = { key, text, fontSize: style.fontSize, unitsPerEm: font.unitsPerEm, glyphs, width };
  shapedCache.set(cacheKey, shaped);
  return shaped;
}

export function getShapedGlyphPaths(shaped: ShapedTextRun): ShapedGlyphPath[] | undefined {
  const font = fontCache.get(shaped.key);
  if (!font) return undefined;

  const scale = shaped.fontSize / shaped.unitsPerEm;
  let cursorX = 0;
  let cursorY = 0;
  const paths: ShapedGlyphPath[] = [];
  for (const glyph of shaped.glyphs) {
    paths.push({
      ...glyph,
      d: glyphPathForId(shaped.key, font, glyph.glyphId),
      x: cursorX + glyph.xOffset * scale,
      y: cursorY + glyph.yOffset * scale,
      scale
    });
    cursorX += glyph.xAdvance * scale;
    cursorY += glyph.yAdvance * scale;
  }
  return paths;
}

function textFontKeyForStyle(style: TextStyle): TextFontKey | undefined {
  const family = textFontFamilyForCss(style.fontFamily);
  if (!family) return undefined;
  const variant = style.bold && style.italic
    ? "boldItalic"
    : style.bold
      ? "bold"
      : style.italic
        ? "italic"
        : "regular";
  return `${family}:${variant}`;
}

function textFontFamilyForCss(fontFamily: string): TextFontFamily | undefined {
  if (fontFamily.includes(newComputerModernFontFamily)) return "new-computer-modern";
  if (fontFamily.includes(libertinusSerifFontFamily)) return "libertinus";
  if (fontFamily.includes(latinModernRomanFontFamily)) return "latin-modern";
  return undefined;
}

function glyphPathForId(key: TextFontKey, font: FontkitFont, glyphId: number): string {
  const cacheKey = `${key}:${glyphId}`;
  const cached = glyphPathCache.get(cacheKey);
  if (cached) return cached;
  const d = font.getGlyph(glyphId).path.toSVG();
  glyphPathCache.set(cacheKey, d);
  return d;
}

async function loadTextFont(key: TextFontKey): Promise<void> {
  if (fontCache.has(key)) return;
  const current = loadPromises.get(key);
  if (current) return current;

  const promise = fetch(textFontUrls[key])
    .then(async (response) => {
      if (!response.ok) throw new Error(`Could not load font: ${textFontUrls[key]}`);
      loadTextFontFromBytes(key, new Uint8Array(await response.arrayBuffer()));
    });
  loadPromises.set(key, promise);
  return promise;
}
