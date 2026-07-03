import type { InlineNode, MarkdownAst, MarkdownNode } from "./markdownTypes";
import { parseInline } from "./parseInline";
import { parseImageAttributes, parseImageBlock } from "./parseImage";
import { isTableStart, parseTableAt } from "./parseTable";

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

    const fence = line.match(/^```([^\s`]*)\s*(.*?)$/);
    if (fence) {
      const language = fence[1] || undefined;
      const fenceInfo = parseFenceInfo(language, fence[2] ?? "");
      const code: string[] = [];
      i += 1;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        code.push(lines[i]);
        i += 1;
      }
      if (language === "graphsx") {
        children.push({
          type: "graphsx",
          source: code.join("\n"),
          caption: fenceInfo.caption,
          width: fenceInfo.width,
          align: fenceInfo.align
        });
      } else {
        children.push({ type: "codeBlock", language, code: code.join("\n") });
      }
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

    const image = parseImageBlock(line);
    if (image) {
      children.push(image);
      i += 1;
      continue;
    }

    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      children.push({ type: "thematicBreak" });
      i += 1;
      continue;
    }

    if (isTableStart(lines, i)) {
      const table = parseTableAt(lines, i);
      if (!table) throw new Error("Expected table parser to accept a table start");
      children.push({ type: "table", headers: table.headers, rows: table.rows, align: table.align });
      i = table.end;
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
      !parseImageBlock(lines[i]) &&
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

function parseFenceInfo(language: string | undefined, rest: string): {
  caption?: string;
  width?: ReturnType<typeof parseImageAttributes>["width"];
  align?: ReturnType<typeof parseImageAttributes>["align"];
} {
  if (language !== "graphsx" || !rest.trim()) return {};
  const body = rest.trim().startsWith("{") ? rest.trim() : `{${rest.trim()}}`;
  const attrs = parseImageAttributes(body);
  const captionMatch = rest.match(/(?:^|\s)caption=("([^"]*)"|'([^']*)'|[^\s]+)/);
  const caption = captionMatch?.[2] ?? captionMatch?.[3] ?? captionMatch?.[1]?.replace(/^["']|["']$/g, "");
  return { caption, width: attrs.width, align: attrs.align };
}
