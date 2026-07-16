import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, PDFFont, StandardFonts } from "pdf-lib";
import type { DisplayObject, PagedDisplayList } from "../../display-list/displayTypes";
import { debugLog, debugWarn, isDebugLogEnabled } from "../../utils/debugSettings";
import { openMathFontProfiles, openMathFontUrl } from "../math/openMathFont";
import {
  getDefaultOpenMathMetricsForProfile,
  layoutNativeMath,
  type NativeGlyph
} from "../math/nativeMath";
import type { NativeMathFontProfileName } from "../math/nativeMathProfiles";
import {
  latinModernRomanFontFamily,
  latinModernRomanFontUrls,
  libertinusSerifFontFamily,
  libertinusSerifFontUrls
} from "../text/latinModernRomanFont";
import { subsetFontWithHarfbuzz } from "./pdfFontSubset";

type TextObject = Extract<DisplayObject, { type: "text" }>;

export type PdfFontSet = {
  regular: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
  boldItalic: PDFFont;
  mono: PDFFont;
  openMath?: PDFFont;
  openMathLibertinus?: PDFFont;
  latinModernRoman?: {
    regular: PDFFont;
    bold: PDFFont;
    italic: PDFFont;
    boldItalic: PDFFont;
  };
  libertinusSerif?: {
    regular: PDFFont;
    bold: PDFFont;
    italic: PDFFont;
    boldItalic: PDFFont;
  };
};

const fontBytesCache = new Map<string, Uint8Array>();

type PdfFontUsage = {
  openMath: boolean;
  openMathLibertinus: boolean;
  latinModernRoman: boolean;
  libertinusSerif: boolean;
  subsetFontText: Map<string, string>;
};

type FontSubsetText = (url: string) => string | undefined;
type FontVariantUsed = (url: string) => boolean;

export async function loadPdfFonts(
  pdf: PDFDocument,
  layout?: PagedDisplayList,
  subsetCustomFonts = false
): Promise<PdfFontSet> {
  const usage = layout ? collectPdfFontUsage(layout) : allPdfFontUsage();
  const getSubsetText: FontSubsetText = (url) => subsetCustomFonts && isSubsettableCustomFontUrl(url) ? usage.subsetFontText.get(url) : undefined;
  const isVariantUsed: FontVariantUsed = (url) => layout ? usage.subsetFontText.has(url) : true;
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);
  const boldItalic = await pdf.embedFont(StandardFonts.HelveticaBoldOblique);
  const mono = await pdf.embedFont(StandardFonts.Courier);

  const [openMath, openMathLibertinus, latinModernRoman, libertinusSerif] = await Promise.all([
    usage.openMath ? loadOpenMathFont(pdf, openMathFontUrl, getSubsetText) : undefined,
    usage.openMathLibertinus ? loadOpenMathFont(pdf, openMathFontProfiles.libertinus.url, getSubsetText) : undefined,
    usage.latinModernRoman ? loadLatinModernRomanFonts(pdf, getSubsetText, isVariantUsed) : undefined,
    usage.libertinusSerif ? loadLibertinusSerifFonts(pdf, getSubsetText, isVariantUsed) : undefined
  ]);
  if (isDebugLogEnabled("pdf")) {
    debugLog("pdf", "[pdf-fonts]", {
      usage: {
        openMath: usage.openMath,
        openMathLibertinus: usage.openMathLibertinus,
        latinModernRoman: usage.latinModernRoman,
        libertinusSerif: usage.libertinusSerif
      },
      subsetFonts: Array.from(usage.subsetFontText, ([url, text]) => ({
        url,
        textLength: text.length
      })),
      loaded: {
        openMath: Boolean(openMath),
        openMathLibertinus: Boolean(openMathLibertinus),
        latinModernRoman: Boolean(latinModernRoman),
        libertinusSerif: Boolean(libertinusSerif)
      }
    });
  }
  return { regular, bold, italic, boldItalic, mono, openMath, openMathLibertinus, latinModernRoman, libertinusSerif };
}

export function selectPdfTextFont(object: TextObject, fonts: PdfFontSet): PDFFont {
  if (object.fontFamily.includes("Consolas") || object.fontFamily.includes("Monaco")) return fonts.mono;
  const family = isLatinModernRomanFont(object.fontFamily) && fonts.latinModernRoman
    ? fonts.latinModernRoman
    : isLibertinusSerifFont(object.fontFamily) && fonts.libertinusSerif
      ? fonts.libertinusSerif
    : fonts;
  if (object.bold && object.italic) return family.boldItalic;
  if (object.bold) return family.bold;
  if (object.italic) return family.italic;
  return family.regular;
}

export function selectPdfTextFontFallbacks(object: TextObject, fonts: PdfFontSet): PDFFont[] {
  const selected = selectPdfTextFont(object, fonts);
  const fallbacks = [selected];

  if (fonts.openMath && fonts.openMath !== selected) fallbacks.push(fonts.openMath);
  if (fonts.openMathLibertinus && fonts.openMathLibertinus !== selected) fallbacks.push(fonts.openMathLibertinus);

  return fallbacks;
}

function isLatinModernRomanFont(fontFamily: string): boolean {
  return fontFamily.includes(latinModernRomanFontFamily);
}

function isLibertinusSerifFont(fontFamily: string): boolean {
  return fontFamily.includes(libertinusSerifFontFamily);
}

async function loadOpenMathFont(pdf: PDFDocument, url = openMathFontUrl, getSubsetText: FontSubsetText): Promise<PDFFont | undefined> {
  try {
    pdf.registerFontkit(fontkit);
    return await embedCustomFont(pdf, url, getSubsetText);
  } catch {
    return undefined;
  }
}

async function loadLatinModernRomanFonts(pdf: PDFDocument, getSubsetText: FontSubsetText, isVariantUsed: FontVariantUsed): Promise<PdfFontSet["latinModernRoman"]> {
  try {
    pdf.registerFontkit(fontkit);
    return await loadVariantFonts(pdf, latinModernRomanFontUrls, getSubsetText, isVariantUsed);
  } catch {
    return undefined;
  }
}

async function loadLibertinusSerifFonts(pdf: PDFDocument, getSubsetText: FontSubsetText, isVariantUsed: FontVariantUsed): Promise<PdfFontSet["libertinusSerif"]> {
  try {
    pdf.registerFontkit(fontkit);
    return await loadVariantFonts(pdf, libertinusSerifFontUrls, getSubsetText, isVariantUsed);
  } catch {
    return undefined;
  }
}

async function loadVariantFonts(
  pdf: PDFDocument,
  urls: { regular: string; bold: string; italic: string; boldItalic: string },
  getSubsetText: FontSubsetText,
  isVariantUsed: FontVariantUsed
): Promise<NonNullable<PdfFontSet["latinModernRoman"]>> {
  const variants = {
    regular: isVariantUsed(urls.regular) ? await embedCustomFont(pdf, urls.regular, getSubsetText) : undefined,
    bold: isVariantUsed(urls.bold) ? await embedCustomFont(pdf, urls.bold, getSubsetText) : undefined,
    italic: isVariantUsed(urls.italic) ? await embedCustomFont(pdf, urls.italic, getSubsetText) : undefined,
    boldItalic: isVariantUsed(urls.boldItalic) ? await embedCustomFont(pdf, urls.boldItalic, getSubsetText) : undefined
  };
  const fallback = variants.regular ?? variants.bold ?? variants.italic ?? variants.boldItalic ?? await embedCustomFont(pdf, urls.regular, getSubsetText);
  return {
    regular: variants.regular ?? fallback,
    bold: variants.bold ?? fallback,
    italic: variants.italic ?? fallback,
    boldItalic: variants.boldItalic ?? fallback
  };
}

async function embedCustomFont(pdf: PDFDocument, url: string, getSubsetText: FontSubsetText): Promise<PDFFont> {
  const bytes = await loadFontBytes(url);
  const subsetText = getSubsetText(url);
  if (subsetText) {
    try {
      const subsetBytes = await createSubsetFont(bytes, subsetText);
      validatePdfLibEmbeddableFont(subsetBytes);
      if (isDebugLogEnabled("pdf")) {
        debugLog("pdf", "[pdf-font-subset]", {
          url,
          textLength: subsetText.length,
          originalBytes: bytes.byteLength,
          subsetBytes: subsetBytes.byteLength,
          embedded: subsetBytes.byteLength < bytes.byteLength ? "subset" : "full-sized-subset-output"
        });
      }
      return pdf.embedFont(subsetBytes, { subset: false });
    } catch (error) {
      if (isDebugLogEnabled("pdf")) {
        debugWarn("pdf", "[pdf-export] HarfBuzz font subsetting failed; embedding full font", {
          url,
          textLength: subsetText.length,
          originalBytes: bytes.byteLength,
          error
        });
      }
    }
  }
  return pdf.embedFont(bytes, { subset: false });
}

async function createSubsetFont(bytes: Uint8Array, text: string): Promise<Uint8Array> {
  return subsetFontWithHarfbuzz(bytes, text, { noLayoutClosure: true });
}

function validatePdfLibEmbeddableFont(bytes: Uint8Array): void {
  const font = fontkit.create(bytes) as {
    characterSet?: number[];
    glyphForCodePoint?: (codePoint: number) => unknown;
  };
  if (!font.characterSet || !font.glyphForCodePoint) return;
  for (const codePoint of font.characterSet) {
    if (!font.glyphForCodePoint(codePoint)) {
      throw new Error(`Subset font maps U+${codePoint.toString(16).toUpperCase()} to a missing glyph`);
    }
  }
}

async function loadFontBytes(url: string): Promise<Uint8Array> {
  const cached = fontBytesCache.get(url);
  if (cached) return cached;

  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load font: ${url}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  fontBytesCache.set(url, bytes);
  return bytes;
}

function isSubsettableCustomFontUrl(url: string): boolean {
  return subsettableCustomFontUrls.has(url);
}

const subsettableCustomFontUrls = new Set([
  openMathFontUrl,
  openMathFontProfiles.libertinus.url,
  latinModernRomanFontUrls.regular,
  latinModernRomanFontUrls.bold,
  latinModernRomanFontUrls.italic,
  latinModernRomanFontUrls.boldItalic,
  libertinusSerifFontUrls.regular,
  libertinusSerifFontUrls.bold,
  libertinusSerifFontUrls.italic,
  libertinusSerifFontUrls.boldItalic
]);

function collectPdfFontUsage(layout: PagedDisplayList): PdfFontUsage {
  const usage = emptyPdfFontUsage();
  for (const page of layout.pages) {
    for (const object of page.objects) collectObjectFontUsage(object, usage);
  }
  return usage;
}

function collectObjectFontUsage(object: DisplayObject, usage: PdfFontUsage): void {
  if (object.type === "text") {
    collectTextObjectFontUsage(object, usage);
    return;
  }

  if (object.type === "math") {
    collectOpenMathProfileUsage(object.nativeMathProfile, usage);
    collectNativeLayoutFontUsage(object.nativeLayout?.nodes, usage, object.nativeMathProfile);
    return;
  }

  if (object.type === "graphsx") {
    if (!object.displayList) return;
    collectGraphSXFontUsage(object.displayList, usage, object.nativeMathProfile);
  }
}

function collectTextFontUsage(fontFamily: string, usage: PdfFontUsage): void {
  if (isLatinModernRomanFont(fontFamily)) usage.latinModernRoman = true;
  if (isLibertinusSerifFont(fontFamily)) usage.libertinusSerif = true;
  collectOpenMathFamilyUsage(fontFamily, usage);
}

function collectTextObjectFontUsage(object: TextObject, usage: PdfFontUsage): void {
  collectTextFontUsage(object.fontFamily, usage);
  const url = textFontUrlForStyle(object.fontFamily, object.bold, object.italic);
  if (url) addSubsetText(usage, url, object.text);
}

function textFontUrlForStyle(fontFamily: string, bold?: boolean, italic?: boolean): string | undefined {
  const variant = bold && italic ? "boldItalic" : bold ? "bold" : italic ? "italic" : "regular";
  if (isLatinModernRomanFont(fontFamily)) return latinModernRomanFontUrls[variant];
  if (isLibertinusSerifFont(fontFamily)) return libertinusSerifFontUrls[variant];
  return undefined;
}

function collectNativeLayoutFontUsage(nodes: unknown[] | undefined, usage: PdfFontUsage, profile?: string): void {
  const openMathUrl = openMathFontUrlForProfile(profile);
  for (const node of nodes ?? []) {
    if (node && typeof node === "object") {
      if ("type" in node && node.type === "graphsx" && "displayList" in node && node.displayList) {
        collectGraphSXFontUsage(
          node.displayList as Record<string, any>,
          usage,
          (profile as NativeMathFontProfileName | undefined) ?? "openmath"
        );
      }
      if ("text" in node && typeof node.text === "string") {
        addSubsetText(usage, openMathUrl, node.text);
      }
    }
  }
}

function openMathFontUrlForProfile(profile: string | undefined): string {
  if (profile === "openmath-libertinus" || profile === "libertinus") return openMathFontProfiles.libertinus.url;
  return openMathFontUrl;
}

function collectGraphSXFontUsage(
  displayList: Record<string, any>,
  usage: PdfFontUsage,
  nativeMathProfile: NativeMathFontProfileName = "openmath"
): void {
  const visit = (item: Record<string, any> | undefined) => {
    if (!item) return;
    if (item.type === "math" || item.tag === "math") {
      collectOpenMathProfileUsage(nativeMathProfile, usage);
      collectGraphSXMathSubsetText(item, nativeMathProfile, usage);
    }
    const props = item.props ?? {};
    const style = item.style ?? {};
    const textStyle = item.textStyle ?? {};
    const fontFamily = props.fontFamily
      ?? props["font-family"]
      ?? style.fontFamily
      ?? style["font-family"]
      ?? textStyle.fontFamily
      ?? textStyle["font-family"];
    if (typeof fontFamily === "string") {
      collectTextFontUsage(fontFamily, usage);
      const fontWeight = String(props.fontWeight
        ?? props["font-weight"]
        ?? style.fontWeight
        ?? style["font-weight"]
        ?? textStyle.fontWeight
        ?? textStyle["font-weight"]
        ?? "");
      const fontStyle = String(props.fontStyle
        ?? props["font-style"]
        ?? style.fontStyle
        ?? style["font-style"]
        ?? textStyle.fontStyle
        ?? textStyle["font-style"]
        ?? "");
      const url = textFontUrlForStyle(fontFamily, fontWeight === "700" || fontWeight === "bold", fontStyle === "italic");
      const text = typeof props.text === "string"
        ? props.text
        : typeof item.text === "string"
          ? item.text
          : typeof props.label === "string"
            ? props.label
            : "";
      if (url && text) addSubsetText(usage, url, text);
    }
    for (const child of item.children ?? []) visit(child);
    if (item.displayList?.items) {
      collectGraphSXFontUsage(item.displayList, usage, nativeMathProfile);
    }
  };
  for (const item of displayList.items ?? []) visit(item);
}

function collectOpenMathProfileUsage(profile: string | undefined, usage: PdfFontUsage): void {
  if (profile === "openmath-libertinus" || profile === "libertinus") usage.openMathLibertinus = true;
  else usage.openMath = true;
}

function collectGraphSXMathSubsetText(
  item: Record<string, any>,
  nativeMathProfile: NativeMathFontProfileName,
  usage: PdfFontUsage
): void {
  const source = String(item.source ?? item.fallback ?? "");
  if (!source) return;
  const openMathUrl = openMathFontUrlForProfile(nativeMathProfile);
  const metrics = getDefaultOpenMathMetricsForProfile(nativeMathProfile);
  const fontSize = Number(item.fontSize);
  const layout = layoutNativeMath(source, false, Number.isFinite(fontSize) ? fontSize : 12, metrics, nativeMathProfile);
  for (const node of layout.nodes) {
    if (isNativeGlyphNode(node)) addSubsetText(usage, openMathUrl, node.text);
  }
}

function isNativeGlyphNode(node: unknown): node is NativeGlyph {
  return Boolean(node && typeof node === "object" && "type" in node && node.type === "glyph" && "text" in node && typeof node.text === "string");
}

function collectOpenMathFamilyUsage(fontFamily: string, usage: PdfFontUsage): void {
  if (fontFamily.includes(openMathFontProfiles.libertinus.family)) usage.openMathLibertinus = true;
  if (fontFamily.includes(getOpenMathFamily())) usage.openMath = true;
}

function getOpenMathFamily(): string {
  return openMathFontProfiles["latin-modern"].family;
}

function emptyPdfFontUsage(): PdfFontUsage {
  return {
    openMath: false,
    openMathLibertinus: false,
    latinModernRoman: false,
    libertinusSerif: false,
    subsetFontText: new Map()
  };
}

function allPdfFontUsage(): PdfFontUsage {
  return {
    openMath: true,
    openMathLibertinus: true,
    latinModernRoman: true,
    libertinusSerif: true,
    subsetFontText: new Map()
  };
}

function addSubsetText(usage: PdfFontUsage, url: string, text: string): void {
  usage.subsetFontText.set(url, `${usage.subsetFontText.get(url) ?? ""}${text}`);
}
