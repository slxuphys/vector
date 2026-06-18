import { describe, expect, it } from "vitest";
import { createDocumentEngine } from "../src/core/engine/createDocumentEngine";
import { parseMarkdown } from "../src/core/markdown/parseMarkdown";
import { renderPageToSvg } from "../src/core/renderers/svg/renderPageToSvg";
import { renderToPdf } from "../src/core/renderers/pdf/renderToPdf";
import { tokenizeLatex } from "../src/core/renderers/pdf/pdfMath";
import { renderKatex } from "../src/core/renderers/math/renderKatex";
import { mathMeasureKey, normalizeMathLatex } from "../src/core/layout/mathMetrics";

describe("markdown parser", () => {
  it("parses headings, lists, tables, code, and page breaks", () => {
    const ast = parseMarkdown(`# Title

- [x] Done
- Todo

| A | B |
| - | - |
| 1 | 2 |

\`\`\`ts
const x = 1
\`\`\`

<!-- pagebreak -->
`);

    expect(ast.children.map((node) => node.type)).toEqual([
      "heading",
      "list",
      "table",
      "codeBlock",
      "pageBreak"
    ]);
  });
});

describe("document engine", () => {
  it("creates a paged display list", async () => {
    const engine = createDocumentEngine({ useWorker: false });
    const { layout, stats } = await engine.layout("# Title\n\nBody text\n\n$$\nE = mc^2\n$$");

    expect(stats.pageCount).toBeGreaterThan(0);
    expect(layout.pages[0].objects.some((object) => object.type === "text")).toBe(true);
    expect(layout.pages[0].objects.some((object) => object.type === "math")).toBe(true);
  });

  it("renders selectable svg text", async () => {
    const engine = createDocumentEngine({ useWorker: false });
    const { layout } = await engine.layout("# SVG Markdown Preview");
    const svg = renderPageToSvg(layout.pages[0]);
    const textObjects = layout.pages[0].objects.filter((object) => object.type === "text");

    expect(svg).toContain("<svg");
    expect(svg).toContain("<text");
    expect(svg).toContain('xml:space="preserve"');
    expect(svg).toContain("SVG ");
    expect(svg).toContain("Markdown ");
    expect(svg).toContain("Preview");
    expect(textObjects.some((object) => object.type === "text" && object.text === "Markdown ")).toBe(true);
  });

  it("keeps space after inline math", async () => {
    const engine = createDocumentEngine({ useWorker: false });
    const { layout } = await engine.layout("$E=mc^2$ is inline math and $\\frac{a}{b}$ renders");
    const mathObjects = layout.pages[0].objects.filter((object) => object.type === "math");
    const firstMath = mathObjects[0];
    const fraction = mathObjects[1];
    const nextText = layout.pages[0].objects.find(
      (object) => object.type === "text" && object.text.includes("is")
    );

    expect(firstMath?.type).toBe("math");
    expect(fraction?.type).toBe("math");
    expect(nextText?.type).toBe("text");
    if (firstMath?.type === "math" && fraction?.type === "math" && nextText?.type === "text") {
      expect(firstMath.advance).toBeGreaterThan(0);
      expect(firstMath.width).toBeGreaterThan(firstMath.advance ?? 0);
      expect(firstMath.width).toBeGreaterThan(34);
      expect(nextText.x).toBeGreaterThan(firstMath.x + (firstMath.advance ?? 0));
      expect(nextText.x - (firstMath.x + (firstMath.advance ?? 0))).toBeLessThan(5);
      expect(fraction.width).toBeLessThan(firstMath.width);
      expect(fraction.width).toBeGreaterThan(8);
    }
  });

  it("exports a PDF", async () => {
    const engine = createDocumentEngine({ useWorker: false });
    const { layout } = await engine.layout("# Title");
    const bytes = await renderToPdf(layout);

    expect(bytes.length).toBeGreaterThan(100);
  });

  it("tokenizes latex for PDF math fallback", () => {
    expect(tokenizeLatex("E = mc^2").map((token) => `${token.script ?? "base"}:${token.text}`)).toEqual([
      "base:E = mc",
      "super:2"
    ]);
  });

  it("renders KaTeX as HTML only so preview and PDF rasterization use the same layer", () => {
    const html = renderKatex("\\int_0^1 x^2 dx = 1/3", true);

    expect(html).toContain("katex-html");
    expect(html).not.toContain("<math");
  });

  it("normalizes meaningless inline math spaces for measurement keys", () => {
    expect(normalizeMathLatex("E=   mc^2")).toBe("E=mc^2");
    expect(mathMeasureKey("E=mc^2", false, 12)).toBe(mathMeasureKey("E=   mc^2", false, 12));
  });

});
