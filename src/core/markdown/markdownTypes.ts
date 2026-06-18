export type InlineNode =
  | { type: "text"; text: string }
  | { type: "strong"; children: InlineNode[] }
  | { type: "emphasis"; children: InlineNode[] }
  | { type: "code"; text: string }
  | { type: "link"; href: string; children: InlineNode[] }
  | { type: "math"; text: string };

export type MarkdownNode =
  | { type: "heading"; level: number; children: InlineNode[] }
  | { type: "paragraph"; children: InlineNode[] }
  | { type: "list"; ordered: boolean; items: InlineNode[][]; checked?: Array<boolean | undefined> }
  | { type: "codeBlock"; language?: string; code: string }
  | { type: "table"; headers: InlineNode[][]; rows: InlineNode[][][] }
  | { type: "mathBlock"; text: string }
  | { type: "thematicBreak" }
  | { type: "pageBreak" };

export type MarkdownAst = {
  type: "document";
  children: MarkdownNode[];
};
