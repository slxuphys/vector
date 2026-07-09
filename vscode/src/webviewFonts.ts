import {
  latinModernRomanFontFaceCss,
  libertinusSerifFontFaceCss,
  newComputerModernFontFaceCss
} from "../../src/core/renderers/text/latinModernRomanFont";
import { openMathFontFaceCss } from "../../src/core/renderers/math/openMathFont";

export const vectorWebviewFontCss = [
  latinModernRomanFontFaceCss(),
  libertinusSerifFontFaceCss(),
  newComputerModernFontFaceCss(),
  openMathFontFaceCss("latin-modern"),
  openMathFontFaceCss("libertinus"),
  openMathFontFaceCss("new-computer-modern")
].join("");
