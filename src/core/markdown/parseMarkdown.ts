import type { InlineNode, MarkdownAst, MarkdownNode } from "./markdownTypes";

export function parseMarkdown(markdown: string): MarkdownAst {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const children: MarkdownNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i += 1;
      continue;
    }

    if (/^<!--\s*pagebreak\s*-->$/i.test(line.trim()) || /^-{3,}\s*page-break\s*-{3,}$/i.test(line.trim())) {
      children.push({ type: "pageBreak" });
      i += 1;
      continue;
    }

    const fence = line.match(/^```(\S*)\s*$/);
    if (fence) {
      const language = fence[1] || undefined;
      const code: string[] = [];
      i += 1;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        code.push(lines[i]);
        i += 1;
      }
      children.push({ type: "codeBlock", language, code: code.join("\n") });
      i += 1;
      continue;
    }

    if (/^\$\$\s*$/.test(line.trim())) {
      const math: string[] = [];
      i += 1;
      while (i < lines.length && !/^\$\$\s*$/.test(lines[i].trim())) {
        math.push(lines[i]);
        i += 1;
      }
      children.push({ type: "mathBlock", text: math.join("\n") });
      i += 1;
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      children.push({
        type: "heading",
        level: heading[1].length,
        children: parseInline(heading[2].replace(/\s+#+\s*$/, ""))
      });
      i += 1;
      continue;
    }

    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      children.push({ type: "thematicBreak" });
      i += 1;
      continue;
    }

    if (isTableStart(lines, i)) {
      const headers = splitTableRow(lines[i]).map(parseInline);
      i += 2;
      const rows: InlineNode[][][] = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) {
        rows.push(splitTableRow(lines[i]).map(parseInline));
        i += 1;
      }
      children.push({ type: "table", headers, rows });
      continue;
    }

    if (/^\s*(?:[-*+]\s+|\d+\.\s+)/.test(line)) {
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
      children.push({ type: "list", ordered, items, checked });
      continue;
    }

    const paragraph: string[] = [line.trim()];
    i += 1;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,6})\s+/.test(lines[i]) &&
      !/^```/.test(lines[i]) &&
      !/^\s*(?:[-*+]\s+|\d+\.\s+)/.test(lines[i]) &&
      !isTableStart(lines, i)
    ) {
      paragraph.push(lines[i].trim());
      i += 1;
    }
    children.push({ type: "paragraph", children: parseInline(paragraph.join(" ")) });
  }

  return { type: "document", children };
}

function isTableStart(lines: string[], index: number): boolean {
  return Boolean(
    lines[index]?.includes("|") &&
      /^\s*\|?[\s:-]+\|[\s|:-]*$/.test(lines[index + 1] ?? "")
  );
}

function splitTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

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
