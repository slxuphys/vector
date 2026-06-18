import type { InlineNode } from "../markdown/markdownTypes";

export type InlineRun = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
  math?: boolean;
  link?: string;
};

export type LayoutBlock =
  | { type: "heading"; level: number; runs: InlineRun[] }
  | { type: "paragraph"; runs: InlineRun[] }
  | { type: "list"; ordered: boolean; items: InlineRun[][]; checked?: Array<boolean | undefined> }
  | { type: "code"; language?: string; code: string }
  | { type: "table"; headers: InlineRun[][]; rows: InlineRun[][][] }
  | { type: "math"; text: string }
  | { type: "rule" }
  | { type: "pageBreak" };

export function flattenInline(nodes: InlineNode[], inherited: Partial<InlineRun> = {}): InlineRun[] {
  return nodes.flatMap((node): InlineRun[] => {
    if (node.type === "text") return [{ ...inherited, text: node.text }];
    if (node.type === "code") return [{ ...inherited, text: node.text, code: true }];
    if (node.type === "math") return [{ ...inherited, text: node.text, math: true }];
    if (node.type === "strong") return flattenInline(node.children, { ...inherited, bold: true });
    if (node.type === "emphasis") return flattenInline(node.children, { ...inherited, italic: true });
    return flattenInline(node.children, { ...inherited, link: node.href });
  });
}
