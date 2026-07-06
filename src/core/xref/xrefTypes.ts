export type CrossRefKind = "section" | "equation" | "figure" | "table";

export type CrossRefAnchor = {
  id: string;
  kind: CrossRefKind;
  number: string;
};
