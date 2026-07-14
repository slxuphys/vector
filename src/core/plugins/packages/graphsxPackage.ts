import { parseImageAttributes } from "../../markdown/parseImage";
import type { GraphSXNode } from "../../markdown/markdownTypes";
import type { VectorPlugin } from "../pluginTypes";

export const graphsxPackage: VectorPlugin = {
  name: "@vector/graphsx",
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
    environments: {
      tikzpicture: ({ source, mode }) => mode === "vertical"
        ? [{ type: "graphsx", syntax: "tikz", source, align: "center" }]
        : undefined
    }
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

function parseGraphSXFenceInfo(info: string): Pick<GraphSXNode, "caption" | "width" | "align" | "label"> {
  if (!info.trim()) return {};
  const body = info.trim().startsWith("{") ? info.trim() : `{${info.trim()}}`;
  const attrs = parseImageAttributes(body);
  const captionMatch = info.match(/(?:^|\s)caption=("([^"]*)"|'([^']*)'|[^\s]+)/);
  const caption = captionMatch?.[2] ?? captionMatch?.[3] ?? captionMatch?.[1]?.replace(/^["']|["']$/g, "");
  return { caption, width: attrs.width, align: attrs.align, label: attrs.label };
}
