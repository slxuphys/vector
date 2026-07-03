import {
  buildGraphDisplayList,
  buildPlotDisplayList,
  graphSXDocumentSummary,
  parseGraphSXDocument,
  type GraphSXDisplayList
} from "@slxu/graphsx";
import { escapeXml } from "../../utils/sanitize";
import { defaultTheme } from "../../theme/defaultTheme";
import type { DocumentTheme } from "../../theme/themeTypes";
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

export function renderGraphSX(source: string, theme: DocumentTheme = defaultTheme): GraphSXArtifact {
  try {
    const model = parseGraphSXDocument(source);
    const defaults = graphSXDefaults(theme);
    const displayList = model.type === "graph"
      ? buildGraphDisplayList(model, {
          minWidth: 0,
          minHeight: 0,
          viewportPadding: 24,
          defaults
        })
      : buildPlotDisplayList(model, {
          minWidth: 0,
          minHeight: 0,
          defaults
        });
    if (typeof console !== "undefined") {
      console.log("[graphsx-display-list]", {
        type: displayList.type,
        width: displayList.width,
        height: displayList.height,
        summary: graphSXDocumentSummary(model).text,
        displayList
      });
    }
    const svg = renderGraphSXDisplayListToSvg(displayList);
    return {
      svg,
      svgBody: renderGraphSXDisplayListBody(displayList),
      viewBox: `0 0 ${displayList.width} ${displayList.height}`,
      width: displayList.width,
      height: displayList.height,
      summary: graphSXDocumentSummary(model).text,
      displayList
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not render GraphSX block";
    return errorGraphSXArtifact(message);
  }
}

function graphSXDefaults(theme: DocumentTheme): Record<string, unknown> {
  return {
    text: {
      fontFamily: theme.fontFamily,
      fontSize: theme.fontSize,
      fill: theme.text
    },
    math: {
      fontSize: theme.fontSize,
      fill: theme.text,
      profile: "openmath"
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
