import type { SourceSpan } from "../source/sourceTypes";

type SourceMapped = { sourceSpan?: SourceSpan };

export type InlineNode =
  | { type: "text"; text: string; nonBreak?: boolean; color?: string }
  | { type: "strong"; children: InlineNode[] }
  | { type: "emphasis"; children: InlineNode[] }
  | { type: "code"; text: string }
  | { type: "link"; href: string; children: InlineNode[] }
  | { type: "math"; text: string }
  | import("../citations/citationTypes").CitationNode;

export type TableAlign = "left" | "center" | "right";
export type ImageAlign = "left" | "center" | "right";

export type ImageLength = {
  value: number;
  unit: "px" | "percent";
};

export type TableCellNode = {
  children: InlineNode[];
  colSpan: number;
  rowSpan: number;
};

export type LabeledNode = {
  label?: string;
  labelNumber?: string;
};

export type MarkdownNode =
  | (({ type: "heading"; level: number; children: InlineNode[]; title?: boolean; unnumbered?: boolean } & LabeledNode) & SourceMapped)
  | ({ type: "paragraph"; children: InlineNode[]; continuation?: boolean } & SourceMapped)
  | ({ type: "list"; ordered: boolean; items: InlineNode[][]; checked?: Array<boolean | undefined> } & SourceMapped)
  | ({ type: "codeBlock"; language?: string; code: string } & SourceMapped)
  | (({ type: "table"; headers: TableCellNode[]; rows: TableCellNode[][]; align: TableAlign[] } & LabeledNode) & SourceMapped)
  | (ImageNode & SourceMapped)
  | (GraphSXNode & SourceMapped)
  | (({ type: "mathBlock"; text: string } & LabeledNode) & SourceMapped)
  | ({ type: "bibliography" } & SourceMapped)
  | ({ type: "thematicBreak" } & SourceMapped)
  | ({ type: "pageBreak" } & SourceMapped);

export type ImageNode = {
  type: "image";
  src: string;
  alt: string;
  caption?: string;
  width?: ImageLength;
  height?: ImageLength;
  align?: ImageAlign;
} & LabeledNode;

export type GraphSXNode = {
  type: "graphsx";
  syntax?: "graphsx" | "tikz";
  source: string;
  caption?: string;
  width?: ImageLength;
  align?: ImageAlign;
} & LabeledNode;

export type MarkdownAst = {
  type: "document";
  children: MarkdownNode[];
};
