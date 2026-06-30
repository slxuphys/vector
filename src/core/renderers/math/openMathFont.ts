import latinModernMathUrl from "../../../assets/fonts/latinmodern-math.otf?url";
import libertinusMathUrl from "../../../assets/fonts/libertinus-math.otf?url";
import newComputerModernMathUrl from "../../../assets/fonts/newcm-math.otf?url";

export type OpenMathFontProfileName = "latin-modern" | "libertinus" | "new-computer-modern";

export type OpenMathFontProfile = {
  name: OpenMathFontProfileName;
  family: string;
  stack: string;
  url: string;
  role: "openMath" | "openMathLibertinus" | "openMathNewComputerModern";
};

export const openMathFontProfiles: Record<OpenMathFontProfileName, OpenMathFontProfile> = {
  "latin-modern": {
    name: "latin-modern",
    family: "Latin Modern Math",
    stack: "Latin Modern Math, serif",
    url: latinModernMathUrl,
    role: "openMath"
  },
  libertinus: {
    name: "libertinus",
    family: "Libertinus Math",
    stack: "Libertinus Math, serif",
    url: libertinusMathUrl,
    role: "openMathLibertinus"
  },
  "new-computer-modern": {
    name: "new-computer-modern",
    family: "New Computer Modern Math",
    stack: "New Computer Modern Math, serif",
    url: newComputerModernMathUrl,
    role: "openMathNewComputerModern"
  }
};

export const openMathFontFamily = openMathFontProfiles["latin-modern"].family;
export const openMathFontStack = openMathFontProfiles["latin-modern"].stack;
export const openMathFontUrl = openMathFontProfiles["latin-modern"].url;

export function getOpenMathFontProfile(name: OpenMathFontProfileName = "latin-modern"): OpenMathFontProfile {
  return openMathFontProfiles[name] ?? openMathFontProfiles["latin-modern"];
}

export function isOpenMathFontProfileName(value: string | undefined): value is OpenMathFontProfileName {
  return value === "latin-modern" || value === "libertinus" || value === "new-computer-modern";
}

export function openMathFontFaceCss(name: OpenMathFontProfileName = "latin-modern"): string {
  const profile = getOpenMathFontProfile(name);
  return `@font-face{font-family:"${profile.family}";src:url("${profile.url}") format("opentype");font-weight:400;font-style:normal;font-display:block;}`;
}
