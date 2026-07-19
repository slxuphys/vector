import { afterEach, describe, expect, it, vi } from "vitest";
import {
  chooseEntryFile,
  isEditableProjectPath,
  languageForProjectPath,
  loadProjectTextFile,
  normalizeProjectPath,
  preserveLoadedProjectText,
  readProjectDirectory,
  sameProjectSnapshot,
  watchProjectDirectory
} from "../src/playground/product/projectFileSystem";
import { buildProjectTree } from "../src/playground/product/projectTree";
import { createProjectResourceProvider } from "../src/playground/product/useProjectResources";
import type { PlaygroundProject } from "../src/playground/product/projectTypes";

describe("playground project filesystem", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("normalizes paths from local and browser projects", () => {
    expect(normalizeProjectPath(" ./chapters\\intro.tex ")).toBe("chapters/intro.tex");
  });

  it("recognizes editable project files", () => {
    expect(isEditableProjectPath("paper.tex")).toBe(true);
    expect(isEditableProjectPath("references.bib")).toBe(true);
    expect(isEditableProjectPath("figure.pdf")).toBe(false);
  });

  it("assigns editor languages from file extensions", () => {
    expect(languageForProjectPath("README.md")).toBe("markdown");
    expect(languageForProjectPath("main.tex")).toBe("latex");
    expect(languageForProjectPath("library.bib")).toBe("bibtex");
    expect(languageForProjectPath("vector.sty")).toBe("text");
  });

  it("prefers an explicit entry file and otherwise selects a document", () => {
    const files = [
      { kind: "text" as const, path: "notes.txt", content: "", language: "text" as const },
      { kind: "text" as const, path: "paper.tex", content: "", language: "latex" as const },
      { kind: "text" as const, path: "README.md", content: "", language: "markdown" as const }
    ];
    expect(chooseEntryFile(files, "README.md")).toBe("README.md");
    expect(chooseEntryFile(files, "missing.md")).toBe("paper.tex");
  });

  it("keeps binary-only and empty folders in the project tree", () => {
    const tree = buildProjectTree([
      { kind: "asset", path: "figures/result.pdf", mimeType: "application/pdf", size: 42, url: "blob:test#asset.pdf" }
    ], ["figures", "empty"]);
    expect(tree.map((node) => node.path)).toEqual(["empty", "figures"]);
    expect(tree[1].children[0].path).toBe("figures/result.pdf");
  });

  it("uses FileSystemObserver recursively when the browser provides it", async () => {
    let notify: ((records: unknown[]) => void) | undefined;
    const observe = vi.fn(async () => undefined);
    const disconnect = vi.fn();
    class Observer {
      constructor(callback: (records: unknown[]) => void) {
        notify = callback;
      }
      observe = observe;
      disconnect = disconnect;
    }
    vi.stubGlobal("FileSystemObserver", Observer);
    const root = { kind: "directory", name: "paper" } as FileSystemDirectoryHandle;
    const onChange = vi.fn();
    const dispose = await watchProjectDirectory(root, onChange);
    expect(observe).toHaveBeenCalledWith(root, { recursive: true });
    notify?.([{ type: "modified" }]);
    expect(onChange).toHaveBeenCalledOnce();
    dispose();
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it("compares filesystem snapshots without treating fresh blob URLs as changes", () => {
    const base = {
      id: "local:test",
      name: "paper",
      kind: "local" as const,
      entryFile: "main.tex",
      directories: ["figures"],
      files: [
        { kind: "text" as const, path: "main.tex", content: "Hello", language: "latex" as const, lastModified: 10 },
        { kind: "asset" as const, path: "figures/a.pdf", mimeType: "application/pdf", size: 42, lastModified: 20, url: "blob:first" }
      ]
    };
    const reread = structuredClone(base);
    reread.files[1].url = "blob:second";
    expect(sameProjectSnapshot(base, reread)).toBe(true);
    reread.files[1].lastModified = 21;
    expect(sameProjectSnapshot(base, reread)).toBe(false);
  });

  it("scans file metadata without reading text or creating asset URLs", async () => {
    const readText = vi.fn(async () => "lazy text");
    const textFile = { size: 9, type: "text/plain", lastModified: 11, text: readText } as unknown as File;
    const pdfFile = { size: 42, type: "application/pdf", lastModified: 12 } as File;
    const root = fakeDirectory([
      ["main.tex", fakeFileHandle("main.tex", textFile)],
      ["figure.pdf", fakeFileHandle("figure.pdf", pdfFile)]
    ]);
    const createUrl = vi.spyOn(URL, "createObjectURL");

    const snapshot = await readProjectDirectory(root);
    expect(snapshot.files).toEqual([
      { kind: "asset", path: "figure.pdf", mimeType: "application/pdf", size: 42, lastModified: 12 },
      { kind: "text", path: "main.tex", language: "latex", lastModified: 11 }
    ]);
    expect(readText).not.toHaveBeenCalled();
    expect(createUrl).not.toHaveBeenCalled();

    await loadProjectTextFile(root, snapshot.files, "main.tex");
    expect(readText).toHaveBeenCalledOnce();
    expect(snapshot.files[1]).toMatchObject({ content: "lazy text" });
    createUrl.mockRestore();
  });

  it("loads and caches project resources only when requested", async () => {
    const project = {
      id: "local:lazy",
      name: "paper",
      kind: "local" as const,
      entryFile: "main.tex",
      directories: ["figures"],
      files: [
        { kind: "text" as const, path: "main.tex", content: "Main", language: "latex" as const, lastModified: 1 },
        { kind: "text" as const, path: "references.bib", language: "bibtex" as const, lastModified: 2 },
        { kind: "asset" as const, path: "figures/result.pdf", mimeType: "application/pdf", size: 3, lastModified: 3 }
      ]
    };
    const readFile = vi.fn(async (_projectId: string, path: string) => path.endsWith(".bib")
      ? new File(["@article{x}"], "references.bib", { lastModified: 2 })
      : new File([new Uint8Array([1, 2, 3])], "result.pdf", { type: "application/pdf", lastModified: 3 }));
    const provider = createProjectResourceProvider(project, readFile);

    expect(provider.readText("main.tex")).toBe("Main");
    expect(readFile).not.toHaveBeenCalled();
    expect(await provider.readText("references.bib", "main.tex")).toBe("@article{x}");
    expect(await provider.readText("references.bib", "main.tex")).toBe("@article{x}");
    const url = await provider.getUrl("result.pdf", "figures/placeholder.tex");
    expect(url).toMatch(/^blob:.*#asset\.pdf$/);
    expect(await provider.getUrl("result.pdf", "figures/placeholder.tex")).toBe(url);
    expect(readFile).toHaveBeenCalledTimes(2);
  });

  it("keeps already loaded text when an unchanged metadata snapshot is refreshed", () => {
    const previous: PlaygroundProject = {
      id: "local:text",
      name: "paper",
      kind: "local" as const,
      entryFile: "main.tex",
      directories: [],
      files: [{ kind: "text" as const, path: "main.tex", language: "latex" as const, content: "Loaded", lastModified: 9 }]
    };
    const refreshed: PlaygroundProject = {
      ...previous,
      files: [{ kind: "text" as const, path: "main.tex", language: "latex" as const, lastModified: 9 }]
    };
    preserveLoadedProjectText(previous, refreshed);
    const refreshedFile = refreshed.files[0];
    expect(refreshedFile.kind === "text" ? refreshedFile.content : undefined).toBe("Loaded");
    expect(sameProjectSnapshot(previous, refreshed)).toBe(true);
  });
});

function fakeFileHandle(name: string, file: File): FileSystemFileHandle {
  return { kind: "file", name, getFile: vi.fn(async () => file) } as unknown as FileSystemFileHandle;
}

function fakeDirectory(entries: Array<[string, FileSystemHandle]>): FileSystemDirectoryHandle {
  return {
    kind: "directory",
    name: "paper",
    async *entries() {
      yield* entries;
    },
    getFileHandle: vi.fn(async (name: string) => {
      const handle = entries.find(([entryName]) => entryName === name)?.[1];
      if (!handle || handle.kind !== "file") throw new Error("missing file");
      return handle as FileSystemFileHandle;
    })
  } as unknown as FileSystemDirectoryHandle;
}
