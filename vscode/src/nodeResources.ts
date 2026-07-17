import * as path from "node:path";
import * as vscode from "vscode";
import type { DocumentResourceProvider } from "../../src/core/resources";

type CachedResource<T> = {
  mtime: number;
  size: number;
  value: T;
};

const textCache = new Map<string, CachedResource<string>>();
const binaryCache = new Map<string, CachedResource<Uint8Array>>();
const maxEntries = 64;

export function createNodeResourceProvider(document: vscode.TextDocument): DocumentResourceProvider {
  return {
    resolve(resourcePath, from) {
      return resolveLocalPath(document, resourcePath, from);
    },
    readText(resourcePath, from) {
      return readCached(document, resourcePath, from, textCache, (bytes) => new TextDecoder().decode(bytes));
    },
    readBinary(resourcePath, from) {
      return readCached(document, resourcePath, from, binaryCache, (bytes) => bytes);
    },
    getUrl(resourcePath, from) {
      return resolveLocalPath(document, resourcePath, from);
    }
  };
}

function resolveLocalPath(document: vscode.TextDocument, resourcePath: string, from?: string): string {
  const raw = resourcePath.split(/[?#]/, 1)[0];
  let clean = raw;
  try {
    clean = decodeURIComponent(raw);
  } catch {
    // Keep malformed percent escapes literal so the caller receives a normal missing-resource result.
  }
  if (path.isAbsolute(clean)) return path.normalize(clean).replaceAll("\\", "/");
  const sourcePath = from && path.isAbsolute(from) ? from : document.uri.fsPath;
  return path.resolve(path.dirname(sourcePath), clean).replaceAll("\\", "/");
}

async function readCached<T>(
  document: vscode.TextDocument,
  resourcePath: string,
  from: string | undefined,
  cache: Map<string, CachedResource<T>>,
  decode: (bytes: Uint8Array) => T
): Promise<T | undefined> {
  if (document.uri.scheme !== "file") return undefined;
  const resolved = resolveLocalPath(document, resourcePath, from);
  const uri = vscode.Uri.file(resolved);
  try {
    const stat = await vscode.workspace.fs.stat(uri);
    const key = uri.toString();
    const cached = cache.get(key);
    if (cached && cached.mtime === stat.mtime && cached.size === stat.size) return cached.value;
    const value = decode(await vscode.workspace.fs.readFile(uri));
    cache.delete(key);
    cache.set(key, { mtime: stat.mtime, size: stat.size, value });
    trimCache(cache);
    return value;
  } catch {
    return undefined;
  }
}

function trimCache<T>(cache: Map<string, CachedResource<T>>): void {
  while (cache.size > maxEntries) {
    const oldest = cache.keys().next().value as string | undefined;
    if (!oldest) return;
    cache.delete(oldest);
  }
}
