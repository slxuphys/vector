import { describe, expect, it } from "vitest";
import { createDocumentEngine } from "../src/core/engine/createDocumentEngine";
import { parseMarkdown } from "../src/core/markdown/parseMarkdown";
import { renderPageToSvg } from "../src/core/renderers/svg/renderPageToSvg";
import { renderToPdf } from "../src/core/renderers/pdf/renderToPdf";
import { tokenizeLatex } from "../src/core/renderers/pdf/pdfMath";
import { renderKatex } from "../src/core/renderers/math/renderKatex";
import { defaultNativeMathMetrics, layoutNativeMath } from "../src/core/renderers/math/nativeMath";
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

  it("renders native math without falling back to KaTeX foreignObject", async () => {
    const engine = createDocumentEngine({ useWorker: false, mathRenderer: "native" });
    const { layout } = await engine.layout("Native $E = mc^2$ and unsupported $\\begin{pmatrix} a \\end{pmatrix}$");
    const svg = renderPageToSvg(layout.pages[0]);

    expect(svg).toContain("svg-md-native-math");
    expect(svg).toContain("⟦begin⟧");
    expect(svg).not.toContain("foreignObject");
    expect(svg).not.toContain("katex-html");
  });

  it("exports native math with the native PDF path", async () => {
    const engine = createDocumentEngine({ useWorker: false, mathRenderer: "native" });
    const { layout } = await engine.layout("Native $\\sqrt{x^2 + y^2} = r$ and $$\n\\frac{1}{3}\n$$");
    const bytes = await renderToPdf(layout);

    expect(bytes.length).toBeGreaterThan(1000);
  });

  it("keeps native subscript and superscript attached to the base atom", () => {
    const layout = layoutNativeMath("x_i^2 + y_i^2 = r^2", false, 12);
    const glyphs = layout.nodes.filter((node) => node.type === "glyph");
    const x = glyphs.find((node) => node.text === "x");
    const sub = glyphs.find((node) => node.text === "i");
    const sup = glyphs.find((node) => node.text === "2");

    expect(x?.type).toBe("glyph");
    expect(sub?.type).toBe("glyph");
    expect(sup?.type).toBe("glyph");
    if (x?.type === "glyph" && sub?.type === "glyph" && sup?.type === "glyph") {
      expect(sub.x - x.x).toBeLessThan(12);
      expect(sup.x - x.x).toBeLessThan(12);
      expect(sub.y).toBeGreaterThan(x.y);
      expect(sub.y - x.y).toBeLessThan(6);
      expect(sup.y).toBeLessThan(x.y);
    }
  });

  it("keeps native inline math near the surrounding text baseline", async () => {
    const engine = createDocumentEngine({ useWorker: false, mathRenderer: "native" });
    const { layout } = await engine.layout("Text before $E = mc^2$ and after");
    const math = layout.pages[0].objects.find((object) => object.type === "math");
    const text = layout.pages[0].objects.find(
      (object) => object.type === "text" && math?.type === "math" && Math.abs(object.y - (math.y + (math.baseline ?? 0))) < 4
    );

    expect(text?.type).toBe("text");
    expect(math?.type).toBe("math");
    if (text?.type === "text" && math?.type === "math") {
      expect(Math.abs((math.y + (math.baseline ?? 0)) - text.y)).toBeLessThan(2);
    }
  });

  it("uses native glyph gap for compact calculation spacing by default", () => {
    const layout = layoutNativeMath("E=mc^2", false, 12);
    const tightLayout = layoutNativeMath("E=mc^2", false, 12, {
      ...defaultNativeMathMetrics,
      inlineGlyphGap: 0
    });
    const glyphs = layout.nodes.filter((node) => node.type === "glyph");
    const tightGlyphs = tightLayout.nodes.filter((node) => node.type === "glyph");
    const e = glyphs.find((node) => node.text === "E");
    const equals = glyphs.find((node) => node.text === "=");
    const m = glyphs.find((node) => node.text === "m");
    const tightE = tightGlyphs.find((node) => node.text === "E");
    const tightEquals = tightGlyphs.find((node) => node.text === "=");
    const tightM = tightGlyphs.find((node) => node.text === "m");

    expect(e?.type).toBe("glyph");
    expect(equals?.type).toBe("glyph");
    expect(m?.type).toBe("glyph");
    expect(tightE?.type).toBe("glyph");
    expect(tightEquals?.type).toBe("glyph");
    expect(tightM?.type).toBe("glyph");
    if (
      e?.type === "glyph" &&
      equals?.type === "glyph" &&
      m?.type === "glyph" &&
      tightE?.type === "glyph" &&
      tightEquals?.type === "glyph" &&
      tightM?.type === "glyph"
    ) {
      expect(equals.x - e.x).toBeGreaterThan(tightEquals.x - tightE.x);
      expect(m.x - equals.x).toBeGreaterThan(tightM.x - tightEquals.x);
    }
  });

  it("positions native inline fraction axis from the configured math baseline", () => {
    const fontSize = 12;
    const layout = layoutNativeMath("\\frac{a}{b}", false, fontSize);
    const rule = layout.nodes.find((node) => node.type === "rule");

    expect(rule?.type).toBe("rule");
    if (rule?.type === "rule") {
      const ruleCenter = rule.y + rule.height / 2;
      expect(layout.baseline - ruleCenter).toBeCloseTo(
        fontSize * defaultNativeMathMetrics.inlineFractionAxisOffset,
        5
      );
    }
  });

  it("does not let inline fraction axis offset move the parent math baseline", () => {
    const defaultLayout = layoutNativeMath("x + \\frac{a}{b} = y", false, 12);
    const tunedLayout = layoutNativeMath("x + \\frac{a}{b} = y", false, 12, {
      ...defaultNativeMathMetrics,
      inlineFractionAxisOffset: defaultNativeMathMetrics.inlineFractionAxisOffset + 0.16
    });
    const defaultX = defaultLayout.nodes.find((node) => node.type === "glyph" && node.text === "x");
    const tunedX = tunedLayout.nodes.find((node) => node.type === "glyph" && node.text === "x");

    expect(defaultLayout.baseline).toBeCloseTo(tunedLayout.baseline, 5);
    expect(defaultX?.type).toBe("glyph");
    expect(tunedX?.type).toBe("glyph");
    if (defaultX?.type === "glyph" && tunedX?.type === "glyph") {
      expect(defaultX.y).toBeCloseTo(tunedX.y, 5);
    }
  });

  it("keeps normal glyphs on the same baseline when inline math contains a fraction", () => {
    const standalone = layoutNativeMath("x", false, 12);
    const mixed = layoutNativeMath("x + \\frac{a}{b} = y", false, 12);
    const standaloneX = standalone.nodes.find((node) => node.type === "glyph" && node.text === "x");
    const mixedX = mixed.nodes.find((node) => node.type === "glyph" && node.text === "x");

    expect(standalone.baseline).toBeCloseTo(mixed.baseline, 5);
    expect(standaloneX?.type).toBe("glyph");
    expect(mixedX?.type).toBe("glyph");
    if (standaloneX?.type === "glyph" && mixedX?.type === "glyph") {
      expect(standaloneX.y).toBeCloseTo(mixedX.y, 5);
    }
  });

  it("renders native upright operator-like commands", () => {
    const layout = layoutNativeMath("\\nabla + \\Gamma + \\Delta = \\Omega", false, 12);
    const glyphs = layout.nodes.filter((node) => node.type === "glyph");
    const text = glyphs.map((node) => node.text).join("");

    expect(text).toContain("∇");
    expect(text).toContain("Γ");
    expect(text).toContain("Δ");
    expect(text).toContain("Ω");
    expect(text).not.toContain("⟦Gamma⟧");
    expect(glyphs.find((node) => node.text === "∇")?.italic).toBe(false);
    expect(glyphs.find((node) => node.text === "Γ")?.italic).toBe(false);
    expect(glyphs.find((node) => node.text === "Δ")?.italic).toBe(false);
    expect(glyphs.find((node) => node.text === "Ω")?.italic).toBe(false);
  });

  it("normalizes meaningless inline math spaces for measurement keys", () => {
    expect(normalizeMathLatex("E=   mc^2")).toBe("E=mc^2");
    expect(mathMeasureKey("E=mc^2", false, 12)).toBe(mathMeasureKey("E=   mc^2", false, 12));
  });

  it("includes native math metrics in native measurement keys", () => {
    expect(mathMeasureKey("E=mc^2", false, 12, "native", defaultNativeMathMetrics)).not.toBe(
      mathMeasureKey("E=mc^2", false, 12, "native", {
        ...defaultNativeMathMetrics,
        inlineGlyphGap: defaultNativeMathMetrics.inlineGlyphGap + 0.05
      })
    );
  });

  it("keeps simple native inline and display glyph spacing consistent", () => {
    const inline = layoutNativeMath("E=md", false, 12);
    const display = layoutNativeMath("E=md", true, 12);
    const inlineGlyphs = inline.nodes.filter((node) => node.type === "glyph");
    const displayGlyphs = display.nodes.filter((node) => node.type === "glyph");
    const inlineM = inlineGlyphs.find((node) => node.text === "m");
    const inlineD = inlineGlyphs.find((node) => node.text === "d");
    const displayM = displayGlyphs.find((node) => node.text === "m");
    const displayD = displayGlyphs.find((node) => node.text === "d");

    expect(inlineM?.type).toBe("glyph");
    expect(inlineD?.type).toBe("glyph");
    expect(displayM?.type).toBe("glyph");
    expect(displayD?.type).toBe("glyph");
    if (inlineM?.type === "glyph" && inlineD?.type === "glyph" && displayM?.type === "glyph" && displayD?.type === "glyph") {
      expect(inlineD.x - inlineM.x).toBeCloseTo(displayD.x - displayM.x, 5);
    }
  });

  it("uses a real math minus glyph in native math", () => {
    const layout = layoutNativeMath("a-b", false, 12);
    const glyphs = layout.nodes.filter((node) => node.type === "glyph");

    expect(glyphs.map((node) => node.text)).toContain("−");
    expect(glyphs.map((node) => node.text)).not.toContain("-");
  });

  it("ignores spaces after native backslash commands", () => {
    const spaced = layoutNativeMath("\\alpha x", false, 12);
    const compact = layoutNativeMath("\\alpha{}x", false, 12);
    const glyphs = spaced.nodes.filter((node) => node.type === "glyph");

    expect(glyphs.map((node) => node.text)).toEqual(["α", "x"]);
    expect(spaced.width).toBeCloseTo(compact.width, 5);
  });

  it("ignores literal spaces in native math but keeps explicit spacing commands", () => {
    const spaced = layoutNativeMath("x y", false, 12);
    const compact = layoutNativeMath("xy", false, 12);
    const explicit = layoutNativeMath("x\\quad y", false, 12);
    const glyphs = spaced.nodes.filter((node) => node.type === "glyph");

    expect(glyphs.map((node) => node.text)).toEqual(["x", "y"]);
    expect(spaced.width).toBeCloseTo(compact.width, 5);
    expect(explicit.width).toBeGreaterThan(compact.width);
  });

});
