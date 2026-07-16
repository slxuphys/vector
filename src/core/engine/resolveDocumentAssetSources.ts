import type { FigureImageNode, ImageNode, MarkdownAst } from "../markdown/markdownTypes";
import { debugGroup, debugLog } from "../utils/debugSettings";

type AssetResolutionTrace = {
  matched: Array<{ source: string; candidates: string[]; resolved: string }>;
  unresolved: Array<{ source: string; candidates: string[] }>;
};

export function resolveDocumentAssetSources(
  ast: MarkdownAst,
  assetUrls: Record<string, string> | undefined,
  sourcePath: string | undefined
): MarkdownAst {
  if (!assetUrls || Object.keys(assetUrls).length === 0) {
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
  const sourceDirectory = dirname(normalizePath(sourcePath ?? ""));
  const trace: AssetResolutionTrace = { matched: [], unresolved: [] };
  const result = {
    ...ast,
    children: ast.children.map((node) => {
      if (node.type === "image") return resolveImage(node, assetUrls, sourceDirectory, trace);
      if (node.type === "figure") return {
        ...node,
        images: node.images.map((image) => resolveFigureImage(image, assetUrls, sourceDirectory, trace))
      };
      return node;
    })
  };
  if (trace.matched.length > 0 || trace.unresolved.length > 0) {
    debugGroup("assets", `[assets] resolved ${trace.matched.length}, unresolved ${trace.unresolved.length}`, () => [
      ["document", { sourcePath, sourceDirectory }],
      ["matched", trace.matched],
      ["unresolved", trace.unresolved],
      ["available paths", Object.keys(assetUrls)]
    ], trace.unresolved.length > 0 ? "warn" : "log");
  }
  return result;
}

function resolveImage(image: ImageNode, assets: Record<string, string>, sourceDirectory: string, trace: AssetResolutionTrace): ImageNode {
  const sources = resolveSources(image.sources ?? [image.src], assets, sourceDirectory, trace);
  return { ...image, src: sources[0] ?? image.src, sources };
}

function resolveFigureImage(image: FigureImageNode, assets: Record<string, string>, sourceDirectory: string, trace: AssetResolutionTrace): FigureImageNode {
  const sources = resolveSources(image.sources ?? [image.src], assets, sourceDirectory, trace);
  return { ...image, src: sources[0] ?? image.src, sources };
}

function resolveSources(sources: string[], assets: Record<string, string>, sourceDirectory: string, trace: AssetResolutionTrace): string[] {
  const resolved: string[] = [];
  for (const source of sources) {
    if (isExternalSource(source)) {
      resolved.push(source);
      continue;
    }
    const normalized = normalizePath(decodePath(source));
    const relative = sourceDirectory ? normalizePath(`${sourceDirectory}/${normalized}`) : normalized;
    const match = findAsset(assets, relative, normalized);
    if (match) {
      trace.matched.push({
        source,
        candidates: [relative, normalized],
        resolved: summarizeResolvedSource(match)
      });
      resolved.push(match);
    }
    else {
      trace.unresolved.push({
        source,
        candidates: [relative, normalized]
      });
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

function findAsset(assets: Record<string, string>, ...paths: string[]): string | undefined {
  for (const path of paths) {
    const direct = assets[path];
    if (direct) return direct;
  }

  for (const path of paths) {
    const suffix = `/${path}`;
    const matches = Object.entries(assets).filter(([assetPath]) => assetPath.endsWith(suffix));
    if (matches.length === 1) return matches[0][1];
  }
  return undefined;
}

function decodePath(path: string): string {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

function isExternalSource(source: string): boolean {
  return /^(?:data:|blob:|https?:|file:|\/)/i.test(source);
}

function normalizePath(path: string): string {
  const result: string[] = [];
  for (const segment of path.replaceAll("\\", "/").split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") result.pop(); else result.push(segment);
  }
  return result.join("/");
}

function dirname(path: string): string {
  const index = path.lastIndexOf("/");
  return index < 0 ? "" : path.slice(0, index);
}
