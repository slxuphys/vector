import { flattenInline, type LayoutBlock } from "../layout/layoutBlocks";
import type { MarkdownAst } from "./markdownTypes";

export function normalizeAst(ast: MarkdownAst): LayoutBlock[] {
  return ast.children.map((node): LayoutBlock => {
    switch (node.type) {
      case "heading":
        return {
          type: "heading",
          level: node.level,
          runs: flattenInline(node.children),
          label: node.label,
          labelNumber: node.labelNumber,
          title: node.title,
          unnumbered: node.unnumbered,
          source: node.sourceSpan
        };
      case "paragraph":
        return { type: "paragraph", runs: flattenInline(node.children), source: node.sourceSpan };
      case "list":
        return {
          type: "list",
          ordered: node.ordered,
          checked: node.checked,
          items: node.items.map((item) => flattenInline(item)),
          source: node.sourceSpan
        };
      case "codeBlock":
        return { type: "code", language: node.language, code: node.code, source: node.sourceSpan };
      case "table":
        return {
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
        };
      case "image":
        return {
          type: "image",
          src: node.src,
          alt: node.alt,
          caption: node.caption,
          width: node.width,
          height: node.height,
          align: node.align,
          label: node.label,
          labelNumber: node.labelNumber,
          source: node.sourceSpan
        };
      case "graphsx":
        return {
          type: "graphsx",
          source: node.source,
          caption: node.caption,
          width: node.width,
          align: node.align,
          label: node.label,
          labelNumber: node.labelNumber,
          sourceSpan: node.sourceSpan
        };
      case "mathBlock":
        return { type: "math", text: node.text, label: node.label, labelNumber: node.labelNumber, source: node.sourceSpan };
      case "thematicBreak":
        return { type: "rule", source: node.sourceSpan };
      case "pageBreak":
        return { type: "pageBreak", source: node.sourceSpan };
      case "bibliography":
        return { type: "paragraph", runs: [], source: node.sourceSpan };
    }
  });
}
