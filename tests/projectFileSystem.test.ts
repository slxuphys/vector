import { describe, expect, it } from "vitest";
import {
  chooseEntryFile,
  isEditableProjectPath,
  languageForProjectPath,
  normalizeProjectPath
} from "../src/playground/product/projectFileSystem";
import { buildProjectTree } from "../src/playground/product/projectTree";

describe("playground project filesystem", () => {
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
});
