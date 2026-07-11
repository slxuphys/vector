export type CitationItem = {
  key: string;
  locator?: string;
};

export type CitationNode = {
  type: "citation";
  items: CitationItem[];
  narrative?: boolean;
};

export type BibEntry = {
  key: string;
  type: string;
  fields: Record<string, string>;
};
