import type { SourceSpan } from "../source/sourceTypes";

type SourceMapped = { sourceSpan?: SourceSpan };

export type InlineNode =
  | { type: "text"; text: string; nonBreak?: boolean; color?: string }
  | { type: "strong"; children: InlineNode[] }
  | { type: "emphasis"; children: InlineNode[] }
  | { type: "code"; text: string }
  | { type: "link"; href: string; children: InlineNode[] }
  | { type: "math"; text: string }
  | InlinePluginNode;

export type InlinePluginNode = {
  type: "inlinePlugin";
  plugin: string;
  kind: string;
  data: unknown;
};

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
  | (({ type: "heading"; level: number; children: InlineNode[]; title?: boolean; unnumbered?: boolean; appendix?: boolean } & LabeledNode) & SourceMapped)
  | ({ type: "appendix" } & SourceMapped)
  | ({ type: "paragraph"; children: InlineNode[]; continuation?: boolean } & SourceMapped)
  | ({ type: "list"; ordered: boolean; items: InlineNode[][]; checked?: Array<boolean | undefined> } & SourceMapped)
  | ({ type: "referenceList"; entries: Array<{ key: string; number: number; children: InlineNode[] }> } & SourceMapped)
  | ({ type: "codeBlock"; language?: string; code: string } & SourceMapped)
  | (({ type: "table"; headers: TableCellNode[]; rows: TableCellNode[][]; align: TableAlign[] } & LabeledNode) & SourceMapped)
  | (ImageNode & SourceMapped)
  | (FigureNode & SourceMapped)
  | (PluginAstNode & SourceMapped)
  | (({ type: "mathBlock"; text: string } & LabeledNode) & SourceMapped)
  | ({ type: "thematicBreak" } & SourceMapped)
  | ({ type: "pageBreak" } & SourceMapped);

export type ImageNode = {
  type: "image";
  src: string;
  sources?: string[];
  alt: string;
  caption?: string;
  width?: ImageLength;
  height?: ImageLength;
  align?: ImageAlign;
} & LabeledNode;

export type FigureImageNode = {
  src: string;
  sources?: string[];
  alt: string;
  width?: ImageLength;
  height?: ImageLength;
};

export type FigureNode = {
  type: "figure";
  images: FigureImageNode[];
  caption?: string;
  align?: ImageAlign;
} & LabeledNode;

export type PluginAstNode = {
  type: "plugin";
  plugin: string;
  kind: string;
  data: unknown;
  role?: "figure";
  caption?: string;
  width?: ImageLength;
  align?: ImageAlign;
} & LabeledNode;

export type MarkdownAst = {
  type: "document";
  children: MarkdownNode[];
};
