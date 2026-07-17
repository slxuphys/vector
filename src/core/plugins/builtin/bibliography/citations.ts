import type { InlineNode, InlinePluginNode, MarkdownAst, MarkdownNode } from "../../../markdown/markdownTypes";
import type { BibEntry } from "./bibtex";
import { buildBibliographyNodes } from "./references";

export type BibliographyInput = {
  paths: string[];
  files?: Record<string, string>;
  sourcePath?: string;
  parse: (path: string, source: string) => BibEntry[];
  onMissingFile?: (path: string) => void;
  onMissingKey?: (key: string) => void;
};

export type CitationItem = {
  key: string;
  locator?: string;
};

export type CitationData = {
  items: CitationItem[];
  narrative?: boolean;
};

export function resolveCitations(ast: MarkdownAst, input: BibliographyInput): MarkdownAst {
  const citations = collectCitations(ast.children);
  if (citations.length === 0) return removeBibliographyPlaceholders(ast);
  const entries = loadEntries(input);
  const orderedKeys = [...new Set(citations.flatMap((citation) => citation.items.map((item) => item.key)))];
  const numbers = new Map(orderedKeys.map((key, index) => [key, index + 1]));
  const byKey = new Map(entries.map((entry) => [entry.key, entry]));
  for (const key of orderedKeys) if (!byKey.has(key)) input.onMissingKey?.(key);
  const resolved = ast.children.map((node) => resolveNode(node, numbers, byKey));
  const bibliography = buildBibliographyNodes(orderedKeys, byKey);
  const markerIndex = resolved.findIndex(isBibliographyMarker);
  if (markerIndex >= 0) resolved.splice(markerIndex, 1, ...bibliography);
  else resolved.push(...bibliography);
  return { type: "document", children: resolved.filter((node) => !isBibliographyMarker(node)) };
}

function loadEntries(input: BibliographyInput): BibEntry[] {
  const files = input.files;
  if (!files) return [];
  const sourceDirectory = dirname(normalizePath(input.sourcePath ?? ""));
  return input.paths.flatMap((path) => {
    const normalized = normalizePath(path);
    const withExtension = normalized.endsWith(".bib") ? normalized : `${normalized}.bib`;
    const relative = sourceDirectory ? normalizePath(`${sourceDirectory}/${normalized}`) : normalized;
    const relativeWithExtension = sourceDirectory ? normalizePath(`${sourceDirectory}/${withExtension}`) : withExtension;
    const resolvedPath = [relative, relativeWithExtension, normalized, withExtension]
      .find((candidate) => files[candidate] !== undefined);
    const content = resolvedPath ? files[resolvedPath] : undefined;
    if (!content) input.onMissingFile?.(withExtension);
    return content ? input.parse(resolvedPath ?? normalized, content) : [];
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

function collectCitations(nodes: MarkdownNode[]): CitationData[] {
  const citations: CitationData[] = [];
  const collect = (inline: InlineNode[]) => {
    for (const node of inline) {
      if (isCitationNode(node)) citations.push(node.data as CitationData);
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
    if (isCitationNode(node)) {
      const citation = node.data as CitationData;
      const missing = citation.items.some((item) => !entries.has(item.key));
      const text = citationText(citation, numbers);
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

function citationText(citation: CitationData, numbers: Map<string, number>): string {
  return `[${citation.items.map((item) => {
    const number = numbers.get(item.key);
    const base = number === undefined ? "??" : String(number);
    return item.locator ? `${base}, ${item.locator}` : base;
  }).join(", ")}]`;
}

function isCitationNode(node: InlineNode): node is InlinePluginNode {
  return node.type === "inlinePlugin" && node.plugin === "@vector/bibliography" && node.kind === "citation";
}

function removeBibliographyPlaceholders(ast: MarkdownAst): MarkdownAst {
  return { type: "document", children: ast.children.filter((node) => !isBibliographyMarker(node)) };
}

function isBibliographyMarker(node: MarkdownNode): boolean {
  return node.type === "plugin" && node.plugin === "@vector/bibliography" && node.kind === "bibliography";
}
