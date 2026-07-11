import type { InlineNode } from "./markdownTypes";
import type { CitationItem } from "../citations/citationTypes";

const nonBreakingSpaceMarker = "\uE110";
const citationPlaceholderMarker = "\uE111";

export function parseInline(text: string): InlineNode[] {
  const nodes: InlineNode[] = [];
  let rest = text;

  while (rest.length > 0) {
    const match = rest.match(/(\[@[^\]]+]|(?<![\w@])@[A-Za-z][\w.'-]*(?::[\w.'-]+)?|\*\*[^*]+\*\*|(?<![\w:])_[^_\n]+_(?!\w)|`[^`]+`|\[[^\]]+]\([^)]+\)|\$[^$]+\$)/);
    if (!match || match.index === undefined) {
      nodes.push(...textNodes(rest));
      break;
    }

    if (match.index > 0) nodes.push(...textNodes(rest.slice(0, match.index)));
    const token = match[0];
    if (token.startsWith("[@")) {
      const items = parseCitationItems(token.slice(1, -1));
      nodes.push(items.length ? { type: "citation", items } : { type: "text", text: token });
    } else if (token.startsWith("@")) {
      const suffix = /[.,;:!?]$/.test(token) ? token.slice(-1) : "";
      const key = token.slice(1, suffix ? -1 : undefined);
      if (isCrossReferenceKey(key)) nodes.push({ type: "text", text: token });
      else {
        nodes.push({ type: "citation", narrative: true, items: [{ key }] });
        if (suffix) nodes.push({ type: "text", text: suffix });
      }
    } else if (token.startsWith("**")) {
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

function parseCitationItems(source: string): CitationItem[] {
  return source
    .split(";")
    .map((part) => {
      const match = /^\s*@([A-Za-z][\w.'-]*)(?:\s*,\s*(.+))?\s*$/.exec(part);
      const item: CitationItem | undefined = match
        ? { key: match[1], ...(match[2]?.trim() ? { locator: match[2].trim() } : {}) }
        : undefined;
      return item;
    })
    .filter((item): item is CitationItem => item !== undefined);
}

function isCrossReferenceKey(key: string): boolean {
  return /^(?:eq|fig|tbl|sec)(?::|-)[A-Za-z][\w.'-]*$/.test(key);
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
