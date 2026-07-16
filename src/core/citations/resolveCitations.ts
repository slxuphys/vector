import type { InlineNode, MarkdownAst, MarkdownNode } from "../markdown/markdownTypes";
import { parseInline } from "../markdown/parseInline";
import type { BibEntry, CitationNode } from "./citationTypes";
import { parseBibtex } from "./parseBibtex";

export type BibliographyInput = {
  paths: string[];
  files?: Record<string, string>;
  sourcePath?: string;
};

export function resolveCitations(ast: MarkdownAst, input: BibliographyInput | undefined): MarkdownAst {
  const citations = collectCitations(ast.children);
  if (citations.length === 0) return removeBibliographyPlaceholders(ast);
  const entries = loadEntries(input);
  const orderedKeys = [...new Set(citations.flatMap((citation) => citation.items.map((item) => item.key)))];
  const numbers = new Map(orderedKeys.map((key, index) => [key, index + 1]));
  const byKey = new Map(entries.map((entry) => [entry.key, entry]));
  const resolved = ast.children.map((node) => resolveNode(node, numbers, byKey));
  const bibliography = buildBibliographyNodes(orderedKeys, byKey);
  const markerIndex = resolved.findIndex((node) => node.type === "bibliography");
  if (markerIndex >= 0) resolved.splice(markerIndex, 1, ...bibliography);
  else resolved.push(...bibliography);
  return { type: "document", children: resolved.filter((node) => node.type !== "bibliography") };
}

function loadEntries(input: BibliographyInput | undefined): BibEntry[] {
  const files = input?.files;
  if (!input || !files) return [];
  const sourceDirectory = dirname(normalizePath(input.sourcePath ?? ""));
  return input.paths.flatMap((path) => {
    const normalized = normalizePath(path);
    const withExtension = normalized.endsWith(".bib") ? normalized : `${normalized}.bib`;
    const relative = sourceDirectory ? normalizePath(`${sourceDirectory}/${normalized}`) : normalized;
    const relativeWithExtension = sourceDirectory ? normalizePath(`${sourceDirectory}/${withExtension}`) : withExtension;
    const content = files[relative]
      ?? files[relativeWithExtension]
      ?? files[normalized]
      ?? files[withExtension];
    return content ? parseBibtex(content) : [];
  });
}

function normalizePath(path: string): string {
  const result: string[] = [];
  for (const segment of path.replaceAll("\\", "/").split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") result.pop(); else result.push(segment);
  }
  return result.join("/");
}

function dirname(path: string): string {
  const index = path.lastIndexOf("/");
  return index < 0 ? "" : path.slice(0, index);
}

function collectCitations(nodes: MarkdownNode[]): CitationNode[] {
  const citations: CitationNode[] = [];
  const collect = (inline: InlineNode[]) => {
    for (const node of inline) {
      if (node.type === "citation") citations.push(node);
      else if (node.type === "strong" || node.type === "emphasis" || node.type === "link") collect(node.children);
    }
  };
  for (const node of nodes) {
    if (node.type === "heading" || node.type === "paragraph") collect(node.children);
    else if (node.type === "list") node.items.forEach(collect);
    else if (node.type === "table") {
      node.headers.forEach((cell) => collect(cell.children));
      node.rows.forEach((row) => row.forEach((cell) => collect(cell.children)));
    }
  }
  return citations;
}

function resolveNode(node: MarkdownNode, numbers: Map<string, number>, entries: Map<string, BibEntry>): MarkdownNode {
  if (node.type === "heading" || node.type === "paragraph") return { ...node, children: resolveInline(node.children, numbers, entries) };
  if (node.type === "list") return { ...node, items: node.items.map((item) => resolveInline(item, numbers, entries)) };
  if (node.type === "table") {
    return {
      ...node,
      headers: node.headers.map((cell) => ({ ...cell, children: resolveInline(cell.children, numbers, entries) })),
      rows: node.rows.map((row) => row.map((cell) => ({ ...cell, children: resolveInline(cell.children, numbers, entries) })))
    };
  }
  return node;
}

function resolveInline(nodes: InlineNode[], numbers: Map<string, number>, entries: Map<string, BibEntry>): InlineNode[] {
  return nodes.flatMap((node): InlineNode[] => {
    if (node.type === "citation") {
      const missing = node.items.some((item) => !entries.has(item.key));
      const text = citationText(node, numbers);
      return missing
        ? [{ type: "text", text, color: "#b42318" }]
        : [{ type: "link", href: "#refs", children: [{ type: "text", text }] }];
    }
    if (node.type === "strong" || node.type === "emphasis" || node.type === "link") {
      return [{ ...node, children: resolveInline(node.children, numbers, entries) }];
    }
    return [node];
  });
}

function citationText(citation: CitationNode, numbers: Map<string, number>): string {
  const parts = citation.items.map((item) => {
    const number = numbers.get(item.key);
    const base = number === undefined ? "??" : String(number);
    return item.locator ? base + ", " + item.locator : base;
  });
  return "[" + parts.join(", ") + "]";
}

function buildBibliographyNodes(keys: string[], entries: Map<string, BibEntry>): MarkdownNode[] {
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
  if (!entry) return "Missing bibliography entry: " + key;
  const author = entry.fields.author ?? "Unknown author";
  const title = entry.fields.title ?? key;
  const container = entry.fields.journal ?? entry.fields.booktitle ?? entry.fields.publisher;
  const year = entry.fields.year;
  return [author, title, container, year].filter(Boolean).join(". ") + ".";
}

function removeBibliographyPlaceholders(ast: MarkdownAst): MarkdownAst {
  return { type: "document", children: ast.children.filter((node) => node.type !== "bibliography") };
}
