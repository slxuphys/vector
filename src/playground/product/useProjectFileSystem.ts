import { useCallback, useEffect, useRef, useState } from "react";
import { strToU8, zip } from "fflate";
import { openLocalFolderProject } from "./localFolderProjectFileSystem";
import { createOpfsProject, deleteOpfsProject, listOpfsProjects } from "./opfsProjectFileSystem";
import {
  isFigureAssetPath,
  languageForProjectPath,
  normalizeProjectPath,
  revokeProjectObjectUrls,
  validateProjectPath,
  type ProjectFileSystemBackend
} from "./projectFileSystem";
import { sampleProjects } from "./sampleProjects";
import { isProjectTextFile, type PlaygroundProject, type ProjectFile, type ProjectFileLanguage } from "./projectTypes";

export type ProjectStorageStatus = "idle" | "loading" | "saving" | "saved" | "error";

export function useProjectFileSystem() {
  const [projects, setProjects] = useState<PlaygroundProject[]>(() => structuredClone(sampleProjects));
  const [projectId, setProjectId] = useState(sampleProjects[0].id);
  const [activePath, setActivePath] = useState(sampleProjects[0].entryFile);
  const [storageStatus, setStorageStatus] = useState<ProjectStorageStatus>("loading");
  const [storageError, setStorageError] = useState<string | undefined>();
  const backends = useRef(new Map<string, ProjectFileSystemBackend>());
  const saveTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const saveChains = useRef(new Map<string, Promise<void>>());
  const pendingEdits = useRef(new Map<string, { projectId: string; path: string; content: string }>());
  const projectsRef = useRef(projects);
  const projectIdRef = useRef(projectId);
  const activePathRef = useRef(activePath);
  projectsRef.current = projects;
  projectIdRef.current = projectId;
  activePathRef.current = activePath;

  const project = projects.find((candidate) => candidate.id === projectId) ?? projects[0];
  const activeFile = project.files.find((file) => file.path === activePath)
    ?? project.files.find((file) => file.path === project.entryFile)
    ?? project.files[0];

  useEffect(() => {
    let disposed = false;
    void listOpfsProjects()
      .then((loaded) => {
        if (disposed) return;
        for (const item of loaded) backends.current.set(item.project.id, item.backend);
        setProjects((current) => {
          const ids = new Set(current.map((candidate) => candidate.id));
          return [...current, ...loaded.map((item) => item.project).filter((candidate) => !ids.has(candidate.id))];
        });
        setStorageStatus("idle");
      })
      .catch((error) => setOperationError(error, "Could not load browser projects."));
    return () => { disposed = true; };
  }, []);

  useEffect(() => () => {
    for (const timer of saveTimers.current.values()) clearTimeout(timer);
    for (const edit of pendingEdits.current.values()) {
      const backend = backends.current.get(edit.projectId);
      if (backend) void backend.writeTextFile(edit.path, edit.content);
    }
    for (const current of projectsRef.current) revokeProjectObjectUrls(current);
  }, []);

  const commitPendingEdit = useCallback((currentProjectId: string, currentPath: string) => {
    const edit = pendingEdits.current.get(editKey(currentProjectId, currentPath));
    if (!edit) return;
    const key = editKey(currentProjectId, currentPath);
    const timer = saveTimers.current.get(key);
    if (timer) clearTimeout(timer);
    saveTimers.current.delete(key);
    pendingEdits.current.delete(key);
    setProjects((current) => applyTextEdit(current, edit));
    void persistTextEdit(edit).catch(() => undefined);
  }, []);

  const selectProject = useCallback((nextId: string) => {
    commitPendingEdit(projectIdRef.current, activePathRef.current);
    const nextProject = projects.find((candidate) => candidate.id === nextId);
    if (!nextProject) return;
    setProjectId(nextId);
    setActivePath(nextProject.entryFile);
    setStorageError(undefined);
    setStorageStatus("idle");
  }, [commitPendingEdit, projects]);

  const selectFile = useCallback((nextPath: string) => {
    commitPendingEdit(projectIdRef.current, activePathRef.current);
    setActivePath(nextPath);
  }, [commitPendingEdit]);

  const updateActiveFile = useCallback((content: string) => {
    if (!activeFile || !isProjectTextFile(activeFile)) return;
    const currentProjectId = project.id;
    const currentPath = activeFile.path;
    const saveKey = editKey(currentProjectId, currentPath);
    pendingEdits.current.set(saveKey, { projectId: currentProjectId, path: currentPath, content });
    const backend = backends.current.get(currentProjectId);
    const existing = saveTimers.current.get(saveKey);
    if (existing) clearTimeout(existing);
    if (backend) {
      setStorageStatus("saving");
      setStorageError(undefined);
    }
    saveTimers.current.set(saveKey, setTimeout(() => {
      saveTimers.current.delete(saveKey);
      const edit = pendingEdits.current.get(saveKey);
      if (edit?.content === content) pendingEdits.current.delete(saveKey);
      setProjects((current) => applyTextEdit(current, { projectId: currentProjectId, path: currentPath, content }));
      if (backend) void persistTextEdit({ projectId: currentProjectId, path: currentPath, content }).catch(() => undefined);
    }, 300));
  }, [activeFile, project.id]);

  const addFile = useCallback(async (requestedPath: string): Promise<string | undefined> => {
    const path = normalizeProjectPath(requestedPath);
    const pathError = validateProjectPath(path);
    if (pathError) return pathError;
    if (hasEntry(project, path)) return "An entry with this name already exists.";
    const backend = backends.current.get(project.id);
    try {
      await flushPendingEntries(project.id, activePath);
      if (backend) await backend.createTextFile(path);
      const file: ProjectFile = { kind: "text", path, content: "", language: languageForPath(path) };
      setProjects((current) => current.map((candidate) => candidate.id === project.id
        ? { ...candidate, files: [...candidate.files, file] }
        : candidate));
      setActivePath(path);
      setStorageStatus(backend ? "saved" : "idle");
      return undefined;
    } catch (error) {
      return setOperationError(error, `Could not create ${path}.`);
    }
  }, [activePath, project]);

  const addFolder = useCallback(async (requestedPath: string): Promise<string | undefined> => {
    const path = normalizeProjectPath(requestedPath);
    const pathError = validateProjectPath(path);
    if (pathError) return pathError;
    if (hasEntry(project, path)) return "An entry with this name already exists.";
    const backend = backends.current.get(project.id);
    try {
      if (backend) await backend.createDirectory(path);
      setProjects((current) => current.map((candidate) => {
        if (candidate.id !== project.id) return candidate;
        const directories = new Set(candidate.directories);
        addParentDirectories(`${path}/.folder`, directories);
        return { ...candidate, directories: [...directories].sort() };
      }));
      setStorageStatus(backend ? "saved" : "idle");
      return undefined;
    } catch (error) {
      return setOperationError(error, `Could not create ${path}.`);
    }
  }, [project]);

  const uploadFiles = useCallback(async (files: File[], targetDirectory = "", preserveFolders = false) => {
    if (files.length === 0) return;
    setStorageStatus("saving");
    setStorageError(undefined);
    const backend = backends.current.get(project.id);
    try {
      await flushPendingEntries(project.id);
      for (const file of files) {
        const relative = preserveFolders && file.webkitRelativePath ? file.webkitRelativePath : file.name;
        const path = normalizeProjectPath([targetDirectory, relative].filter(Boolean).join("/"));
        if (backend) await backend.writeFile(path, file);
      }
      await addUploadedFiles(files, targetDirectory, preserveFolders);
      setStorageStatus(backend ? "saved" : "idle");
    } catch (error) {
      setOperationError(error, "Could not upload the selected files.");
    }
  }, [activePath, project.id]);

  const renameEntry = useCallback(async (path: string, nextPathInput: string): Promise<string | undefined> => {
    const nextPath = normalizeProjectPath(nextPathInput);
    const pathError = validateProjectPath(nextPath);
    if (pathError) return pathError;
    if (nextPath.startsWith(`${path}/`)) return "A folder cannot be moved inside itself.";
    if (path !== nextPath && hasEntry(project, nextPath)) return "An entry with this name already exists.";
    const backend = backends.current.get(project.id);
    try {
      await flushPendingEntries(project.id, path);
      if (backend) {
        await backend.renameEntry(path, nextPath);
      }
      setProjects((current) => current.map((candidate) => candidate.id === project.id
        ? renameMemoryEntry(candidate, path, nextPath)
        : candidate));
      setActivePath((current) => remapPath(current, path, nextPath));
      setStorageStatus(backend ? "saved" : "idle");
      return undefined;
    } catch (error) {
      return setOperationError(error, `Could not rename ${path}.`);
    }
  }, [activePath, project]);

  const deleteEntry = useCallback(async (path: string) => {
    const backend = backends.current.get(project.id);
    try {
      await discardPendingEntries(project.id, path);
      if (backend) {
        await backend.deleteEntry(path);
      }
      revokeEntryObjectUrls(project, path);
      setProjects((current) => current.map((candidate) => candidate.id === project.id
        ? deleteMemoryEntry(candidate, path)
        : candidate));
      if (activePath === path || activePath.startsWith(`${path}/`)) {
        const remaining = project.files.find((file) => file.path !== path && !file.path.startsWith(`${path}/`));
        if (remaining) setActivePath(remaining.path);
      }
      setStorageStatus(backend ? "saved" : "idle");
    } catch (error) {
      setOperationError(error, `Could not delete ${path}.`);
    }
  }, [activePath, project]);

  const downloadEntry = useCallback(async (path: string, directory: boolean) => {
    try {
      if (!directory) {
        const file = project.files.find((candidate) => candidate.path === path);
        if (!file) throw new Error("File not found.");
        downloadBlob(await blobForProjectFile(project.id, file), fileName(path));
        return;
      }
      const prefix = path ? `${path}/` : "";
      const selected = project.files.filter((file) => file.path.startsWith(prefix));
      const entries: Record<string, Uint8Array> = {};
      for (const file of selected) {
        const blob = await blobForProjectFile(project.id, file);
        entries[file.path.slice(prefix.length)] = new Uint8Array(await blob.arrayBuffer());
      }
      for (const directoryPath of project.directories.filter((candidate) => candidate.startsWith(prefix))) {
        const relative = directoryPath.slice(prefix.length);
        if (relative && !Object.keys(entries).some((entry) => entry.startsWith(`${relative}/`))) entries[`${relative}/`] = new Uint8Array();
      }
      const bytes = await zipFiles(entries);
      const zipBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      downloadBlob(new Blob([zipBuffer], { type: "application/zip" }), `${fileName(path || project.name)}.zip`);
    } catch (error) {
      setOperationError(error, `Could not download ${path || project.name}.`);
    }
  }, [project]);

  const createBrowserProject = useCallback(async (name: string) => {
    setStorageStatus("loading");
    setStorageError(undefined);
    try {
      await flushPendingEntries(projectIdRef.current, activePathRef.current);
      const loaded = await createOpfsProject(name);
      backends.current.set(loaded.project.id, loaded.backend);
      setProjects((current) => [...current, loaded.project]);
      setProjectId(loaded.project.id);
      setActivePath(loaded.project.entryFile);
      setStorageStatus("saved");
    } catch (error) {
      setOperationError(error, "Could not create a browser project.");
    }
  }, []);

  const openLocalFolder = useCallback(async () => {
    setStorageStatus("loading");
    setStorageError(undefined);
    try {
      await flushPendingEntries(projectIdRef.current, activePathRef.current);
      const loaded = await openLocalFolderProject();
      backends.current.set(loaded.project.id, loaded.backend);
      setProjects((current) => [...current, loaded.project]);
      setProjectId(loaded.project.id);
      setActivePath(loaded.project.entryFile);
      setStorageStatus("idle");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setStorageStatus("idle");
        return;
      }
      setOperationError(error, "Could not open the local folder.");
    }
  }, []);

  const removeProject = useCallback(async (id: string) => {
    const target = projectsRef.current.find((candidate) => candidate.id === id);
    if (!target || target.kind === "example") return;
    setStorageStatus(target.kind === "browser" ? "loading" : "idle");
    setStorageError(undefined);
    try {
      await flushPendingEntries(id);
      if (target.kind === "browser") await deleteOpfsProject(id);
      backends.current.delete(id);
      revokeProjectObjectUrls(target);
      setProjects((current) => current.filter((candidate) => candidate.id !== id));
      if (projectIdRef.current === id) {
        const fallback = sampleProjects[0];
        setProjectId(fallback.id);
        setActivePath(fallback.entryFile);
      }
      setStorageStatus(target.kind === "browser" ? "saved" : "idle");
    } catch (error) {
      setOperationError(error, target.kind === "browser" ? "Could not delete the browser project." : "Could not close the local folder.");
      throw error;
    }
  }, []);

  async function flushPendingEntries(id: string, path?: string): Promise<void> {
    const edits = matchingPendingEdits(pendingEdits.current, id, path);
    const inFlightWrites = matchingSaveChains(saveChains.current, id, path);
    for (const edit of edits) {
      const key = editKey(edit.projectId, edit.path);
      const timer = saveTimers.current.get(key);
      if (timer) clearTimeout(timer);
      saveTimers.current.delete(key);
      pendingEdits.current.delete(key);
    }
    if (edits.length > 0) setProjects((current) => edits.reduce(applyTextEdit, current));
    await Promise.all([
      ...inFlightWrites.map((write) => write.catch(() => undefined)),
      ...edits.map(persistTextEdit)
    ]);
  }

  async function discardPendingEntries(id: string, path: string): Promise<void> {
    const edits = matchingPendingEdits(pendingEdits.current, id, path);
    for (const edit of edits) {
      const key = editKey(edit.projectId, edit.path);
      const timer = saveTimers.current.get(key);
      if (timer) clearTimeout(timer);
      saveTimers.current.delete(key);
      pendingEdits.current.delete(key);
    }
    const matchingWrites = [...saveChains.current.entries()]
      .filter(([key]) => keyMatchesEntry(key, id, path))
      .map(([, write]) => write.catch(() => undefined));
    await Promise.all(matchingWrites);
  }

  async function persistTextEdit(edit: { projectId: string; path: string; content: string }): Promise<void> {
    const backend = backends.current.get(edit.projectId);
    if (!backend) return;
    const key = editKey(edit.projectId, edit.path);
    const previous = saveChains.current.get(key) ?? Promise.resolve();
    const write = previous.catch(() => undefined).then(() => backend.writeTextFile(edit.path, edit.content));
    saveChains.current.set(key, write);
    try {
      await write;
      if (saveChains.current.get(key) === write) {
        saveChains.current.delete(key);
        setStorageStatus("saved");
      }
    } catch (error) {
      if (saveChains.current.get(key) === write) saveChains.current.delete(key);
      setOperationError(error, `Could not save ${edit.path}.`);
      throw error;
    }
  }

  async function addUploadedFiles(files: File[], targetDirectory: string, preserveFolders: boolean) {
    const additions: ProjectFile[] = [];
    for (const file of files) {
      const relative = preserveFolders && file.webkitRelativePath ? file.webkitRelativePath : file.name;
      const path = normalizeProjectPath([targetDirectory, relative].filter(Boolean).join("/"));
      additions.push(isEditablePath(path)
        ? { kind: "text", path, content: await file.text(), language: languageForPath(path) }
        : {
            kind: isFigureAssetPath(path) ? "asset" : "binary",
            path,
            mimeType: file.type || (/\.pdf$/i.test(path) ? "application/pdf" : "application/octet-stream"),
            size: file.size,
            url: URL.createObjectURL(file)
          });
    }
    setProjects((current) => current.map((candidate) => {
      if (candidate.id !== project.id) return candidate;
      const directories = new Set(candidate.directories);
      for (const addition of additions) addParentDirectories(addition.path, directories);
      revokeReplacedObjectUrls(candidate.files, additions);
      return { ...candidate, files: mergeFiles(candidate.files, additions), directories: [...directories].sort() };
    }));
  }

  async function blobForProjectFile(id: string, file: ProjectFile): Promise<Blob> {
    const backend = backends.current.get(id);
    if (backend) return backend.readFile(file.path);
    if (isProjectTextFile(file)) return new Blob([strToU8(file.content)], { type: "text/plain;charset=utf-8" });
    return (await fetch(file.url)).blob();
  }

  function setOperationError(error: unknown, fallback: string): string {
    const message = errorMessage(error, fallback);
    setStorageStatus("error");
    setStorageError(message);
    return message;
  }

  return {
    projects, project, activeFile, activePath, projectId, storageStatus, storageError,
    selectProject, selectFile, updateActiveFile, addFile, addFolder,
    uploadFiles, renameEntry, deleteEntry, downloadEntry, createBrowserProject, openLocalFolder, removeProject
  };
}

function editKey(projectId: string, path: string): string {
  return `${projectId}:${path}`;
}

function matchingPendingEdits(
  pending: Map<string, { projectId: string; path: string; content: string }>,
  projectId: string,
  path?: string
): Array<{ projectId: string; path: string; content: string }> {
  return [...pending.values()].filter((edit) => edit.projectId === projectId && (!path || entryContains(path, edit.path)));
}

function keyMatchesEntry(key: string, projectId: string, path: string): boolean {
  const prefix = `${projectId}:`;
  return key.startsWith(prefix) && entryContains(path, key.slice(prefix.length));
}

function matchingSaveChains(
  chains: Map<string, Promise<void>>,
  projectId: string,
  path?: string
): Promise<void>[] {
  const prefix = `${projectId}:`;
  return [...chains.entries()]
    .filter(([key]) => key.startsWith(prefix) && (!path || entryContains(path, key.slice(prefix.length))))
    .map(([, write]) => write);
}

function entryContains(entryPath: string, candidate: string): boolean {
  return candidate === entryPath || candidate.startsWith(`${entryPath}/`);
}

function applyTextEdit(
  projects: PlaygroundProject[],
  edit: { projectId: string; path: string; content: string }
): PlaygroundProject[] {
  return projects.map((candidate) => candidate.id !== edit.projectId
    ? candidate
    : {
        ...candidate,
        files: candidate.files.map((file) => file.path === edit.path && isProjectTextFile(file)
          ? { ...file, content: edit.content }
          : file)
      });
}

export function languageForPath(path: string): ProjectFileLanguage {
  return languageForProjectPath(path);
}

function hasEntry(project: PlaygroundProject, path: string): boolean {
  const key = path.toLowerCase();
  return project.files.some((file) => file.path.toLowerCase() === key)
    || project.directories.some((directory) => directory.toLowerCase() === key);
}

function renameMemoryEntry(project: PlaygroundProject, path: string, nextPath: string): PlaygroundProject {
  return {
    ...project,
    entryFile: remapPath(project.entryFile, path, nextPath),
    files: project.files.map((file) => ({ ...file, path: remapPath(file.path, path, nextPath) })),
    directories: project.directories.map((directory) => remapPath(directory, path, nextPath)).sort()
  };
}

function deleteMemoryEntry(project: PlaygroundProject, path: string): PlaygroundProject {
  const matches = (candidate: string) => candidate === path || candidate.startsWith(`${path}/`);
  const files = project.files.filter((file) => !matches(file.path));
  return { ...project, files, directories: project.directories.filter((directory) => !matches(directory)), entryFile: files[0]?.path ?? project.entryFile };
}

function remapPath(candidate: string, path: string, nextPath: string): string {
  return candidate === path ? nextPath : candidate.startsWith(`${path}/`) ? `${nextPath}${candidate.slice(path.length)}` : candidate;
}

function mergeFiles(current: ProjectFile[], additions: ProjectFile[]): ProjectFile[] {
  const paths = new Set(additions.map((file) => file.path.toLowerCase()));
  return [...current.filter((file) => !paths.has(file.path.toLowerCase())), ...additions].sort((a, b) => a.path.localeCompare(b.path));
}

function revokeReplacedObjectUrls(current: ProjectFile[], additions: ProjectFile[]): void {
  const replaced = new Set(additions.map((file) => file.path.toLowerCase()));
  for (const file of current) {
    if (replaced.has(file.path.toLowerCase()) && !isProjectTextFile(file) && file.url.startsWith("blob:")) {
      URL.revokeObjectURL(file.url);
    }
  }
}

function revokeEntryObjectUrls(project: PlaygroundProject, path: string): void {
  for (const file of project.files) {
    if (entryContains(path, file.path) && !isProjectTextFile(file) && file.url.startsWith("blob:")) {
      URL.revokeObjectURL(file.url);
    }
  }
}

function addParentDirectories(path: string, directories: Set<string>) {
  const parts = path.split("/");
  parts.pop();
  let current = "";
  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    directories.add(current);
  }
}

function isEditablePath(path: string): boolean {
  return ["markdown", "latex", "bibtex", "text"].includes(languageForPath(path)) && /\.(?:md|markdown|tex|latex|bib|txt|sty|cls)$/i.test(path);
}

function fileName(path: string): string {
  return normalizeProjectPath(path).split("/").pop() || "project";
}

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function zipFiles(entries: Record<string, Uint8Array>): Promise<Uint8Array> {
  return new Promise((resolve, reject) => zip(entries, { level: 6 }, (error, bytes) => error ? reject(error) : resolve(bytes)));
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
