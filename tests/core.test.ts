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

  it("renders native large operator commands", () => {
    const layout = layoutNativeMath("\\int + \\sum + \\prod + \\lim", false, 12);
    const glyphs = layout.nodes.filter((node) => node.type === "glyph");
    const text = glyphs.map((node) => node.text).join("");

    expect(text).toContain("∫");
    expect(text).toContain("∑");
    expect(text).toContain("∏");
    expect(text).toContain("lim");
    expect(text).not.toContain("⟦int⟧");
    expect(text).not.toContain("⟦sum⟧");
    expect(text).not.toContain("⟦prod⟧");
    expect(text).not.toContain("⟦lim⟧");
    expect(glyphs.find((node) => node.text === "∫")?.italic).toBe(false);
    expect(glyphs.find((node) => node.text === "∑")?.italic).toBe(false);
    expect(glyphs.find((node) => node.text === "∏")?.italic).toBe(false);
    expect(glyphs.find((node) => node.text === "lim")?.italic).toBe(false);
  });

  it("uses the KaTeX size font for native large operators in display math", () => {
    const inline = layoutNativeMath("\\sum_i", false, 12);
    const display = layoutNativeMath("\\sum_i", true, 12);
    const inlineGlyphs = inline.nodes.filter((node) => node.type === "glyph");
    const displayGlyphs = display.nodes.filter((node) => node.type === "glyph");
    const inlineSum = inlineGlyphs.find((node) => node.text === "∑");
    const displaySum = displayGlyphs.find((node) => node.text === "∑");
    const inlineSub = inlineGlyphs.find((node) => node.text === "i");
    const displaySub = displayGlyphs.find((node) => node.text === "i");

    expect(inlineSum?.type).toBe("glyph");
    expect(displaySum?.type).toBe("glyph");
    expect(inlineSub?.type).toBe("glyph");
    expect(displaySub?.type).toBe("glyph");
    if (
      inlineSum?.type === "glyph" &&
      displaySum?.type === "glyph" &&
      inlineSub?.type === "glyph" &&
      displaySub?.type === "glyph"
    ) {
      expect(displaySum.fontSize).toBeCloseTo(inlineSum.fontSize, 5);
      expect(displaySum.fontFamily).toContain("KaTeX_Size2");
      expect(inlineSum.fontFamily).toBeUndefined();
      expect(displaySub.x - displaySum.x).toBeGreaterThan(inlineSub.x - inlineSum.x);
    }
  });

  it("positions native display large-operator scripts around the taller operator", () => {
    const inline = layoutNativeMath("\\int_0^1", false, 12);
    const display = layoutNativeMath("\\int_0^1", true, 12);
    const inlineGlyphs = inline.nodes.filter((node) => node.type === "glyph");
    const displayGlyphs = display.nodes.filter((node) => node.type === "glyph");
    const inlineIntegral = inlineGlyphs.find((node) => node.text === "∫");
    const displayIntegral = displayGlyphs.find((node) => node.text === "∫");
    const inlineLower = inlineGlyphs.find((node) => node.text === "0");
    const displayLower = displayGlyphs.find((node) => node.text === "0");
    const inlineUpper = inlineGlyphs.find((node) => node.text === "1");
    const displayUpper = displayGlyphs.find((node) => node.text === "1");

    expect(inlineIntegral?.type).toBe("glyph");
    expect(displayIntegral?.type).toBe("glyph");
    expect(inlineLower?.type).toBe("glyph");
    expect(displayLower?.type).toBe("glyph");
    expect(inlineUpper?.type).toBe("glyph");
    expect(displayUpper?.type).toBe("glyph");
    if (
      inlineIntegral?.type === "glyph" &&
      displayIntegral?.type === "glyph" &&
      inlineLower?.type === "glyph" &&
      displayLower?.type === "glyph" &&
      inlineUpper?.type === "glyph" &&
      displayUpper?.type === "glyph"
    ) {
      expect(displayIntegral.fontFamily).toContain("KaTeX_Size2");
      expect(displayUpper.y - displayIntegral.y).toBeLessThan(inlineUpper.y - inlineIntegral.y);
      expect(displayLower.y - displayIntegral.y).toBeGreaterThan(inlineLower.y - inlineIntegral.y);
      expect(displayUpper.x - displayIntegral.x).toBeGreaterThan(inlineUpper.x - inlineIntegral.x);
      expect(displayLower.x - displayIntegral.x).toBeGreaterThan(inlineLower.x - inlineIntegral.x);
    }
  });

  it("allows native display large-operator script placement to be tuned", () => {
    const normal = layoutNativeMath("\\int_0^1", true, 12);
    const tuned = layoutNativeMath("\\int_0^1", true, 12, {
      ...defaultNativeMathMetrics,
      displayLargeOperatorSuperscriptBaseline: -1.2,
      displayLargeOperatorSubscriptBaseline: 1,
      displayLargeOperatorSuperscriptGap: 0.32,
      displayLargeOperatorSubscriptGap: 0.32
    });
    const normalGlyphs = normal.nodes.filter((node) => node.type === "glyph");
    const tunedGlyphs = tuned.nodes.filter((node) => node.type === "glyph");
    const normalIntegral = normalGlyphs.find((node) => node.text === "∫");
    const tunedIntegral = tunedGlyphs.find((node) => node.text === "∫");
    const normalLower = normalGlyphs.find((node) => node.text === "0");
    const tunedLower = tunedGlyphs.find((node) => node.text === "0");
    const normalUpper = normalGlyphs.find((node) => node.text === "1");
    const tunedUpper = tunedGlyphs.find((node) => node.text === "1");

    expect(normalIntegral?.type).toBe("glyph");
    expect(tunedIntegral?.type).toBe("glyph");
    expect(normalLower?.type).toBe("glyph");
    expect(tunedLower?.type).toBe("glyph");
    expect(normalUpper?.type).toBe("glyph");
    expect(tunedUpper?.type).toBe("glyph");
    if (
      normalIntegral?.type === "glyph" &&
      tunedIntegral?.type === "glyph" &&
      normalLower?.type === "glyph" &&
      tunedLower?.type === "glyph" &&
      normalUpper?.type === "glyph" &&
      tunedUpper?.type === "glyph"
    ) {
      expect(tunedUpper.y - tunedIntegral.y).toBeLessThan(normalUpper.y - normalIntegral.y);
      expect(tunedLower.y - tunedIntegral.y).toBeGreaterThan(normalLower.y - normalIntegral.y);
      expect(tunedUpper.x - tunedIntegral.x).toBeGreaterThan(normalUpper.x - normalIntegral.x);
      expect(tunedLower.x - tunedIntegral.x).toBeGreaterThan(normalLower.x - normalIntegral.x);
    }
  });

  it("centers native display sum and product limits above and below the operator", () => {
    const sum = layoutNativeMath("\\sum_i^n", true, 12);
    const product = layoutNativeMath("\\prod_i^n", true, 12);
    const sumGlyphs = sum.nodes.filter((node) => node.type === "glyph");
    const productGlyphs = product.nodes.filter((node) => node.type === "glyph");
    const sumOperator = sumGlyphs.find((node) => node.text === "∑");
    const productOperator = productGlyphs.find((node) => node.text === "∏");
    const sumLower = sumGlyphs.find((node) => node.text === "i");
    const sumUpper = sumGlyphs.find((node) => node.text === "n");
    const productLower = productGlyphs.find((node) => node.text === "i");
    const productUpper = productGlyphs.find((node) => node.text === "n");

    expect(sumOperator?.type).toBe("glyph");
    expect(productOperator?.type).toBe("glyph");
    expect(sumLower?.type).toBe("glyph");
    expect(sumUpper?.type).toBe("glyph");
    expect(productLower?.type).toBe("glyph");
    expect(productUpper?.type).toBe("glyph");
    if (
      sumOperator?.type === "glyph" &&
      productOperator?.type === "glyph" &&
      sumLower?.type === "glyph" &&
      sumUpper?.type === "glyph" &&
      productLower?.type === "glyph" &&
      productUpper?.type === "glyph"
    ) {
      const sumCenter = sumOperator.x + sumOperator.fontSize * 0.35;
      const productCenter = productOperator.x + productOperator.fontSize * 0.35;
      expect(Math.abs(sumLower.x - sumCenter)).toBeLessThan(sumOperator.fontSize * 0.45);
      expect(Math.abs(sumUpper.x - sumCenter)).toBeLessThan(sumOperator.fontSize * 0.45);
      expect(Math.abs(productLower.x - productCenter)).toBeLessThan(productOperator.fontSize * 0.45);
      expect(Math.abs(productUpper.x - productCenter)).toBeLessThan(productOperator.fontSize * 0.45);
      expect(sumUpper.y).toBeLessThan(sumOperator.y);
      expect(sumLower.y).toBeGreaterThan(sumOperator.y);
      expect(productUpper.y).toBeLessThan(productOperator.y);
      expect(productLower.y).toBeGreaterThan(productOperator.y);
    }
  });

  it("allows native display sum and product limit placement to be tuned", () => {
    const normal = layoutNativeMath("\\sum_i^n", true, 12);
    const tuned = layoutNativeMath("\\sum_i^n", true, 12, {
      ...defaultNativeMathMetrics,
      displayLimitOperatorSuperscriptBaseline: -1.1,
      displayLimitOperatorSubscriptBaseline: 1
    });
    const normalGlyphs = normal.nodes.filter((node) => node.type === "glyph");
    const tunedGlyphs = tuned.nodes.filter((node) => node.type === "glyph");
    const normalOperator = normalGlyphs.find((node) => node.text === "∑");
    const tunedOperator = tunedGlyphs.find((node) => node.text === "∑");
    const normalLower = normalGlyphs.find((node) => node.text === "i");
    const tunedLower = tunedGlyphs.find((node) => node.text === "i");
    const normalUpper = normalGlyphs.find((node) => node.text === "n");
    const tunedUpper = tunedGlyphs.find((node) => node.text === "n");

    expect(normalOperator?.type).toBe("glyph");
    expect(tunedOperator?.type).toBe("glyph");
    expect(normalLower?.type).toBe("glyph");
    expect(tunedLower?.type).toBe("glyph");
    expect(normalUpper?.type).toBe("glyph");
    expect(tunedUpper?.type).toBe("glyph");
    if (
      normalOperator?.type === "glyph" &&
      tunedOperator?.type === "glyph" &&
      normalLower?.type === "glyph" &&
      tunedLower?.type === "glyph" &&
      normalUpper?.type === "glyph" &&
      tunedUpper?.type === "glyph"
    ) {
      expect(tunedUpper.y - tunedOperator.y).toBeLessThan(normalUpper.y - normalOperator.y);
      expect(tunedLower.y - tunedOperator.y).toBeGreaterThan(normalLower.y - normalOperator.y);
      expect(tunedUpper.x - tunedOperator.x).toBeCloseTo(normalUpper.x - normalOperator.x, 5);
      expect(tunedLower.x - tunedOperator.x).toBeCloseTo(normalLower.x - normalOperator.x, 5);
    }
  });

  it("advances the next native token after display sum and product limits", () => {
    const layout = layoutNativeMath("\\sum_i^n z", true, 12);
    const bare = layoutNativeMath("\\sum k", true, 12);
    const glyphs = layout.nodes.filter((node) => node.type === "glyph");
    const bareGlyphs = bare.nodes.filter((node) => node.type === "glyph");
    const sum = glyphs.find((node) => node.text === "∑");
    const lower = glyphs.find((node) => node.text === "i");
    const upper = glyphs.find((node) => node.text === "n");
    const next = glyphs.find((node) => node.text === "z");
    const bareSum = bareGlyphs.find((node) => node.text === "∑");
    const bareNext = bareGlyphs.find((node) => node.text === "k");

    expect(sum?.type).toBe("glyph");
    expect(lower?.type).toBe("glyph");
    expect(upper?.type).toBe("glyph");
    expect(next?.type).toBe("glyph");
    expect(bareSum?.type).toBe("glyph");
    expect(bareNext?.type).toBe("glyph");
    if (
      sum?.type === "glyph" &&
      lower?.type === "glyph" &&
      upper?.type === "glyph" &&
      next?.type === "glyph" &&
      bareSum?.type === "glyph" &&
      bareNext?.type === "glyph"
    ) {
      expect(next.x).toBeGreaterThan(sum.x);
      expect(next.x).toBeGreaterThan(lower.x);
      expect(next.x).toBeGreaterThan(upper.x);
      expect(next.x).toBeGreaterThanOrEqual(Math.max(sum.x, lower.x, upper.x));
      expect(bareNext.x - bareSum.x).toBeGreaterThan(bareSum.fontSize * 0.6);
    }
  });

  it("renders native plus-minus commands", () => {
    const layout = layoutNativeMath("x \\pm y", false, 12);
    const compactLayout = layoutNativeMath("x \\pm y", false, 12, {
      ...defaultNativeMathMetrics,
      binaryMargin: 0
    });
    const glyphs = layout.nodes.filter((node) => node.type === "glyph");
    const compactGlyphs = compactLayout.nodes.filter((node) => node.type === "glyph");
    const plusMinus = glyphs.find((node) => node.text === "±");
    const compactPlusMinus = compactGlyphs.find((node) => node.text === "±");
    const y = glyphs.find((node) => node.text === "y");
    const compactY = compactGlyphs.find((node) => node.text === "y");

    expect(glyphs.map((node) => node.text)).toContain("±");
    expect(glyphs.map((node) => node.text)).not.toContain("⟦pm⟧");
    expect(plusMinus?.type).toBe("glyph");
    expect(compactPlusMinus?.type).toBe("glyph");
    expect(y?.type).toBe("glyph");
    expect(compactY?.type).toBe("glyph");
    if (
      plusMinus?.type === "glyph" &&
      compactPlusMinus?.type === "glyph" &&
      y?.type === "glyph" &&
      compactY?.type === "glyph"
    ) {
      expect(y.x - plusMinus.x).toBeGreaterThan(compactY.x - compactPlusMinus.x);
    }
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

  it("draws native square roots with a controllable radical path", () => {
    const layout = layoutNativeMath("\\sqrt{x}", false, 12);
    const paths = layout.nodes.filter((node) => node.type === "path");
    const glyphs = layout.nodes.filter((node) => node.type === "glyph");
    const rule = layout.nodes.find((node) => node.type === "rule");

    expect(paths).toHaveLength(3);
    expect(paths[1]?.strokeWidth).toBeGreaterThan(paths[0]?.strokeWidth ?? 0);
    expect(paths[1]?.strokeWidth).toBeGreaterThan(paths[2]?.strokeWidth ?? 0);
    expect(glyphs.map((node) => node.text)).not.toContain("√");
    expect(rule?.type).toBe("rule");
  });

  it("scales the native radical path from the square root body height", () => {
    const simple = layoutNativeMath("\\sqrt{x}", false, 12);
    const tall = layoutNativeMath("\\sqrt{\\frac{a}{b}}", false, 12);
    const simplePaths = simple.nodes.filter((node) => node.type === "path");
    const tallPaths = tall.nodes.filter((node) => node.type === "path");

    expect(simplePaths).toHaveLength(3);
    expect(tallPaths).toHaveLength(3);
    if (simplePaths.length === 3 && tallPaths.length === 3) {
      const simplePoints = simplePaths.flatMap((path) => path.points);
      const tallPoints = tallPaths.flatMap((path) => path.points);
      const simpleSpan = Math.max(...simplePoints.map((point) => point[1])) - Math.min(...simplePoints.map((point) => point[1]));
      const tallSpan = Math.max(...tallPoints.map((point) => point[1])) - Math.min(...tallPoints.map((point) => point[1]));
      expect(tallSpan).toBeGreaterThan(simpleSpan);
    }
  });

  it("scales the native square root rule from the body height", () => {
    const simple = layoutNativeMath("\\sqrt{x}", false, 12);
    const tall = layoutNativeMath("\\sqrt{\\frac{a}{b}}", false, 12);
    const simpleRule = simple.nodes.find((node) => node.type === "rule");
    const tallRule = tall.nodes.find((node) => node.type === "rule");

    expect(simpleRule?.type).toBe("rule");
    expect(tallRule?.type).toBe("rule");
    if (simpleRule?.type === "rule" && tallRule?.type === "rule") {
      expect(tallRule.height).toBeGreaterThan(simpleRule.height);
    }
  });

  it("positions the native square root rule from the body height", () => {
    const simple = layoutNativeMath("\\sqrt{x}", false, 12);
    const tall = layoutNativeMath("\\sqrt{\\frac{a}{b}}", false, 12);
    const simpleRule = simple.nodes.find((node) => node.type === "rule");
    const tallRule = tall.nodes.find((node) => node.type === "rule");

    expect(simpleRule?.type).toBe("rule");
    expect(tallRule?.type).toBe("rule");
    if (simpleRule?.type === "rule" && tallRule?.type === "rule") {
      expect(tallRule.y).toBeLessThan(simpleRule.y);
    }
  });

  it("keeps native radical path stroke weight independent of body height", () => {
    const simple = layoutNativeMath("\\sqrt{x}", false, 12);
    const tall = layoutNativeMath("\\sqrt{\\frac{a}{b}}", false, 12);
    const simplePaths = simple.nodes.filter((node) => node.type === "path");
    const tallPaths = tall.nodes.filter((node) => node.type === "path");

    expect(simplePaths).toHaveLength(3);
    expect(tallPaths).toHaveLength(3);
    if (simplePaths.length === 3 && tallPaths.length === 3) {
      expect(tallPaths[0].strokeWidth).toBeCloseTo(simplePaths[0].strokeWidth, 5);
      expect(tallPaths[1].strokeWidth).toBeCloseTo(simplePaths[1].strokeWidth, 5);
      expect(tallPaths[2].strokeWidth).toBeCloseTo(simplePaths[2].strokeWidth, 5);
    }
  });

});
