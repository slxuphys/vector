import type { PlaygroundProject, ProjectFile, ProjectFileLanguage, ProjectTextFile } from "./projectTypes";

export type ProjectFileSystemKind = "opfs" | "local";

export interface ProjectFileSystemBackend {
  readonly kind: ProjectFileSystemKind;
  loadProject(): Promise<PlaygroundProject>;
  writeTextFile(path: string, content: string): Promise<void>;
  createTextFile(path: string, content?: string): Promise<void>;
  createDirectory(path: string): Promise<void>;
  writeFile(path: string, data: Blob): Promise<void>;
  readFile(path: string): Promise<File>;
  renameEntry(path: string, nextPath: string): Promise<void>;
  deleteEntry(path: string): Promise<void>;
}

export type LoadedProjectBackend = {
  project: PlaygroundProject;
  backend: ProjectFileSystemBackend;
};

export type ProjectDirectorySnapshot = {
  files: ProjectFile[];
  directories: string[];
};

export const editableProjectExtensions = new Set(["md", "markdown", "tex", "latex", "bib", "txt", "sty", "cls"]);
const imageExtensions = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "avif", "bmp"]);

export function isEditableProjectPath(path: string): boolean {
  return editableProjectExtensions.has(extensionForPath(path));
}

export function chooseEntryFile(files: ProjectFile[], preferred?: string): string {
  const textFiles = files.filter((file): file is ProjectTextFile => file.kind === "text");
  if (preferred && textFiles.some((file) => file.path === preferred)) return preferred;
  return textFiles.find((file) => file.language === "latex")?.path
    ?? textFiles.find((file) => file.language === "markdown")?.path
    ?? textFiles[0]?.path
    ?? "main.md";
}

export function normalizeProjectPath(path: string): string {
  return path.trim().replaceAll("\\", "/").replace(/^\.\//, "").replace(/^\/+|\/+$/g, "");
}

export function validateProjectPath(path: string): string | undefined {
  const normalized = normalizeProjectPath(path);
  if (!normalized) return "Enter a name.";
  if (normalized.includes("//") || normalized.split("/").some((segment) => !segment || segment === "." || segment === "..")) {
    return "Enter a valid project path.";
  }
  return undefined;
}

export async function readProjectDirectory(root: FileSystemDirectoryHandle): Promise<ProjectDirectorySnapshot> {
  const snapshot: ProjectDirectorySnapshot = { files: [], directories: [] };
  await collectEntries(root, "", snapshot);
  snapshot.files.sort((left, right) => left.path.localeCompare(right.path));
  snapshot.directories.sort((left, right) => left.localeCompare(right));
  return snapshot;
}

export function directoryEntries(directory: FileSystemDirectoryHandle): AsyncIterableIterator<[string, FileSystemHandle]> {
  return (directory as FileSystemDirectoryHandle & {
    entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
  }).entries();
}

export async function writeTextFile(root: FileSystemDirectoryHandle, path: string, content: string): Promise<void> {
  await writeProjectFile(root, path, new Blob([content], { type: "text/plain;charset=utf-8" }));
}

export async function writeProjectFile(root: FileSystemDirectoryHandle, path: string, data: Blob): Promise<void> {
  const { directory, name } = await resolveParent(root, path, true);
  const handle = await directory.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  await writable.write(data);
  await writable.close();
}

export async function createProjectDirectory(root: FileSystemDirectoryHandle, path: string): Promise<void> {
  const segments = pathSegments(path);
  let directory = root;
  for (const segment of segments) directory = await directory.getDirectoryHandle(segment, { create: true });
}

export async function readProjectFile(root: FileSystemDirectoryHandle, path: string): Promise<File> {
  const { directory, name } = await resolveParent(root, path, false);
  return (await directory.getFileHandle(name)).getFile();
}

export async function deleteProjectEntry(root: FileSystemDirectoryHandle, path: string): Promise<void> {
  const { directory, name } = await resolveParent(root, path, false);
  await directory.removeEntry(name, { recursive: true });
}

export async function renameProjectEntry(root: FileSystemDirectoryHandle, path: string, nextPath: string): Promise<void> {
  const normalized = normalizeProjectPath(path);
  const normalizedNext = normalizeProjectPath(nextPath);
  if (normalized === normalizedNext) return;
  const source = await getEntry(root, normalized);
  if (source.kind === "file") {
    await writeProjectFile(root, normalizedNext, await (source as FileSystemFileHandle).getFile());
  } else {
    const target = await getDirectory(root, normalizedNext, true);
    await copyDirectory(source as FileSystemDirectoryHandle, target);
  }
  await deleteProjectEntry(root, normalized);
}

export function languageForProjectPath(path: string): ProjectFileLanguage {
  const extension = extensionForPath(path);
  if (extension === "md" || extension === "markdown") return "markdown";
  if (extension === "tex" || extension === "latex") return "latex";
  if (extension === "bib") return "bibtex";
  return "text";
}

export function isFigureAssetPath(path: string): boolean {
  const extension = extensionForPath(path);
  return extension === "pdf" || imageExtensions.has(extension);
}

export function revokeProjectObjectUrls(project: PlaygroundProject | undefined): void {
  if (!project || typeof URL === "undefined" || typeof URL.revokeObjectURL !== "function") return;
  for (const file of project.files) if (file.kind !== "text" && file.url.startsWith("blob:")) URL.revokeObjectURL(file.url);
}

async function collectEntries(
  directory: FileSystemDirectoryHandle,
  prefix: string,
  snapshot: ProjectDirectorySnapshot
): Promise<void> {
  for await (const [name, handle] of directoryEntries(directory)) {
    if (name === "node_modules" || name === ".git" || name === ".vector-project.json") continue;
    const path = prefix ? `${prefix}/${name}` : name;
    if (handle.kind === "directory") {
      snapshot.directories.push(path);
      await collectEntries(handle as FileSystemDirectoryHandle, path, snapshot);
      continue;
    }
    const file = await (handle as FileSystemFileHandle).getFile();
    if (isEditableProjectPath(path)) {
      snapshot.files.push({ kind: "text", path, content: await file.text(), language: languageForProjectPath(path) });
    } else {
      const mimeType = file.type || mimeTypeForPath(path);
      snapshot.files.push({
        kind: isFigureAssetPath(path) ? "asset" : "binary",
        path,
        mimeType,
        size: file.size,
        url: URL.createObjectURL(file)
      });
    }
  }
}

async function resolveParent(
  root: FileSystemDirectoryHandle,
  path: string,
  create: boolean
): Promise<{ directory: FileSystemDirectoryHandle; name: string }> {
  const segments = pathSegments(path);
  const name = segments.pop();
  if (!name) throw new Error("A file name is required.");
  let directory = root;
  for (const segment of segments) directory = await directory.getDirectoryHandle(segment, { create });
  return { directory, name };
}

async function getDirectory(root: FileSystemDirectoryHandle, path: string, create: boolean): Promise<FileSystemDirectoryHandle> {
  let directory = root;
  for (const segment of pathSegments(path)) directory = await directory.getDirectoryHandle(segment, { create });
  return directory;
}

async function getEntry(root: FileSystemDirectoryHandle, path: string): Promise<FileSystemHandle> {
  const { directory, name } = await resolveParent(root, path, false);
  try {
    return await directory.getFileHandle(name);
  } catch {
    return directory.getDirectoryHandle(name);
  }
}

async function copyDirectory(source: FileSystemDirectoryHandle, target: FileSystemDirectoryHandle): Promise<void> {
  for await (const [name, handle] of directoryEntries(source)) {
    if (handle.kind === "file") {
      await writeProjectFile(target, name, await (handle as FileSystemFileHandle).getFile());
    } else {
      const child = await target.getDirectoryHandle(name, { create: true });
      await copyDirectory(handle as FileSystemDirectoryHandle, child);
    }
  }
}

function pathSegments(path: string): string[] {
  const normalized = normalizeProjectPath(path);
  const error = validateProjectPath(normalized);
  if (error) throw new Error(error);
  return normalized.split("/");
}

function extensionForPath(path: string): string {
  const name = normalizeProjectPath(path).split("/").pop() ?? "";
  return name.includes(".") ? name.split(".").pop()?.toLowerCase() ?? "" : "";
}

function mimeTypeForPath(path: string): string {
  const extension = extensionForPath(path);
  if (extension === "pdf") return "application/pdf";
  if (extension === "svg") return "image/svg+xml";
  if (extension === "png") return "image/png";
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "gif") return "image/gif";
  if (extension === "webp") return "image/webp";
  if (extension === "avif") return "image/avif";
  return "application/octet-stream";
}
