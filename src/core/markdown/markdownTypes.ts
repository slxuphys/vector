export type InlineNode =
  | { type: "text"; text: string }
  | { type: "strong"; children: InlineNode[] }
  | { type: "emphasis"; children: InlineNode[] }
  | { type: "code"; text: string }
  | { type: "link"; href: string; children: InlineNode[] }
  | { type: "math"; text: string };

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
  | ({ type: "heading"; level: number; children: InlineNode[]; title?: boolean } & LabeledNode)
  | { type: "paragraph"; children: InlineNode[] }
  | { type: "list"; ordered: boolean; items: InlineNode[][]; checked?: Array<boolean | undefined> }
  | { type: "codeBlock"; language?: string; code: string }
  | ({ type: "table"; headers: TableCellNode[]; rows: TableCellNode[][]; align: TableAlign[] } & LabeledNode)
  | ImageNode
  | GraphSXNode
  | ({ type: "mathBlock"; text: string } & LabeledNode)
  | { type: "thematicBreak" }
  | { type: "pageBreak" };

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
  source: string;
  caption?: string;
  width?: ImageLength;
  align?: ImageAlign;
} & LabeledNode;

export type MarkdownAst = {
  type: "document";
  children: MarkdownNode[];
};
