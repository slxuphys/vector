import type { InlineNode, MarkdownAst, MarkdownNode } from "../markdown/markdownTypes";
import { applyCrossRefFormat, defaultCrossRefConfig, type CrossRefAnchor, type CrossRefConfig, type CrossRefKind } from "./xrefTypes";

const refPattern = /@(!)?((?:eq|fig|tbl|sec):[A-Za-z][\w:-]*(?:\.[A-Za-z0-9_-]+)*)/g;

export function resolveCrossReferences(
  ast: MarkdownAst,
  config: CrossRefConfig = defaultCrossRefConfig,
  options: { titleFromFirstHeading?: boolean; numberSections?: boolean; sectionNumberStyle?: "decimal" | "revtex" } = {}
): MarkdownAst {
  const children = numberSectionHeadings(
    markTitleHeading(ast.children, options.titleFromFirstHeading ?? true),
    options.numberSections ?? false,
    options.sectionNumberStyle ?? "decimal"
  );
  const anchors = collectAnchors(children);
  return {
    type: "document",
    children: children.map((node) => resolveNodeReferences(annotateNode(node, anchors), anchors, config))
  };
}

function numberSectionHeadings(nodes: MarkdownNode[], enabled: boolean, style: "decimal" | "revtex"): MarkdownNode[] {
  if (!enabled) return nodes;
  const counters = [0, 0, 0, 0, 0, 0];
  const firstHeading = nodes.find((node): node is Extract<MarkdownNode, { type: "heading" }> => node.type === "heading" && !node.title);
  const firstSectionLevel = firstHeading?.level ?? 1;
  return nodes.map((node) => {
    if (node.type !== "heading" || node.title) return node;
    const rawLevel = Math.max(1, Math.min(6, node.level));
    const sectionLevel = Math.max(1, rawLevel - firstSectionLevel + 1);
    counters[sectionLevel - 1] += 1;
    for (let index = sectionLevel; index < counters.length; index += 1) counters[index] = 0;
    return {
      ...node,
      labelNumber: formatSectionNumber(counters, sectionLevel, style)
    };
  });
}

function formatSectionNumber(counters: number[], level: number, style: "decimal" | "revtex"): string {
  const active = counters.slice(0, level).filter(Boolean);
  if (style !== "revtex") return active.join(".");
  const value = active[active.length - 1] ?? 0;
  if (level === 1) return toRoman(value);
  if (level === 2) return toLetters(value);
  return String(value);
}

function toRoman(value: number): string {
  const numerals: Array<[number, string]> = [
    [1000, "M"],
    [900, "CM"],
    [500, "D"],
    [400, "CD"],
    [100, "C"],
    [90, "XC"],
    [50, "L"],
    [40, "XL"],
    [10, "X"],
    [9, "IX"],
    [5, "V"],
    [4, "IV"],
    [1, "I"]
  ];
  let remaining = value;
  let result = "";
  for (const [number, numeral] of numerals) {
    while (remaining >= number) {
      result += numeral;
      remaining -= number;
    }
  }
  return result || String(value);
}

function toLetters(value: number): string {
  let remaining = value;
  let result = "";
  while (remaining > 0) {
    remaining -= 1;
    result = String.fromCharCode(65 + (remaining % 26)) + result;
    remaining = Math.floor(remaining / 26);
  }
  return result || String(value);
}

function markTitleHeading(nodes: MarkdownNode[], titleFromFirstHeading: boolean): MarkdownNode[] {
  if (!titleFromFirstHeading) return nodes;
  const first = nodes[0];
  if (first?.type !== "heading" || first.level !== 1) return nodes;
  return nodes.map((node, index) => index === 0 ? { ...node, title: true } : node);
}

function collectAnchors(nodes: MarkdownNode[]): Map<string, CrossRefAnchor> {
  const anchors = new Map<string, CrossRefAnchor>();
  const sectionCounters = [0, 0, 0, 0, 0, 0];
  let equation = 0;
  let figure = 0;
  let table = 0;

  for (const node of nodes) {
    if (node.type === "heading") {
      if (node.title) continue;
      const level = Math.max(1, Math.min(6, node.level));
      sectionCounters[level - 1] += 1;
      for (let index = level; index < sectionCounters.length; index += 1) sectionCounters[index] = 0;
      if (node.label) {
        anchors.set(node.label, {
          id: node.label,
          kind: "section",
          number: node.labelNumber ?? sectionCounters.slice(0, level).filter(Boolean).join(".")
        });
      }
    } else if (node.type === "mathBlock" && node.label) {
      equation += 1;
      anchors.set(node.label, { id: node.label, kind: "equation", number: String(equation) });
    } else if ((node.type === "image" || node.type === "graphsx") && node.label) {
      figure += 1;
      anchors.set(node.label, { id: node.label, kind: "figure", number: String(figure) });
    } else if (node.type === "table" && node.label) {
      table += 1;
      anchors.set(node.label, { id: node.label, kind: "table", number: String(table) });
    }
  }

  return anchors;
}

function resolveNodeReferences(node: MarkdownNode, anchors: Map<string, CrossRefAnchor>, config: CrossRefConfig): MarkdownNode {
  switch (node.type) {
    case "heading":
      return { ...node, children: resolveInlineReferences(node.children, anchors, config) };
    case "paragraph":
      return { ...node, children: resolveInlineReferences(node.children, anchors, config) };
    case "list":
      return { ...node, items: node.items.map((item) => resolveInlineReferences(item, anchors, config)) };
    case "table":
      return {
        ...node,
        headers: node.headers.map((cell) => ({ ...cell, children: resolveInlineReferences(cell.children, anchors, config) })),
        rows: node.rows.map((row) => row.map((cell) => ({ ...cell, children: resolveInlineReferences(cell.children, anchors, config) })))
      };
    default:
      return node;
  }
}

function annotateNode(node: MarkdownNode, anchors: Map<string, CrossRefAnchor>): MarkdownNode {
  if ("label" in node && node.label) {
    const anchor = anchors.get(node.label);
    if (anchor) return { ...node, labelNumber: node.labelNumber ?? anchor.number };
  }
  return node;
}

function resolveInlineReferences(nodes: InlineNode[], anchors: Map<string, CrossRefAnchor>, config: CrossRefConfig): InlineNode[] {
  return nodes.flatMap((node): InlineNode[] => {
    if (node.type === "text") return resolveTextReferences(node.text, anchors, config);
    if (node.type === "strong" || node.type === "emphasis") {
      return [{ ...node, children: resolveInlineReferences(node.children, anchors, config) }];
    }
    if (node.type === "link") {
      return [{ ...node, children: resolveInlineReferences(node.children, anchors, config) }];
    }
    return [node];
  });
}

function resolveTextReferences(text: string, anchors: Map<string, CrossRefAnchor>, config: CrossRefConfig): InlineNode[] {
  const nodes: InlineNode[] = [];
  let cursor = 0;
  for (const match of text.matchAll(refPattern)) {
    const index = match.index ?? 0;
    if (index > cursor) nodes.push({ type: "text", text: text.slice(cursor, index) });
    const rawNumberOnly = Boolean(match[1]);
    const id = match[2];
    const anchor = anchors.get(id);
    const resolved = rawNumberOnly && anchor ? anchor.number : formatReference(id, anchor, config);
    nodes.push(anchor
      ? {
          type: "link",
          href: `#${id}`,
          children: [{ type: "text", text: resolved }]
        }
      : { type: "text", text: resolved });
    cursor = index + match[0].length;
  }
  if (cursor < text.length) nodes.push({ type: "text", text: text.slice(cursor) });
  return nodes.length ? nodes : [{ type: "text", text }];
}

function formatReference(id: string, anchor: CrossRefAnchor | undefined, config: CrossRefConfig): string {
  if (!anchor) {
    if (typeof console !== "undefined") console.warn("[xref-missing]", { id });
    return `??${id}??`;
  }
  const prefix = id.split(":", 1)[0];
  const kind = kindForPrefix(prefix) ?? anchor.kind;
  return applyCrossRefFormat(config[kind].referenceFormat, {
    number: anchor.number,
    id,
    kind
  });
}

function kindForPrefix(prefix: string): CrossRefKind | undefined {
  if (prefix === "eq") return "equation";
  if (prefix === "fig") return "figure";
  if (prefix === "tbl") return "table";
  if (prefix === "sec") return "section";
  return undefined;
}
