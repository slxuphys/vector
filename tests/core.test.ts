import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument } from "pdf-lib";
import { createDocumentEngine } from "../src/core/engine/createDocumentEngine";
import { parseMarkdown } from "../src/core/markdown/parseMarkdown";
import { renderPageToSvg } from "../src/core/renderers/svg/renderPageToSvg";
import { renderToPdf } from "../src/core/renderers/pdf/renderToPdf";
import { tokenizeLatex } from "../src/core/renderers/pdf/pdfMath";
import { subsetFontWithHarfbuzz } from "../src/core/renderers/pdf/pdfFontSubset";
import { renderKatex } from "../src/core/renderers/math/renderKatex";
import {
  defaultNativeMathMetrics,
  defaultOpenMathMetrics,
  getDefaultOpenMathMetrics,
  layoutNativeMath,
  openMathMetricsFromConstants
} from "../src/core/renderers/math/nativeMath";
import {
  getNativeGlyphId,
  getNativeGlyphMetrics,
  getNativeGlyphTexMetrics,
  getOpenTypeMathConstants,
  getOpenTypeMathKern,
  getOpenTypeMathRadicalVariant,
  loadNativeFontFromBytes
} from "../src/core/renderers/math/nativeFontMetrics";
import { mathMeasureKey, normalizeMathLatex } from "../src/core/layout/mathMetrics";
import { measureText } from "../src/core/layout/measureText";
import { normalizeAst } from "../src/core/markdown/normalizeAst";
import { paginate } from "../src/core/layout/paginate";
import { loadTextFontFromBytes } from "../src/core/renderers/text/textFontMetrics";
import { newComputerModernFontFamily } from "../src/core/renderers/text/latinModernRomanFont";
import { defaultTheme } from "../src/core/theme/defaultTheme";
import type { PageConfig } from "../src/core/layout/pageConfig";

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
    const table = ast.children.find((node) => node.type === "table");
    expect(table?.type).toBe("table");
    if (table?.type === "table") {
      expect(table.align).toEqual(["left", "left"]);
    }
  });

  it("parses table alignment and escaped pipes", () => {
    const ast = parseMarkdown(`| Left | Center | Right |
| :--- | :---: | ---: |
| a \\| b | \`x | y\` | $E=mc^2$ |
`);
    const table = ast.children[0];

    expect(table?.type).toBe("table");
    if (table?.type === "table") {
      expect(table.align).toEqual(["left", "center", "right"]);
      expect(table.rows[0][0].children).toEqual([{ type: "text", text: "a | b" }]);
      expect(table.rows[0][1].children).toEqual([{ type: "code", text: "x | y" }]);
      expect(table.rows[0][2].children).toEqual([{ type: "math", text: "E=mc^2" }]);
    }
  });

  it("parses block images with captions and sizing attributes", () => {
    const ast = parseMarkdown(`![Phase space](plot.svg "Figure 1. Phase space"){width=70% align=center}
`);
    const image = ast.children[0];

    expect(image?.type).toBe("image");
    if (image?.type === "image") {
      expect(image.alt).toBe("Phase space");
      expect(image.src).toBe("plot.svg");
      expect(image.caption).toBe("Figure 1. Phase space");
      expect(image.width).toEqual({ value: 70, unit: "percent" });
      expect(image.align).toBe("center");
    }
  });

  it("parses fenced GraphSX blocks with sizing attributes", () => {
    const ast = parseMarkdown(`\`\`\`graphsx width=80% align=center caption="Figure 2. Routed graph"
<Graph><Rect id="A" /></Graph>
\`\`\`
`);
    const graph = ast.children[0];

    expect(graph?.type).toBe("graphsx");
    if (graph?.type === "graphsx") {
      expect(graph.source).toContain("<Graph>");
      expect(graph.caption).toBe("Figure 2. Routed graph");
      expect(graph.width).toEqual({ value: 80, unit: "percent" });
      expect(graph.align).toBe("center");
    }
  });

  it("preserves LaTeX command backslashes inside table math cells", () => {
    const ast = parseMarkdown(`| Formula |
| --- |
| $\\frac{a}{b}$ |
`);
    const table = ast.children[0];

    expect(table?.type).toBe("table");
    if (table?.type === "table") {
      expect(table.rows[0][0].children).toEqual([{ type: "math", text: "\\frac{a}{b}" }]);
    }
  });

  it("keeps pipe delimiters inside table math cells", () => {
    const ast = parseMarkdown(`| Formula | Meaning |
| --- | --- |
| $\\left|x\\right|$ | absolute value |
`);
    const table = ast.children[0];

    expect(table?.type).toBe("table");
    if (table?.type === "table") {
      expect(table.rows[0]).toHaveLength(2);
      expect(table.rows[0][0].children).toEqual([{ type: "math", text: "\\left|x\\right|" }]);
      expect(table.rows[0][1].children).toEqual([{ type: "text", text: "absolute value" }]);
    }
  });

  it("parses table cell colspan and rowspan attributes", () => {
    const ast = parseMarkdown(`| Group {: colspan=2} | Status |
| --- | --- | --- |
| Alpha {: rowspan=2} | $x$ | ready |
| $y$ | done |
`);
    const table = ast.children[0];

    expect(table?.type).toBe("table");
    if (table?.type === "table") {
      expect(table.headers[0].colSpan).toBe(2);
      expect(table.headers[0].children).toEqual([{ type: "text", text: "Group" }]);
      expect(table.rows[0][0].rowSpan).toBe(2);
      expect(table.rows[0][0].children).toEqual([{ type: "text", text: "Alpha" }]);
      expect(table.rows[1][0].children).toEqual([{ type: "math", text: "y" }]);
    }
  });
});

describe("document engine", () => {
  it("measures bundled text fonts from font files", () => {
    loadTextFontFromBytes("new-computer-modern:regular", readFileSync("src/assets/fonts/cmu-serif-regular.otf"));
    const width = measureText("This sample", {
      fontSize: 12,
      fontFamily: newComputerModernFontFamily,
      monoFontFamily: defaultTheme.monoFontFamily
    });

    expect(width).toBeCloseTo(63.408, 3);
  });

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
    expect(textObjects.some((object) => object.type === "text" && object.text.includes("Markdown "))).toBe(true);
  });

  it("renders markdown images with captions into SVG pages", async () => {
    const engine = createDocumentEngine({ useWorker: false });
    const { layout } = await engine.layout(`![Plot](data:image/svg+xml,%3Csvg%2F%3E "Figure 1. Plot"){width=50% align=center}`);
    const svg = renderPageToSvg(layout.pages[0]);
    const image = layout.pages[0].objects.find((object) => object.type === "image");
    const caption = layout.pages[0].objects.find((object) => object.type === "text" && object.text === "Figure 1. Plot");

    expect(image?.type).toBe("image");
    expect(caption?.type).toBe("text");
    expect(svg).toContain("<image");
    expect(svg).toContain("Figure 1. Plot");
    if (image?.type === "image") {
      expect(image.width).toBeGreaterThan(100);
      expect(image.width).toBeLessThan(400);
    }
  });

  it("renders fenced GraphSX blocks into SVG pages", async () => {
    const engine = createDocumentEngine({ useWorker: false });
    const { layout } = await engine.layout(`\`\`\`graphsx width=60% align=center caption="Figure 2. GraphSX"
<Graph>
  <Rect id="A" at={[80, 80]} label="A" />
  <Rect id="B" at={[240, 80]} label="B" />
  <Link headArrow from="A.right" to="B.left" />
</Graph>
\`\`\``);
    const svg = renderPageToSvg(layout.pages[0]);
    const graph = layout.pages[0].objects.find((object) => object.type === "graphsx");
    const caption = layout.pages[0].objects.find((object) => object.type === "text" && object.text === "Figure 2. GraphSX");

    expect(graph?.type).toBe("graphsx");
    expect(caption?.type).toBe("text");
    expect(svg).toContain("graphsx-arrow-head");
    expect(svg).toContain("Figure 2. GraphSX");
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
      expect(nextText.x).toBeGreaterThanOrEqual(firstMath.x + (firstMath.advance ?? 0));
      expect(nextText.text.startsWith(" ") || nextText.x > firstMath.x + (firstMath.advance ?? 0)).toBe(true);
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

  it("subsets bundled PDF text fonts", async () => {
    const fontBytes = readFileSync("src/assets/fonts/cmu-serif-regular.otf");
    const createPdf = async (subsetFont: boolean) => {
      const pdf = await PDFDocument.create();
      pdf.registerFontkit(fontkit);
      const font = await pdf.embedFont(fontBytes, { subset: subsetFont });
      const page = pdf.addPage([320, 120]);
      page.drawText("This sample uses a bundled Computer Modern text font.", {
        x: 24,
        y: 64,
        size: 12,
        font
      });
      return pdf.save();
    };
    const full = await createPdf(false);
    const subset = await createPdf(true);

    expect(subset.length).toBeGreaterThan(100);
    expect(subset.length).toBeLessThan(full.length);
  });

  it("subsets bundled text fonts with HarfBuzz WASM", async () => {
    const fontBytes = readFileSync("src/assets/fonts/cmu-serif-regular.otf");
    const wasmBytes = readFileSync("node_modules/subset-font/node_modules/harfbuzzjs/hb-subset.wasm");
    const subset = await subsetFontWithHarfbuzz(fontBytes, "This is a test", {
      noLayoutClosure: true,
      wasmBytes
    });
    const font = fontkit.create(subset);
    const missingGlyphs = font.characterSet.filter((codePoint) => !font.glyphForCodePoint(codePoint));

    expect(subset.length).toBeGreaterThan(100);
    expect(subset.length).toBeLessThan(fontBytes.length);
    expect(missingGlyphs).toEqual([]);
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
    expect(svg).toContain("a");
    expect(svg).toContain("(");
    expect(svg).not.toContain("⟦begin⟧");
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
    expect(svg).toContain("Latin Modern Math");
    expect(svg).not.toContain("foreignObject");
    expect(svg).not.toContain("katex-html");
  });

  it("renders table cell math through the selected math renderer", async () => {
    const engine = createDocumentEngine({ useWorker: false, mathRenderer: "native-openmath" });
    const { layout } = await engine.layout(`| Symbol | Value |
| :--- | ---: |
| radius | $r^2$ |
`);
    const page = layout.pages[0];
    const math = page.objects.find((object) => object.type === "math");
    const cellRects = page.objects.filter((object) => object.type === "rect" && object.stroke);

    expect(math?.type).toBe("math");
    if (math?.type === "math") {
      expect(math.renderer).toBe("native-openmath");
    }
    expect(cellRects.length).toBeGreaterThanOrEqual(4);
  });

  it("renders inline pipe delimiters inside table math cells", async () => {
    const engine = createDocumentEngine({ useWorker: false, mathRenderer: "native-openmath" });
    const { layout } = await engine.layout(`| Formula | Meaning |
| --- | --- |
| $\\left|x\\right|$ | absolute value |
`);
    const math = layout.pages[0].objects.find((object) => object.type === "math");
    const text = layout.pages[0].objects.find((object) => object.type === "text" && object.text.includes("absolute"));

    expect(math?.type).toBe("math");
    if (math?.type === "math") {
      expect(math.latex).toBe("\\left|x\\right|");
      expect(math.renderer).toBe("native-openmath");
    }
    expect(text?.type).toBe("text");
  });

  it("renders table colspan and rowspan as larger cell rectangles", async () => {
    const engine = createDocumentEngine({ useWorker: false, mathRenderer: "native-openmath" });
    const { layout } = await engine.layout(`| Group {: colspan=2} | Status |
| --- | --- | --- |
| Alpha {: rowspan=2} | $x$ | ready |
| $y$ | done |
`);
    const rects = layout.pages[0].objects.filter((object): object is Extract<typeof object, { type: "rect" }> => object.type === "rect" && Boolean(object.stroke));
    const widths = rects.map((rect) => rect.width);
    const heights = rects.map((rect) => rect.height);

    expect(rects.length).toBeGreaterThanOrEqual(6);
    expect(Math.max(...widths)).toBeGreaterThan(Math.min(...widths) * 1.5);
    expect(Math.max(...heights)).toBeGreaterThan(Math.min(...heights) * 1.5);
  });

  it("does not split a table rowspan group across pages", () => {
    const ast = parseMarkdown(`Intro text forces the table near the page bottom so the first body group must move.

| Family {: colspan=2} | Result |
| --- | --- | --- |
| Quadratic {: rowspan=2} | $x^2 + y^2$ | baseline |
| $\\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$ | wide formula |
| Calculus | $\\left. \\frac{d}{dx}x^2 \\right|_{x=1}$ | delimiter |
`);
    const page: PageConfig = {
      size: "letter",
      width: 420,
      height: 132,
      margin: { top: 18, right: 18, bottom: 18, left: 18 }
    };
    const pages = paginate(normalizeAst(ast), page, defaultTheme, undefined, "native-openmath");
    const quadraticPage = pages.findIndex((displayPage) => displayPage.objects.some((object) => object.type === "text" && object.text.includes("Quadratic")));
    const wideFormulaPage = pages.findIndex((displayPage) => displayPage.objects.some((object) => object.type === "text" && object.text.includes("wide")));

    expect(quadraticPage).toBeGreaterThanOrEqual(0);
    expect(wideFormulaPage).toBe(quadraticPage);
  });

  it("uses a less hand-tuned default metric profile for native OpenMath", () => {
    expect(defaultOpenMathMetrics.relationMargin).toBeLessThan(defaultNativeMathMetrics.relationMargin);
    expect(defaultOpenMathMetrics.binaryMargin).toBeLessThan(defaultNativeMathMetrics.binaryMargin);
    expect(defaultOpenMathMetrics.accentGap).toBeLessThan(defaultNativeMathMetrics.accentGap);
  });

  it("derives native OpenMath defaults from OpenType MATH constants", () => {
    const constants = {
      unitsPerEm: 1000,
      scriptPercentScaleDown: 70,
      scriptScriptPercentScaleDown: 50,
      delimitedSubFormulaMinHeight: 1500,
      displayOperatorMinHeight: 1800,
      axisHeight: 250,
      subscriptShiftDown: 180,
      superscriptShiftUp: 420,
      subSuperscriptGapMin: 40,
      spaceAfterScript: 50,
      upperLimitGapMin: 110,
      upperLimitBaselineRiseMin: 680,
      lowerLimitGapMin: 120,
      lowerLimitBaselineDropMin: 620,
      fractionNumeratorShiftUp: 460,
      fractionNumeratorDisplayStyleShiftUp: 700,
      fractionDenominatorShiftDown: 470,
      fractionDenominatorDisplayStyleShiftDown: 700,
      fractionNumeratorGapMin: 70,
      fractionNumDisplayStyleGapMin: 150,
      fractionRuleThickness: 60,
      fractionDenominatorGapMin: 80,
      fractionDenomDisplayStyleGapMin: 150,
      overbarVerticalGap: 90,
      overbarRuleThickness: 60,
      radicalVerticalGap: 100,
      radicalDisplayStyleVerticalGap: 160,
      radicalRuleThickness: 60,
      radicalExtraAscender: 70
    };
    const metrics = openMathMetricsFromConstants(constants);

    expect(metrics.scriptScale).toBeCloseTo(constants.scriptPercentScaleDown / 100, 5);
    expect(metrics.fractionRuleThickness).toBeCloseTo(
      constants.fractionRuleThickness / constants.unitsPerEm,
      5
    );
    expect(metrics.fractionAxisOffset).toBeCloseTo(constants.axisHeight / constants.unitsPerEm, 5);
    expect(metrics.fractionNumeratorShiftUp).toBeCloseTo(
      constants.fractionNumeratorShiftUp / constants.unitsPerEm,
      5
    );
    expect(metrics.fractionNumeratorDisplayGap).toBeCloseTo(
      constants.fractionNumDisplayStyleGapMin / constants.unitsPerEm,
      5
    );
    expect(metrics.fractionDenominatorDisplayShiftDown).toBeCloseTo(
      constants.fractionDenominatorDisplayStyleShiftDown / constants.unitsPerEm,
      5
    );
    expect(metrics.integralSideSuperscriptBaseline).toBeCloseTo(
      -constants.superscriptShiftUp / constants.unitsPerEm,
      5
    );
    expect(metrics.integralSideSubscriptBaseline).toBeCloseTo(
      constants.subscriptShiftDown / constants.unitsPerEm,
      5
    );
    expect(metrics.integralSideSuperscriptGap).toBeCloseTo(
      defaultOpenMathMetrics.integralSideSuperscriptGap,
      5
    );
    expect(metrics.integralSideSubscriptGap).toBeCloseTo(
      defaultOpenMathMetrics.integralSideSubscriptGap,
      5
    );
    expect(metrics.displayLimitOperatorSuperscriptGap).toBeCloseTo(
      constants.upperLimitGapMin / constants.unitsPerEm,
      5
    );
    expect(metrics.displayLimitOperatorSubscriptGap).toBeCloseTo(
      constants.lowerLimitGapMin / constants.unitsPerEm,
      5
    );
    expect(metrics).not.toEqual(defaultOpenMathMetrics);
  });

  it("uses mathematical italic glyphs for OpenMath variables", () => {
    const layout = layoutNativeMath("a + A", false, 12, defaultOpenMathMetrics, "openmath");
    const glyphs = layout.nodes.filter((node) => node.type === "glyph");

    expect(glyphs.map((node) => node.text)).toEqual(["𝑎", "+", "𝐴"]);
    expect(glyphs.find((node) => node.text === "𝑎")?.italic).toBe(false);
    expect(glyphs.find((node) => node.text === "𝐴")?.italic).toBe(false);
  });

  it("uses mathematical italic glyphs for OpenMath lowercase Greek variables", () => {
    const layout = layoutNativeMath("\\alpha + \\theta + \\lambda + \\Gamma", false, 12, defaultOpenMathMetrics, "openmath");
    const glyphs = layout.nodes.filter((node) => node.type === "glyph");

    expect(glyphs.map((node) => node.text)).toEqual(["𝛼", "+", "𝜃", "+", "𝜆", "+", "Γ"]);
    expect(glyphs.every((node) => node.italic === false)).toBe(true);
  });

  it("maps OpenMath mathbf to mathematical bold glyphs instead of CSS bold", () => {
    const layout = layoutNativeMath("\\mathbf{B} + \\mathbf{x} + \\mathbf{123}", false, 12, defaultOpenMathMetrics, "openmath");
    const glyphs = layout.nodes.filter((node) => node.type === "glyph");

    expect(glyphs.map((node) => node.text)).toEqual(["𝐁", "+", "𝐱", "+", "𝟏𝟐𝟑"]);
    expect(glyphs.every((node) => node.bold !== true)).toBe(true);
  });

  it("uses TeX-style atom spacing for binary operators", () => {
    const binary = layoutNativeMath("x+y", false, 12, defaultNativeMathMetrics, "katex");
    const unary = layoutNativeMath("+x", false, 12, defaultNativeMathMetrics, "katex");
    const binaryGlyphs = binary.nodes.filter((node) => node.type === "glyph");
    const unaryGlyphs = unary.nodes.filter((node) => node.type === "glyph");
    const binaryGap = binaryGlyphs[2].x - binaryGlyphs[1].x;
    const unaryGap = unaryGlyphs[1].x - unaryGlyphs[0].x;

    expect(binaryGlyphs.map((node) => node.text)).toEqual(["x", "+", "y"]);
    expect(unaryGlyphs.map((node) => node.text)).toEqual(["+", "x"]);
    expect(binaryGap - unaryGap).toBeGreaterThan(12 * defaultNativeMathMetrics.binaryMargin * 0.8);
  });

  it("does not add ink-edge gap after display named operators when thin space is zero", () => {
    const metrics = { ...defaultOpenMathMetrics, thinMathSpace: 0 };
    const layout = layoutNativeMath("\\max x \\sin x", true, 12, metrics, "openmath");
    const glyphs = layout.nodes.filter((node) => node.type === "glyph");
    const max = glyphs.find((node) => node.text === "max");
    const firstX = glyphs.find((node) => node.text === "𝑥");

    expect(max?.type).toBe("glyph");
    expect(firstX?.type).toBe("glyph");
    if (max?.type === "glyph" && firstX?.type === "glyph") {
      expect(firstX.x - max.x).toBeLessThan(20);
    }
  });

  it("exports native math with the native PDF path", async () => {
    const engine = createDocumentEngine({ useWorker: false, mathRenderer: "native" });
    const { layout } = await engine.layout("Native $\\sqrt{x^2 + y^2} = r$ and $$\n\\frac{1}{3}\n$$");
    const bytes = await renderToPdf(layout);

    expect(bytes.length).toBeGreaterThan(1000);
  });

  it("exports native OpenMath math-italic glyphs with the OpenMath PDF font", async () => {
    const engine = createDocumentEngine({ useWorker: false, mathRenderer: "native-openmath" });
    const { layout } = await engine.layout("OpenMath $x^2 + \\alpha = y$ and $\\sin x$ and $\\mathbf{B}$");
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
        fontSize * defaultNativeMathMetrics.fractionAxisOffset,
        5
      );
    }
  });

  it("does not let inline fraction axis offset move the parent math baseline", () => {
    const defaultLayout = layoutNativeMath("x + \\frac{a}{b} = y", false, 12);
    const tunedLayout = layoutNativeMath("x + \\frac{a}{b} = y", false, 12, {
      ...defaultNativeMathMetrics,
      fractionAxisOffset: defaultNativeMathMetrics.fractionAxisOffset + 0.16
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

  it("allows native fraction numerator and denominator shifts to be tuned around the fixed axis", () => {
    const normal = layoutNativeMath("\\frac{a}{b}", false, 12);
    const shifted = layoutNativeMath("\\frac{a}{b}", false, 12, {
      ...defaultNativeMathMetrics,
      fractionNumeratorShiftUp: defaultNativeMathMetrics.fractionNumeratorShiftUp + 0.2,
      fractionDenominatorShiftDown: defaultNativeMathMetrics.fractionDenominatorShiftDown + 0.2
    });
    const normalRule = normal.nodes.find((node) => node.type === "rule");
    const shiftedRule = shifted.nodes.find((node) => node.type === "rule");
    const normalGlyphs = normal.nodes.filter((node) => node.type === "glyph");
    const shiftedGlyphs = shifted.nodes.filter((node) => node.type === "glyph");
    const normalNumerator = normalGlyphs.find((node) => node.text === "a");
    const shiftedNumerator = shiftedGlyphs.find((node) => node.text === "a");
    const normalDenominator = normalGlyphs.find((node) => node.text === "b");
    const shiftedDenominator = shiftedGlyphs.find((node) => node.text === "b");

    expect(normalRule?.type).toBe("rule");
    expect(shiftedRule?.type).toBe("rule");
    expect(normalNumerator?.type).toBe("glyph");
    expect(shiftedNumerator?.type).toBe("glyph");
    expect(normalDenominator?.type).toBe("glyph");
    expect(shiftedDenominator?.type).toBe("glyph");
    if (
      normalRule?.type === "rule" &&
      shiftedRule?.type === "rule" &&
      normalNumerator?.type === "glyph" &&
      shiftedNumerator?.type === "glyph" &&
      normalDenominator?.type === "glyph" &&
      shiftedDenominator?.type === "glyph"
    ) {
      expect(normal.baseline - (normalRule.y + normalRule.height / 2)).toBeCloseTo(
        shifted.baseline - (shiftedRule.y + shiftedRule.height / 2),
        5
      );
      expect(shiftedNumerator.y - shifted.baseline).toBeLessThan(normalNumerator.y - normal.baseline);
      expect(shiftedDenominator.y - shifted.baseline).toBeGreaterThan(normalDenominator.y - normal.baseline);
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

  it("maps OpenMath Greek variants to math italic glyphs", () => {
    const layout = layoutNativeMath(
      "\\iota + \\kappa + \\nu + \\omicron + \\phi + \\varphi + \\vartheta + \\varpi + \\varrho + \\varsigma + \\varkappa",
      false,
      12,
      defaultOpenMathMetrics,
      "openmath"
    );
    const text = layout.nodes.filter((node) => node.type === "glyph").map((node) => node.text).join("");

    expect(text).toContain("𝜄");
    expect(text).toContain("𝜅");
    expect(text).toContain("𝜈");
    expect(text).toContain("𝜊");
    expect(text).toContain("𝜙");
    expect(text).toContain("𝜑");
    expect(text).toContain("𝜗");
    expect(text).toContain("𝜛");
    expect(text).toContain("𝜚");
    expect(text).toContain("𝜍");
    expect(text).toContain("𝜘");
    expect(text).not.toContain("ι");
    expect(text).not.toContain("κ");
    expect(text).not.toContain("ν");
    expect(text).not.toContain("ο");
    expect(text).not.toContain("ϕ");
    expect(text).not.toContain("φ");
    expect(text).not.toContain("ϑ");
    expect(text).not.toContain("ϖ");
    expect(text).not.toContain("ϱ");
    expect(text).not.toContain("ς");
    expect(text).not.toContain("ϰ");
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

  it("parses common native math environments and normalizes rows and columns", () => {
    const layout = layoutNativeMath("\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}", true, 12);
    const glyphs = layout.nodes.filter((node) => node.type === "glyph");
    const text = glyphs.map((node) => node.text).join("");
    const a = glyphs.find((node) => node.text === "a" || node.text === "𝑎");
    const c = glyphs.find((node) => node.text === "c" || node.text === "𝑐");

    expect(text).toContain("(");
    expect(text).toContain(")");
    expect(text).toContain("a");
    expect(text).toContain("b");
    expect(text).toContain("c");
    expect(text).toContain("d");
    expect(a?.type).toBe("glyph");
    expect(c?.type).toBe("glyph");
    if (a?.type === "glyph" && c?.type === "glyph") expect(c.y).toBeGreaterThan(a.y);
    expect(text).not.toContain("⟦begin⟧");
  });

  it("marks unknown native math environments while still parsing their body", () => {
    const layout = layoutNativeMath("\\begin{mystery} x + y \\end{mystery}", false, 12);
    const glyphs = layout.nodes.filter((node) => node.type === "glyph");
    const text = glyphs.map((node) => node.text).join("");
    const marker = glyphs.find((node) => node.text.includes("unknown environment"));

    expect(text).toContain("unknown environment: mystery");
    expect(text).toContain("x");
    expect(text).toContain("y");
    expect(marker?.type).toBe("glyph");
    if (marker?.type === "glyph") expect(marker.color).toBe("#b42318");
  });

  it("renders native left/right delimiters around tall content", () => {
    const layout = layoutNativeMath("\\left(\\frac{x}{y}\\right)^2", true, 12);
    const glyphs = layout.nodes.filter((node) => node.type === "glyph");
    const text = glyphs.map((node) => node.text).join("");
    const left = glyphs.find((node) => node.text === "(");
    const right = glyphs.find((node) => node.text === ")");

    expect(text).toContain("(");
    expect(text).toContain(")");
    expect(text).toContain("2");
    expect(text).not.toContain("⟦left⟧");
    expect(text).not.toContain("⟦right⟧");
    expect(left?.type).toBe("glyph");
    expect(right?.type).toBe("glyph");
    if (left?.type === "glyph" && right?.type === "glyph") {
      expect(left.fontSize).toBeGreaterThanOrEqual(12);
      expect(right.fontSize).toBeGreaterThanOrEqual(12);
    }
  });

  it("uses OpenType vertical delimiter variants for OpenMath left/right delimiters", () => {
    loadNativeFontFromBytes("openMath", readFileSync("src/assets/fonts/latinmodern-math.otf"));
    const layout = layoutNativeMath("\\left(\\frac{x}{y}\\right)", true, 12, getDefaultOpenMathMetrics(), "openmath");
    const delimiterPaths = layout.nodes.filter((node) => node.type === "glyphPath");
    const delimiterGlyphs = layout.nodes.filter((node) => node.type === "glyph" && ["(", ")"].includes(node.text));

    expect(delimiterPaths.length).toBeGreaterThanOrEqual(2);
    expect(delimiterGlyphs).toHaveLength(0);
  });

  it("renders native bra and ket wrappers", () => {
    const layout = layoutNativeMath("\\bra{\\psi} H \\ket{\\phi}", false, 12);
    const glyphs = layout.nodes.filter((node) => node.type === "glyph");
    const text = glyphs.map((node) => node.text).join("");

    expect(text).toContain("⟨");
    expect(text).toContain("|");
    expect(text).toContain("⟩");
    expect(text).not.toContain("⟦bra⟧");
    expect(text).not.toContain("⟦ket⟧");
  });

  it("keeps simple native bra and ket delimiters on a stable inline baseline", () => {
    const layout = layoutNativeMath("\\bra{a}H\\ket{b}", false, 12);
    const delimiters = layout.nodes.filter((node) => (
      node.type === "glyph" && ["⟨", "|", "⟩"].includes(node.text)
    ));
    const baselines = delimiters.map((node) => node.y);

    expect(delimiters.length).toBe(4);
    expect(new Set(baselines.map((baseline) => baseline.toFixed(3))).size).toBe(1);
  });

  it("uses glyph advance rather than inserted padding inside native bra and ket", () => {
    const layout = layoutNativeMath("\\bra{a}", false, 12);
    const left = layout.nodes.find((node) => node.type === "glyph" && node.text === "⟨");
    const body = layout.nodes.find((node) => node.type === "glyph" && (node.text === "a" || node.text === "𝑎"));

    expect(left?.type).toBe("glyph");
    expect(body?.type).toBe("glyph");
    if (left?.type === "glyph" && body?.type === "glyph") {
      expect(body.x - left.x).toBeLessThan(12 * 0.55);
    }
  });

  it("keeps simple native display bra and ket delimiters on the same baseline", () => {
    const layout = layoutNativeMath("\\bra{a} A \\ket{b} = \\frac{1}{\\sqrt{2}}", true, 12, defaultOpenMathMetrics, "openmath");
    const delimiters = layout.nodes.filter((node) => (
      node.type === "glyph" && ["⟨", "|", "⟩"].includes(node.text)
    ));
    const baselines = delimiters.map((node) => node.y);

    expect(delimiters.length).toBe(4);
    expect(new Set(baselines.map((baseline) => baseline.toFixed(3))).size).toBe(1);
  });

  it("places superscripts higher after tall native delimiters", () => {
    const simple = layoutNativeMath("\\left(x\\right)^2", false, 12);
    const tall = layoutNativeMath("\\left(\\frac{x}{y}\\right)^2", false, 12);
    const simpleSup = simple.nodes.find((node) => node.type === "glyph" && node.text === "2");
    const tallSup = tall.nodes.find((node) => node.type === "glyph" && node.text === "2");

    expect(simpleSup?.type).toBe("glyph");
    expect(tallSup?.type).toBe("glyph");
    if (simpleSup?.type === "glyph" && tallSup?.type === "glyph") {
      expect(tallSup.y - tall.baseline).toBeLessThan(simpleSup.y - simple.baseline);
    }
  });

  it("places subscripts lower after tall native delimiters", () => {
    const simple = layoutNativeMath("\\left(x\\right)_i", false, 12);
    const tall = layoutNativeMath("\\left(\\frac{x}{y}\\right)_i", false, 12);
    const simpleSub = simple.nodes.find((node) => node.type === "glyph" && node.text === "i");
    const tallSub = tall.nodes.find((node) => node.type === "glyph" && node.text === "i");

    expect(simpleSub?.type).toBe("glyph");
    expect(tallSub?.type).toBe("glyph");
    if (simpleSub?.type === "glyph" && tallSub?.type === "glyph") {
      expect(tallSub.y - tall.baseline).toBeGreaterThan(simpleSub.y - simple.baseline);
    }
  });

  it("renders named math functions upright in native and OpenMath modes", () => {
    const native = layoutNativeMath("\\arg \\max \\sin \\exp \\log x", false, 12);
    const openMath = layoutNativeMath("\\arg \\max \\sin \\exp \\log x", false, 12, defaultOpenMathMetrics, "openmath");
    const nativeGlyphs = native.nodes.filter((node) => node.type === "glyph");
    const openMathGlyphs = openMath.nodes.filter((node) => node.type === "glyph");

    for (const name of ["arg", "max", "sin", "exp", "log"]) {
      expect(nativeGlyphs.find((node) => node.text === name)?.italic).toBe(false);
      expect(openMathGlyphs.find((node) => node.text === name)?.italic).toBe(false);
      expect(openMathGlyphs.map((node) => node.text)).toContain(name);
    }
    expect(openMathGlyphs.map((node) => node.text)).toContain("𝑥");
  });

  it("applies native named-operator spacing after scripts, not before them", () => {
    const spaced = layoutNativeMath("\\sin^2 x", false, 12);
    const compact = layoutNativeMath("\\sin^2 x", false, 12, {
      ...defaultNativeMathMetrics,
      thinMathSpace: 0
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

  it("uses OpenType MATH variants for OpenMath display large operators", async () => {
    loadNativeFontFromBytes("openMath", readFileSync("src/assets/fonts/latinmodern-math.otf"));
    const layout = layoutNativeMath(
      "\\int_0^1 x + \\sum_i^n z + \\prod_i^n y",
      true,
      12,
      getDefaultOpenMathMetrics(),
      "openmath"
    );
    const operatorPaths = layout.nodes.filter((node) => node.type === "glyphPath");
    const glyphs = layout.nodes.filter((node) => node.type === "glyph");
    const lowerZero = glyphs.find((node) => node.text === "0");
    const upperOne = glyphs.find((node) => node.text === "1");
    const nextX = glyphs.find((node) => node.text === "𝑥");

    expect(operatorPaths.length).toBeGreaterThanOrEqual(3);
    expect(glyphs.map((node) => node.text)).not.toContain("∫");
    expect(glyphs.map((node) => node.text)).not.toContain("∑");
    expect(glyphs.map((node) => node.text)).not.toContain("∏");
    expect(lowerZero?.type).toBe("glyph");
    expect(upperOne?.type).toBe("glyph");
    expect(nextX?.type).toBe("glyph");
    if (lowerZero?.type === "glyph" && upperOne?.type === "glyph" && nextX?.type === "glyph") {
      expect(upperOne.y).toBeLessThan(lowerZero.y);
      expect(nextX.x).toBeGreaterThanOrEqual(operatorPaths[0].x + operatorPaths[0].width);
    }
  });

  it("uses tolerance when choosing near-threshold OpenMath radical variants", async () => {
    loadNativeFontFromBytes("openMath", readFileSync("src/assets/fonts/latinmodern-math.otf"));
    const withoutTolerance = getOpenTypeMathRadicalVariant(14.69, 12, 0);
    const withTolerance = getOpenTypeMathRadicalVariant(14.69, 12, 12 * 0.04);

    expect(withoutTolerance?.glyphId).toBe(3082);
    expect(withTolerance?.glyphId).toBe(3081);
  });

  it("uses a minimum root body box for compact OpenMath square roots", async () => {
    loadNativeFontFromBytes("openMath", readFileSync("src/assets/fonts/latinmodern-math.otf"));
    const xRoot = layoutNativeMath("\\sqrt{x}", false, 12, getDefaultOpenMathMetrics(), "openmath");
    const eRoot = layoutNativeMath("\\sqrt{e}", false, 12, getDefaultOpenMathMetrics(), "openmath");
    const xRule = xRoot.nodes.find((node) => node.type === "rule");
    const eRule = eRoot.nodes.find((node) => node.type === "rule");
    const xGlyph = xRoot.nodes.find((node) => node.type === "glyph" && node.text === "𝑥");
    const eGlyph = eRoot.nodes.find((node) => node.type === "glyph" && node.text === "𝑒");

    expect(xRule?.type).toBe("rule");
    expect(eRule?.type).toBe("rule");
    expect(xGlyph?.type).toBe("glyph");
    expect(eGlyph?.type).toBe("glyph");
    if (xRule?.type === "rule" && eRule?.type === "rule" && xGlyph?.type === "glyph" && eGlyph?.type === "glyph") {
      expect(xGlyph.y - xRule.y).toBeCloseTo(eGlyph.y - eRule.y, 5);
    }
  });

  it("keeps OpenMath right delimiter variants inside the enclosing group advance", async () => {
    loadNativeFontFromBytes("openMath", readFileSync("src/assets/fonts/latinmodern-math.otf"));
    const layout = layoutNativeMath("\\left. \\right|_a", true, 12, getDefaultOpenMathMetrics(), "openmath");
    const delimiter = layout.nodes.find((node) => node.type === "glyphPath");
    const subscript = layout.nodes.find((node) => node.type === "glyph" && node.text === "𝑎");

    expect(delimiter?.type).toBe("glyphPath");
    expect(subscript?.type).toBe("glyph");
    if (delimiter?.type === "glyphPath" && subscript?.type === "glyph") {
      expect(subscript.x).toBeGreaterThanOrEqual(delimiter.x + delimiter.width);
    }
  });

  it("centers OpenMath display integral glyph paths on the math axis", async () => {
    loadNativeFontFromBytes("openMath", readFileSync("src/assets/fonts/latinmodern-math.otf"));
    const layout = layoutNativeMath(
      "\\int^x_y \\sqrt{\\frac{a}{b}}",
      true,
      12,
      getDefaultOpenMathMetrics(),
      "openmath"
    );
    const integral = layout.nodes.find((node) => node.type === "glyphPath");

    expect(integral?.type).toBe("glyphPath");
    if (integral?.type === "glyphPath") {
      const constants = getOpenTypeMathConstants();
      const axisHeight = constants ? 12 * constants.axisHeight / constants.unitsPerEm : 12 * 0.25;
      const visualCenter = integral.y + (integral.inkTopOffset + integral.inkBottomOffset) / 2;
      expect(visualCenter).toBeCloseTo(layout.baseline - axisHeight, 5);
      expect(integral.y + integral.inkBottomOffset).toBeLessThanOrEqual(layout.height);
    }
  });

  it("anchors OpenMath display integral side scripts to operator ink edges", async () => {
    loadNativeFontFromBytes("openMath", readFileSync("src/assets/fonts/latinmodern-math.otf"));
    const layout = layoutNativeMath("\\int^x_y z", true, 12, getDefaultOpenMathMetrics(), "openmath");
    const integral = layout.nodes.find((node) => node.type === "glyphPath");
    const superscript = layout.nodes.find((node) => node.type === "glyph" && node.text === "𝑥");
    const subscript = layout.nodes.find((node) => node.type === "glyph" && node.text === "𝑦");
    const next = layout.nodes.find((node) => node.type === "glyph" && node.text === "𝑧");

    expect(integral?.type).toBe("glyphPath");
    expect(superscript?.type).toBe("glyph");
    expect(subscript?.type).toBe("glyph");
    expect(next?.type).toBe("glyph");
    if (
      integral?.type === "glyphPath" &&
      superscript?.type === "glyph" &&
      subscript?.type === "glyph" &&
      next?.type === "glyph"
    ) {
      expect(superscript.x).toBeCloseTo(
        integral.x + integral.width + 12 * getDefaultOpenMathMetrics().integralSideSuperscriptGap,
        5
      );
      expect(subscript.x).toBeCloseTo(
        integral.x + 12 * getDefaultOpenMathMetrics().integralSideSubscriptGap,
        5
      );
      expect(next.x).toBeGreaterThanOrEqual(integral.x + integral.width);
    }
  });

  it("advances after inline integral scripts before placing the next token", async () => {
    loadNativeFontFromBytes("openMathNewComputerModern", readFileSync("src/assets/fonts/newcm-math.otf"));
    const layout = layoutNativeMath("\\int_a^b x", false, 12, defaultOpenMathMetrics, "openmath-new-computer-modern");
    const glyphs = layout.nodes.filter((node) => node.type === "glyph");
    const upper = glyphs.find((node) => node.text === "𝑏");
    const next = glyphs.find((node) => node.text === "𝑥");
    const integralGlyphId = getNativeGlyphId("openMathNewComputerModern", "∫");

    expect(integralGlyphId).toBeDefined();
    expect(upper?.type).toBe("glyph");
    expect(next?.type).toBe("glyph");
    if (upper?.type === "glyph" && next?.type === "glyph") {
      const upperMetrics = getNativeGlyphMetrics("openMathNewComputerModern", upper.text, upper.fontSize);
      expect(upperMetrics).toBeDefined();
      if (!upperMetrics) return;
      expect(next.x).toBeGreaterThanOrEqual(upper.x + upperMetrics.advanceWidth);
    }
  });

  it("falls back cleanly when the OpenMath font has no MathKernInfo for integrals", async () => {
    loadNativeFontFromBytes("openMath", readFileSync("src/assets/fonts/latinmodern-math.otf"));
    const layout = layoutNativeMath("\\int^x_y z", true, 12, getDefaultOpenMathMetrics(), "openmath");
    const integral = layout.nodes.find((node) => node.type === "glyphPath");

    expect(integral?.type).toBe("glyphPath");
    if (integral?.type === "glyphPath") {
      expect(getOpenTypeMathKern(3049, "topRight", 12, 12)).toBeUndefined();
      expect(getOpenTypeMathKern(3063, "topRight", 12, 12)).toBeUndefined();
      expect(Number.isFinite(layout.width)).toBe(true);
    }
  });

  it("positions native integral side scripts from the operator geometry", () => {
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
      expect(displayUpper.y - displayIntegral.y).toBeGreaterThan(-displayIntegral.fontSize * 1.4);
      expect(displayUpper.x).toBeGreaterThanOrEqual(displayIntegral.x);
      expect(displayLower.x).toBeGreaterThanOrEqual(displayIntegral.x);
      expect(displayUpper.x - displayIntegral.x).toBeLessThan(displayIntegral.fontSize * 2);
      expect(displayLower.x - displayIntegral.x).toBeLessThan(displayIntegral.fontSize * 2);
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

  it("allows native integral side-script attachment to be tuned", () => {
    const normal = layoutNativeMath("\\int_0^1", true, 12);
    const tuned = layoutNativeMath("\\int_0^1", true, 12, {
      ...defaultNativeMathMetrics,
      integralSideSuperscriptAttachment: 0.1,
      integralSideSuperscriptGap: 0.9
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
      expect(tunedUpper.x - tunedIntegral.x).toBeGreaterThan(normalUpper.x - normalIntegral.x);
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

  it("uses a separate display top gap for native square roots", () => {
    const metrics = {
      ...defaultNativeMathMetrics,
      sqrtTopGap: 0.02,
      displaySqrtTopGap: 0.2
    };
    const inline = layoutNativeMath("\\sqrt{x}", false, 12, metrics);
    const display = layoutNativeMath("\\sqrt{x}", true, 12, metrics);
    const inlineRule = inline.nodes.find((node) => node.type === "rule");
    const displayRule = display.nodes.find((node) => node.type === "rule");
    const inlineX = inline.nodes.find((node) => node.type === "glyph" && node.text === "x");
    const displayX = display.nodes.find((node) => node.type === "glyph" && node.text === "x");

    expect(inlineRule?.type).toBe("rule");
    expect(displayRule?.type).toBe("rule");
    expect(inlineX?.type).toBe("glyph");
    expect(displayX?.type).toBe("glyph");
    if (inlineRule?.type === "rule" && displayRule?.type === "rule" && inlineX?.type === "glyph" && displayX?.type === "glyph") {
      expect(displayX.y - displayRule.y).toBeGreaterThan(inlineX.y - inlineRule.y);
    }
  });

  it("uses display square-root top gap inside display fraction children", () => {
    const metrics = {
      ...defaultNativeMathMetrics,
      sqrtTopGap: 0.02,
      displaySqrtTopGap: 0.2
    };
    const inline = layoutNativeMath("\\frac{1}{\\sqrt{3}}", false, 12, metrics);
    const display = layoutNativeMath("\\frac{1}{\\sqrt{3}}", true, 12, metrics);
    const inlineRules = inline.nodes.filter((node) => node.type === "rule");
    const displayRules = display.nodes.filter((node) => node.type === "rule");
    const inlineSqrtRule = inlineRules[1];
    const displaySqrtRule = displayRules[1];
    const inlineThree = inline.nodes.find((node) => node.type === "glyph" && node.text === "3");
    const displayThree = display.nodes.find((node) => node.type === "glyph" && node.text === "3");

    expect(inlineSqrtRule?.type).toBe("rule");
    expect(displaySqrtRule?.type).toBe("rule");
    expect(inlineThree?.type).toBe("glyph");
    expect(displayThree?.type).toBe("glyph");
    if (
      inlineSqrtRule?.type === "rule" &&
      displaySqrtRule?.type === "rule" &&
      inlineThree?.type === "glyph" &&
      displayThree?.type === "glyph"
    ) {
      expect(displayThree.y - displaySqrtRule.y).toBeGreaterThan(inlineThree.y - inlineSqrtRule.y);
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

  it("uses OpenMath font bbox bottoms for accent placement", () => {
    loadNativeFontFromBytes("openMath", readFileSync("src/assets/fonts/latinmodern-math.otf"));
    const metrics = getDefaultOpenMathMetrics();
    const layout = layoutNativeMath("\\hat x", true, 12, metrics, "openmath");
    const hat = layout.nodes.find((node) => node.type === "glyphPath");
    const body = layout.nodes.find((node) => node.type === "glyph" && node.text === "𝑥");

    expect(layout.nodes.some((node) => node.type === "glyph" && node.text === "^")).toBe(false);
    expect(hat?.type).toBe("glyphPath");
    expect(body?.type).toBe("glyph");
    if (hat?.type === "glyphPath" && body?.type === "glyph") {
      const bodyMetrics = getNativeGlyphMetrics("openMath", "𝑥", body.fontSize);
      expect(bodyMetrics).toBeDefined();
      if (!bodyMetrics) return;

      const hatBottom = hat.y + hat.inkBottomOffset;
      const bodyTop = body.y + bodyMetrics.actualTopOffset;
      const gap = bodyTop - hatBottom;
      expect(gap).toBeCloseTo(body.fontSize * metrics.accentGap, 5);
      expect(gap).toBeGreaterThanOrEqual(0);
    }
  });

  it("uses OpenType MATH horizontal accent variants for OpenMath hats", () => {
    loadNativeFontFromBytes("openMath", readFileSync("src/assets/fonts/latinmodern-math.otf"));
    const simple = layoutNativeMath("\\hat x", false, 12, getDefaultOpenMathMetrics(), "openmath");
    const wide = layoutNativeMath("\\hat{x+y}", false, 12, getDefaultOpenMathMetrics(), "openmath");
    const simpleHat = simple.nodes.find((node) => node.type === "glyphPath");
    const wideHat = wide.nodes.find((node) => node.type === "glyphPath");

    expect(simpleHat?.type).toBe("glyphPath");
    expect(wideHat?.type).toBe("glyphPath");
    if (simpleHat?.type === "glyphPath" && wideHat?.type === "glyphPath") {
      expect(simpleHat.width).toBeLessThan(5);
      expect(wideHat.width).toBeGreaterThan(simpleHat.width);
    }
  });

  it("uses OpenType MATH horizontal accent variants for OpenMath vectors", () => {
    loadNativeFontFromBytes("openMath", readFileSync("src/assets/fonts/latinmodern-math.otf"));
    const simple = layoutNativeMath("\\vec x", false, 12, getDefaultOpenMathMetrics(), "openmath");
    const wide = layoutNativeMath("\\vec{x+y}", false, 12, getDefaultOpenMathMetrics(), "openmath");
    const simpleVector = simple.nodes.find((node) => node.type === "glyphPath");
    const wideVector = wide.nodes.find((node) => node.type === "glyphPath");

    expect(simpleVector?.type).toBe("glyphPath");
    expect(wideVector?.type).toBe("glyphPath");
    if (simpleVector?.type === "glyphPath" && wideVector?.type === "glyphPath") {
      expect(simpleVector.width).toBeGreaterThan(4);
      expect(wideVector.width).toBeGreaterThan(simpleVector.width);
    }
  });

  it("uses the Latin Modern Math macron glyph for OpenMath bars", () => {
    loadNativeFontFromBytes("openMath", readFileSync("src/assets/fonts/latinmodern-math.otf"));
    const metrics = getDefaultOpenMathMetrics();
    const layout = layoutNativeMath("\\bar{x}", false, 12, metrics, "openmath");
    const bar = layout.nodes.find((node) => node.type === "glyph" && node.text === "¯");
    const body = layout.nodes.find((node) => node.type === "glyph" && node.text === "𝑥");

    expect(layout.nodes.some((node) => node.type === "glyph" && node.text === "ˉ")).toBe(false);
    expect(bar?.type).toBe("glyph");
    expect(body?.type).toBe("glyph");
    if (bar?.type === "glyph" && body?.type === "glyph") {
      const barMetrics = getNativeGlyphMetrics("openMath", "¯", bar.fontSize);
      const bodyMetrics = getNativeGlyphMetrics("openMath", "𝑥", body.fontSize);
      expect(barMetrics).toBeDefined();
      expect(bodyMetrics).toBeDefined();
      if (!barMetrics || !bodyMetrics) return;

      const barBottom = bar.y + barMetrics.actualBottomOffset;
      const bodyTop = body.y + bodyMetrics.actualTopOffset;
      expect(bodyTop - barBottom).toBeCloseTo(bar.fontSize * metrics.accentGap, 5);
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
