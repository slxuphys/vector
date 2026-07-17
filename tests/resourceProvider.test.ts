import { describe, expect, it } from "vitest";
import { createDocumentEngine, layoutMarkdown } from "../src/core/engine/createDocumentEngine";
import { parseMarkdown } from "../src/core/markdown/parseMarkdown";
import {
  createMemoryResourceProvider,
  resolveResourcePath,
  type DocumentResourceProvider
} from "../src/core/resources";
import {
  resolveDocumentResourceSources,
  resolveDocumentResourceSourcesSync
} from "../src/core/engine/resolveDocumentAssetSources";

describe("document resources", () => {
  it("resolves document-relative paths and unique project suffixes", () => {
    const resources = createMemoryResourceProvider({
      text: { "project/refs/references.bib": "entries" },
      urls: { "project/figures/plot.png": "blob:plot" }
    });
    expect(resolveResourcePath("../refs/references.bib", "project/paper/main.md"))
      .toBe("project/refs/references.bib");
    expect(resources.readText("references.bib")).toBe("entries");
    expect(resources.getUrl("figures/plot.png", "project/main.md")).toBe("blob:plot");
  });

  it("resolves figures through sync and async providers", async () => {
    const ast = parseMarkdown("![Plot](figures/plot.png)");
    const memory = createMemoryResourceProvider({ urls: { "paper/figures/plot.png": "blob:plot" } });
    const sync = resolveDocumentResourceSourcesSync(ast, memory, "paper/main.md");
    const asyncProvider: DocumentResourceProvider = {
      ...memory,
      async getUrl(path, from) {
        return memory.getUrl(path, from);
      }
    };
    const asynchronous = await resolveDocumentResourceSources(ast, asyncProvider, "paper/main.md");
    expect(sync.children[0]).toMatchObject({ type: "image", src: "blob:plot" });
    expect(asynchronous.children[0]).toMatchObject({ type: "image", src: "blob:plot" });
  });

  it("loads bibliography text asynchronously through the engine provider", async () => {
    const bibliography = "@article{vector, author={Ada Vector}, title={Fast Preview}, year={2026}}";
    const memory = createMemoryResourceProvider({ text: { "paper/references.bib": bibliography } });
    const resources: DocumentResourceProvider = {
      ...memory,
      async readText(path, from) {
        return memory.readText(path, from);
      }
    };
    const result = await createDocumentEngine({
      sourceFormat: "latex",
      sourcePath: "paper/main.tex",
      resources
    }).layout("Prior work\\cite{vector}.\\bibliography{references}");
    expect(result.layout.pages.flatMap((page) => page.objects)
      .some((object) => object.type === "text" && object.text.includes("Ada Vector"))).toBe(true);
  });

  it("rejects async providers from the synchronous layout helper", () => {
    const resources: DocumentResourceProvider = {
      resolve: (path) => path,
      readText: async () => undefined,
      readBinary: async () => undefined,
      getUrl: async () => undefined
    };
    expect(() => layoutMarkdown("![Plot](plot.png)", { resources }))
      .toThrow(/asynchronous resource provider/i);
  });
});
