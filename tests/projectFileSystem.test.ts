import { afterEach, describe, expect, it, vi } from "vitest";
import {
  chooseEntryFile,
  isEditableProjectPath,
  languageForProjectPath,
  normalizeProjectPath,
  sameProjectSnapshot,
  watchProjectDirectory
} from "../src/playground/product/projectFileSystem";
import { buildProjectTree } from "../src/playground/product/projectTree";

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
});
