export type LineBreakingAlgorithm = "greedy" | "knuth-plass";
export type TextAlign = "left" | "justify";

export type LayoutConfig = {
  lineBreaking: {
    algorithm: LineBreakingAlgorithm;
    hyphenation: boolean;
    language?: string;
  };
  textAlign: TextAlign;
};

export const defaultLayoutConfig: LayoutConfig = {
  lineBreaking: {
    algorithm: "greedy",
    hyphenation: false
  },
  textAlign: "left"
};
