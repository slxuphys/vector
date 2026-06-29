import { describe, expect, it } from "vitest";
import { createDocumentEngine } from "../src/core/engine/createDocumentEngine";
import { parseMarkdown } from "../src/core/markdown/parseMarkdown";
import { renderPageToSvg } from "../src/core/renderers/svg/renderPageToSvg";
import { renderToPdf } from "../src/core/renderers/pdf/renderToPdf";
import { tokenizeLatex } from "../src/core/renderers/pdf/pdfMath";
import { renderKatex } from "../src/core/renderers/math/renderKatex";
import { defaultNativeMathMetrics, layoutNativeMath } from "../src/core/renderers/math/nativeMath";
import { getNativeGlyphTexMetrics } from "../src/core/renderers/math/nativeFontMetrics";
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

  it("renders native OpenMath mode through the native display path", async () => {
    const engine = createDocumentEngine({ useWorker: false, mathRenderer: "native-openmath" });
    const { layout } = await engine.layout("OpenMath $\\sqrt{x^2 + y^2} = r$");
    const math = layout.pages[0].objects.find((object) => object.type === "math");
    const svg = renderPageToSvg(layout.pages[0]);

    expect(math?.type).toBe("math");
    if (math?.type === "math") {
      expect(math.renderer).toBe("native-openmath");
      expect(math.svg).toBe("");
      expect(math.nativeMetrics).toBeDefined();
    }
    expect(svg).toContain("svg-md-native-math");
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
      expect(Math.abs((math.y + (math.baseline ?? 0)) - text.y)).toBeLessThan(3);
    }
  });

  it("allows native glyph gap to tune compact calculation spacing", () => {
    const layout = layoutNativeMath("E=mc^2", false, 12);
    const looseLayout = layoutNativeMath("E=mc^2", false, 12, {
      ...defaultNativeMathMetrics,
      inlineGlyphGap: 0.16
    });
    const glyphs = layout.nodes.filter((node) => node.type === "glyph");
    const looseGlyphs = looseLayout.nodes.filter((node) => node.type === "glyph");
    const e = glyphs.find((node) => node.text === "E");
    const equals = glyphs.find((node) => node.text === "=");
    const m = glyphs.find((node) => node.text === "m");
    const looseE = looseGlyphs.find((node) => node.text === "E");
    const looseEquals = looseGlyphs.find((node) => node.text === "=");
    const looseM = looseGlyphs.find((node) => node.text === "m");

    expect(e?.type).toBe("glyph");
    expect(equals?.type).toBe("glyph");
    expect(m?.type).toBe("glyph");
    expect(looseE?.type).toBe("glyph");
    expect(looseEquals?.type).toBe("glyph");
    expect(looseM?.type).toBe("glyph");
    if (
      e?.type === "glyph" &&
      equals?.type === "glyph" &&
      m?.type === "glyph" &&
      looseE?.type === "glyph" &&
      looseEquals?.type === "glyph" &&
      looseM?.type === "glyph"
    ) {
      expect(looseEquals.x - looseE.x).toBeGreaterThan(equals.x - e.x);
      expect(looseM.x - looseEquals.x).toBeGreaterThan(m.x - equals.x);
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

  it("keeps normal glyphs aligned when inline math contains a fraction", () => {
    const standalone = layoutNativeMath("x", false, 12);
    const mixed = layoutNativeMath("x + \\frac{a}{b} = y", false, 12);
    const standaloneX = standalone.nodes.find((node) => node.type === "glyph" && node.text === "x");
    const mixedX = mixed.nodes.find((node) => node.type === "glyph" && node.text === "x");
    const mixedY = mixed.nodes.find((node) => node.type === "glyph" && node.text === "y");

    expect(standaloneX?.type).toBe("glyph");
    expect(mixedX?.type).toBe("glyph");
    expect(mixedY?.type).toBe("glyph");
    if (standaloneX?.type === "glyph" && mixedX?.type === "glyph" && mixedY?.type === "glyph") {
      expect(mixedX.y).toBeCloseTo(mixedY.y, 5);
      expect(mixed.baseline).toBeGreaterThan(standalone.baseline);
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

  it("applies native named-operator spacing after scripts, not before them", () => {
    const spaced = layoutNativeMath("\\sin^2 x", false, 12);
    const compact = layoutNativeMath("\\sin^2 x", false, 12, {
      ...defaultNativeMathMetrics,
      namedOperatorRightMargin: 0
    });
    const spacedGlyphs = spaced.nodes.filter((node) => node.type === "glyph");
    const compactGlyphs = compact.nodes.filter((node) => node.type === "glyph");
    const spacedSup = spacedGlyphs.find((node) => node.text === "2");
    const compactSup = compactGlyphs.find((node) => node.text === "2");
    const spacedX = spacedGlyphs.find((node) => node.text === "x");
    const compactX = compactGlyphs.find((node) => node.text === "x");

    expect(spacedGlyphs.map((node) => node.text)).toContain("sin");
    expect(spacedSup?.type).toBe("glyph");
    expect(compactSup?.type).toBe("glyph");
    expect(spacedX?.type).toBe("glyph");
    expect(compactX?.type).toBe("glyph");
    if (
      spacedSup?.type === "glyph" &&
      compactSup?.type === "glyph" &&
      spacedX?.type === "glyph" &&
      compactX?.type === "glyph"
    ) {
      expect(spacedSup.x).toBeCloseTo(compactSup.x, 5);
      expect(spacedX.x).toBeGreaterThan(compactX.x);
    }
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
      const displaySumMetrics = getNativeGlyphTexMetrics("size2", "∑", displaySum.fontSize);
      const displaySubMetrics = getNativeGlyphTexMetrics("mathItalic", "i", displaySub.fontSize);
      expect(displaySumMetrics).toBeDefined();
      expect(displaySubMetrics).toBeDefined();
      if (!displaySumMetrics || !displaySubMetrics) return;

      const displaySubCenter = displaySub.x + displaySubMetrics.advanceWidth / 2;
      const displaySumCenter = displaySum.x + displaySumMetrics.advanceWidth / 2;
      expect(Math.abs(displaySubCenter - displaySumCenter)).toBeLessThan(1);
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

  it("bases native display limit scripts on the measured operator height", () => {
    const sum = layoutNativeMath("\\sum_i", true, 12);
    const lim = layoutNativeMath("\\lim_i", true, 12);
    const sumGlyphs = sum.nodes.filter((node) => node.type === "glyph");
    const limGlyphs = lim.nodes.filter((node) => node.type === "glyph");
    const sumOperator = sumGlyphs.find((node) => node.text === "∑");
    const sumLower = sumGlyphs.find((node) => node.text === "i");
    const limOperator = limGlyphs.find((node) => node.text === "lim");
    const limLower = limGlyphs.find((node) => node.text === "i");

    expect(sumOperator?.type).toBe("glyph");
    expect(sumLower?.type).toBe("glyph");
    expect(limOperator?.type).toBe("glyph");
    expect(limLower?.type).toBe("glyph");
    if (
      sumOperator?.type === "glyph" &&
      sumLower?.type === "glyph" &&
      limOperator?.type === "glyph" &&
      limLower?.type === "glyph"
    ) {
      expect(sumLower.y - sumOperator.y).toBeGreaterThan(limLower.y - limOperator.y);
    }
  });

  it("keeps text limit-operator subscripts closer than tall symbol subscripts", () => {
    const layout = layoutNativeMath("\\sum_{\\theta} \\max_{\\theta}", true, 12);
    const glyphs = layout.nodes.filter((node) => node.type === "glyph");
    const sum = glyphs.find((node) => node.text === "∑");
    const max = glyphs.find((node) => node.text === "max");
    const theta = glyphs.filter((node) => node.text === "θ");
    const sumTheta = theta[0];
    const maxTheta = theta[1];

    expect(sum?.type).toBe("glyph");
    expect(max?.type).toBe("glyph");
    expect(sumTheta?.type).toBe("glyph");
    expect(maxTheta?.type).toBe("glyph");
    if (
      sum?.type === "glyph" &&
      max?.type === "glyph" &&
      sumTheta?.type === "glyph" &&
      maxTheta?.type === "glyph"
    ) {
      expect(maxTheta.y - max.y).toBeLessThan(sumTheta.y - sum.y);
    }
  });

  it("allows native display large-operator script placement to be tuned", () => {
    const normal = layoutNativeMath("\\int_0^1", true, 12);
    const tuned = layoutNativeMath("\\int_0^1", true, 12, {
      ...defaultNativeMathMetrics,
      displayLargeOperatorSuperscriptBaseline: -1.4,
      displayLargeOperatorSubscriptBaseline: 1.2,
      displayLargeOperatorSuperscriptGap: 0.9,
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

  it("centers native display lim subscripts below the operator", () => {
    const layout = layoutNativeMath("\\lim_{x\\to0} f(x)", true, 12);
    const glyphs = layout.nodes.filter((node) => node.type === "glyph");
    const lim = glyphs.find((node) => node.text === "lim");
    const subX = glyphs.find((node) => node.text === "x");
    const f = glyphs.find((node) => node.text === "f");

    expect(lim?.type).toBe("glyph");
    expect(subX?.type).toBe("glyph");
    expect(f?.type).toBe("glyph");
    if (lim?.type === "glyph" && subX?.type === "glyph" && f?.type === "glyph") {
      expect(subX.y).toBeGreaterThan(lim.y);
      expect(subX.x).toBeGreaterThanOrEqual(lim.x - lim.fontSize * 0.6);
      expect(subX.x).toBeLessThanOrEqual(lim.x + lim.fontSize * 1.4);
      expect(f.x).toBeGreaterThan(lim.x);
      expect(f.x).toBeGreaterThan(subX.x);
    }
  });

  it("allows native display sum and product limit placement to be tuned", () => {
    const normal = layoutNativeMath("\\sum_i^n", true, 12);
    const tuned = layoutNativeMath("\\sum_i^n", true, 12, {
      ...defaultNativeMathMetrics,
      displayLimitOperatorSuperscriptBaseline: -1.4,
      displayLimitOperatorSubscriptBaseline: 1.2
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
      expect(bareNext.x).toBeGreaterThan(bareSum.x);
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

  it("renders native infinity as an upright math symbol with usable width", () => {
    const layout = layoutNativeMath("\\infty", false, 12);
    const glyphs = layout.nodes.filter((node) => node.type === "glyph");
    const infinity = glyphs.find((node) => node.text === "∞");

    expect(infinity?.type).toBe("glyph");
    if (infinity?.type === "glyph") {
      expect(infinity.italic).toBe(false);
      expect(layout.advance).toBeGreaterThan(8);
    }
  });

  it("renders native cdot as a math binary operator", () => {
    const layout = layoutNativeMath("x \\cdot y", false, 12);
    const compactLayout = layoutNativeMath("x \\cdot y", false, 12, {
      ...defaultNativeMathMetrics,
      binaryMargin: 0
    });
    const glyphs = layout.nodes.filter((node) => node.type === "glyph");
    const compactGlyphs = compactLayout.nodes.filter((node) => node.type === "glyph");
    const dot = glyphs.find((node) => node.text === "⋅");
    const compactDot = compactGlyphs.find((node) => node.text === "⋅");
    const y = glyphs.find((node) => node.text === "y");
    const compactY = compactGlyphs.find((node) => node.text === "y");

    expect(glyphs.map((node) => node.text)).toContain("⋅");
    expect(glyphs.map((node) => node.text)).not.toContain("·");
    expect(dot?.type).toBe("glyph");
    expect(compactDot?.type).toBe("glyph");
    expect(y?.type).toBe("glyph");
    expect(compactY?.type).toBe("glyph");
    if (
      dot?.type === "glyph" &&
      compactDot?.type === "glyph" &&
      y?.type === "glyph" &&
      compactY?.type === "glyph"
    ) {
      expect(dot.italic).toBe(false);
      expect(y.x - dot.x).toBeGreaterThan(compactY.x - compactDot.x);
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

  it("includes native math metrics in native OpenMath measurement keys", () => {
    expect(mathMeasureKey("E=mc^2", false, 12, "native-openmath", defaultNativeMathMetrics)).not.toBe(
      mathMeasureKey("E=mc^2", false, 12, "native-openmath", {
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

  it("keeps compact native square roots from using the full font-sized radical width floor", () => {
    const simple = layoutNativeMath("\\sqrt{x}", false, 12);
    const tall = layoutNativeMath("\\sqrt{\\frac{a}{b}}", false, 12);
    const simplePaths = simple.nodes.filter((node) => node.type === "path");
    const tallPaths = tall.nodes.filter((node) => node.type === "path");

    expect(simplePaths).toHaveLength(3);
    expect(tallPaths).toHaveLength(3);
    if (simplePaths.length === 3 && tallPaths.length === 3) {
      const simpleRuleStart = simplePaths[2].points[1][0];
      const tallRuleStart = tallPaths[2].points[1][0];
      expect(simpleRuleStart).toBeLessThan(12 * defaultNativeMathMetrics.sqrtRadicalWidth);
      expect(tallRuleStart).toBeGreaterThan(simpleRuleStart);
    }
  });

  it("keeps the native square root rule thickness independent of body height", () => {
    const simple = layoutNativeMath("\\sqrt{x}", false, 12);
    const tall = layoutNativeMath("\\sqrt{\\frac{a}{b}}", false, 12);
    const simpleRule = simple.nodes.find((node) => node.type === "rule");
    const tallRule = tall.nodes.find((node) => node.type === "rule");

    expect(simpleRule?.type).toBe("rule");
    expect(tallRule?.type).toBe("rule");
    if (simpleRule?.type === "rule" && tallRule?.type === "rule") {
      expect(tallRule.height).toBeCloseTo(simpleRule.height, 5);
    }
  });

  it("keeps the native square root rule at the top of the radical box", () => {
    const simple = layoutNativeMath("\\sqrt{x}", false, 12);
    const tall = layoutNativeMath("\\sqrt{\\frac{a}{b}}", false, 12);
    const simpleRule = simple.nodes.find((node) => node.type === "rule");
    const tallRule = tall.nodes.find((node) => node.type === "rule");

    expect(simpleRule?.type).toBe("rule");
    expect(tallRule?.type).toBe("rule");
    if (simpleRule?.type === "rule" && tallRule?.type === "rule") {
      expect(tallRule.y).toBeCloseTo(simpleRule.y, 5);
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

  it("renders native accents from actual body boxes", () => {
    const accented = layoutNativeMath("\\hat{x} + \\bar{x} + \\vec{x} + \\dot{x} + \\ddot{x}", false, 12);
    const simple = layoutNativeMath("\\hat{x}", false, 12);
    const tall = layoutNativeMath("\\hat{x^2}", false, 12);
    const paths = accented.nodes.filter((node) => node.type === "path");
    const glyphs = accented.nodes.filter((node) => node.type === "glyph");

    expect(paths.length).toBeGreaterThan(0);
    expect(glyphs.map((node) => node.text)).toEqual(expect.arrayContaining(["^", "ˉ", "˙", "¨"]));
    expect(glyphs.map((node) => node.text)).not.toContain("⟦hat⟧");
    expect(glyphs.map((node) => node.text)).not.toContain("⟦vec⟧");
    expect(tall.baseline).toBeGreaterThan(simple.baseline);
  });

  it("uses KaTeX skew metrics to shift native accents over italic bases", () => {
    const skewed = layoutNativeMath("\\hat{F}", false, 12);
    const unskewed = layoutNativeMath("\\hat{i}", false, 12);
    const skewedHat = skewed.nodes.find((node) => node.type === "glyph" && node.text === "^");
    const unskewedHat = unskewed.nodes.find((node) => node.type === "glyph" && node.text === "^");

    expect(skewedHat?.type).toBe("glyph");
    expect(unskewedHat?.type).toBe("glyph");
    if (skewedHat?.type === "glyph" && unskewedHat?.type === "glyph") {
      const skewedCenterOffset = skewedHat.x + skewedHat.fontSize * 0.36 - skewed.width / 2;
      const unskewedCenterOffset = unskewedHat.x + unskewedHat.fontSize * 0.36 - unskewed.width / 2;
      expect(skewedCenterOffset).toBeGreaterThan(unskewedCenterOffset + 0.5);
    }
  });

  it("keeps native font accents close to the accented body", () => {
    const layout = layoutNativeMath("\\hat{x}", false, 12);
    const hat = layout.nodes.find((node) => node.type === "glyph" && node.text === "^");
    const body = layout.nodes.find((node) => node.type === "glyph" && node.text === "x");

    expect(hat?.type).toBe("glyph");
    expect(body?.type).toBe("glyph");
    if (hat?.type === "glyph" && body?.type === "glyph") {
      const hatMetrics = getNativeGlyphTexMetrics("mainRegular", "^", hat.fontSize);
      const bodyMetrics = getNativeGlyphTexMetrics("mathItalic", "x", body.fontSize);
      expect(hatMetrics).toBeDefined();
      expect(bodyMetrics).toBeDefined();
      if (!hatMetrics || !bodyMetrics) return;

      const hatBottom = hat.y - hat.fontSize * 0.531;
      const bodyTop = body.y - bodyMetrics.actualAscent;
      const gap = bodyTop - hatBottom;
      expect(gap).toBeCloseTo(hat.fontSize * defaultNativeMathMetrics.accentGap, 5);
      expect(gap).toBeGreaterThanOrEqual(0);
    }
  });

  it("allows native accent gap to be tuned", () => {
    const tight = layoutNativeMath("\\hat{x}", false, 12, {
      ...defaultNativeMathMetrics,
      accentGap: 0
    });
    const loose = layoutNativeMath("\\hat{x}", false, 12, {
      ...defaultNativeMathMetrics,
      accentGap: 0.12
    });
    const tightBody = tight.nodes.find((node) => node.type === "glyph" && node.text === "x");
    const looseBody = loose.nodes.find((node) => node.type === "glyph" && node.text === "x");

    expect(tightBody?.type).toBe("glyph");
    expect(looseBody?.type).toBe("glyph");
    if (tightBody?.type === "glyph" && looseBody?.type === "glyph") {
      expect(looseBody.y - tightBody.y).toBeCloseTo(12 * 0.12, 5);
    }
  });

});
