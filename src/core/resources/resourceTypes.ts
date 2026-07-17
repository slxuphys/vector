export type ResourceResult<T> = T | Promise<T>;

export interface DocumentResourceProvider {
  resolve(path: string, from?: string): string;
  readText(path: string, from?: string): ResourceResult<string | undefined>;
  readBinary(path: string, from?: string): ResourceResult<Uint8Array | undefined>;
  getUrl(path: string, from?: string): ResourceResult<string | undefined>;
}

export type MemoryResourceProviderInput = {
  text?: Record<string, string>;
  binary?: Record<string, Uint8Array>;
  urls?: Record<string, string>;
};

export function createMemoryResourceProvider(input: MemoryResourceProviderInput): DocumentResourceProvider {
  const text = normalizeEntries(input.text);
  const binary = normalizeEntries(input.binary);
  const urls = normalizeEntries(input.urls);
  const knownPaths = new Set([...Object.keys(text), ...Object.keys(binary), ...Object.keys(urls)]);

  const find = <T>(entries: Record<string, T>, path: string, from?: string): T | undefined => {
    const resolved = resolveResourcePath(path, from);
    const normalized = normalizeResourcePath(path);
    const direct = entries[resolved] ?? entries[normalized];
    if (direct !== undefined) return direct;
    for (const candidate of [resolved, normalized]) {
      const suffix = `/${candidate}`;
      const matches = Object.entries(entries).filter(([entryPath]) => entryPath.endsWith(suffix));
      if (matches.length === 1) return matches[0][1];
    }
    return undefined;
  };

  return {
    resolve(path, from) {
      const resolved = resolveResourcePath(path, from);
      if (knownPaths.has(resolved)) return resolved;
      const normalized = normalizeResourcePath(path);
      return knownPaths.has(normalized) ? normalized : resolved;
    },
    readText: (path, from) => find(text, path, from),
    readBinary: (path, from) => find(binary, path, from),
    getUrl: (path, from) => find(urls, path, from)
  };
}

export function createLegacyResourceProvider(input: {
  bibliographyFiles?: Record<string, string>;
  assetUrls?: Record<string, string>;
}): DocumentResourceProvider | undefined {
  if (!input.bibliographyFiles && !input.assetUrls) return undefined;
  return createMemoryResourceProvider({ text: input.bibliographyFiles, urls: input.assetUrls });
}

export function resolveResourcePath(path: string, from?: string): string {
  const decoded = decodeResourcePath(path);
  if (/^(?:data:|blob:|https?:|file:)/i.test(decoded)) return decoded;
  if (!from || isAbsoluteResource(path)) {
    const normalized = normalizeResourcePath(decoded);
    return decoded.startsWith("/") ? `/${normalized}` : normalized;
  }
  const source = normalizeResourcePath(from);
  const slash = source.lastIndexOf("/");
  const directory = slash < 0 ? "" : source.slice(0, slash);
  return normalizeResourcePath(directory ? `${directory}/${decoded}` : decoded);
}

export function normalizeResourcePath(path: string): string {
  const output: string[] = [];
  for (const part of path.replaceAll("\\", "/").split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") output.pop();
    else output.push(part);
  }
  return output.join("/");
}

export function isPromiseLike<T>(value: ResourceResult<T>): value is Promise<T> {
  return typeof (value as Promise<T> | undefined)?.then === "function";
}

function normalizeEntries<T>(entries: Record<string, T> | undefined): Record<string, T> {
  return Object.fromEntries(Object.entries(entries ?? {}).map(([path, value]) => [normalizeResourcePath(path), value]));
}

function decodeResourcePath(path: string): string {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

function isAbsoluteResource(path: string): boolean {
  return /^(?:[a-z][a-z\d+.-]*:|\/|[a-z]:[\\/])/i.test(path);
}
