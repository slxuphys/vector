import type { ImageLength, InlineNode, MarkdownAst, MarkdownNode } from "../markdown/markdownTypes";
import { parseInline } from "../markdown/parseInline";

const nonBreakingSpaceMarker = "\uE110";
const citationPlaceholderMarker = "\uE111";

type LatexPreamble = {
  title?: string;
  authors: string[];
  date?: string;
  abstract?: string;
};

export type LatexDocumentClass = {
  name: string;
  options: string[];
};

type LatexBlockMatch = {
  index: number;
  end: number;
  nodes: MarkdownNode[];
};

export function parseLatex(source: string): MarkdownAst {
  const normalized = source.replace(/\r\n?/g, "\n");
  const body = stripPreamble(normalized);
  return {
    type: "document",
    children: parseLatexBlocks(body)
  };
}

export function readLatexDocumentClass(source: string): LatexDocumentClass {
  const match = source.match(/\\documentclass(?:\[([^\]]*)])?\{([^}]+)}/);
  if (!match) return { name: "article", options: [] };
  return {
    name: match[2].trim() || "article",
    options: (match[1] ?? "")
      .split(",")
      .map((option) => option.trim())
      .filter(Boolean)
  };
}

export function readLatexPreamble(source: string): LatexPreamble {
  const rawDate = readCommandArgument(source, "date");
  const authorCommands = readCommandArguments(source, "author");
  return {
    title: optionalLatexInline(readCommandArgument(source, "title")),
    authors: authorCommands.length ? authorCommands.flatMap(splitAuthors) : [],
    date: rawDate === undefined ? undefined : latexInlineToMarkdown(rawDate),
    abstract: optionalLatexInline(readEnvironment(source, "abstract")?.body.trim())
  };
}

function stripPreamble(source: string): string {
  return source
    .replace(/\\documentclass(?:\[[^\]]*])?\{[^}]*}/g, "")
    .replace(/\\usepackage(?:\[[^\]]*])?\{[^}]*}/g, "")
    .replace(/\\title\s*\{(?:[^{}]|\{[^{}]*})*}/g, "")
    .replace(/\\author\s*\{(?:[^{}]|\{[^{}]*})*}/g, "")
    .replace(/\\affiliation\s*\{(?:[^{}]|\{[^{}]*})*}/g, "")
    .replace(/\\date\s*\{(?:[^{}]|\{[^{}]*})*}/g, "")
    .replace(/\\maketitle\b/g, "")
    .replace(/\\begin\{abstract}[\s\S]*?\\end\{abstract}/g, "")
    .replace(/\\begin\{document}/g, "")
    .replace(/\\end\{document}/g, "");
}

function parseLatexBlocks(source: string): MarkdownNode[] {
  const nodes: MarkdownNode[] = [];
  let cursor = 0;

  while (cursor < source.length) {
    const match = findNextBlock(source, cursor);
    if (!match) {
      nodes.push(...parseLatexParagraphs(source.slice(cursor)));
      break;
    }
    if (match.index > cursor) nodes.push(...parseLatexParagraphs(source.slice(cursor, match.index)));
    nodes.push(...match.nodes);
    cursor = match.end;
  }

  return nodes;
}

function findNextBlock(source: string, cursor: number): LatexBlockMatch | undefined {
  const candidates = [
    matchFigure(source, cursor),
    matchMathEnvironment(source, cursor),
    matchDisplayMath(source, cursor),
    matchList(source, cursor),
    matchSection(source, cursor),
    matchPageBreak(source, cursor)
  ].filter((match): match is LatexBlockMatch => match !== undefined);
  candidates.sort((a, b) => a.index - b.index);
  return candidates[0];
}

function matchFigure(source: string, cursor: number): LatexBlockMatch | undefined {
  const match = /\\begin\{figure\*?}([\s\S]*?)\\end\{figure\*?}/g.exec(source.slice(cursor));
  if (!match || match.index === undefined) return undefined;
  const index = cursor + match.index;
  const body = match[1];
  const include = body.match(/\\includegraphics(?:\[([^\]]*)])?\{([^}]+)}/);
  if (!include) {
    return {
      index,
      end: index + match[0].length,
      nodes: parseLatexParagraphs(body)
    };
  }

  const caption = optionalLatexInline(readCommandArgument(body, "caption"));
  const label = readCommandArgument(body, "label");
  return {
    index,
    end: index + match[0].length,
    nodes: [{
      type: "image",
      src: include[2].trim(),
      alt: caption ?? include[2].trim(),
      caption,
      label,
      width: parseLatexGraphicsWidth(include[1] ?? ""),
      align: "center"
    }]
  };
}

function matchMathEnvironment(source: string, cursor: number): LatexBlockMatch | undefined {
  const match = /\\begin\{(equation|equation\*|align|align\*|gather|gather\*)}([\s\S]*?)\\end\{\1}/g.exec(source.slice(cursor));
  if (!match || match.index === undefined) return undefined;
  const index = cursor + match.index;
  const stripped = stripMathLabel(match[2]);
  return {
    index,
    end: index + match[0].length,
    nodes: [{
      type: "mathBlock",
      text: stripped.body.trim(),
      label: stripped.label
    }]
  };
}

function matchDisplayMath(source: string, cursor: number): LatexBlockMatch | undefined {
  const match = /\\\[([\s\S]*?)\\]/g.exec(source.slice(cursor));
  if (!match || match.index === undefined) return undefined;
  const index = cursor + match.index;
  const stripped = stripMathLabel(match[1]);
  return {
    index,
    end: index + match[0].length,
    nodes: [{
      type: "mathBlock",
      text: stripped.body.trim(),
      label: stripped.label
    }]
  };
}

function matchList(source: string, cursor: number): LatexBlockMatch | undefined {
  const match = /\\begin\{(itemize|enumerate)}([\s\S]*?)\\end\{\1}/g.exec(source.slice(cursor));
  if (!match || match.index === undefined) return undefined;
  const index = cursor + match.index;
  const ordered = match[1] === "enumerate";
  const items = match[2]
    .split(/\\item\b/g)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => parseLatexInline(item.replace(/\n+/g, " ")));
  return {
    index,
    end: index + match[0].length,
    nodes: items.length ? [{ type: "list", ordered, items }] : []
  };
}

function matchSection(source: string, cursor: number): LatexBlockMatch | undefined {
  const match = /\\(section|subsection|subsubsection)\*?\{((?:[^{}]|\{[^{}]*})*)}(\s*\\label\{([A-Za-z][\w:.-]*)})?/g.exec(source.slice(cursor));
  if (!match || match.index === undefined) return undefined;
  const index = cursor + match.index;
  const command = match[1];
  return {
    index,
    end: index + match[0].length,
    nodes: [{
      type: "heading",
      level: command === "section" ? 2 : command === "subsection" ? 3 : 4,
      children: parseLatexInline(match[2]),
      label: match[4]
    }]
  };
}

function matchPageBreak(source: string, cursor: number): LatexBlockMatch | undefined {
  const match = /\\(?:newpage|clearpage|pagebreak)\b/g.exec(source.slice(cursor));
  if (!match || match.index === undefined) return undefined;
  const index = cursor + match.index;
  return {
    index,
    end: index + match[0].length,
    nodes: [{ type: "pageBreak" }]
  };
}

function parseLatexParagraphs(source: string): MarkdownNode[] {
  return stripLatexComments(source)
    .split(/\n\s*\n/g)
    .map((paragraph) => paragraph.replace(/\s*\n\s*/g, " ").trim())
    .filter(Boolean)
    .map((paragraph): MarkdownNode => ({
      type: "paragraph",
      children: parseLatexInline(paragraph)
    }));
}

function parseLatexInline(source: string): InlineNode[] {
  return parseInline(latexInlineToMarkdown(source));
}

function latexInlineToMarkdown(source: string): string {
  return preserveMathWhile(source, (value) => {
    let transformed = replaceInlineCommands(value);
    transformed = transformed
      .replace(/~/g, nonBreakingSpaceMarker)
      .replace(/\\cite\{[^{}]*}/g, citationPlaceholderMarker)
      .replace(/\\ref\{([A-Za-z][\w:.-]*)}/g, "@!$1")
      .replace(/\\(?:eqref|autoref|cref)\{([A-Za-z][\w:.-]*)}/g, "@$1")
      .replace(/\\LaTeX\b/g, "LaTeX")
      .replace(/\\TeX\b/g, "TeX")
      .replace(/\\and\b/g, ", ")
      .replace(/\\label\{([A-Za-z][\w:.-]*)}/g, "")
      .replace(/\\(?:noindent|quad|qquad|,|;|:|!)/g, " ")
      .replace(/\\[a-zA-Z]+\*?(?:\[[^\]]*])?/g, "");
    return transformed.replace(/[{}]/g, "");
  })
    .replace(/\s+/g, " ")
    .trim();
}

function preserveMathWhile(text: string, transform: (value: string) => string): string {
  const math: string[] = [];
  const protectedText = text
    .replace(/\\\(([\s\S]*?)\\\)/g, (_match, body: string) => protectMath(`$${body}$`, math))
    .replace(/\$\$[\s\S]*?\$\$/g, (match) => protectMath(match, math))
    .replace(/\$(?:\\.|[^$])+\$/g, (match) => protectMath(match, math));
  return transform(protectedText).replace(/\uE100(\d+)\uE101/g, (_match, index: string) => math[Number(index)]);
}

function protectMath(value: string, math: string[]): string {
  const index = math.push(value) - 1;
  return `\uE100${index}\uE101`;
}

function replaceInlineCommands(source: string): string {
  let text = source;
  for (let pass = 0; pass < 4; pass += 1) {
    text = text
      .replace(/\\(?:textbf|mathbf)\{([^{}]*)}/g, "**$1**")
      .replace(/\\(?:emph|textit)\{([^{}]*)}/g, "*$1*")
      .replace(/\\texttt\{([^{}]*)}/g, "`$1`");
  }
  return text;
}

function parseLatexGraphicsWidth(options: string): ImageLength | undefined {
  const width = options.match(/width\s*=\s*([^,\]]+)/)?.[1]?.trim();
  if (!width) return undefined;
  const percent = width.match(/^([0-9.]+)\\(?:textwidth|linewidth)$/);
  const plainPercent = width.match(/^([0-9.]+)%$/);
  const px = width.match(/^([0-9.]+)(?:pt|px)?$/);
  if (percent) return { value: Math.round(Number(percent[1]) * 1000) / 10, unit: "percent" };
  if (plainPercent) return { value: Number(plainPercent[1]), unit: "percent" };
  if (px) return { value: Number(px[1]), unit: "px" };
  return undefined;
}

function stripMathLabel(body: string): { body: string; label?: string } {
  let label: string | undefined;
  const stripped = body.replace(/\\label\{([A-Za-z][\w:.-]*)}/g, (_match, id: string) => {
    label = id;
    return "";
  });
  return { body: stripped, label };
}

function readEnvironment(source: string, name: string): { body: string; start: number; end: number } | undefined {
  const pattern = new RegExp(`\\\\begin\\{${escapeRegExp(name)}}([\\s\\S]*?)\\\\end\\{${escapeRegExp(name)}}`);
  const match = source.match(pattern);
  if (!match || match.index === undefined) return undefined;
  return { body: match[1], start: match.index, end: match.index + match[0].length };
}

function readCommandArgument(source: string, command: string): string | undefined {
  const startMatch = new RegExp(`\\\\${escapeRegExp(command)}\\s*\\{`).exec(source);
  if (!startMatch || startMatch.index === undefined) return undefined;
  const open = startMatch.index + startMatch[0].lastIndexOf("{");
  const end = findMatchingBrace(source, open);
  return end === undefined ? undefined : source.slice(open + 1, end).trim();
}

function readCommandArguments(source: string, command: string): string[] {
  const values: string[] = [];
  const pattern = new RegExp(`\\\\${escapeRegExp(command)}\\s*\\{`, "g");
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source))) {
    const open = match.index + match[0].lastIndexOf("{");
    const end = findMatchingBrace(source, open);
    if (end === undefined) continue;
    values.push(source.slice(open + 1, end).trim());
    pattern.lastIndex = end + 1;
  }
  return values;
}

function findMatchingBrace(source: string, open: number): number | undefined {
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    const char = source[index];
    if (char === "\\" && index + 1 < source.length) {
      index += 1;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return undefined;
}

function splitAuthors(value: string | undefined): string[] {
  if (!value) return [];
  return value.split(/\\and|\\\\/g).map((author) => latexInlineToMarkdown(author)).filter(Boolean);
}

function optionalLatexInline(source: string | undefined): string | undefined {
  const converted = latexInlineToMarkdown(source ?? "");
  return converted || undefined;
}

function stripLatexComments(source: string): string {
  return source
    .split("\n")
    .map((line) => line.replace(/(^|[^\\])%.*/, "$1").trimEnd())
    .join("\n");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
