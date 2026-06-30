import latinModernRomanBoldItalicUrl from "../../../assets/fonts/lmroman10-bolditalic.otf?url";
import latinModernRomanBoldUrl from "../../../assets/fonts/lmroman10-bold.otf?url";
import latinModernRomanItalicUrl from "../../../assets/fonts/lmroman10-italic.otf?url";
import latinModernRomanRegularUrl from "../../../assets/fonts/lmroman10-regular.otf?url";
import libertinusSerifBoldItalicUrl from "../../../assets/fonts/libertinus-serif-bolditalic.otf?url";
import libertinusSerifBoldUrl from "../../../assets/fonts/libertinus-serif-bold.otf?url";
import libertinusSerifItalicUrl from "../../../assets/fonts/libertinus-serif-italic.otf?url";
import libertinusSerifRegularUrl from "../../../assets/fonts/libertinus-serif-regular.otf?url";
import newComputerModernBoldItalicUrl from "../../../assets/fonts/newcm10-bolditalic.otf?url";
import newComputerModernBoldUrl from "../../../assets/fonts/newcm10-bold.otf?url";
import newComputerModernItalicUrl from "../../../assets/fonts/newcm10-italic.otf?url";
import newComputerModernRegularUrl from "../../../assets/fonts/newcm10-regular.otf?url";
import type { OpenMathFontProfileName } from "../math/openMathFont";

export const latinModernRomanFontFamily = "Latin Modern Roman";
export const latinModernRomanFontStack = `"${latinModernRomanFontFamily}", "Times New Roman", serif`;
export const libertinusSerifFontFamily = "Libertinus Serif";
export const libertinusSerifFontStack = `"${libertinusSerifFontFamily}", "Times New Roman", serif`;
export const newComputerModernFontFamily = "New Computer Modern";
export const newComputerModernFontStack = `"${newComputerModernFontFamily}", "Times New Roman", serif`;

export const latinModernRomanFontUrls = {
  regular: latinModernRomanRegularUrl,
  bold: latinModernRomanBoldUrl,
  italic: latinModernRomanItalicUrl,
  boldItalic: latinModernRomanBoldItalicUrl
};

export const libertinusSerifFontUrls = {
  regular: libertinusSerifRegularUrl,
  bold: libertinusSerifBoldUrl,
  italic: libertinusSerifItalicUrl,
  boldItalic: libertinusSerifBoldItalicUrl
};

export const newComputerModernFontUrls = {
  regular: newComputerModernRegularUrl,
  bold: newComputerModernBoldUrl,
  italic: newComputerModernItalicUrl,
  boldItalic: newComputerModernBoldItalicUrl
};

export function openMathTextFontFamily(profileName: OpenMathFontProfileName): string {
  if (profileName === "new-computer-modern") return newComputerModernFontFamily;
  return profileName === "libertinus" ? libertinusSerifFontFamily : latinModernRomanFontFamily;
}

export function openMathTextFontStack(profileName: OpenMathFontProfileName): string {
  if (profileName === "new-computer-modern") return newComputerModernFontStack;
  return profileName === "libertinus" ? libertinusSerifFontStack : latinModernRomanFontStack;
}

export function openMathTextFontFaceCss(profileName: OpenMathFontProfileName): string {
  if (profileName === "new-computer-modern") return newComputerModernFontFaceCss();
  return profileName === "libertinus" ? libertinusSerifFontFaceCss() : latinModernRomanFontFaceCss();
}

export function latinModernRomanFontFaceCss(): string {
  return [
    fontFace(latinModernRomanFontFamily, latinModernRomanRegularUrl, 400, "normal"),
    fontFace(latinModernRomanFontFamily, latinModernRomanBoldUrl, 700, "normal"),
    fontFace(latinModernRomanFontFamily, latinModernRomanItalicUrl, 400, "italic"),
    fontFace(latinModernRomanFontFamily, latinModernRomanBoldItalicUrl, 700, "italic")
  ].join("");
}

export function libertinusSerifFontFaceCss(): string {
  return [
    fontFace(libertinusSerifFontFamily, libertinusSerifRegularUrl, 400, "normal"),
    fontFace(libertinusSerifFontFamily, libertinusSerifBoldUrl, 700, "normal"),
    fontFace(libertinusSerifFontFamily, libertinusSerifItalicUrl, 400, "italic"),
    fontFace(libertinusSerifFontFamily, libertinusSerifBoldItalicUrl, 700, "italic")
  ].join("");
}

export function newComputerModernFontFaceCss(): string {
  return [
    fontFace(newComputerModernFontFamily, newComputerModernRegularUrl, 400, "normal"),
    fontFace(newComputerModernFontFamily, newComputerModernBoldUrl, 700, "normal"),
    fontFace(newComputerModernFontFamily, newComputerModernItalicUrl, 400, "italic"),
    fontFace(newComputerModernFontFamily, newComputerModernBoldItalicUrl, 700, "italic")
  ].join("");
}

function fontFace(family: string, url: string, weight: number, style: "normal" | "italic"): string {
  return `@font-face{font-family:"${family}";src:url("${url}") format("opentype");font-weight:${weight};font-style:${style};font-display:block;}`;
}
