import { parseImageAttributes } from "../../../markdown/parseImage";
import type { ImageLength, MarkdownNode, PluginAstNode } from "../../../markdown/markdownTypes";
import { renderGraphSX } from "../../../renderers/graphsx/renderGraphSX";
import type { VectorPlugin, VectorPluginDocumentContext } from "../../api";

const graphsxPluginName = "@vector/graphsx";

type GraphSXLatexState = {
  tikzDefinitions: string[];
};

type GraphSXPluginData = {
  syntax?: "graphsx" | "tikz";
  source: string;
};

export const graphsxPackage: VectorPlugin = {
  metadata: {
    name: graphsxPluginName,
    version: "0.1.0",
    apiVersion: "1",
    runtimes: ["browser", "node"]
  },
  markdown: {
    fences: {
      graphsx: ({ info, source, sourceSpan }) => ({
        type: "plugin",
        plugin: graphsxPluginName,
        kind: "graph",
        role: "figure",
        data: { source } satisfies GraphSXPluginData,
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
            type: "plugin",
            plugin: graphsxPluginName,
            kind: "graph",
            role: "figure",
            data: {
              syntax: "tikz",
              source: effectiveTikzSource(source, document)
            } satisfies GraphSXPluginData,
            align: "center"
          }]
        : undefined
    },
    transformMath: ({ source, document }) => injectTikzDefinitions(source, tikzState(document).tikzDefinitions)
  },
  ast: {
    normalizers: {
      graph: (node) => isGraphSXNode(node)
        ? {
            type: "plugin",
            plugin: graphsxPluginName,
            kind: "graph",
            role: node.role,
            data: node.data,
            caption: node.caption,
            width: node.width,
            align: node.align,
            label: node.label,
            labelNumber: node.labelNumber,
            source: node.sourceSpan
          }
        : undefined
    }
  },
  layout: {
    handlers: {
      graph: (block, context) => {
        const data = graphData(block.data);
        const profile = context.nativeMathProfile ?? "openmath";
        const artifact = renderGraphSX(data.source, context.theme, profile, data.syntax ?? "graphsx");
        const requestedWidth = resolveLength(block.width, context.contentWidth);
        const width = requestedWidth === undefined ? artifact.width : Math.min(context.contentWidth, requestedWidth);
        const scale = artifact.width > 0 ? width / artifact.width : 1;
        const height = Math.max(1, artifact.height * scale);
        const warnings = requestedWidth === undefined && artifact.width > context.contentWidth
          ? [`GraphSX natural width ${formatNumber(artifact.width)} exceeds content width ${formatNumber(context.contentWidth)}. Add width=100% to fit.`]
          : [];
        return {
          width,
          height,
          align: block.align ?? "center",
          objects: [{
            type: "graphsx",
            source: data.source,
            svg: artifact.svg,
            svgBody: artifact.svgBody,
            viewBox: artifact.viewBox,
            summary: artifact.summary,
            displayList: artifact.displayList,
            nativeMathProfile: profile,
            x: 0,
            y: 0,
            width,
            height,
            warnings
          }]
        };
      }
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

function parseGraphSXFenceInfo(info: string): Pick<PluginAstNode, "caption" | "width" | "align" | "label"> {
  if (!info.trim()) return {};
  const body = info.trim().startsWith("{") ? info.trim() : `{${info.trim()}}`;
  const attrs = parseImageAttributes(body);
  const captionMatch = info.match(/(?:^|\s)caption=("([^"]*)"|'([^']*)'|[^\s]+)/);
  const caption = captionMatch?.[2] ?? captionMatch?.[3] ?? captionMatch?.[1]?.replace(/^["']|["']$/g, "");
  return { caption, width: attrs.width, align: attrs.align, label: attrs.label };
}

function isGraphSXNode(node: MarkdownNode): node is PluginAstNode {
  return node.type === "plugin" && node.plugin === graphsxPluginName && node.kind === "graph";
}

function graphData(data: unknown): GraphSXPluginData {
  if (!data || typeof data !== "object" || typeof (data as GraphSXPluginData).source !== "string") {
    throw new Error("GraphSX plugin nodes require a string source.");
  }
  return data as GraphSXPluginData;
}

function resolveLength(length: ImageLength | undefined, available: number): number | undefined {
  if (!length) return undefined;
  return length.unit === "percent" ? available * length.value / 100 : length.value;
}

function formatNumber(value: number): string {
  return Number(value.toFixed(1)).toString();
}
