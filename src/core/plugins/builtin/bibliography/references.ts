import type { MarkdownNode } from "../../../markdown/markdownTypes";
import { parseInline } from "../../../markdown/parseInline";
import type { BibEntry } from "./bibtex";

export function buildBibliographyNodes(keys: string[], entries: Map<string, BibEntry>): MarkdownNode[] {
  return [
    {
      type: "heading",
      level: 1,
      children: parseInline("References"),
      label: "refs",
      unnumbered: true
    },
    {
      type: "referenceList",
      entries: keys.map((key, index) => ({
        key,
        number: index + 1,
        children: parseInline(formatEntry(entries.get(key), key))
      }))
    }
  ];
}

function formatEntry(entry: BibEntry | undefined, key: string): string {
  if (!entry) return `Missing bibliography entry: ${key}`;
  const author = entry.fields.author ?? "Unknown author";
  const title = entry.fields.title ?? key;
  const container = entry.fields.journal ?? entry.fields.booktitle ?? entry.fields.publisher;
  const year = entry.fields.year;
  return [author, title, container, year].filter(Boolean).join(". ") + ".";
}
