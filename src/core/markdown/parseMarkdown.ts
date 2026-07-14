import type { InlineNode, MarkdownAst, MarkdownNode } from "./markdownTypes";
import { parseInline } from "./parseInline";
import { parseImageBlock } from "./parseImage";
import { isTableStart, parseTableAt } from "./parseTable";
import { firstPartyPlugins } from "../plugins/firstPartyPlugins";
import type { VectorPluginRegistry } from "../plugins/pluginRegistry";

export function parseMarkdown(
  markdown: string,
  sourceOffset = 0,
  plugins: VectorPluginRegistry = firstPartyPlugins
): MarkdownAst {
  const normalized = markdown.replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n");
  const lineStarts = lineStartOffsets(lines);
  const children: MarkdownNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i += 1;
      continue;
    }

    if (/^<!--\s*pagebreak\s*-->$/i.test(line.trim()) || /^-{3,}\s*page-break\s*-{3,}$/i.test(line.trim())) {
      children.push({ type: "pageBreak", sourceSpan: sourceForLines(normalized, lineStarts, i, i + 1, sourceOffset) });
      i += 1;
      continue;
    }

    if (/^:::\s*bibliography\s*$/i.test(line.trim())) {
      const blockStart = i;
      i += 1;
      while (i < lines.length && !/^:::\s*$/.test(lines[i].trim())) i += 1;
      if (i < lines.length) i += 1;
      children.push({ type: "bibliography", sourceSpan: sourceForLines(normalized, lineStarts, blockStart, i, sourceOffset) });
      continue;
    }

    const fence = line.match(/^```([^\s`]*)\s*(.*?)$/);
    if (fence) {
      const blockStart = i;
      const language = fence[1] || undefined;
      const code: string[] = [];
      i += 1;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        code.push(lines[i]);
        i += 1;
      }
      const sourceSpan = sourceForLines(normalized, lineStarts, blockStart, Math.min(lines.length, i + 1), sourceOffset);
      const fenceHandler = language ? plugins.markdownFence(language) : undefined;
      const packageNode = fenceHandler?.({
        language: language ?? "",
        info: fence[2] ?? "",
        source: code.join("\n"),
        sourceSpan
      });
      if (packageNode) {
        const node: MarkdownNode = packageNode;
        children.push(withFollowingLabel(node, lines, i + 1));
        if (followingLabel(lines[i + 1])) i += 1;
      } else {
        children.push({ type: "codeBlock", language, code: code.join("\n"), sourceSpan });
      }
      i += 1;
      continue;
    }

    if (/^\$\$\s*$/.test(line.trim())) {
      const blockStart = i;
      const math: string[] = [];
      i += 1;
      while (i < lines.length && !/^\$\$\s*$/.test(lines[i].trim())) {
        math.push(lines[i]);
        i += 1;
      }
      const node: MarkdownNode = { type: "mathBlock", text: math.join("\n"), sourceSpan: sourceForLines(normalized, lineStarts, blockStart, Math.min(lines.length, i + 1), sourceOffset) };
      children.push(withFollowingLabel(node, lines, i + 1));
      if (followingLabel(lines[i + 1])) i += 1;
      i += 1;
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const labeled = stripTrailingLabel(heading[2].replace(/\s+#+\s*$/, ""));
      children.push({
        type: "heading",
        level: heading[1].length,
        children: parseInline(labeled.text),
        label: labeled.label,
        sourceSpan: sourceForLines(normalized, lineStarts, i, i + 1, sourceOffset)
      });
      i += 1;
      continue;
    }

    const image = parseImageBlock(line);
    if (image) {
      children.push(withFollowingLabel({ ...image, sourceSpan: sourceForLines(normalized, lineStarts, i, i + 1, sourceOffset) }, lines, i + 1));
      if (followingLabel(lines[i + 1])) i += 1;
      i += 1;
      continue;
    }

    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      children.push({ type: "thematicBreak", sourceSpan: sourceForLines(normalized, lineStarts, i, i + 1, sourceOffset) });
      i += 1;
      continue;
    }

    if (isTableStart(lines, i)) {
      const blockStart = i;
      const table = parseTableAt(lines, i);
      if (!table) throw new Error("Expected table parser to accept a table start");
      const node: MarkdownNode = { type: "table", headers: table.headers, rows: table.rows, align: table.align, sourceSpan: sourceForLines(normalized, lineStarts, blockStart, table.end, sourceOffset) };
      children.push(withFollowingLabel(node, lines, table.end));
      i = table.end;
      if (followingLabel(lines[table.end])) i += 1;
      continue;
    }

    if (/^\s*(?:[-*+]\s+|\d+\.\s+)/.test(line)) {
      const blockStart = i;
      const ordered = /^\s*\d+\.\s+/.test(line);
      const items: InlineNode[][] = [];
      const checked: Array<boolean | undefined> = [];
      while (i < lines.length && /^\s*(?:[-*+]\s+|\d+\.\s+)/.test(lines[i])) {
        const text = lines[i].replace(/^\s*(?:[-*+]\s+|\d+\.\s+)/, "");
        const task = text.match(/^\[([ xX])]\s+(.*)$/);
        checked.push(task ? task[1].toLowerCase() === "x" : undefined);
        items.push(parseInline(task ? task[2] : text));
        i += 1;
      }
      children.push({ type: "list", ordered, items, checked, sourceSpan: sourceForLines(normalized, lineStarts, blockStart, i, sourceOffset) });
      continue;
    }

    const blockStart = i;
    const paragraph: string[] = [line.trim()];
    i += 1;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,6})\s+/.test(lines[i]) &&
      !parseImageBlock(lines[i]) &&
      !/^```/.test(lines[i]) &&
      !/^\s*(?:[-*+]\s+|\d+\.\s+)/.test(lines[i]) &&
      !isTableStart(lines, i)
    ) {
      paragraph.push(lines[i].trim());
      i += 1;
    }
    children.push({ type: "paragraph", children: parseInline(paragraph.join(" ")), sourceSpan: sourceForLines(normalized, lineStarts, blockStart, i, sourceOffset) });
  }

  return { type: "document", children };
}

function lineStartOffsets(lines: string[]): number[] {
  let offset = 0;
  return lines.map((line) => {
    const start = offset;
    offset += line.length + 1;
    return start;
  });
}

function sourceForLines(source: string, lineStarts: number[], startLine: number, endLine: number, sourceOffset: number) {
  const start = sourceOffset + (lineStarts[Math.max(0, startLine)] ?? source.length);
  const end = sourceOffset + (endLine >= lineStarts.length ? source.length : lineStarts[Math.max(0, endLine)] ?? source.length);
  return { start, end };
}

function stripTrailingLabel(text: string): { text: string; label?: string } {
  const match = text.match(/\s*\{#([A-Za-z][\w:.'-]*)}\s*$/);
  if (!match) return { text };
  return {
    text: text.slice(0, match.index).trimEnd(),
    label: match[1]
  };
}

function followingLabel(line: string | undefined): string | undefined {
  const match = line?.trim().match(/^\{:\s*#([A-Za-z][\w:.'-]*)\s*}$|^\{#([A-Za-z][\w:.'-]*)}$/);
  return match?.[1] ?? match?.[2];
}

function withFollowingLabel<T extends MarkdownNode>(node: T, lines: string[], index: number): T {
  const label = followingLabel(lines[index]);
  return label ? { ...node, label } : node;
}
