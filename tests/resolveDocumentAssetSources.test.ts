import { describe, expect, it } from "vitest";
import { resolveDocumentAssetSources } from "../src/core/engine/resolveDocumentAssetSources";
import type { MarkdownAst } from "../src/core/markdown/markdownTypes";
import { parseLatex } from "../src/core/latex/parseLatex";

describe("project asset source resolution", () => {
  it("resolves document-relative figure candidates to project object URLs", () => {
    const ast: MarkdownAst = {
      type: "document",
      children: [{ type: "image", src: "../figures/chart.pdf", alt: "Chart" }]
    };
    const resolved = resolveDocumentAssetSources(ast, {
      "figures/chart.pdf": "blob:chart#asset.pdf"
    }, "chapters/results.tex");
    const image = resolved.children[0];
    expect(image.type).toBe("image");
    if (image.type === "image") expect(image.src).toBe("blob:chart#asset.pdf");
  });

  it("resolves LaTeX graphicspath candidates", () => {
    const source = String.raw`\graphicspath{{figure/}}
\begin{document}
\begin{figure}
\includegraphics[width=\columnwidth]{result.pdf}
\caption{Result}
\end{figure}
\end{document}`;
    const ast = parseLatex(source);
    const resolved = resolveDocumentAssetSources(ast, {
      "figure/result.pdf": "blob:result#asset.pdf"
    }, "main.tex");
    const image = resolved.children.find((node) => node.type === "image");
    expect(image?.type).toBe("image");
    if (image?.type === "image") expect(image.src).toBe("blob:result#asset.pdf");
  });

  it("resolves a uniquely matching asset below an imported project root", () => {
    const ast: MarkdownAst = {
      type: "document",
      children: [{ type: "image", src: "figures/result.pdf", alt: "Result" }]
    };
    const resolved = resolveDocumentAssetSources(ast, {
      "imported-project/figures/result.pdf": "blob:result#asset.pdf"
    }, "main.tex");
    const image = resolved.children[0];
    expect(image.type).toBe("image");
    if (image.type === "image") expect(image.src).toBe("blob:result#asset.pdf");
  });
});
