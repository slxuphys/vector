import type { PlaygroundProject } from "./projectTypes";
import {
  chooseEntryFile,
  createProjectDirectory,
  deleteProjectEntry,
  directoryEntries,
  readProjectDirectory,
  readProjectFile,
  renameProjectEntry,
  type LoadedProjectBackend,
  type ProjectFileSystemBackend,
  writeProjectFile,
  writeTextFile
} from "./projectFileSystem";
import { debugWarn } from "../../core/utils/debugSettings";

const projectsDirectoryName = "vector-projects";
const manifestName = ".vector-project.json";

type ProjectManifest = {
  id: string;
  name: string;
  entryFile: string;
};

export function supportsOpfs(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.storage?.getDirectory === "function";
}

export async function listOpfsProjects(): Promise<LoadedProjectBackend[]> {
  if (!supportsOpfs()) return [];
  const projectsRoot = await getProjectsRoot();
  const projects: LoadedProjectBackend[] = [];
  for await (const [directoryName, handle] of directoryEntries(projectsRoot)) {
    if (handle.kind !== "directory") continue;
    try {
      const backend = new OpfsProjectBackend(handle as FileSystemDirectoryHandle, directoryName);
      projects.push({ project: await backend.loadProject(), backend });
    } catch (error) {
      debugWarn("assets", "[browser project] skipped unreadable project", { directoryName, error });
    }
  }
  return projects.sort((left, right) => left.project.name.localeCompare(right.project.name));
}

export async function createOpfsProject(name: string): Promise<LoadedProjectBackend> {
  if (!supportsOpfs()) throw new Error("Browser project storage is not available in this browser.");
  const projectsRoot = await getProjectsRoot();
  const id = crypto.randomUUID();
  const directory = await projectsRoot.getDirectoryHandle(id, { create: true });
  const manifest: ProjectManifest = { id, name: name.trim() || "Untitled project", entryFile: "main.md" };
  await writeTextFile(directory, manifestName, JSON.stringify(manifest, null, 2));
  await writeTextFile(directory, manifest.entryFile, "# Untitled document\n\nStart writing here.\n");
  const backend = new OpfsProjectBackend(directory, id);
  return { project: await backend.loadProject(), backend };
}

class OpfsProjectBackend implements ProjectFileSystemBackend {
  readonly kind = "opfs" as const;

  constructor(
    private readonly directory: FileSystemDirectoryHandle,
    private readonly directoryName: string
  ) {}

  async loadProject(): Promise<PlaygroundProject> {
    const manifest = await readManifest(this.directory, this.directoryName);
    const snapshot = await readProjectDirectory(this.directory);
    const visibleFiles = snapshot.files.filter((file) => file.path !== manifestName);
    if (!visibleFiles.some((file) => file.kind === "text")) {
      await writeTextFile(this.directory, manifest.entryFile, "# Untitled document\n\nStart writing here.\n");
      visibleFiles.push({ kind: "text", path: manifest.entryFile, content: "# Untitled document\n\nStart writing here.\n", language: "markdown" });
    }
    return {
      id: `opfs:${manifest.id}`,
      name: manifest.name,
      kind: "browser",
      entryFile: chooseEntryFile(visibleFiles, manifest.entryFile),
      files: visibleFiles,
      directories: snapshot.directories
    };
  }

  writeTextFile(path: string, content: string): Promise<void> {
    return writeTextFile(this.directory, path, content);
  }

  createTextFile(path: string, content = ""): Promise<void> {
    return writeTextFile(this.directory, path, content);
  }

  createDirectory(path: string): Promise<void> {
    return createProjectDirectory(this.directory, path);
  }

  writeFile(path: string, data: Blob): Promise<void> {
    return writeProjectFile(this.directory, path, data);
  }

  readFile(path: string): Promise<File> {
    return readProjectFile(this.directory, path);
  }

  renameEntry(path: string, nextPath: string): Promise<void> {
    return renameProjectEntry(this.directory, path, nextPath);
  }

  deleteEntry(path: string): Promise<void> {
    return deleteProjectEntry(this.directory, path);
  }
}

async function getProjectsRoot(): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle(projectsDirectoryName, { create: true });
}

async function readManifest(directory: FileSystemDirectoryHandle, fallbackId: string): Promise<ProjectManifest> {
  try {
    const handle = await directory.getFileHandle(manifestName);
    const parsed = JSON.parse(await (await handle.getFile()).text()) as Partial<ProjectManifest>;
    return {
      id: parsed.id || fallbackId,
      name: parsed.name || "Browser project",
      entryFile: parsed.entryFile || "main.md"
    };
  } catch {
    return { id: fallbackId, name: "Browser project", entryFile: "main.md" };
  }
}
