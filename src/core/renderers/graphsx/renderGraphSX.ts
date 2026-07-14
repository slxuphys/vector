import {
  buildGraphDisplayList,
  buildPlotDisplayList,
  graphSXDocumentSummary,
  parseGraphSXDocument,
  type GraphSXDisplayList
} from "@slxu/graphsx";
import { buildTikzDisplayList, parseTikz, tikzSummary } from "@slxu/graphsx/tikz";
import { escapeXml } from "../../utils/sanitize";
import { cmToPt } from "../../utils/units";
import { isDebugLogEnabled } from "../../utils/debugSettings";
import { measureText as measureDocumentText } from "../../layout/measureText";
import { defaultTheme } from "../../theme/defaultTheme";
import type { DocumentTheme } from "../../theme/themeTypes";
import { getDefaultOpenMathMetricsForProfile, layoutNativeMath } from "../math/nativeMath";
import type { NativeMathFontProfileName } from "../math/nativeMathProfiles";
import { renderGraphSXDisplayListBody, renderGraphSXDisplayListToSvg } from "./renderGraphSXDisplayList";

export type GraphSXArtifact = {
  svg: string;
  svgBody: string;
  viewBox: string;
  width: number;
  height: number;
  summary: string;
  displayList: GraphSXDisplayList;
};

export function renderGraphSX(
  source: string,
  theme: DocumentTheme = defaultTheme,
  nativeMathProfile: NativeMathFontProfileName = "openmath",
  syntax: "graphsx" | "tikz" = "graphsx"
): GraphSXArtifact {
  try {
    const defaults = graphSXDefaults(theme, nativeMathProfile);
    if (typeof console !== "undefined" && isDebugLogEnabled("graph")) {
      console.log("[graphsx-defaults]", defaults);
    }
    const measure = graphSXMeasure(theme, nativeMathProfile);
    const model: any = syntax === "tikz"
      ? parseTikz(source, {
          defaults,
          units: {
            cm: cmToPt(1),
            pt: 1
          }
        })
      : parseGraphSXDocument(source);
    const displayList: GraphSXDisplayList = syntax === "tikz"
      ? buildTikzDisplayList(model, { minWidth: 0, minHeight: 0, viewportPadding: 0, defaults, ...measure })
      : model.type === "graph"
        ? buildGraphDisplayList(model, {
            minWidth: 0,
            minHeight: 0,
            viewportPadding: 0,
            defaults,
            ...measure
          })
        : buildPlotDisplayList(model, {
            minWidth: 0,
            minHeight: 0,
            defaults,
            ...measure
          });
    const summary = syntax === "tikz" ? tikzSummary(model).text : graphSXDocumentSummary(model).text;
    if (typeof console !== "undefined" && isDebugLogEnabled("graph")) {
      console.log("[graphsx-display-list]", {
        type: displayList.type,
        width: displayList.width,
        height: displayList.height,
        summary,
        displayList
      });
    }
    const svg = renderGraphSXDisplayListToSvg(displayList, nativeMathProfile);
    return {
      svg,
      svgBody: renderGraphSXDisplayListBody(displayList, nativeMathProfile),
      viewBox: `0 0 ${displayList.width} ${displayList.height}`,
      width: displayList.width,
      height: displayList.height,
      summary,
      displayList
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not render GraphSX block";
    return errorGraphSXArtifact(message);
  }
}

function graphSXMeasure(theme: DocumentTheme, nativeMathProfile: NativeMathFontProfileName) {
  const mathMetrics = getDefaultOpenMathMetricsForProfile(nativeMathProfile);
  return {
    measureMath(source: unknown, textStyle: Record<string, unknown> = {}) {
      const fontSize = positiveNumber(textStyle.fontSize, theme.fontSize);
      const layout = layoutNativeMath(String(source ?? ""), false, fontSize, mathMetrics, nativeMathProfile);
      return {
        width: layout.width,
        height: layout.height,
        baseline: layout.baseline
      };
    },
    measureText(text: unknown, textStyle: Record<string, unknown> = {}) {
      const fontSize = positiveNumber(textStyle.fontSize, theme.fontSize);
      const fontFamily = typeof textStyle.fontFamily === "string" ? textStyle.fontFamily : theme.fontFamily;
      return {
        width: measureDocumentText(String(text ?? ""), {
          fontSize,
          fontFamily,
          monoFontFamily: theme.monoFontFamily,
          bold: isBoldWeight(textStyle.fontWeight),
          italic: textStyle.fontStyle === "italic"
        }),
        height: fontSize * theme.lineHeight
      };
    }
  };
}

function positiveNumber(value: unknown, fallback: number): number {
  const number = Number.parseFloat(String(value ?? ""));
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function isBoldWeight(value: unknown): boolean {
  if (typeof value === "string" && value.toLowerCase() === "bold") return true;
  const weight = Number(value);
  return Number.isFinite(weight) && weight >= 600;
}

function graphSXDefaults(theme: DocumentTheme, nativeMathProfile: NativeMathFontProfileName): Record<string, unknown> {
  return {
    text: {
      fontFamily: theme.fontFamily,
      fontSize: theme.fontSize,
      fill: theme.text
    },
    math: {
      fontSize: theme.fontSize,
      fill: theme.text,
      profile: nativeMathProfile
    },
    graph: {
      labelFontSize: theme.fontSize * 1.33,
      portLabelFontSize: theme.fontSize * 0.92
    }
  };
}

function errorGraphSXArtifact(message: string): GraphSXArtifact {
  const width = 420;
  const height = 96;
  const body = [
    `<rect x="0" y="0" width="${width}" height="${height}" fill="#fff5f5" stroke="#f04438" stroke-width="1" rx="4" />`,
    `<text x="14" y="32" font-size="13" font-family="Arial, Helvetica, sans-serif" fill="#b42318">GraphSX error</text>`,
    `<text x="14" y="58" font-size="11" font-family="Arial, Helvetica, sans-serif" fill="#7a271a">${escapeXml(message)}</text>`
  ].join("");
  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`,
    svgBody: body,
    viewBox: `0 0 ${width} ${height}`,
    width,
    height,
    summary: `GraphSX error: ${message}`,
    displayList: {
      type: "graph",
      width,
      height,
      items: []
    }
  };
}
