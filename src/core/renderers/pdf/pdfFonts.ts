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
import { openMathFontProfiles, openMathFontUrl } from "../math/openMathFont";
import {
  latinModernRomanFontFamily,
  latinModernRomanFontUrls,
  libertinusSerifFontFamily,
  libertinusSerifFontUrls,
  newComputerModernFontFamily,
  newComputerModernFontUrls
} from "../text/latinModernRomanFont";

type TextObject = Extract<DisplayObject, { type: "text" }>;

export type PdfFontSet = {
  regular: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
  boldItalic: PDFFont;
  mono: PDFFont;
  openMath?: PDFFont;
  openMathLibertinus?: PDFFont;
  openMathNewComputerModern?: PDFFont;
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
  newComputerModern?: {
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

  const [tex, openMath, openMathLibertinus, openMathNewComputerModern, latinModernRoman, libertinusSerif, newComputerModern] = await Promise.all([
    loadTexFonts(pdf),
    loadOpenMathFont(pdf),
    loadOpenMathFont(pdf, openMathFontProfiles.libertinus.url),
    loadOpenMathFont(pdf, openMathFontProfiles["new-computer-modern"].url),
    loadLatinModernRomanFonts(pdf),
    loadLibertinusSerifFonts(pdf),
    loadNewComputerModernFonts(pdf)
  ]);
  return { regular, bold, italic, boldItalic, mono, tex, openMath, openMathLibertinus, openMathNewComputerModern, latinModernRoman, libertinusSerif, newComputerModern };
}

export function selectPdfTextFont(object: TextObject, fonts: PdfFontSet): PDFFont {
  if (object.fontFamily.includes("Consolas") || object.fontFamily.includes("Monaco")) return fonts.mono;
  const family = isLatinModernRomanFont(object.fontFamily) && fonts.latinModernRoman
    ? fonts.latinModernRoman
    : isLibertinusSerifFont(object.fontFamily) && fonts.libertinusSerif
      ? fonts.libertinusSerif
    : isNewComputerModernFont(object.fontFamily) && fonts.newComputerModern
      ? fonts.newComputerModern
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
  if (fonts.openMathLibertinus && fonts.openMathLibertinus !== selected) fallbacks.push(fonts.openMathLibertinus);
  if (fonts.openMathNewComputerModern && fonts.openMathNewComputerModern !== selected) fallbacks.push(fonts.openMathNewComputerModern);

  return fallbacks;
}

function isLatinModernRomanFont(fontFamily: string): boolean {
  return fontFamily.includes(latinModernRomanFontFamily);
}

function isLibertinusSerifFont(fontFamily: string): boolean {
  return fontFamily.includes(libertinusSerifFontFamily);
}

function isNewComputerModernFont(fontFamily: string): boolean {
  return fontFamily.includes(newComputerModernFontFamily);
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

async function loadOpenMathFont(pdf: PDFDocument, url = openMathFontUrl): Promise<PDFFont | undefined> {
  try {
    pdf.registerFontkit(fontkit);
    return await embedCustomFont(pdf, url);
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

async function loadLibertinusSerifFonts(pdf: PDFDocument): Promise<PdfFontSet["libertinusSerif"]> {
  try {
    pdf.registerFontkit(fontkit);
    const [regular, bold, italic, boldItalic] = await Promise.all([
      embedCustomFont(pdf, libertinusSerifFontUrls.regular),
      embedCustomFont(pdf, libertinusSerifFontUrls.bold),
      embedCustomFont(pdf, libertinusSerifFontUrls.italic),
      embedCustomFont(pdf, libertinusSerifFontUrls.boldItalic)
    ]);
    return { regular, bold, italic, boldItalic };
  } catch {
    return undefined;
  }
}

async function loadNewComputerModernFonts(pdf: PDFDocument): Promise<PdfFontSet["newComputerModern"]> {
  try {
    pdf.registerFontkit(fontkit);
    const [regular, bold, italic, boldItalic] = await Promise.all([
      embedCustomFont(pdf, newComputerModernFontUrls.regular),
      embedCustomFont(pdf, newComputerModernFontUrls.bold),
      embedCustomFont(pdf, newComputerModernFontUrls.italic),
      embedCustomFont(pdf, newComputerModernFontUrls.boldItalic)
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
