import type { InlineNode } from "../markdown/markdownTypes";
import type { ImageAlign, ImageLength, TableAlign } from "../markdown/markdownTypes";
import type { SourceSpan } from "../source/sourceTypes";

export type InlineRun = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
  math?: boolean;
  nonBreak?: boolean;
  color?: string;
  link?: string;
  fontScale?: number;
  baselineShift?: number;
};

export type TitleAuthor = {
  runs: InlineRun[];
  affiliationIndexes: number[];
  email?: InlineRun[];
};

export type TableCellBlock = {
  runs: InlineRun[];
  colSpan: number;
  rowSpan: number;
};

export type FigureImageBlock = {
  src: string;
  sources?: string[];
  alt: string;
  width?: ImageLength;
  height?: ImageLength;
};

export type TitleMatter = {
  title?: InlineRun[];
  titleFontSize?: number;
  authors: TitleAuthor[];
  affiliations: InlineRun[][];
  date?: InlineRun[];
  abstract?: InlineRun[];
  abstractTitle: string;
  style?: "default" | "latex-article" | "revtex";
};

export type PluginLayoutBlock = {
  type: "plugin";
  plugin: string;
  kind: string;
  data: unknown;
  role?: "figure";
  caption?: string;
  width?: ImageLength;
  align?: ImageAlign;
  label?: string;
  labelNumber?: string;
  source?: SourceSpan;
};

export type LayoutBlock =
  | { type: "heading"; level: number; runs: InlineRun[]; label?: string; labelNumber?: string; title?: boolean; unnumbered?: boolean; appendix?: boolean; source?: SourceSpan }
  | { type: "paragraph"; runs: InlineRun[]; continuation?: boolean; source?: SourceSpan }
  | { type: "list"; ordered: boolean; items: InlineRun[][]; checked?: Array<boolean | undefined>; source?: SourceSpan }
  | { type: "referenceList"; entries: Array<{ key: string; number: number; runs: InlineRun[] }>; source?: SourceSpan }
  | { type: "code"; language?: string; code: string; source?: SourceSpan }
  | { type: "table"; headers: TableCellBlock[]; rows: TableCellBlock[][]; align: TableAlign[]; label?: string; labelNumber?: string; source?: SourceSpan }
  | { type: "image"; src: string; sources?: string[]; alt: string; caption?: string; width?: ImageLength; height?: ImageLength; align?: ImageAlign; label?: string; labelNumber?: string; source?: SourceSpan }
  | { type: "figure"; images: FigureImageBlock[]; caption?: string; align?: ImageAlign; label?: string; labelNumber?: string; source?: SourceSpan }
  | PluginLayoutBlock
  | { type: "math"; text: string; label?: string; labelNumber?: string; source?: SourceSpan }
  | { type: "rule"; source?: SourceSpan }
  | { type: "pageBreak"; source?: SourceSpan };

export function flattenInline(nodes: InlineNode[], inherited: Partial<InlineRun> = {}): InlineRun[] {
  return nodes.flatMap((node): InlineRun[] => {
    if (node.type === "text") return [{ ...inherited, text: node.text, nonBreak: node.nonBreak, color: node.color }];
    if (node.type === "code") return [{ ...inherited, text: node.text, code: true }];
    if (node.type === "math") return [{ ...inherited, text: node.text, math: true }];
    if (node.type === "inlinePlugin") return [{ ...inherited, text: `[unsupported ${node.plugin}:${node.kind}]`, nonBreak: true, color: "#b42318" }];
    if (node.type === "strong") return flattenInline(node.children, { ...inherited, bold: true });
    if (node.type === "emphasis") return flattenInline(node.children, { ...inherited, italic: true });
    return flattenInline(node.children, { ...inherited, link: node.href });
  });
}
