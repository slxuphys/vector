import { openMathFontFaceCss } from "../math/openMathFont";
import {
  latinModernRomanFontFaceCss,
  libertinusSerifFontFaceCss
} from "../text/latinModernRomanFont";

export function previewFontFaceCss(): string {
  return [
    latinModernRomanFontFaceCss(),
    libertinusSerifFontFaceCss(),
    openMathFontFaceCss("latin-modern"),
    openMathFontFaceCss("libertinus")
  ].join("");
}
