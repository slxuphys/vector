import type { InlineNode } from "./markdownTypes";

export function parseInline(text: string): InlineNode[] {
  const nodes: InlineNode[] = [];
  let rest = text;

  while (rest.length > 0) {
    const match = rest.match(/(\*\*[^*]+\*\*|_[^_]+_|`[^`]+`|\[[^\]]+]\([^)]+\)|\$[^$]+\$)/);
    if (!match || match.index === undefined) {
      nodes.push({ type: "text", text: rest });
      break;
    }

    if (match.index > 0) nodes.push({ type: "text", text: rest.slice(0, match.index) });
    const token = match[0];
    if (token.startsWith("**")) {
      nodes.push({ type: "strong", children: parseInline(token.slice(2, -2)) });
    } else if (token.startsWith("_")) {
      nodes.push({ type: "emphasis", children: parseInline(token.slice(1, -1)) });
    } else if (token.startsWith("`")) {
      nodes.push({ type: "code", text: token.slice(1, -1) });
    } else if (token.startsWith("[")) {
      const link = token.match(/^\[([^\]]+)]\(([^)]+)\)$/);
      if (link) nodes.push({ type: "link", href: link[2], children: parseInline(link[1]) });
    } else if (token.startsWith("$")) {
      nodes.push({ type: "math", text: token.slice(1, -1) });
    }
    rest = rest.slice(match.index + token.length);
  }

  return nodes.filter((node) => node.type !== "text" || node.text.length > 0);
}
