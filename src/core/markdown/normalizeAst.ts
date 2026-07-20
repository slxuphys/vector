import { flattenInline, type LayoutBlock } from "../layout/layoutBlocks";
import type { MarkdownAst } from "./markdownTypes";
import { builtinPlugins } from "../plugins/builtin";
import type { VectorPluginRegistry } from "../plugins/api";

export function normalizeAst(ast: MarkdownAst, plugins: VectorPluginRegistry = builtinPlugins): LayoutBlock[] {
  return ast.children.flatMap((node): LayoutBlock[] => {
    if (node.type === "appendix") return [];
    const packageBlock = node.type === "plugin"
      ? plugins.astNormalizer(node.type, node.plugin, node.kind)?.(node)
      : plugins.astNormalizer(node.type)?.(node);
    if (packageBlock) return [packageBlock];
    switch (node.type) {
      case "heading":
        return [{
          type: "heading",
          level: node.level,
          runs: flattenInline(node.children),
          label: node.label,
          labelNumber: node.labelNumber,
          title: node.title,
          unnumbered: node.unnumbered,
          appendix: node.appendix,
          source: node.sourceSpan
        }];
      case "paragraph":
        return [{
          type: "paragraph",
          runs: flattenInline(node.children),
          continuation: node.continuation,
          source: node.sourceSpan
        }];
      case "list":
        return [{
          type: "list",
          ordered: node.ordered,
          checked: node.checked,
          items: node.items.map((item) => flattenInline(item)),
          source: node.sourceSpan
        }];
      case "referenceList":
        return [{
          type: "referenceList",
          entries: node.entries.map((entry) => ({
            key: entry.key,
            number: entry.number,
            runs: flattenInline(entry.children)
          })),
          source: node.sourceSpan
        }];
      case "codeBlock":
        return [{ type: "code", language: node.language, code: node.code, source: node.sourceSpan }];
      case "table":
        return [{
          type: "table",
          headers: node.headers.map((cell) => ({
            runs: flattenInline(cell.children),
            colSpan: cell.colSpan,
            rowSpan: cell.rowSpan
          })),
          rows: node.rows.map((row) => row.map((cell) => ({
            runs: flattenInline(cell.children),
            colSpan: cell.colSpan,
            rowSpan: cell.rowSpan
          }))),
          align: node.align,
          label: node.label,
          labelNumber: node.labelNumber,
          source: node.sourceSpan
        }];
      case "image":
        return [{
          type: "image",
          src: node.src,
          sources: node.sources,
          alt: node.alt,
          caption: node.caption,
          width: node.width,
          height: node.height,
          align: node.align,
          label: node.label,
          labelNumber: node.labelNumber,
          source: node.sourceSpan
        }];
      case "figure":
        return [{
          type: "figure",
          images: node.images.map((image) => ({ ...image })),
          caption: node.caption,
          align: node.align,
          label: node.label,
          labelNumber: node.labelNumber,
          source: node.sourceSpan
        }];
      case "plugin":
        throw new Error(`Plugin AST node "${node.plugin}:${node.kind}" has no registered normalizer.`);
      case "mathBlock":
        return [{ type: "math", text: node.text, label: node.label, labelNumber: node.labelNumber, source: node.sourceSpan }];
      case "thematicBreak":
        return [{ type: "rule", source: node.sourceSpan }];
      case "pageBreak":
        return [{ type: "pageBreak", source: node.sourceSpan }];
    }
  });
}
