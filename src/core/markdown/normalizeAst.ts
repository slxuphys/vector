import { flattenInline, type LayoutBlock } from "../layout/layoutBlocks";
import type { MarkdownAst } from "./markdownTypes";

export function normalizeAst(ast: MarkdownAst): LayoutBlock[] {
  return ast.children.map((node): LayoutBlock => {
    switch (node.type) {
      case "heading":
        return { type: "heading", level: node.level, runs: flattenInline(node.children) };
      case "paragraph":
        return { type: "paragraph", runs: flattenInline(node.children) };
      case "list":
        return {
          type: "list",
          ordered: node.ordered,
          checked: node.checked,
          items: node.items.map((item) => flattenInline(item))
        };
      case "codeBlock":
        return { type: "code", language: node.language, code: node.code };
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
          align: node.align
        };
      case "image":
        return {
          type: "image",
          src: node.src,
          alt: node.alt,
          caption: node.caption,
          width: node.width,
          height: node.height,
          align: node.align
        };
      case "mathBlock":
        return { type: "math", text: node.text };
      case "thematicBreak":
        return { type: "rule" };
      case "pageBreak":
        return { type: "pageBreak" };
    }
  });
}
