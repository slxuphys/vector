import { useCallback, useEffect, useRef, useState } from "react";
import { strToU8, zip } from "fflate";
import { openLocalFolderProject } from "./localFolderProjectFileSystem";
import { createOpfsProject, listOpfsProjects } from "./opfsProjectFileSystem";
import {
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
  const [projectId, setProjectId] = useState(sampleProjects[1].id);
  const [activePath, setActivePath] = useState(sampleProjects[1].entryFile);
  const [storageStatus, setStorageStatus] = useState<ProjectStorageStatus>("loading");
  const [storageError, setStorageError] = useState<string | undefined>();
  const backends = useRef(new Map<string, ProjectFileSystemBackend>());
  const saveTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const projectsRef = useRef(projects);
  projectsRef.current = projects;

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
    for (const current of projectsRef.current) revokeProjectObjectUrls(current);
  }, []);

  const selectProject = useCallback((nextId: string) => {
    const nextProject = projects.find((candidate) => candidate.id === nextId);
    if (!nextProject) return;
    setProjectId(nextId);
    setActivePath(nextProject.entryFile);
    setStorageError(undefined);
    setStorageStatus("idle");
  }, [projects]);

  const updateActiveFile = useCallback((content: string) => {
    if (!activeFile || !isProjectTextFile(activeFile)) return;
    const currentProjectId = project.id;
    const currentPath = activeFile.path;
    setProjects((current) => current.map((candidate) => candidate.id !== currentProjectId
      ? candidate
      : {
          ...candidate,
          files: candidate.files.map((file) => file.path === currentPath && isProjectTextFile(file) ? { ...file, content } : file)
        }));

    const backend = backends.current.get(currentProjectId);
    if (!backend) return;
    const saveKey = `${currentProjectId}:${currentPath}`;
    const existing = saveTimers.current.get(saveKey);
    if (existing) clearTimeout(existing);
    setStorageStatus("saving");
    setStorageError(undefined);
    saveTimers.current.set(saveKey, setTimeout(() => {
      saveTimers.current.delete(saveKey);
      void backend.writeTextFile(currentPath, content)
        .then(() => setStorageStatus("saved"))
        .catch((error) => setOperationError(error, `Could not save ${currentPath}.`));
    }, 300));
  }, [activeFile, project.id]);

  const addFile = useCallback(async (requestedPath: string): Promise<string | undefined> => {
    const path = normalizeProjectPath(requestedPath);
    const pathError = validateProjectPath(path);
    if (pathError) return pathError;
    if (hasEntry(project, path)) return "An entry with this name already exists.";
    const backend = backends.current.get(project.id);
    try {
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
  }, [project]);

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
      for (const file of files) {
        const relative = preserveFolders && file.webkitRelativePath ? file.webkitRelativePath : file.name;
        const path = normalizeProjectPath([targetDirectory, relative].filter(Boolean).join("/"));
        if (backend) await backend.writeFile(path, file);
      }
      if (backend) await reloadProject(project.id, activePath);
      else await addMemoryFiles(files, targetDirectory, preserveFolders);
      setStorageStatus(backend ? "saved" : "idle");
    } catch (error) {
      setOperationError(error, "Could not upload the selected files.");
    }
  }, [project.id]);

  const renameEntry = useCallback(async (path: string, nextPathInput: string): Promise<string | undefined> => {
    const nextPath = normalizeProjectPath(nextPathInput);
    const pathError = validateProjectPath(nextPath);
    if (pathError) return pathError;
    if (nextPath.startsWith(`${path}/`)) return "A folder cannot be moved inside itself.";
    if (path !== nextPath && hasEntry(project, nextPath)) return "An entry with this name already exists.";
    const backend = backends.current.get(project.id);
    try {
      if (backend) {
        await backend.renameEntry(path, nextPath);
        await reloadProject(project.id, remapPath(activePath, path, nextPath));
      } else {
        setProjects((current) => current.map((candidate) => candidate.id === project.id
          ? renameMemoryEntry(candidate, path, nextPath)
          : candidate));
        setActivePath((current) => remapPath(current, path, nextPath));
      }
      setStorageStatus(backend ? "saved" : "idle");
      return undefined;
    } catch (error) {
      return setOperationError(error, `Could not rename ${path}.`);
    }
  }, [activePath, project]);

  const deleteEntry = useCallback(async (path: string) => {
    const backend = backends.current.get(project.id);
    try {
      if (backend) {
        await backend.deleteEntry(path);
        const nextActivePath = activePath === path || activePath.startsWith(`${path}/`) ? undefined : activePath;
        await reloadProject(project.id, nextActivePath);
      } else {
        setProjects((current) => current.map((candidate) => candidate.id === project.id
          ? deleteMemoryEntry(candidate, path)
          : candidate));
      }
      if (!backend && (activePath === path || activePath.startsWith(`${path}/`))) {
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

  async function reloadProject(id: string, preferredPath?: string) {
    const backend = backends.current.get(id);
    if (!backend) return;
    const next = await backend.loadProject();
    setProjects((current) => current.map((candidate) => {
      if (candidate.id !== id) return candidate;
      revokeProjectObjectUrls(candidate);
      return next;
    }));
    setActivePath(preferredPath && next.files.some((file) => file.path === preferredPath) ? preferredPath : next.entryFile);
  }

  async function addMemoryFiles(files: File[], targetDirectory: string, preserveFolders: boolean) {
    const additions: ProjectFile[] = [];
    const directories = new Set(project.directories);
    for (const file of files) {
      const relative = preserveFolders && file.webkitRelativePath ? file.webkitRelativePath : file.name;
      const path = normalizeProjectPath([targetDirectory, relative].filter(Boolean).join("/"));
      addParentDirectories(path, directories);
      additions.push(isEditablePath(path)
        ? { kind: "text", path, content: await file.text(), language: languageForPath(path) }
        : { kind: /^(image\/|application\/pdf)/.test(file.type) ? "asset" : "binary", path, mimeType: file.type, size: file.size, url: URL.createObjectURL(file) });
    }
    setProjects((current) => current.map((candidate) => candidate.id === project.id
      ? { ...candidate, files: mergeFiles(candidate.files, additions), directories: [...directories].sort() }
      : candidate));
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
    selectProject, selectFile: setActivePath, updateActiveFile, addFile, addFolder,
    uploadFiles, renameEntry, deleteEntry, downloadEntry, createBrowserProject, openLocalFolder
  };
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
