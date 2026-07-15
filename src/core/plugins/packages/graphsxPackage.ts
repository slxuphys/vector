import { parseImageAttributes } from "../../markdown/parseImage";
import type { GraphSXNode } from "../../markdown/markdownTypes";
import type { VectorPlugin } from "../pluginTypes";
import type { VectorPluginDocumentContext } from "../pluginDocumentContext";

const graphsxPluginName = "@vector/graphsx";

type GraphSXLatexState = {
  tikzDefinitions: string[];
};

export const graphsxPackage: VectorPlugin = {
  name: graphsxPluginName,
  markdown: {
    fences: {
      graphsx: ({ info, source, sourceSpan }) => ({
        type: "graphsx",
        source,
        ...parseGraphSXFenceInfo(info),
        sourceSpan
      })
    }
  },
  latex: {
    commands: {
      tikzset: {
        arguments: ["required"],
        modes: ["preamble", "vertical"],
        transparent: true,
        handler: ({ source, document }) => {
          tikzState(document).tikzDefinitions.push(source);
          return [];
        }
      }
    },
    environments: {
      tikzpicture: ({ source, mode, document }) => mode === "vertical"
        ? [{
            type: "graphsx",
            syntax: "tikz",
            source: effectiveTikzSource(source, document),
            align: "center"
          }]
        : undefined
    },
    transformMath: ({ source, document }) => injectTikzDefinitions(source, tikzState(document).tikzDefinitions)
  },
  ast: {
    normalizers: {
      graphsx: (node) => node.type === "graphsx"
        ? {
            type: "graphsx",
            syntax: node.syntax,
            source: node.source,
            caption: node.caption,
            width: node.width,
            align: node.align,
            label: node.label,
            labelNumber: node.labelNumber,
            sourceSpan: node.sourceSpan
          }
        : undefined
    }
  }
};

function tikzState(document: VectorPluginDocumentContext): GraphSXLatexState {
  return document.getState(graphsxPluginName, () => ({ tikzDefinitions: [] }));
}

function effectiveTikzSource(source: string, document: VectorPluginDocumentContext): string {
  const definitions = tikzState(document).tikzDefinitions;
  return definitions.length ? `${definitions.join("\n")}\n${source}` : source;
}

function injectTikzDefinitions(source: string, definitions: string[]): string {
  if (!definitions.length || !source.includes("\\begin{tikzpicture}")) return source;
  const prefix = `\n${definitions.join("\n")}\n`;
  return source.replace(
    /\\begin\{tikzpicture\}(\s*\[[^\]]*])?/g,
    (begin) => `${begin}${prefix}`
  );
}

function parseGraphSXFenceInfo(info: string): Pick<GraphSXNode, "caption" | "width" | "align" | "label"> {
  if (!info.trim()) return {};
  const body = info.trim().startsWith("{") ? info.trim() : `{${info.trim()}}`;
  const attrs = parseImageAttributes(body);
  const captionMatch = info.match(/(?:^|\s)caption=("([^"]*)"|'([^']*)'|[^\s]+)/);
  const caption = captionMatch?.[2] ?? captionMatch?.[3] ?? captionMatch?.[1]?.replace(/^["']|["']$/g, "");
  return { caption, width: attrs.width, align: attrs.align, label: attrs.label };
}
