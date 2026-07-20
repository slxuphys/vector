import type { EngineOptions } from "../../../engine/engineTypes";
import { defaultLayoutConfig } from "../../../layout/layoutConfig";
import { getDefaultOpenMathMetricsForProfile } from "../../../renderers/math/nativeMath";
import { openMathTextFontFaceCss, openMathTextFontStack } from "../../../renderers/text/latinModernRomanFont";
import type { LatexDocumentClassContext, VectorPlugin } from "../../api";

export const latexDocumentClassesPackage: VectorPlugin = {
  metadata: {
    name: "@vector/latex-classes",
    version: "0.1.0",
    apiVersion: "1",
    dependencies: ["@vector/latex-core"],
    runtimes: ["browser", "node"]
  },
  latex: {
    documentClasses: {
      article: articleDefaults,
      "revtex4-2": revtexDefaults
    }
  }
};

function articleDefaults(context: LatexDocumentClassContext): EngineOptions {
  const options = normalizedOptions(context);
  const fontSize = latexFontSize(options);
  const nativeMathProfile = "openmath" as const;
  const date = context.preamble.date === undefined ? latexToday() : context.preamble.date || undefined;

  return {
    sourceFormat: "latex",
    pageSize: "letter",
    margin: { top: 72, right: 134, bottom: 72, left: 134 },
    mathRenderer: "native-openmath",
    nativeMathProfile,
    nativeMathMetrics: getDefaultOpenMathMetricsForProfile(nativeMathProfile),
    theme: {
      fontFamily: openMathTextFontStack("latin-modern"),
      fontFaceCss: openMathTextFontFaceCss("latin-modern"),
      fontSize,
      lineHeight: 1.2
    },
    layout: {
      textAlign: "justify",
      lineBreaking: { ...defaultLayoutConfig.lineBreaking, hyphenation: true },
      headingStyle: "default",
      columns: { count: options.has("twocolumn") ? 2 : 1, gap: 24 },
      paragraph: { ...defaultLayoutConfig.paragraph, indent: fontSize * 1.5 },
      headingFontSizes: {
        1: fontSize >= 12 ? 17.28 : 14.4,
        2: fontSize >= 12 ? 14.4 : 12,
        3: Math.max(fontSize, 12),
        4: fontSize,
        5: fontSize,
        6: fontSize
      }
    },
    document: {
      titleFromFirstHeading: false,
      title: context.preamble.title,
      titleFontSize: fontSize * 1.7,
      authors: context.preamble.authors,
      date,
      abstract: context.preamble.abstract,
      abstractTitle: "Abstract",
      titleStyle: "latex-article",
      numberSections: true,
      appendixStyle: "article"
    }
  };
}

function revtexDefaults(context: LatexDocumentClassContext): EngineOptions {
  const options = normalizedOptions(context);
  const fontSize = latexFontSize(options);
  const nativeMathProfile = "openmath" as const;

  return {
    sourceFormat: "latex",
    pageSize: "letter",
    margin: { top: 72, right: 72, bottom: 72, left: 72 },
    mathRenderer: "native-openmath",
    nativeMathProfile,
    nativeMathMetrics: getDefaultOpenMathMetricsForProfile(nativeMathProfile),
    theme: {
      fontFamily: openMathTextFontStack("latin-modern"),
      fontFaceCss: openMathTextFontFaceCss("latin-modern"),
      fontSize,
      lineHeight: 1.28
    },
    layout: {
      textAlign: "justify",
      lineBreaking: { ...defaultLayoutConfig.lineBreaking, hyphenation: true },
      headingStyle: "revtex",
      columns: { count: options.has("twocolumn") ? 2 : 1, gap: 24 },
      paragraph: {
        ...defaultLayoutConfig.paragraph,
        indent: fontSize * 1.5,
        suppressAfter: []
      },
      headingFontSizes: {
        1: fontSize * 1.2,
        2: fontSize * 1.05,
        3: fontSize,
        4: fontSize,
        5: fontSize,
        6: fontSize
      }
    },
    crossRef: {
      section: { captionFormat: "{number}.", referenceFormat: "{number}" },
      equation: { captionFormat: "({number})", referenceFormat: "({number})" },
      figure: { captionFormat: "FIG. {number}.", referenceFormat: "Fig. {number}" },
      table: { captionFormat: "TABLE {number}.", referenceFormat: "Table {number}" }
    },
    document: {
      titleFromFirstHeading: false,
      title: context.preamble.title,
      titleFontSize: fontSize * 1.18,
      authors: context.preamble.authors,
      date: context.preamble.date || undefined,
      abstract: context.preamble.abstract,
      abstractTitle: "",
      titleStyle: "revtex",
      numberSections: true,
      sectionNumberStyle: "revtex",
      appendixStyle: "revtex"
    }
  };
}

function normalizedOptions(context: LatexDocumentClassContext): Set<string> {
  return new Set(context.options.map((option) => option.toLowerCase()));
}

function latexFontSize(options: Set<string>): number {
  return options.has("12pt") ? 12 : options.has("11pt") ? 11 : 10;
}

function latexToday(): string {
  return new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}
