import type { ImageLength, InlineNode, MarkdownAst, MarkdownNode } from "../markdown/markdownTypes";
import { parseInline } from "../markdown/parseInline";
import {
  findNextLatexCommand,
  findNextLatexEnvironment,
  type LatexCommandMatch,
  type LatexCommandSyntax,
  type LatexEnvironmentMatch
} from "./latexSyntax";
import { builtinPlugins } from "../plugins/builtin";
import type { LatexParserMode, VectorPluginRegistry } from "../plugins/api";
import {
  createVectorPluginDocumentContext,
  type VectorPluginDocumentContext
} from "../plugins/api";
import { debugGroup, debugWarn } from "../utils/debugSettings";

const nonBreakingSpaceMarker = "\uE110";
const latexGraphicsStateKey = "latex-graphics";
const latexGraphicsExtensions = [".pdf", ".png", ".jpg", ".jpeg", ".svg"];

type LatexGraphicsState = {
  paths: string[];
};

export type LatexAuthor = {
  name: string;
  affiliations: string[];
  email?: string;
};

export type LatexPreamble = {
  title?: string;
  authors: LatexAuthor[];
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
  nodes?: MarkdownNode[];
  resolve?: () => MarkdownNode[] | undefined;
  transparent?: boolean;
};

type LatexMacro = {
  parameterCount: number;
  optionalDefault?: string;
  body: string;
};

type MacroExpansionState = {
  expansions: number;
  warned: Set<string>;
};

const maxMacroExpansionDepth = 64;
const maxMacroExpansions = 10_000;

export function parseLatex(
  source: string,
  sourceOffset = 0,
  plugins: VectorPluginRegistry = builtinPlugins,
  document: VectorPluginDocumentContext = createVectorPluginDocumentContext()
): MarkdownAst {
  const normalized = normalizeLatexSource(source);
  const expanded = expandLatexMacros(normalized);
  const documentStart = /\\begin\{document}/.exec(expanded);
  document.getState<LatexGraphicsState>(latexGraphicsStateKey, () => ({
    paths: readLatexGraphicsPaths(expanded)
  }));
  if (documentStart?.index !== undefined) {
    parseLatexBlocks(
      stripLatexComments(expanded.slice(0, documentStart.index)),
      sourceOffset,
      plugins,
      "preamble",
      document
    );
  }
  const bodyOffset = documentStart?.index === undefined
    ? sourceOffset
    : sourceOffset + documentStart.index + documentStart[0].length;
  const body = documentStart?.index === undefined
    ? stripPreamble(expanded)
    : maskLatexDocumentOnlyContent(expanded.slice(documentStart.index + documentStart[0].length));
  return {
    type: "document",
    children: parseLatexBlocks(stripLatexComments(body), bodyOffset, plugins, "vertical", document)
  };
}

function maskLatexDocumentOnlyContent(source: string): string {
  return maskLatexCommandDeclarations(source, new Set([
    "title",
    "author",
    "affiliation",
    "email",
    "date",
    "thanks"
  ]))
    .replace(/\\begin\{abstract}([\s\S]*?)\\end\{abstract}/g, (match) => maskLatexSource(match))
    .replace(/\\maketitle\b|\\end\{document}/g, (match) => maskLatexSource(match));
}

function maskLatexCommandDeclarations(source: string, names: Set<string>): string {
  const masked = source.split("");
  let cursor = 0;

  while (cursor < source.length) {
    if (source[cursor] !== "\\") {
      cursor += 1;
      continue;
    }
    const command = readLatexControlSequence(source, cursor);
    if (!command || !names.has(command.name)) {
      cursor = command?.end ?? cursor + 1;
      continue;
    }

    let argumentStart = skipLatexWhitespace(source, command.end);
    const optional = readDelimitedLatexArgument(source, argumentStart, "[", "]");
    if (optional) argumentStart = skipLatexWhitespace(source, optional.end);
    const argument = readDelimitedLatexArgument(source, argumentStart, "{", "}");
    if (!argument) {
      cursor = command.end;
      continue;
    }

    const end = argument.end;
    const replacement = maskLatexSource(source.slice(cursor, end));
    for (let index = cursor; index < end; index += 1) masked[index] = replacement[index - cursor];
    cursor = end;
  }

  return masked.join("");
}

function maskLatexSource(source: string): string {
  return source.replace(/[^\n]/g, " ");
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
  const expanded = expandLatexMacros(normalizeLatexSource(source));
  const rawDate = readCommandArgument(expanded, "date");
  return {
    title: optionalLatexInline(readCommandArgument(expanded, "title")),
    authors: readLatexAuthors(expanded),
    date: rawDate === undefined ? undefined : latexInlineToMarkdown(rawDate),
    abstract: optionalLatexInline(readEnvironment(expanded, "abstract")?.body.trim())
  };
}

export function readLatexGraphicsPaths(source: string): string[] {
  return readCommandArguments(stripLatexComments(source), "graphicspath")
    .flatMap((value) => {
      const paths = [...value.matchAll(/\{([^{}]*)}/g)].map((match) => match[1]);
      return paths.length > 0 ? paths : [value];
    })
    .map((value) => value.trim().replaceAll("\\", "/"))
    .filter(Boolean);
}

function readLatexAuthors(source: string): LatexAuthor[] {
  const authors: LatexAuthor[] = [];
  let current: LatexAuthor[] = [];
  let cursor = 0;

  while (cursor < source.length) {
    if (source[cursor] === "%" && !isEscaped(source, cursor)) {
      const end = source.indexOf("\n", cursor);
      cursor = end === -1 ? source.length : end + 1;
      continue;
    }
    const command = readLatexControlSequence(source, cursor);
    if (!command || !["author", "affiliation", "email"].includes(command.name)) {
      cursor = command?.end ?? cursor + 1;
      continue;
    }
    const argument = readDelimitedLatexArgument(source, skipLatexWhitespace(source, command.end), "{", "}");
    if (!argument) {
      cursor = command.end;
      continue;
    }
    const value = optionalLatexInline(argument.value);
    if (command.name === "author" && value) {
      current = splitAuthors(argument.value).map((name) => ({ name, affiliations: [] }));
      authors.push(...current);
    } else if (command.name === "affiliation" && value) {
      for (const author of current) author.affiliations.push(value);
    } else if (command.name === "email" && value) {
      for (const author of current) author.email = value;
    }
    cursor = argument.end;
  }

  return authors;
}

function normalizeLatexSource(source: string): string {
  return source.replace(/\r(?=\n)/g, " ").replace(/\r/g, "\n");
}

function expandLatexMacros(source: string): string {
  return expandLatexMacroFragment(source, new Map(), { expansions: 0, warned: new Set() }, 0);
}

function expandLatexMacroFragment(
  source: string,
  macros: Map<string, LatexMacro>,
  state: MacroExpansionState,
  depth: number
): string {
  let result = "";
  let cursor = 0;

  while (cursor < source.length) {
    if (source[cursor] === "%" && !isEscaped(source, cursor)) {
      const end = source.indexOf("\n", cursor);
      const commentEnd = end === -1 ? source.length : end;
      result += source.slice(cursor, commentEnd);
      cursor = commentEnd;
      continue;
    }

    if (source[cursor] !== "\\") {
      result += source[cursor];
      cursor += 1;
      continue;
    }

    const command = readLatexControlSequence(source, cursor);
    if (!command) {
      result += source[cursor];
      cursor += 1;
      continue;
    }

    const definition = readLatexMacroDefinition(source, command);
    if (definition) {
      const existing = macros.has(definition.name);
      if (
        definition.kind === "def" ||
        (definition.kind === "newcommand" && !existing) ||
        (definition.kind === "renewcommand" && existing) ||
        (definition.kind === "providecommand" && !existing)
      ) {
        macros.set(definition.name, definition.macro);
      } else if (definition.kind === "newcommand" || definition.kind === "renewcommand") {
        warnMacro(state, `${definition.kind} could not define \\${definition.name}`);
      }
      result += source.slice(cursor, definition.end).replace(/[^\n]/g, " ");
      cursor = definition.end;
      continue;
    }

    const macro = macros.get(command.name);
    if (!macro) {
      result += command.raw;
      cursor = command.end;
      continue;
    }

    const argumentsResult = readLatexMacroArguments(source, command.end, macro);
    if (!argumentsResult) {
      warnMacro(state, `Missing argument while expanding \\${command.name}`);
      result += command.raw;
      cursor = command.end;
      continue;
    }
    if (depth >= maxMacroExpansionDepth || state.expansions >= maxMacroExpansions) {
      warnMacro(state, `Expansion limit reached at \\${command.name}`);
      result += command.raw;
      cursor = argumentsResult.end;
      continue;
    }

    state.expansions += 1;
    const substituted = macro.body.replace(/#([1-9])/g, (_match, value: string) => argumentsResult.args[Number(value) - 1] ?? "");
    result += expandLatexMacroFragment(substituted, macros, state, depth + 1);
    cursor = argumentsResult.end;
  }

  return result;
}

function readLatexMacroDefinition(
  source: string,
  command: { name: string; end: number }
): { kind: "def" | "newcommand" | "renewcommand" | "providecommand"; name: string; macro: LatexMacro; end: number } | undefined {
  if (command.name === "def") return readDefMacroDefinition(source, command.end);
  if (command.name === "newcommand" || command.name === "renewcommand" || command.name === "providecommand") {
    return readCommandMacroDefinition(source, command.name, command.end);
  }
  return undefined;
}

function readCommandMacroDefinition(
  source: string,
  kind: "newcommand" | "renewcommand" | "providecommand",
  start: number
): { kind: "newcommand" | "renewcommand" | "providecommand"; name: string; macro: LatexMacro; end: number } | undefined {
  let cursor = skipLatexWhitespace(source, start);
  if (source[cursor] === "*") cursor = skipLatexWhitespace(source, cursor + 1);
  const name = readLatexMacroNameArgument(source, cursor);
  if (!name) return undefined;
  cursor = skipLatexWhitespace(source, name.end);

  let parameterCount = 0;
  let optionalDefault: string | undefined;
  const count = readDelimitedLatexArgument(source, cursor, "[", "]");
  if (count) {
    if (!/^\d$/.test(count.value.trim())) return undefined;
    parameterCount = Number(count.value.trim());
    cursor = skipLatexWhitespace(source, count.end);
    const optional = readDelimitedLatexArgument(source, cursor, "[", "]");
    if (optional) {
      optionalDefault = optional.value;
      cursor = skipLatexWhitespace(source, optional.end);
    }
  }

  const body = readDelimitedLatexArgument(source, cursor, "{", "}");
  if (!body) return undefined;
  return {
    kind,
    name: name.value,
    macro: { parameterCount, optionalDefault, body: body.value },
    end: body.end
  };
}

function readDefMacroDefinition(
  source: string,
  start: number
): { kind: "def"; name: string; macro: LatexMacro; end: number } | undefined {
  let cursor = skipLatexWhitespace(source, start);
  const name = readLatexControlSequence(source, cursor);
  if (!name || !name.name) return undefined;
  cursor = name.end;
  let parameterCount = 0;
  while (true) {
    cursor = skipLatexWhitespace(source, cursor);
    if (source[cursor] !== "#" || !/[1-9]/.test(source[cursor + 1] ?? "")) break;
    parameterCount = Math.max(parameterCount, Number(source[cursor + 1]));
    cursor += 2;
  }
  const body = readDelimitedLatexArgument(source, skipLatexWhitespace(source, cursor), "{", "}");
  if (!body) return undefined;
  return {
    kind: "def",
    name: name.name,
    macro: { parameterCount, body: body.value },
    end: body.end
  };
}

function readLatexMacroNameArgument(source: string, start: number): { value: string; end: number } | undefined {
  const braced = readDelimitedLatexArgument(source, start, "{", "}");
  if (braced) {
    const name = readLatexControlSequence(braced.value.trim(), 0);
    return name && name.end === braced.value.trim().length ? { value: name.name, end: braced.end } : undefined;
  }
  const command = readLatexControlSequence(source, start);
  return command ? { value: command.name, end: command.end } : undefined;
}

function readLatexMacroArguments(source: string, start: number, macro: LatexMacro): { args: string[]; end: number } | undefined {
  let cursor = start;
  const args: string[] = [];
  if (macro.optionalDefault !== undefined) {
    cursor = skipLatexWhitespace(source, cursor);
    const optional = readDelimitedLatexArgument(source, cursor, "[", "]");
    if (optional) {
      args.push(optional.value);
      cursor = optional.end;
    } else {
      args.push(macro.optionalDefault);
    }
  }
  while (args.length < macro.parameterCount) {
    const argument = readLatexMacroArgument(source, cursor);
    if (!argument) return undefined;
    args.push(argument.value);
    cursor = argument.end;
  }
  return { args, end: cursor };
}

function readLatexMacroArgument(source: string, start: number): { value: string; end: number } | undefined {
  const cursor = skipLatexWhitespace(source, start);
  const braced = readDelimitedLatexArgument(source, cursor, "{", "}");
  if (braced) return braced;
  const command = readLatexControlSequence(source, cursor);
  if (command) return { value: command.raw, end: command.end };
  return source[cursor] === undefined ? undefined : { value: source[cursor], end: cursor + 1 };
}

function readLatexControlSequence(source: string, start: number): { name: string; raw: string; end: number } | undefined {
  if (source[start] !== "\\" || source[start + 1] === undefined) return undefined;
  let end = start + 1;
  if (/[A-Za-z@]/.test(source[end])) {
    while (/[A-Za-z@]/.test(source[end] ?? "")) end += 1;
  } else {
    end += 1;
  }
  return { name: source.slice(start + 1, end), raw: source.slice(start, end), end };
}

function readDelimitedLatexArgument(source: string, start: number, open: string, close: string): { value: string; end: number } | undefined {
  if (source[start] !== open) return undefined;
  let depth = 0;
  for (let index = start; index < source.length; index += 1) {
    if (source[index] === "\\") {
      index += 1;
      continue;
    }
    if (source[index] === open) depth += 1;
    if (source[index] === close) {
      depth -= 1;
      if (depth === 0) return { value: source.slice(start + 1, index), end: index + 1 };
    }
  }
  return undefined;
}

function skipLatexWhitespace(source: string, start: number): number {
  let cursor = start;
  while (/\s/.test(source[cursor] ?? "")) cursor += 1;
  return cursor;
}

function isEscaped(source: string, index: number): boolean {
  let slashCount = 0;
  for (let cursor = index - 1; cursor >= 0 && source[cursor] === "\\"; cursor -= 1) slashCount += 1;
  return slashCount % 2 === 1;
}

function warnMacro(state: MacroExpansionState, message: string): void {
  if (state.warned.has(message)) return;
  state.warned.add(message);
  debugWarn("parser", "[LaTeX macro] expansion warning", message);
}

function stripPreamble(source: string): string {
  return source
    .replace(/\\documentclass(?:\[[^\]]*])?\{[^}]*}/g, "")
    .replace(/\\usepackage(?:\[[^\]]*])?\{[^}]*}/g, "")
    .replace(/\\graphicspath\s*\{(?:[^{}]|\{[^{}]*})*}/g, "")
    .replace(/\\title\s*\{(?:[^{}]|\{[^{}]*})*}/g, "")
    .replace(/\\author\s*\{(?:[^{}]|\{[^{}]*})*}/g, "")
    .replace(/\\affiliation\s*\{(?:[^{}]|\{[^{}]*})*}/g, "")
    .replace(/\\date\s*\{(?:[^{}]|\{[^{}]*})*}/g, "")
    .replace(/\\maketitle\b/g, "")
    .replace(/\\begin\{abstract}[\s\S]*?\\end\{abstract}/g, "")
    .replace(/\\begin\{document}/g, "")
    .replace(/\\end\{document}/g, "");
}

function parseLatexBlocks(
  source: string,
  sourceOffset: number,
  plugins: VectorPluginRegistry,
  mode: LatexParserMode,
  document: VectorPluginDocumentContext
): MarkdownNode[] {
  const nodes: MarkdownNode[] = [];
  const commandDefinitions = latexCommandSyntaxForMode(plugins, mode);
  let visibleSource = source;
  let cursor = 0;
  let scanCursor = 0;
  let previousBlockContinuesParagraph = false;

  while (scanCursor < source.length) {
    const match = findNextBlock(source, scanCursor, plugins, mode, commandDefinitions, document);
    if (!match) {
      const remainder = visibleSource.slice(cursor);
      nodes.push(...parseLatexParagraphs(
        remainder,
        sourceOffset + cursor,
        previousBlockContinuesParagraph && !startsWithParagraphBreak(remainder),
        plugins,
        document
      ));
      break;
    }
    const matchNodes = match.resolve ? match.resolve() : match.nodes;
    if (matchNodes === undefined) {
      scanCursor = match.end;
      continue;
    }
    if (match.transparent && matchNodes.length === 0) {
      visibleSource = maskLatexRange(visibleSource, match.index, match.end);
      scanCursor = match.end;
      continue;
    }
    if (match.index > cursor) {
      const between = visibleSource.slice(cursor, match.index);
      nodes.push(...parseLatexParagraphs(
        between,
        sourceOffset + cursor,
        previousBlockContinuesParagraph && !startsWithParagraphBreak(between),
        plugins,
        document
      ));
    }
    nodes.push(...matchNodes.map((node) => ({ ...node, sourceSpan: { start: sourceOffset + match.index, end: sourceOffset + match.end } })));
    previousBlockContinuesParagraph = matchNodes.some((node) => node.type === "mathBlock");
    cursor = match.end;
    scanCursor = match.end;
  }

  return nodes;
}

function maskLatexRange(source: string, start: number, end: number): string {
  const masked = source.slice(start, end).replace(/[^\n]/g, " ");
  return source.slice(0, start) + masked + source.slice(end);
}

function findNextBlock(
  source: string,
  cursor: number,
  plugins: VectorPluginRegistry,
  mode: LatexParserMode,
  commandDefinitions: ReadonlyMap<string, LatexCommandSyntax>,
  document: VectorPluginDocumentContext
): LatexBlockMatch | undefined {
  const candidates = [
    matchFigure(source, cursor, plugins, document),
    matchRegisteredEnvironment(source, cursor, plugins, mode, document),
    matchRegisteredCommand(source, cursor, plugins, mode, commandDefinitions, document),
    matchMathEnvironment(source, cursor, plugins, mode, document),
    matchDisplayMath(source, cursor, plugins, mode, document),
    matchList(source, cursor, plugins, document),
  ].filter((match): match is LatexBlockMatch => match !== undefined);
  candidates.sort((a, b) => a.index - b.index);
  return candidates[0];
}

function matchFigure(
  source: string,
  cursor: number,
  plugins: VectorPluginRegistry,
  document: VectorPluginDocumentContext
): LatexBlockMatch | undefined {
  const match = /\\begin\{figure\*?}([\s\S]*?)\\end\{figure\*?}/g.exec(source.slice(cursor));
  if (!match || match.index === undefined) return undefined;
  const index = cursor + match.index;
  return {
    index,
    end: index + match[0].length,
    resolve: () => resolveFigure(match, index, plugins, document)
  };
}

function resolveFigure(
  match: RegExpExecArray,
  index: number,
  plugins: VectorPluginRegistry,
  document: VectorPluginDocumentContext
): MarkdownNode[] {
  const body = match[1];
  const packageEnvironment = findNextLatexEnvironment(body, 0, plugins.latexEnvironmentNames());
  const packageNodes = packageEnvironment
    ? runLatexEnvironmentHandler(packageEnvironment, plugins, "vertical", document)
    : undefined;
  const packagedFigure = packageNodes?.find((node) => node.type === "plugin" && node.role === "figure");
  if (packagedFigure?.type === "plugin") {
    const caption = optionalLatexInline(readCommandArgument(body, "caption"));
    const label = readCommandArgument(body, "label");
    return [{
        ...packagedFigure,
        caption,
        label,
        align: "center"
      }];
  }
  const includes = [...body.matchAll(/\\includegraphics(?:\[([^\]]*)])?\{([^}]+)}/g)];
  if (includes.length === 0) {
    return parseLatexParagraphs(body, index + match[0].indexOf(body), false, plugins, document);
  }

  const caption = optionalLatexInline(readCommandArgument(body, "caption"));
  const label = readCommandArgument(body, "label");
  const graphicsPaths = document.peekState<LatexGraphicsState>(latexGraphicsStateKey)?.paths ?? [];
  const imageDetails: Array<{ requestedSource: string; candidates: string[]; options: string }> = [];
  const images = includes.map((include) => {
    const requestedSource = include[2].trim();
    const sources = resolveLatexFigureSources(requestedSource, graphicsPaths);
    imageDetails.push({
      requestedSource,
      candidates: sources,
      options: include[1] ?? ""
    });
    return {
      src: sources[0] ?? requestedSource,
      sources,
      alt: caption ?? requestedSource,
      width: parseLatexGraphicsWidth(include[1] ?? "")
    };
  });
  debugGroup("parser", `[LaTeX figure] parsed ${images.length} image${images.length === 1 ? "" : "s"}`, () => [
    ["graphics paths", graphicsPaths],
    ["images", imageDetails],
    ["figure", { caption, label }]
  ]);

  if (images.length > 1) {
    return [{
      type: "figure",
      images,
      caption,
      label,
      align: "center"
    }];
  }

  return [{
      type: "image",
      ...images[0],
      caption,
      label,
      align: "center"
    }];
}

function resolveLatexFigureSources(source: string, graphicsPaths: string[]): string[] {
  if (/^(?:https?:|data:|\/)/i.test(source)) return [source];
  const normalizedSource = source.replaceAll("\\", "/").replace(/^\.\//, "");
  const roots = graphicsPaths.length > 0 ? graphicsPaths : [""];
  const stems = roots.map((root) => joinLatexGraphicsPath(root, normalizedSource));
  if (graphicsPaths.length > 0) stems.push(joinLatexGraphicsPath("", normalizedSource));
  const hasExtension = /\.[a-z0-9]+$/i.test(normalizedSource);
  const candidates = hasExtension
    ? stems
    : stems.flatMap((stem) => latexGraphicsExtensions.map((extension) => `${stem}${extension}`));
  return [...new Set(candidates.map(normalizeRelativeFigureSource))];
}

function joinLatexGraphicsPath(root: string, source: string): string {
  const normalizedRoot = root.trim().replaceAll("\\", "/").replace(/^\.\//, "").replace(/\/+$/, "");
  return normalizedRoot ? `${normalizedRoot}/${source}` : source;
}

function normalizeRelativeFigureSource(source: string): string {
  return source;
}

function matchRegisteredCommand(
  source: string,
  cursor: number,
  plugins: VectorPluginRegistry,
  mode: LatexParserMode,
  definitions: ReadonlyMap<string, LatexCommandSyntax>,
  document: VectorPluginDocumentContext
): LatexBlockMatch | undefined {
  const match = findNextLatexCommand(source, cursor, definitions);
  if (!match) return undefined;
  const definition = plugins.latexCommand(match.name);
  return {
    index: match.index,
    end: match.end,
    transparent: definition?.transparent,
    resolve: () => runLatexCommandHandler(match, plugins, mode, document)
  };
}

function latexCommandSyntaxForMode(
  plugins: VectorPluginRegistry,
  mode: LatexParserMode
): ReadonlyMap<string, LatexCommandSyntax> {
  return new Map(plugins.latexCommandNames().flatMap((name) => {
    const definition = plugins.latexCommand(name);
    return definition?.modes.includes(mode)
      ? [[name, { arguments: definition.arguments, trailingLabel: definition.trailingLabel }] as const]
      : [];
  }));
}

function runLatexCommandHandler(
  match: LatexCommandMatch,
  plugins: VectorPluginRegistry,
  mode: LatexParserMode,
  document: VectorPluginDocumentContext
): MarkdownNode[] | undefined {
  const definition = plugins.latexCommand(match.name);
  if (!definition?.modes.includes(mode)) return undefined;
  return definition.handler({
    name: match.name,
    source: match.source,
    starred: match.starred,
    requiredArguments: match.requiredArguments,
    optionalArguments: match.optionalArguments,
    trailingLabel: match.trailingLabel,
    mode,
    parseInline: (source) => parseLatexInline(source, plugins, document),
    document
  });
}

function matchRegisteredEnvironment(
  source: string,
  cursor: number,
  plugins: VectorPluginRegistry,
  mode: LatexParserMode,
  document: VectorPluginDocumentContext
): LatexBlockMatch | undefined {
  const match = findNextLatexEnvironment(source, cursor, plugins.latexEnvironmentNames());
  if (!match) return undefined;
  return {
    index: match.index,
    end: match.end,
    resolve: () => runLatexEnvironmentHandler(match, plugins, mode, document)
  };
}

function runLatexEnvironmentHandler(
  match: LatexEnvironmentMatch,
  plugins: VectorPluginRegistry,
  mode: LatexParserMode,
  document: VectorPluginDocumentContext
): MarkdownNode[] | undefined {
  return plugins.latexEnvironment(match.name)?.({
    name: match.name,
    source: match.source,
    body: match.body,
    options: match.options,
    mode,
    document
  });
}

function matchMathEnvironment(
  source: string,
  cursor: number,
  plugins: VectorPluginRegistry,
  mode: LatexParserMode,
  document: VectorPluginDocumentContext
): LatexBlockMatch | undefined {
  const match = /\\begin\{(equation|equation\*|align|align\*|gather|gather\*)}([\s\S]*?)\\end\{\1}/g.exec(source.slice(cursor));
  if (!match || match.index === undefined) return undefined;
  const index = cursor + match.index;
  const stripped = stripMathLabel(match[2]);
  return {
    index,
    end: index + match[0].length,
    resolve: () => [{
      type: "mathBlock",
      text: transformLatexMath(stripped.body.trim(), plugins, mode, document),
      label: stripped.label
    }]
  };
}

function matchDisplayMath(
  source: string,
  cursor: number,
  plugins: VectorPluginRegistry,
  mode: LatexParserMode,
  document: VectorPluginDocumentContext
): LatexBlockMatch | undefined {
  const match = /\\\[([\s\S]*?)\\]/g.exec(source.slice(cursor));
  if (!match || match.index === undefined) return undefined;
  const index = cursor + match.index;
  const stripped = stripMathLabel(match[1]);
  return {
    index,
    end: index + match[0].length,
    resolve: () => [{
      type: "mathBlock",
      text: transformLatexMath(stripped.body.trim(), plugins, mode, document),
      label: stripped.label
    }]
  };
}

function matchList(
  source: string,
  cursor: number,
  plugins: VectorPluginRegistry,
  document: VectorPluginDocumentContext
): LatexBlockMatch | undefined {
  const match = /\\begin\{(itemize|enumerate)}([\s\S]*?)\\end\{\1}/g.exec(source.slice(cursor));
  if (!match || match.index === undefined) return undefined;
  const index = cursor + match.index;
  const ordered = match[1] === "enumerate";
  return {
    index,
    end: index + match[0].length,
    resolve: () => {
      const items = match[2]
        .split(/\\item\b/g)
        .map((item) => item.trim())
        .filter(Boolean)
        .map((item) => parseLatexInline(item.replace(/\n+/g, " "), plugins, document));
      return items.length ? [{ type: "list", ordered, items }] : [];
    }
  };
}

function parseLatexParagraphs(
  source: string,
  sourceOffset: number,
  firstParagraphContinuation = false,
  plugins: VectorPluginRegistry,
  document: VectorPluginDocumentContext
): MarkdownNode[] {
  const cleaned = stripLatexComments(source);
  const nodes: MarkdownNode[] = [];
  let cursor = 0;
  for (const rawParagraph of cleaned.split(/\n\s*\n/g)) {
    const index = cleaned.indexOf(rawParagraph, cursor);
    cursor = Math.max(cursor, index) + rawParagraph.length;
    const paragraph = rawParagraph.replace(/\s*\n\s*/g, " ").trim();
    if (!paragraph || index < 0) continue;
    const leadingWhitespace = rawParagraph.match(/^\s*/)?.[0].length ?? 0;
    const trailingWhitespace = rawParagraph.match(/\s*$/)?.[0].length ?? 0;
    nodes.push({
      type: "paragraph",
      children: parseLatexInline(paragraph, plugins, document),
      continuation: nodes.length === 0 && firstParagraphContinuation || undefined,
      sourceSpan: {
        start: sourceOffset + index + leadingWhitespace,
        end: sourceOffset + index + rawParagraph.length - trailingWhitespace
      }
    });
  }
  return nodes;
}

function startsWithParagraphBreak(source: string): boolean {
  const leadingWhitespace = source.match(/^\s*/)?.[0] ?? "";
  return /\n[\t ]*\n/.test(leadingWhitespace);
}

function parseLatexInline(
  source: string,
  plugins: VectorPluginRegistry,
  document: VectorPluginDocumentContext
): InlineNode[] {
  const markdown = latexInlineToMarkdown(source, (value) =>
    plugins.transformLatexInline({ source: value, mode: "horizontal", document }));
  return transformInlineMath(parseInline(markdown, plugins, document), plugins, document);
}

function transformInlineMath(
  nodes: InlineNode[],
  plugins: VectorPluginRegistry,
  document: VectorPluginDocumentContext
): InlineNode[] {
  return nodes.map((node): InlineNode => {
    if (node.type === "math") {
      return { ...node, text: transformLatexMath(node.text, plugins, "math", document) };
    }
    if (node.type === "strong" || node.type === "emphasis" || node.type === "link") {
      return { ...node, children: transformInlineMath(node.children, plugins, document) };
    }
    return node;
  });
}

function transformLatexMath(
  source: string,
  plugins: VectorPluginRegistry,
  mode: LatexParserMode,
  document: VectorPluginDocumentContext
): string {
  return plugins.transformLatexMath({ source, mode, document });
}

function latexInlineToMarkdown(source: string, transformSource: (source: string) => string = (value) => value): string {
  return preserveMathWhile(source, (value) => {
    let transformed = replaceInlineCommands(transformSource(value));
    transformed = transformed
      .replace(/~/g, nonBreakingSpaceMarker)
      .replace(/\\ref\{([A-Za-z][\w:.'-]*)}/g, "@!$1")
      .replace(/\\(?:eqref|autoref|cref)\{([A-Za-z][\w:.'-]*)}/g, "@$1")
      .replace(/\\LaTeX\b/g, "LaTeX")
      .replace(/\\TeX\b/g, "TeX")
      .replace(/\\and\b/g, ", ")
      .replace(/\\([&#_%$])/g, "$1")
      .replace(/\\label\{([A-Za-z][\w:.'-]*)}/g, "")
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
  const percent = width.match(/^([0-9.]*)\\(?:columnwidth|textwidth|linewidth)$/);
  const plainPercent = width.match(/^([0-9.]+)%$/);
  const px = width.match(/^([0-9.]+)(?:pt|px)?$/);
  if (percent) {
    const factor = percent[1] ? Number(percent[1]) : 1;
    return { value: Math.round(factor * 1000) / 10, unit: "percent" };
  }
  if (plainPercent) return { value: Number(plainPercent[1]), unit: "percent" };
  if (px) return { value: Number(px[1]), unit: "px" };
  return undefined;
}

function stripMathLabel(body: string): { body: string; label?: string } {
  let label: string | undefined;
  const stripped = body.replace(/\\label\{([A-Za-z][\w:.'-]*)}/g, (_match, id: string) => {
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
    .map((line) => line.replace(/(^|[^\\])%.*/, (match, prefix: string) => `${prefix}${" ".repeat(match.length - prefix.length)}`))
    .join("\n");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
