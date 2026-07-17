import type { FigureImageNode, ImageNode, MarkdownAst } from "../markdown/markdownTypes";
import { debugGroup, debugLog } from "../utils/debugSettings";
import {
  createMemoryResourceProvider,
  isPromiseLike,
  type DocumentResourceProvider
} from "../resources";

type AssetResolutionTrace = {
  matched: Array<{ source: string; candidates: string[]; resolved: string }>;
  unresolved: Array<{ source: string; candidates: string[] }>;
};

export function resolveDocumentAssetSources(
  ast: MarkdownAst,
  assetUrls: Record<string, string> | undefined,
  sourcePath: string | undefined
): MarkdownAst {
  if (!assetUrls || Object.keys(assetUrls).length === 0) return traceSkippedResolution(ast, sourcePath);
  return resolveDocumentResourceSourcesSync(ast, createMemoryResourceProvider({ urls: assetUrls }), sourcePath);
}

export function resolveDocumentResourceSourcesSync(
  ast: MarkdownAst,
  resources: DocumentResourceProvider | undefined,
  sourcePath: string | undefined
): MarkdownAst {
  if (!resources) return traceSkippedResolution(ast, sourcePath);
  const trace: AssetResolutionTrace = { matched: [], unresolved: [] };
  const result = {
    ...ast,
    children: ast.children.map((node) => {
      if (node.type === "image") return resolveImageSync(node, resources, sourcePath, trace);
      if (node.type === "figure") return {
        ...node,
        images: node.images.map((image) => resolveFigureImageSync(image, resources, sourcePath, trace))
      };
      return node;
    })
  };
  traceResolution(trace, sourcePath);
  return result;
}

export async function resolveDocumentResourceSources(
  ast: MarkdownAst,
  resources: DocumentResourceProvider | undefined,
  sourcePath: string | undefined
): Promise<MarkdownAst> {
  if (!resources) return traceSkippedResolution(ast, sourcePath);
  const trace: AssetResolutionTrace = { matched: [], unresolved: [] };
  const children = await Promise.all(ast.children.map(async (node) => {
    if (node.type === "image") return resolveImage(node, resources, sourcePath, trace);
    if (node.type === "figure") return {
      ...node,
      images: await Promise.all(node.images.map((image) => resolveFigureImage(image, resources, sourcePath, trace)))
    };
    return node;
  }));
  traceResolution(trace, sourcePath);
  return { ...ast, children };
}

function traceSkippedResolution(ast: MarkdownAst, sourcePath: string | undefined): MarkdownAst {
  const unresolvedFigures = ast.children.filter((node) => node.type === "image" || node.type === "figure").length;
  if (unresolvedFigures > 0) {
    debugLog("assets", "[assets] resolution skipped", {
      sourcePath,
      figures: unresolvedFigures,
      reason: "no project assets"
    });
  }
  return ast;
}

function traceResolution(trace: AssetResolutionTrace, sourcePath: string | undefined): void {
  if (trace.matched.length > 0 || trace.unresolved.length > 0) {
    debugGroup("assets", `[assets] resolved ${trace.matched.length}, unresolved ${trace.unresolved.length}`, () => [
      ["document", { sourcePath }],
      ["matched", trace.matched],
      ["unresolved", trace.unresolved]
    ], trace.unresolved.length > 0 ? "warn" : "log");
  }
}

async function resolveImage(image: ImageNode, resources: DocumentResourceProvider, sourcePath: string | undefined, trace: AssetResolutionTrace): Promise<ImageNode> {
  const sources = await resolveSources(image.sources ?? [image.src], resources, sourcePath, trace);
  return { ...image, src: sources[0] ?? image.src, sources };
}

async function resolveFigureImage(image: FigureImageNode, resources: DocumentResourceProvider, sourcePath: string | undefined, trace: AssetResolutionTrace): Promise<FigureImageNode> {
  const sources = await resolveSources(image.sources ?? [image.src], resources, sourcePath, trace);
  return { ...image, src: sources[0] ?? image.src, sources };
}

function resolveImageSync(image: ImageNode, resources: DocumentResourceProvider, sourcePath: string | undefined, trace: AssetResolutionTrace): ImageNode {
  const sources = resolveSourcesSync(image.sources ?? [image.src], resources, sourcePath, trace);
  return { ...image, src: sources[0] ?? image.src, sources };
}

function resolveFigureImageSync(image: FigureImageNode, resources: DocumentResourceProvider, sourcePath: string | undefined, trace: AssetResolutionTrace): FigureImageNode {
  const sources = resolveSourcesSync(image.sources ?? [image.src], resources, sourcePath, trace);
  return { ...image, src: sources[0] ?? image.src, sources };
}

async function resolveSources(sources: string[], resources: DocumentResourceProvider, sourcePath: string | undefined, trace: AssetResolutionTrace): Promise<string[]> {
  const resolved: string[] = [];
  for (const source of sources) {
    if (isExternalSource(source)) {
      resolved.push(source);
      continue;
    }
    const resourcePath = resources.resolve(source, sourcePath);
    const match = await resources.getUrl(source, sourcePath);
    if (match) {
      trace.matched.push({
        source,
        candidates: [resourcePath],
        resolved: summarizeResolvedSource(match)
      });
      resolved.push(match);
    }
    else {
      trace.unresolved.push({
        source,
        candidates: [resourcePath]
      });
      resolved.push(source);
    }
  }
  return [...new Set(resolved)];
}

function resolveSourcesSync(sources: string[], resources: DocumentResourceProvider, sourcePath: string | undefined, trace: AssetResolutionTrace): string[] {
  const resolved: string[] = [];
  for (const source of sources) {
    if (isExternalSource(source)) {
      resolved.push(source);
      continue;
    }
    const resourcePath = resources.resolve(source, sourcePath);
    const match = resources.getUrl(source, sourcePath);
    if (isPromiseLike(match)) throw new Error("An asynchronous resource provider requires createDocumentEngine().layout().");
    if (match) {
      trace.matched.push({ source, candidates: [resourcePath], resolved: summarizeResolvedSource(match) });
      resolved.push(match);
    } else {
      trace.unresolved.push({ source, candidates: [resourcePath] });
      resolved.push(source);
    }
  }
  return [...new Set(resolved)];
}

function summarizeResolvedSource(source: string): string {
  if (source.startsWith("blob:")) return `${source.slice(0, 48)}${source.length > 48 ? "..." : ""}`;
  if (source.startsWith("data:")) return `${source.slice(0, 40)}... (${source.length} chars)`;
  return source;
}

function isExternalSource(source: string): boolean {
  return /^(?:data:|blob:|https?:|file:|\/)/i.test(source);
}
