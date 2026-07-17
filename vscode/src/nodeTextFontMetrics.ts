import fontkit from "@pdf-lib/fontkit";
import rawCreateHarfBuzz from "../../node_modules/harfbuzzjs/dist/harfbuzz.js";
import harfbuzzWasmUrl from "../../node_modules/harfbuzzjs/dist/harfbuzz.wasm?url";
import type { TextStyle } from "../../src/core/layout/measureText";
import type { DocumentTheme } from "../../src/core/theme/themeTypes";
import {
  latinModernRomanFontFamily,
  latinModernRomanFontUrls,
  libertinusSerifFontFamily,
  libertinusSerifFontUrls
} from "../../src/core/renderers/text/latinModernRomanFont";

type TextFontFamily = "latin-modern" | "libertinus";
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

type HarfbuzzFontRecord = {
  blob: number;
  face: number;
  font: number;
  unitsPerEm: number;
};

type HarfbuzzModule = {
  HEAPU8: Uint8Array;
  HEAPU16: Uint16Array;
  HEAPU32: Uint32Array;
  HEAP32: Int32Array;
  wasmExports: HarfbuzzExports;
};

type HarfbuzzExports = {
  malloc(size: number): number;
  free(ptr: number): void;
  hb_blob_create(data: number, length: number, mode: number, userData: number, destroy: number): number;
  hb_face_create(blob: number, index: number): number;
  hb_face_get_upem(face: number): number;
  hb_font_create(face: number): number;
  hb_font_set_scale(font: number, xScale: number, yScale: number): void;
  hb_buffer_create(): number;
  hb_buffer_destroy(buffer: number): void;
  hb_buffer_add_utf16(buffer: number, text: number, textLength: number, itemOffset: number, itemLength: number): void;
  hb_buffer_guess_segment_properties(buffer: number): void;
  hb_buffer_get_length(buffer: number): number;
  hb_buffer_get_glyph_infos(buffer: number, length: number): number;
  hb_buffer_get_glyph_positions(buffer: number, length: number): number;
  hb_shape(font: number, buffer: number, features: number, numFeatures: number): void;
};

const createHarfBuzz = rawCreateHarfBuzz as unknown as (options?: {
  wasmBinary?: ArrayBuffer | Uint8Array;
  locateFile?: (path: string) => string;
}) => Promise<unknown>;

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
  "libertinus:boldItalic": libertinusSerifFontUrls.boldItalic
};

const fontCache = new Map<TextFontKey, FontkitFont>();
const fontBytesByKey = new Map<TextFontKey, Uint8Array>();
const harfbuzzFontCache = new Map<TextFontKey, HarfbuzzFontRecord>();
const loadPromises = new Map<TextFontKey, Promise<void>>();
const shapedCache = new Map<string, ShapedTextRun>();
const glyphPathCache = new Map<string, string>();
let harfbuzzModule: HarfbuzzModule | undefined;
let harfbuzzPromise: Promise<HarfbuzzModule> | undefined;

export async function loadTextFontsForTheme(theme: DocumentTheme): Promise<void> {
  const family = textFontFamilyForCss(theme.fontFamily);
  if (!family) return;
  await loadHarfbuzzTextShaper();
  await Promise.all([
    loadTextFont(`${family}:regular`),
    loadTextFont(`${family}:bold`),
    loadTextFont(`${family}:italic`),
    loadTextFont(`${family}:boldItalic`)
  ]);
}

export async function loadHarfbuzzTextShaper(): Promise<void> {
  harfbuzzModule = await loadHarfbuzzModule();
  for (const [key, bytes] of fontBytesByKey) {
    if (!harfbuzzFontCache.has(key)) harfbuzzFontCache.set(key, createHarfbuzzFont(bytes));
  }
}

export function loadTextFontFromBytes(key: TextFontKey, bytes: Uint8Array): void {
  fontBytesByKey.set(key, bytes);
  fontCache.set(key, fontkitApi.create(bytes));
  if (harfbuzzModule) harfbuzzFontCache.set(key, createHarfbuzzFont(bytes));
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
  const harfbuzzFont = harfbuzzFontCache.get(key);
  const font = fontCache.get(key);
  if (!harfbuzzFont && !font) return undefined;

  const cacheKey = `${key}:${style.fontSize}:${style.bold ? "b" : ""}${style.italic ? "i" : ""}:${text}`;
  const cached = shapedCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const glyphs = harfbuzzFont
    ? shapeWithHarfbuzz(text, harfbuzzFont)
    : shapeWithFontkit(text, font!);
  const designWidth = glyphs.reduce((sum, glyph) => sum + glyph.xAdvance, 0);
  const unitsPerEm = harfbuzzFont?.unitsPerEm ?? font!.unitsPerEm;
  const width = designWidth * style.fontSize / unitsPerEm;
  const shaped = { key, text, fontSize: style.fontSize, unitsPerEm, glyphs, width };
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

function shapeWithFontkit(text: string, font: FontkitFont): ShapedGlyph[] {
  const run = font.layout(text);
  return run.positions.map((position, index) => ({
    glyphId: run.glyphs[index]?.id ?? 0,
    cluster: index,
    xAdvance: position.xAdvance,
    yAdvance: position.yAdvance,
    xOffset: position.xOffset ?? 0,
    yOffset: position.yOffset ?? 0
  }));
}

function createHarfbuzzFont(bytes: Uint8Array): HarfbuzzFontRecord {
  const hb = getHarfbuzz();
  const buffer = hb.exports.malloc(bytes.byteLength);
  hb.module.HEAPU8.set(bytes, buffer);
  const blob = hb.exports.hb_blob_create(buffer, bytes.byteLength, 2, 0, 0);
  const face = hb.exports.hb_face_create(blob, 0);
  const unitsPerEm = hb.exports.hb_face_get_upem(face);
  const font = hb.exports.hb_font_create(face);
  hb.exports.hb_font_set_scale(font, unitsPerEm, unitsPerEm);
  return { blob, face, font, unitsPerEm };
}

function shapeWithHarfbuzz(text: string, font: HarfbuzzFontRecord): ShapedGlyph[] {
  const hb = getHarfbuzz();
  const buffer = hb.exports.hb_buffer_create();
  const textPtr = hb.exports.malloc(text.length * 2);
  try {
    const words = hb.module.HEAPU16.subarray(textPtr / 2, textPtr / 2 + text.length);
    for (let index = 0; index < text.length; index += 1) words[index] = text.charCodeAt(index);
    hb.exports.hb_buffer_add_utf16(buffer, textPtr, text.length, 0, text.length);
    hb.exports.hb_buffer_guess_segment_properties(buffer);
    hb.exports.hb_shape(font.font, buffer, 0, 0);
    const length = hb.exports.hb_buffer_get_length(buffer);
    const infosOffset = hb.exports.hb_buffer_get_glyph_infos(buffer, 0) / 4;
    const positionsOffset = hb.exports.hb_buffer_get_glyph_positions(buffer, 0) / 4;
    const infos = hb.module.HEAPU32.subarray(infosOffset, infosOffset + length * 5);
    const positions = hb.module.HEAP32.subarray(positionsOffset, positionsOffset + length * 5);
    const glyphs: ShapedGlyph[] = [];
    for (let index = 0; index < length; index += 1) {
      const offset = index * 5;
      glyphs.push({
        glyphId: infos[offset],
        cluster: infos[offset + 2],
        xAdvance: positions[offset],
        yAdvance: positions[offset + 1],
        xOffset: positions[offset + 2],
        yOffset: positions[offset + 3]
      });
    }
    return glyphs;
  } finally {
    hb.exports.free(textPtr);
    hb.exports.hb_buffer_destroy(buffer);
  }
}

function getHarfbuzz(): { module: HarfbuzzModule; exports: HarfbuzzExports } {
  if (!harfbuzzModule) throw new Error("HarfBuzz text shaper is not loaded");
  return { module: harfbuzzModule, exports: harfbuzzModule.wasmExports };
}

async function loadHarfbuzzModule(): Promise<HarfbuzzModule> {
  if (harfbuzzModule) return harfbuzzModule;
  harfbuzzPromise ??= (async () => {
    const response = await fetch(harfbuzzWasmUrl);
    if (!response.ok) throw new Error("Could not load HarfBuzz text WASM");
    const wasmBinary = new Uint8Array(await response.arrayBuffer());
    const module = await createHarfBuzz({
      wasmBinary,
      locateFile: () => harfbuzzWasmUrl
    }) as HarfbuzzModule;
    harfbuzzModule = module;
    return module;
  })();
  return harfbuzzPromise;
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
