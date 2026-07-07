export type LineBreakingAlgorithm = "greedy" | "knuth-plass";
export type TextAlign = "left" | "justify";

export type LayoutConfig = {
  lineBreaking: {
    algorithm: LineBreakingAlgorithm;
    hyphenation: boolean;
    language?: string;
  };
  textAlign: TextAlign;
  columns: {
    count: number;
    gap: number;
  };
  headingFontSizes: Partial<Record<1 | 2 | 3 | 4 | 5 | 6, number>>;
};

export const defaultLayoutConfig: LayoutConfig = {
  lineBreaking: {
    algorithm: "greedy",
    hyphenation: false
  },
  textAlign: "left",
  columns: {
    count: 1,
    gap: 24
  },
  headingFontSizes: {}
};
