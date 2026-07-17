import type { VectorPlugin } from "../../api";
import type { InlineNode } from "../../../markdown/markdownTypes";
import { parseBibtex, type BibEntry } from "./bibtex";
import { resolveCitations, type CitationData, type CitationItem } from "./citations";
import { isPromiseLike } from "../../../resources";

const pluginName = "@vector/bibliography";
const stateKey = `${pluginName}:document`;
const cacheNamespace = `${pluginName}:bibtex`;

type BibliographyDocumentState = {
  paths: string[];
  files?: Record<string, string>;
};

type CachedBibliography = {
  hash: string;
  entries: BibEntry[];
};

export const bibliographyPackage: VectorPlugin = {
  metadata: {
    name: pluginName,
    version: "0.1.0",
    apiVersion: "1",
    runtimes: ["browser", "node"]
  },
  markdown: {
    inline: ({ source }) => findCitation(source),
    directives: {
      bibliography: ({ sourceSpan }) => bibliographyMarker(sourceSpan)
    }
  },
  latex: {
    commands: {
      bibliography: {
        arguments: ["required"],
        modes: ["vertical"],
        handler: () => [bibliographyMarker()]
      }
    },
    transformInline: ({ source }) => source
      .replace(/\\(?:cite|citep)(?:\[([^\]]*)])?\{([^{}]+)}/g, (_match, locator: string | undefined, keys: string) =>
        `[${keys.split(",").map((key) => `@${key.trim()}${locator?.trim() ? `, ${locator.trim()}` : ""}`).join("; ")}]`)
      .replace(/\\citet(?:\[([^\]]*)])?\{([^{}]+)}/g, (_match, locator: string | undefined, key: string) =>
        `@${key.trim()}`)
  },
  document: {
    prepareDocument(context) {
      const paths = context.sourceFormat === "latex"
        ? readLatexBibliographyPaths(context.source)
        : context.frontMatter?.bibliography ? [context.frontMatter.bibliography] : [];
      const state = context.document.getState<BibliographyDocumentState>(stateKey, () => ({ paths }));
      state.paths = paths;
      if (!context.resources || paths.length === 0) {
        state.files = context.options.bibliographyFiles;
        return;
      }
      const files: Record<string, string> = {};
      const pending: Promise<void>[] = [];
      for (const requested of paths) {
        const candidates = requested.toLowerCase().endsWith(".bib")
          ? [requested]
          : [requested, `${requested}.bib`];
        for (const candidate of candidates) {
          const content = context.resources.readText(candidate, context.sourcePath);
          if (isPromiseLike(content)) {
            pending.push(content.then((value) => storeBibliographyFile(files, context.resources!.resolve(candidate, context.sourcePath), candidate, value)));
          } else {
            storeBibliographyFile(files, context.resources.resolve(candidate, context.sourcePath), candidate, content);
          }
        }
      }
      state.files = files;
      if (pending.length > 0) return Promise.all(pending).then(() => undefined);
    },
    transformAst(ast, context) {
      const state = context.document.peekState<BibliographyDocumentState>(stateKey);
      return resolveCitations(ast, {
        paths: state?.paths ?? [],
        files: state?.files ?? context.options.bibliographyFiles,
        sourcePath: context.sourcePath,
        onMissingFile(path) {
          context.host.diagnostics.report({
            plugin: pluginName,
            severity: "warning",
            code: "bibliography-file-missing",
            message: `Bibliography file not found: ${path}`
          });
        },
        onMissingKey(key) {
          context.host.diagnostics.report({
            plugin: pluginName,
            severity: "warning",
            code: "citation-key-missing",
            message: `Citation key not found: ${key}`
          });
        },
        parse(path, source) {
          const sourceHash = hash(source);
          const cached = context.host.cache.get<CachedBibliography>(cacheNamespace, path);
          if (cached?.hash === sourceHash) return cached.entries;
          const entries = parseBibtex(source);
          context.host.cache.set<CachedBibliography>(cacheNamespace, path, { hash: sourceHash, entries });
          return entries;
        }
      });
    }
  }
};

function storeBibliographyFile(
  files: Record<string, string>,
  resolvedPath: string,
  requestedPath: string,
  content: string | undefined
): void {
  if (content === undefined) return;
  files[resolvedPath] = content;
  files[requestedPath.replaceAll("\\", "/")] = content;
}

function bibliographyMarker(sourceSpan?: { start: number; end: number }) {
  return {
    type: "plugin" as const,
    plugin: pluginName,
    kind: "bibliography",
    data: {},
    sourceSpan
  };
}

function findCitation(source: string) {
  const pattern = /(\[@[^\]]+]|(?<![\w@])@[A-Za-z][\w.'-]*(?::[\w.'-]+)?)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source))) {
    const token = match[0];
    if (token.startsWith("[@")) {
      const items = parseCitationItems(token.slice(1, -1));
      if (items.length > 0) return citationMatch(match.index, token.length, { items });
      continue;
    }
    const suffix = /[.,;:!?]$/.test(token) ? token.slice(-1) : "";
    const key = token.slice(1, suffix ? -1 : undefined);
    if (isCrossReferenceKey(key)) continue;
    const nodes: InlineNode[] = [citationNode({ narrative: true, items: [{ key }] })];
    if (suffix) nodes.push({ type: "text", text: suffix });
    return { index: match.index, length: token.length, nodes };
  }
  return undefined;
}

function citationMatch(index: number, length: number, data: CitationData) {
  return { index, length, nodes: [citationNode(data)] };
}

function citationNode(data: CitationData) {
  return {
    type: "inlinePlugin" as const,
    plugin: pluginName,
    kind: "citation",
    data
  };
}

function parseCitationItems(source: string): CitationItem[] {
  return source
    .split(";")
    .map((part) => {
      const match = /^\s*@([A-Za-z][\w.'-]*)(?:\s*,\s*(.+))?\s*$/.exec(part);
      return match
        ? { key: match[1], ...(match[2]?.trim() ? { locator: match[2].trim() } : {}) }
        : undefined;
    })
    .filter((item): item is CitationItem => item !== undefined);
}

function isCrossReferenceKey(key: string): boolean {
  return /^(?:eq|fig|tbl|sec)(?::|-)[A-Za-z][\w.'-]*$/.test(key);
}

function readLatexBibliographyPaths(source: string): string[] {
  return [...stripLatexComments(source).matchAll(/\\bibliography\s*\{([^}]*)}/g)]
    .flatMap((match) => match[1].split(","))
    .map((path) => path.trim())
    .filter(Boolean);
}

function stripLatexComments(source: string): string {
  return source
    .split("\n")
    .map((line) => line.replace(/(^|[^\\])%.*/, "$1"))
    .join("\n");
}

function hash(source: string): string {
  let value = 0x811c9dc5;
  for (let index = 0; index < source.length; index += 1) {
    value ^= source.charCodeAt(index);
    value = Math.imul(value, 0x01000193);
  }
  return (value >>> 0).toString(16);
}
