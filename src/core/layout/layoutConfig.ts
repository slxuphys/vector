export type LineBreakingAlgorithm = "greedy" | "knuth-plass";
export type TextAlign = "left" | "justify";
export type HeadingStyle = "default" | "revtex";
export type ParagraphSuppressAfter = "title" | "heading" | "paragraph" | "list" | "referenceList" | "code" | "table" | "image" | "graphsx" | "math" | "rule" | "pageBreak";

export type LayoutConfig = {
  lineBreaking: {
    algorithm: LineBreakingAlgorithm;
    hyphenation: boolean;
    language?: string;
  };
  textAlign: TextAlign;
  headingStyle: HeadingStyle;
  columns: {
    count: number;
    gap: number;
  };
  paragraph: {
    indent: number;
    suppressAfter: ParagraphSuppressAfter[];
  };
  headingFontSizes: Partial<Record<1 | 2 | 3 | 4 | 5 | 6, number>>;
};

export const defaultLayoutConfig: LayoutConfig = {
  lineBreaking: {
    algorithm: "greedy",
    hyphenation: false
  },
  textAlign: "left",
  headingStyle: "default",
  columns: {
    count: 1,
    gap: 24
  },
  paragraph: {
    indent: 0,
    suppressAfter: ["title", "heading", "math", "table", "image", "graphsx", "code", "rule", "pageBreak"]
  },
  headingFontSizes: {}
};
