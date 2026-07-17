import type { InlineNode } from "./markdownTypes";
import {
  createVectorPluginDocumentContext,
  type VectorPluginDocumentContext,
  type VectorPluginRegistry
} from "../plugins/api";

const nonBreakingSpaceMarker = "\uE110";

export function parseInline(
  text: string,
  plugins?: VectorPluginRegistry,
  document: VectorPluginDocumentContext = createVectorPluginDocumentContext()
): InlineNode[] {
  const nodes: InlineNode[] = [];
  let rest = text;

  while (rest.length > 0) {
    const match = rest.match(/(\*\*[^*]+\*\*|(?<![\w:])_[^_\n]+_(?!\w)|`[^`]+`|\[[^\]]+]\([^)]+\)|\$[^$]+\$)/);
    const pluginMatch = plugins?.matchMarkdownInline(rest, document);
    const builtinIndex = match?.index;
    const usePlugin = pluginMatch !== undefined && (builtinIndex === undefined || pluginMatch.index <= builtinIndex);
    const nextIndex = usePlugin ? pluginMatch.index : builtinIndex;
    if (nextIndex === undefined) {
      nodes.push(...textNodes(rest));
      break;
    }

    if (nextIndex > 0) nodes.push(...textNodes(rest.slice(0, nextIndex)));
    if (usePlugin) {
      nodes.push(...pluginMatch.nodes);
      rest = rest.slice(pluginMatch.index + pluginMatch.length);
      continue;
    }

    const token = match![0];
    if (token.startsWith("**")) {
      nodes.push({ type: "strong", children: parseInline(token.slice(2, -2), plugins, document) });
    } else if (token.startsWith("_")) {
      nodes.push({ type: "emphasis", children: parseInline(token.slice(1, -1), plugins, document) });
    } else if (token.startsWith("`")) {
      nodes.push({ type: "code", text: token.slice(1, -1) });
    } else if (token.startsWith("[")) {
      const link = token.match(/^\[([^\]]+)]\(([^)]+)\)$/);
      if (link) nodes.push({ type: "link", href: link[2], children: parseInline(link[1], plugins, document) });
    } else if (token.startsWith("$")) {
      nodes.push({ type: "math", text: token.slice(1, -1) });
    }
    rest = rest.slice((match!.index ?? 0) + token.length);
  }

  return nodes.filter((node) => node.type !== "text" || node.text.length > 0);
}

function textNodes(text: string): InlineNode[] {
  return text
    .split(new RegExp(`(${nonBreakingSpaceMarker})`, "g"))
    .filter((part) => part.length > 0)
    .map((part) => part === nonBreakingSpaceMarker
      ? { type: "text", text: " ", nonBreak: true }
      : { type: "text", text: part });
}
