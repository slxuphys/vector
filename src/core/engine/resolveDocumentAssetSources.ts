import type { FigureImageNode, ImageNode, MarkdownAst } from "../markdown/markdownTypes";

export function resolveDocumentAssetSources(
  ast: MarkdownAst,
  assetUrls: Record<string, string> | undefined,
  sourcePath: string | undefined
): MarkdownAst {
  if (!assetUrls || Object.keys(assetUrls).length === 0) {
    const unresolvedFigures = ast.children.filter((node) => node.type === "image" || node.type === "figure").length;
    if (unresolvedFigures > 0) {
      console.log("[asset-resolve] skipped", {
        sourcePath,
        figures: unresolvedFigures,
        reason: "no project assets"
      });
    }
    return ast;
  }
  const sourceDirectory = dirname(normalizePath(sourcePath ?? ""));
  console.log("[asset-resolve] start", {
    sourcePath,
    sourceDirectory,
    available: Object.keys(assetUrls)
  });
  return {
    ...ast,
    children: ast.children.map((node) => {
      if (node.type === "image") return resolveImage(node, assetUrls, sourceDirectory);
      if (node.type === "figure") return {
        ...node,
        images: node.images.map((image) => resolveFigureImage(image, assetUrls, sourceDirectory))
      };
      return node;
    })
  };
}

function resolveImage(image: ImageNode, assets: Record<string, string>, sourceDirectory: string): ImageNode {
  const sources = resolveSources(image.sources ?? [image.src], assets, sourceDirectory);
  return { ...image, src: sources[0] ?? image.src, sources };
}

function resolveFigureImage(image: FigureImageNode, assets: Record<string, string>, sourceDirectory: string): FigureImageNode {
  const sources = resolveSources(image.sources ?? [image.src], assets, sourceDirectory);
  return { ...image, src: sources[0] ?? image.src, sources };
}

function resolveSources(sources: string[], assets: Record<string, string>, sourceDirectory: string): string[] {
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
      console.log("[asset-resolve] matched", {
        source,
        candidates: [relative, normalized],
        resolved: summarizeResolvedSource(match)
      });
      resolved.push(match);
    }
    else {
      console.warn("[asset-resolve] unresolved project asset", {
        source,
        sourceDirectory,
        candidates: [relative, normalized],
        available: Object.keys(assets)
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
