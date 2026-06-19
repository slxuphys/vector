import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, PDFFont, StandardFonts } from "pdf-lib";
import type { DisplayObject } from "../../display-list/displayTypes";
import katexMainBoldUrl from "katex/dist/fonts/KaTeX_Main-Bold.ttf?url";
import katexMainBoldItalicUrl from "katex/dist/fonts/KaTeX_Main-BoldItalic.ttf?url";
import katexMainItalicUrl from "katex/dist/fonts/KaTeX_Main-Italic.ttf?url";
import katexMainRegularUrl from "katex/dist/fonts/KaTeX_Main-Regular.ttf?url";

type TextObject = Extract<DisplayObject, { type: "text" }>;

export type PdfFontSet = {
  regular: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
  boldItalic: PDFFont;
  mono: PDFFont;
  tex?: {
    regular: PDFFont;
    bold: PDFFont;
    italic: PDFFont;
    boldItalic: PDFFont;
  };
};

const fontBytesCache = new Map<string, Uint8Array>();

export async function loadPdfFonts(pdf: PDFDocument): Promise<PdfFontSet> {
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);
  const boldItalic = await pdf.embedFont(StandardFonts.HelveticaBoldOblique);
  const mono = await pdf.embedFont(StandardFonts.Courier);

  const tex = await loadTexFonts(pdf);
  return { regular, bold, italic, boldItalic, mono, tex };
}

export function selectPdfTextFont(object: TextObject, fonts: PdfFontSet): PDFFont {
  if (object.fontFamily.includes("Consolas") || object.fontFamily.includes("Monaco")) return fonts.mono;
  const family = isTexFont(object.fontFamily) && fonts.tex ? fonts.tex : fonts;
  if (object.bold && object.italic) return family.boldItalic;
  if (object.bold) return family.bold;
  if (object.italic) return family.italic;
  return family.regular;
}

function isTexFont(fontFamily: string): boolean {
  return fontFamily.includes("KaTeX_Main");
}

async function loadTexFonts(pdf: PDFDocument): Promise<PdfFontSet["tex"]> {
  try {
    pdf.registerFontkit(fontkit);
    const [regular, bold, italic, boldItalic] = await Promise.all([
      embedCustomFont(pdf, katexMainRegularUrl),
      embedCustomFont(pdf, katexMainBoldUrl),
      embedCustomFont(pdf, katexMainItalicUrl),
      embedCustomFont(pdf, katexMainBoldItalicUrl)
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
