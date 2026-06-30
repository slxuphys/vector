import latinModernRomanBoldItalicUrl from "../../../assets/fonts/lmroman10-bolditalic.otf?url";
import latinModernRomanBoldUrl from "../../../assets/fonts/lmroman10-bold.otf?url";
import latinModernRomanItalicUrl from "../../../assets/fonts/lmroman10-italic.otf?url";
import latinModernRomanRegularUrl from "../../../assets/fonts/lmroman10-regular.otf?url";

export const latinModernRomanFontFamily = "Latin Modern Roman";
export const latinModernRomanFontStack = `"${latinModernRomanFontFamily}", "Times New Roman", serif`;

export const latinModernRomanFontUrls = {
  regular: latinModernRomanRegularUrl,
  bold: latinModernRomanBoldUrl,
  italic: latinModernRomanItalicUrl,
  boldItalic: latinModernRomanBoldItalicUrl
};

export function latinModernRomanFontFaceCss(): string {
  return [
    fontFace(latinModernRomanRegularUrl, 400, "normal"),
    fontFace(latinModernRomanBoldUrl, 700, "normal"),
    fontFace(latinModernRomanItalicUrl, 400, "italic"),
    fontFace(latinModernRomanBoldItalicUrl, 700, "italic")
  ].join("");
}

function fontFace(url: string, weight: number, style: "normal" | "italic"): string {
  return `@font-face{font-family:"${latinModernRomanFontFamily}";src:url("${url}") format("opentype");font-weight:${weight};font-style:${style};font-display:block;}`;
}
