import type { InlineNode } from "./markdownTypes";

const nonBreakingSpaceMarker = "\uE110";
const citationPlaceholderMarker = "\uE111";

export function parseInline(text: string): InlineNode[] {
  const nodes: InlineNode[] = [];
  let rest = text;

  while (rest.length > 0) {
    const match = rest.match(/(\*\*[^*]+\*\*|(?<![\w:])_[^_\n]+_(?!\w)|`[^`]+`|\[[^\]]+]\([^)]+\)|\$[^$]+\$)/);
    if (!match || match.index === undefined) {
      nodes.push(...textNodes(rest));
      break;
    }

    if (match.index > 0) nodes.push(...textNodes(rest.slice(0, match.index)));
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

function textNodes(text: string): InlineNode[] {
  return text
    .split(new RegExp(`(${nonBreakingSpaceMarker}|${citationPlaceholderMarker})`, "g"))
    .filter((part) => part.length > 0)
    .map((part) => part === nonBreakingSpaceMarker
      ? { type: "text", text: " ", nonBreak: true }
      : part === citationPlaceholderMarker
        ? { type: "text", text: "[ ]", nonBreak: true, color: "#b42318" }
      : { type: "text", text: part });
}
