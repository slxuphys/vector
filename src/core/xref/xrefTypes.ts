export type CrossRefKind = "section" | "equation" | "figure" | "table";

export type CrossRefAnchor = {
  id: string;
  kind: CrossRefKind;
  number: string;
  appendix?: boolean;
};

export type CrossRefFormat = {
  captionFormat: string;
  referenceFormat: string;
};

export type CrossRefConfig = Record<CrossRefKind, CrossRefFormat>;

export const defaultCrossRefConfig: CrossRefConfig = {
  section: {
    captionFormat: "{number}",
    referenceFormat: "Section {number}"
  },
  equation: {
    captionFormat: "({number})",
    referenceFormat: "({number})"
  },
  figure: {
    captionFormat: "Figure {number}.",
    referenceFormat: "Figure {number}"
  },
  table: {
    captionFormat: "Table {number}.",
    referenceFormat: "Table {number}"
  }
};

export function applyCrossRefFormat(format: string, values: { number: string; id?: string; kind?: string }): string {
  return format.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key: string) => {
    if (key === "number") return values.number;
    if (key === "id") return values.id ?? "";
    if (key === "kind") return values.kind ?? "";
    return "";
  });
}
