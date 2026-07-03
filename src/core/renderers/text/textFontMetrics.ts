import fontkit from "@pdf-lib/fontkit";
import type { TextStyle } from "../../layout/measureText";
import type { DocumentTheme } from "../../theme/themeTypes";
import {
  latinModernRomanFontFamily,
  latinModernRomanFontUrls,
  libertinusSerifFontFamily,
  libertinusSerifFontUrls,
  newComputerModernFontFamily,
  newComputerModernFontUrls
} from "./latinModernRomanFont";

type TextFontFamily = "latin-modern" | "libertinus" | "new-computer-modern";
type TextFontStyle = "regular" | "bold" | "italic" | "boldItalic";
type TextFontKey = `${TextFontFamily}:${TextFontStyle}`;

type FontkitGlyphRun = {
  positions: Array<{ xAdvance: number; yAdvance: number }>;
};

type FontkitFont = {
  unitsPerEm: number;
  layout(text: string): FontkitGlyphRun;
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
const widthCache = new Map<string, number>();

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

export function loadTextFontFromBytes(key: TextFontKey, bytes: Uint8Array): void {
  fontCache.set(key, fontkitApi.create(bytes));
  widthCache.clear();
}

export function measureTextWithFontFile(text: string, style: TextStyle): number | undefined {
  if (!text) return 0;
  if (style.code) return undefined;
  const key = textFontKeyForStyle(style);
  if (!key) return undefined;
  const font = fontCache.get(key);
  if (!font) return undefined;

  const cacheKey = `${key}:${style.fontSize}:${text}`;
  const cached = widthCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const run = font.layout(text);
  const designWidth = run.positions.reduce((sum, position) => sum + position.xAdvance, 0);
  const width = designWidth * style.fontSize / font.unitsPerEm;
  widthCache.set(cacheKey, width);
  return width;
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

async function loadTextFont(key: TextFontKey): Promise<void> {
  if (fontCache.has(key)) return;
  const current = loadPromises.get(key);
  if (current) return current;

  const promise = fetch(textFontUrls[key])
    .then(async (response) => {
      if (!response.ok) throw new Error(`Could not load font: ${textFontUrls[key]}`);
      loadTextFontFromBytes(key, new Uint8Array(await response.arrayBuffer()));
    })
    .catch(() => {
      // Keep layout usable if font files cannot be fetched; measureText falls back to canvas.
    });
  loadPromises.set(key, promise);
  return promise;
}
