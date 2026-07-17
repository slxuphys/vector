import type { PlaygroundProject } from "./projectTypes";
import {
  chooseEntryFile,
  createProjectDirectory,
  deleteProjectEntry,
  readProjectFile,
  readProjectDirectory,
  renameProjectEntry,
  type LoadedProjectBackend,
  type ProjectFileSystemBackend,
  watchProjectDirectory,
  writeProjectFile,
  writeTextFile
} from "./projectFileSystem";

type DirectoryPickerWindow = Window & {
  showDirectoryPicker?: (options?: { mode?: "read" | "readwrite"; id?: string }) => Promise<FileSystemDirectoryHandle>;
};

type PermissionDirectoryHandle = FileSystemDirectoryHandle & {
  requestPermission?: (descriptor?: { mode?: "read" | "readwrite" }) => Promise<PermissionState>;
};

export function supportsLocalFolderAccess(): boolean {
  return typeof window !== "undefined" && typeof (window as DirectoryPickerWindow).showDirectoryPicker === "function";
}

export async function openLocalFolderProject(): Promise<LoadedProjectBackend> {
  const picker = (window as DirectoryPickerWindow).showDirectoryPicker;
  if (!picker) throw new Error("Opening local folders is not available in this browser.");
  const directory = await picker({ mode: "readwrite", id: "vector-project" }) as PermissionDirectoryHandle;
  const permission = await directory.requestPermission?.({ mode: "readwrite" });
  if (permission === "denied") throw new Error("Vector needs write access to save this folder.");
  const backend = new LocalFolderProjectBackend(directory);
  return { project: await backend.loadProject(), backend };
}

class LocalFolderProjectBackend implements ProjectFileSystemBackend {
  readonly kind = "local" as const;
  private readonly id = crypto.randomUUID();

  constructor(private readonly directory: FileSystemDirectoryHandle) {}

  async loadProject(): Promise<PlaygroundProject> {
    const snapshot = await readProjectDirectory(this.directory);
    const { files, directories } = snapshot;
    if (!files.some((file) => file.kind === "text")) {
      await writeTextFile(this.directory, "main.md", "# Untitled document\n\nStart writing here.\n");
      files.push({ kind: "text", path: "main.md", content: "# Untitled document\n\nStart writing here.\n", language: "markdown" });
    }
    return {
      id: `local:${this.id}`,
      name: this.directory.name,
      kind: "local",
      entryFile: chooseEntryFile(files),
      files,
      directories
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

  watch(onChange: () => void): Promise<() => void> {
    return watchProjectDirectory(this.directory, onChange);
  }
}
