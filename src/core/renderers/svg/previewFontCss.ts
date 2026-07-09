import { openMathFontFaceCss } from "../math/openMathFont";
import {
  latinModernRomanFontFaceCss,
  libertinusSerifFontFaceCss,
  newComputerModernFontFaceCss
} from "../text/latinModernRomanFont";

export function previewFontFaceCss(): string {
  return [
    latinModernRomanFontFaceCss(),
    libertinusSerifFontFaceCss(),
    newComputerModernFontFaceCss(),
    openMathFontFaceCss("latin-modern"),
    openMathFontFaceCss("libertinus"),
    openMathFontFaceCss("new-computer-modern")
  ].join("");
}
