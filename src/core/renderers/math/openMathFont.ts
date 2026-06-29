import latinModernMathUrl from "../../../assets/fonts/latinmodern-math.otf?url";

export const openMathFontFamily = "Latin Modern Math";
export const openMathFontStack = `${openMathFontFamily}, serif`;
export const openMathFontUrl = latinModernMathUrl;

export function openMathFontFaceCss(): string {
  return `@font-face{font-family:"${openMathFontFamily}";src:url("${latinModernMathUrl}") format("opentype");font-weight:400;font-style:normal;font-display:block;}`;
}
