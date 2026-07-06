import type { InlineNode, MarkdownAst, MarkdownNode } from "../markdown/markdownTypes";
import type { CrossRefAnchor, CrossRefKind } from "./xrefTypes";

const refPattern = /@((?:eq|fig|tbl|sec):[A-Za-z][\w:-]*(?:\.[A-Za-z0-9_-]+)*)/g;

export function resolveCrossReferences(ast: MarkdownAst): MarkdownAst {
  const anchors = collectAnchors(ast.children);
  return {
    type: "document",
    children: ast.children.map((node) => resolveNodeReferences(annotateNode(node, anchors), anchors))
  };
}

function collectAnchors(nodes: MarkdownNode[]): Map<string, CrossRefAnchor> {
  const anchors = new Map<string, CrossRefAnchor>();
  const sectionCounters = [0, 0, 0, 0, 0, 0];
  let equation = 0;
  let figure = 0;
  let table = 0;

  for (const node of nodes) {
    if (node.type === "heading") {
      const level = Math.max(1, Math.min(6, node.level));
      sectionCounters[level - 1] += 1;
      for (let index = level; index < sectionCounters.length; index += 1) sectionCounters[index] = 0;
      if (node.label) {
        anchors.set(node.label, {
          id: node.label,
          kind: "section",
          number: sectionCounters.slice(0, level).filter(Boolean).join(".")
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

function resolveNodeReferences(node: MarkdownNode, anchors: Map<string, CrossRefAnchor>): MarkdownNode {
  switch (node.type) {
    case "heading":
      return { ...node, children: resolveInlineReferences(node.children, anchors) };
    case "paragraph":
      return { ...node, children: resolveInlineReferences(node.children, anchors) };
    case "list":
      return { ...node, items: node.items.map((item) => resolveInlineReferences(item, anchors)) };
    case "table":
      return {
        ...node,
        headers: node.headers.map((cell) => ({ ...cell, children: resolveInlineReferences(cell.children, anchors) })),
        rows: node.rows.map((row) => row.map((cell) => ({ ...cell, children: resolveInlineReferences(cell.children, anchors) })))
      };
    default:
      return node;
  }
}

function annotateNode(node: MarkdownNode, anchors: Map<string, CrossRefAnchor>): MarkdownNode {
  if ("label" in node && node.label) {
    const anchor = anchors.get(node.label);
    if (anchor) return { ...node, labelNumber: anchor.number };
  }
  return node;
}

function resolveInlineReferences(nodes: InlineNode[], anchors: Map<string, CrossRefAnchor>): InlineNode[] {
  return nodes.flatMap((node): InlineNode[] => {
    if (node.type === "text") return resolveTextReferences(node.text, anchors);
    if (node.type === "strong" || node.type === "emphasis") {
      return [{ ...node, children: resolveInlineReferences(node.children, anchors) }];
    }
    if (node.type === "link") {
      return [{ ...node, children: resolveInlineReferences(node.children, anchors) }];
    }
    return [node];
  });
}

function resolveTextReferences(text: string, anchors: Map<string, CrossRefAnchor>): InlineNode[] {
  const nodes: InlineNode[] = [];
  let cursor = 0;
  for (const match of text.matchAll(refPattern)) {
    const index = match.index ?? 0;
    if (index > cursor) nodes.push({ type: "text", text: text.slice(cursor, index) });
    const id = match[1];
    const anchor = anchors.get(id);
    const resolved = formatReference(id, anchor);
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

function formatReference(id: string, anchor: CrossRefAnchor | undefined): string {
  if (!anchor) {
    if (typeof console !== "undefined") console.warn("[xref-missing]", { id });
    return `??${id}??`;
  }
  const prefix = id.split(":", 1)[0];
  const kind = kindForPrefix(prefix) ?? anchor.kind;
  if (kind === "equation") return `(${anchor.number})`;
  if (kind === "figure") return `Figure ${anchor.number}`;
  if (kind === "table") return `Table ${anchor.number}`;
  return `Section ${anchor.number}`;
}

function kindForPrefix(prefix: string): CrossRefKind | undefined {
  if (prefix === "eq") return "equation";
  if (prefix === "fig") return "figure";
  if (prefix === "tbl") return "table";
  if (prefix === "sec") return "section";
  return undefined;
}
