import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, PDFFont, StandardFonts } from "pdf-lib";
import type { DisplayObject } from "../../display-list/displayTypes";
import katexMainBoldUrl from "katex/dist/fonts/KaTeX_Main-Bold.ttf?url";
import katexMainBoldItalicUrl from "katex/dist/fonts/KaTeX_Main-BoldItalic.ttf?url";
import katexMainItalicUrl from "katex/dist/fonts/KaTeX_Main-Italic.ttf?url";
import katexMainRegularUrl from "katex/dist/fonts/KaTeX_Main-Regular.ttf?url";
import katexMathItalicUrl from "katex/dist/fonts/KaTeX_Math-Italic.ttf?url";
import katexSize1RegularUrl from "katex/dist/fonts/KaTeX_Size1-Regular.ttf?url";
import katexSize2RegularUrl from "katex/dist/fonts/KaTeX_Size2-Regular.ttf?url";
import katexSize3RegularUrl from "katex/dist/fonts/KaTeX_Size3-Regular.ttf?url";
import katexSize4RegularUrl from "katex/dist/fonts/KaTeX_Size4-Regular.ttf?url";
import { openMathFontUrl } from "../math/openMathFont";
import { latinModernRomanFontFamily, latinModernRomanFontUrls } from "../text/latinModernRomanFont";

type TextObject = Extract<DisplayObject, { type: "text" }>;

export type PdfFontSet = {
  regular: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
  boldItalic: PDFFont;
  mono: PDFFont;
  openMath?: PDFFont;
  latinModernRoman?: {
    regular: PDFFont;
    bold: PDFFont;
    italic: PDFFont;
    boldItalic: PDFFont;
  };
  tex?: {
    regular: PDFFont;
    bold: PDFFont;
    italic: PDFFont;
    boldItalic: PDFFont;
    mathItalic?: PDFFont;
    size1?: PDFFont;
    size2?: PDFFont;
    size3?: PDFFont;
    size4?: PDFFont;
  };
};

const fontBytesCache = new Map<string, Uint8Array>();

export async function loadPdfFonts(pdf: PDFDocument): Promise<PdfFontSet> {
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);
  const boldItalic = await pdf.embedFont(StandardFonts.HelveticaBoldOblique);
  const mono = await pdf.embedFont(StandardFonts.Courier);

  const [tex, openMath, latinModernRoman] = await Promise.all([
    loadTexFonts(pdf),
    loadOpenMathFont(pdf),
    loadLatinModernRomanFonts(pdf)
  ]);
  return { regular, bold, italic, boldItalic, mono, tex, openMath, latinModernRoman };
}

export function selectPdfTextFont(object: TextObject, fonts: PdfFontSet): PDFFont {
  if (object.fontFamily.includes("Consolas") || object.fontFamily.includes("Monaco")) return fonts.mono;
  const family = isLatinModernRomanFont(object.fontFamily) && fonts.latinModernRoman
    ? fonts.latinModernRoman
    : isTexFont(object.fontFamily) && fonts.tex
      ? fonts.tex
      : fonts;
  if (object.bold && object.italic) return family.boldItalic;
  if (object.bold) return family.bold;
  if (object.italic) return family.italic;
  return family.regular;
}

export function selectPdfTextFontFallbacks(object: TextObject, fonts: PdfFontSet): PDFFont[] {
  const selected = selectPdfTextFont(object, fonts);
  const fallbacks = [selected];

  if (fonts.tex) {
    const texFont = selectTexTextFont(object, fonts.tex);
    if (texFont !== selected) fallbacks.push(texFont);
  }

  if (fonts.openMath && fonts.openMath !== selected) fallbacks.push(fonts.openMath);

  return fallbacks;
}

function isLatinModernRomanFont(fontFamily: string): boolean {
  return fontFamily.includes(latinModernRomanFontFamily);
}

function isTexFont(fontFamily: string): boolean {
  return fontFamily.includes("KaTeX_Main");
}

function selectTexTextFont(object: TextObject, fonts: NonNullable<PdfFontSet["tex"]>): PDFFont {
  if (object.bold && object.italic) return fonts.boldItalic;
  if (object.bold) return fonts.bold;
  if (object.italic) return fonts.italic;
  return fonts.regular;
}

async function loadTexFonts(pdf: PDFDocument): Promise<PdfFontSet["tex"]> {
  try {
    pdf.registerFontkit(fontkit);
    const [regular, bold, italic, boldItalic, mathItalic, size1, size2, size3, size4] = await Promise.all([
      embedCustomFont(pdf, katexMainRegularUrl),
      embedCustomFont(pdf, katexMainBoldUrl),
      embedCustomFont(pdf, katexMainItalicUrl),
      embedCustomFont(pdf, katexMainBoldItalicUrl),
      embedCustomFont(pdf, katexMathItalicUrl),
      embedCustomFont(pdf, katexSize1RegularUrl),
      embedCustomFont(pdf, katexSize2RegularUrl),
      embedCustomFont(pdf, katexSize3RegularUrl),
      embedCustomFont(pdf, katexSize4RegularUrl)
    ]);
    return { regular, bold, italic, boldItalic, mathItalic, size1, size2, size3, size4 };
  } catch {
    return undefined;
  }
}

async function loadOpenMathFont(pdf: PDFDocument): Promise<PDFFont | undefined> {
  try {
    pdf.registerFontkit(fontkit);
    return await embedCustomFont(pdf, openMathFontUrl);
  } catch {
    return undefined;
  }
}

async function loadLatinModernRomanFonts(pdf: PDFDocument): Promise<PdfFontSet["latinModernRoman"]> {
  try {
    pdf.registerFontkit(fontkit);
    const [regular, bold, italic, boldItalic] = await Promise.all([
      embedCustomFont(pdf, latinModernRomanFontUrls.regular),
      embedCustomFont(pdf, latinModernRomanFontUrls.bold),
      embedCustomFont(pdf, latinModernRomanFontUrls.italic),
      embedCustomFont(pdf, latinModernRomanFontUrls.boldItalic)
    ]);
    return { regular, bold, italic, boldItalic };
  } catch {
    return undefined;
  }
}

async function embedCustomFont(pdf: PDFDocument, url: string): Promise<PDFFont> {
  const bytes = await loadFontBytes(url);
  return pdf.embedFont(bytes);
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
