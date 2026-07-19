import { useEffect, useMemo, useRef } from "react";
import {
  normalizeResourcePath,
  resolveResourcePath,
  type DocumentResourceProvider
} from "../../core/resources";
import { isProjectTextFile, type PlaygroundProject, type ProjectFile } from "./projectTypes";

type ProjectFileReader = (projectId: string, path: string) => Promise<File | undefined>;

type UrlCacheEntry = {
  version: string;
  promise: Promise<string | undefined>;
};

type ProjectResourceCache = {
  text: Map<string, { version: string; promise: Promise<string | undefined> }>;
  binary: Map<string, { version: string; promise: Promise<Uint8Array | undefined> }>;
  urls: Map<string, UrlCacheEntry>;
};

export function useProjectResources(
  project: PlaygroundProject,
  readFile: ProjectFileReader
): DocumentResourceProvider {
  const caches = useRef(new Map<string, ProjectResourceCache>());

  useEffect(() => () => {
    for (const cache of caches.current.values()) revokeCachedUrls(cache);
    caches.current.clear();
  }, []);

  useEffect(() => () => {
    const cache = caches.current.get(project.id);
    if (!cache) return;
    revokeCachedUrls(cache);
    caches.current.delete(project.id);
  }, [project.id]);

  return useMemo(() => {
    const cache = getProjectCache(caches.current, project.id);
    pruneCache(cache, project.files);
    return buildProjectResourceProvider(project, readFile, cache);
  }, [project, readFile]);
}

export function createProjectResourceProvider(
  project: PlaygroundProject,
  readFile: ProjectFileReader
): DocumentResourceProvider {
  return buildProjectResourceProvider(project, readFile, {
    text: new Map(),
    binary: new Map(),
    urls: new Map()
  });
}

function buildProjectResourceProvider(
  project: PlaygroundProject,
  readFile: ProjectFileReader,
  cache: ProjectResourceCache
): DocumentResourceProvider {
  const knownPaths = new Set(project.files.map((file) => normalizeResourcePath(file.path)));
  const findFile = (path: string, from?: string): ProjectFile | undefined => {
    const resolved = resolveResourcePath(path, from);
    const normalized = normalizeResourcePath(path);
    const direct = project.files.find((file) => file.path === resolved || file.path === normalized);
    if (direct) return direct;
    for (const candidate of [resolved, normalized]) {
      const suffix = `/${candidate}`;
      const matches = project.files.filter((file) => file.path.endsWith(suffix));
      if (matches.length === 1) return matches[0];
    }
    return undefined;
  };
  const resolve = (path: string, from?: string): string => {
    const resolved = resolveResourcePath(path, from);
    if (knownPaths.has(resolved)) return resolved;
    const normalized = normalizeResourcePath(path);
    return knownPaths.has(normalized) ? normalized : resolved;
  };

  return {
    resolve,
    readText(path, from) {
      const file = findFile(path, from);
      if (!file || !isProjectTextFile(file)) return undefined;
      if (file.content !== undefined) return file.content;
      const version = fileVersion(file);
      const cached = cache.text.get(file.path);
      if (cached?.version === version) return cached.promise;
      const load = readFile(project.id, file.path).then((source) => source?.text());
      const promise = load.catch((error) => {
        if (cache.text.get(file.path)?.promise === promise) cache.text.delete(file.path);
        throw error;
      });
      cache.text.set(file.path, { version, promise });
      return promise;
    },
    readBinary(path, from) {
      const file = findFile(path, from);
      if (!file) return undefined;
      const version = fileVersion(file);
      const cached = cache.binary.get(file.path);
      if (cached?.version === version) return cached.promise;
      const load = readFile(project.id, file.path).then(async (source) => source
        ? new Uint8Array(await source.arrayBuffer())
        : undefined);
      const promise = load.catch((error) => {
        if (cache.binary.get(file.path)?.promise === promise) cache.binary.delete(file.path);
        throw error;
      });
      cache.binary.set(file.path, { version, promise });
      return promise;
    },
    getUrl(path, from) {
      const file = findFile(path, from);
      if (!file || isProjectTextFile(file)) return undefined;
      if (file.url) return withPdfMarker(file.url, file.path);
      const version = fileVersion(file);
      const cached = cache.urls.get(file.path);
      if (cached?.version === version) return cached.promise;
      if (cached) revokeUrlPromise(cached.promise);
      const load = readFile(project.id, file.path).then((source) => source
        ? withPdfMarker(URL.createObjectURL(source), file.path)
        : undefined);
      const promise = load.catch((error) => {
        if (cache.urls.get(file.path)?.promise === promise) cache.urls.delete(file.path);
        throw error;
      });
      cache.urls.set(file.path, { version, promise });
      return promise;
    }
  } satisfies DocumentResourceProvider;
}

function getProjectCache(caches: Map<string, ProjectResourceCache>, projectId: string): ProjectResourceCache {
  const cached = caches.get(projectId);
  if (cached) return cached;
  const created: ProjectResourceCache = { text: new Map(), binary: new Map(), urls: new Map() };
  caches.set(projectId, created);
  return created;
}

function pruneCache(cache: ProjectResourceCache, files: ProjectFile[]): void {
  const versions = new Map(files.map((file) => [file.path, fileVersion(file)]));
  pruneMap(cache.text, versions);
  pruneMap(cache.binary, versions);
  for (const [path, entry] of cache.urls) {
    if (versions.get(path) === entry.version) continue;
    revokeUrlPromise(entry.promise);
    cache.urls.delete(path);
  }
}

function pruneMap<T>(
  cache: Map<string, { version: string; promise: Promise<T> }>,
  versions: Map<string, string>
): void {
  for (const [path, entry] of cache) if (versions.get(path) !== entry.version) cache.delete(path);
}

function revokeCachedUrls(cache: ProjectResourceCache): void {
  for (const entry of cache.urls.values()) revokeUrlPromise(entry.promise);
  cache.urls.clear();
}

function revokeUrlPromise(promise: Promise<string | undefined>): void {
  void promise.then((url) => {
    const source = url?.split("#", 1)[0];
    if (source?.startsWith("blob:")) URL.revokeObjectURL(source);
  }).catch(() => undefined);
}

function fileVersion(file: ProjectFile): string {
  return `${file.lastModified ?? "memory"}:${file.kind === "text" ? file.content?.length ?? "lazy" : file.size}`;
}

function withPdfMarker(url: string, path: string): string {
  return /\.pdf$/i.test(path) ? `${url.split("#", 1)[0]}#asset.pdf` : url;
}
