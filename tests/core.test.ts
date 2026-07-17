import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument } from "pdf-lib";
import { createDocumentEngine, prepareMarkdownLayout } from "../src/core/engine/createDocumentEngine";
import { applySourceFormatDefaults, parseMarkdownDocument } from "../src/core/config/documentConfig";
import { parseMarkdown } from "../src/core/markdown/parseMarkdown";
import { parseLatex, readLatexPreamble } from "../src/core/latex/parseLatex";
import { resolveCrossReferences } from "../src/core/xref/resolveReferences";
import { findSourceAnchor } from "../src/core/source/sourceMap";
import { renderPageToSvg } from "../src/core/renderers/svg/renderPageToSvg";
import { renderGraphSX } from "../src/core/renderers/graphsx/renderGraphSX";
import { renderToPdf } from "../src/core/renderers/pdf/renderToPdf";
import { tokenizeLatex } from "../src/core/renderers/pdf/pdfMath";
import { subsetFontWithHarfbuzz } from "../src/core/renderers/pdf/pdfFontSubset";
import {
  defaultNativeMathMetrics,
  defaultOpenMathMetrics,
  getDefaultOpenMathMetrics,
  getDefaultOpenMathMetricsForProfile,
  layoutNativeMath,
  openMathMetricsFromConstants
} from "../src/core/renderers/math/nativeMath";
import {
  getNativeGlyphId,
  getNativeGlyphMetrics,
  getOpenTypeMathConstants,
  getOpenTypeMathKern,
  getOpenTypeMathRadicalVariant,
  loadNativeFontFromBytes
} from "../src/core/renderers/math/nativeFontMetrics";
import { headingSize, mathMeasureKey, normalizeMathLatex } from "../src/core/layout/mathMetrics";
import { measureText } from "../src/core/layout/measureText";
import { normalizeAst } from "../src/core/markdown/normalizeAst";
import { paginate } from "../src/core/layout/paginate";
import { breakRunsIntoLines } from "../src/core/layout/lineBreaking";
import { defaultLayoutConfig } from "../src/core/layout/layoutConfig";
import { loadHarfbuzzTextShaper, loadTextFontFromBytes, shapeTextWithFontFile } from "../src/core/renderers/text/textFontMetrics";
import { latinModernRomanFontFamily, libertinusSerifFontFamily } from "../src/core/renderers/text/latinModernRomanFont";
import { defaultTheme } from "../src/core/theme/defaultTheme";
import type { PageConfig } from "../src/core/layout/pageConfig";
import { createFirstPartyPluginRegistry } from "../src/core/plugins/firstPartyPlugins";
import { findNextLatexEnvironment } from "../src/core/latex/latexSyntax";

describe("plugin registry", () => {
  it("exposes GraphSX as one package for Markdown and LaTeX", () => {
    const plugins = createFirstPartyPluginRegistry();

    expect(plugins.pluginNames()).toContain("@vector/graphsx");
    expect(plugins.markdownFence("graphsx")).toBeTypeOf("function");
    expect(plugins.latexEnvironment("tikzpicture")).toBeTypeOf("function");
  });

  it("lets one plugin add syntax to both source formats", () => {
    const plugins = createFirstPartyPluginRegistry().register({
      name: "test/notice",
      markdown: {
        fences: {
          notice: ({ source, sourceSpan }) => ({
            type: "paragraph",
            children: [{ type: "text", text: source.trim() }],
            sourceSpan
          })
        }
      },
      latex: {
        environments: {
          notice: ({ body, mode }) => mode === "vertical"
            ? [{ type: "paragraph", children: [{ type: "text", text: body.trim() }] }]
            : undefined
        },
        commands: {
          vectornote: {
            arguments: ["required"],
            modes: ["vertical"],
            handler: ({ requiredArguments, parseInline }) => [{
              type: "paragraph",
              children: parseInline(requiredArguments[0])
            }]
          }
        }
      }
    });

    expect(parseMarkdown("```notice\nMarkdown notice\n```", 0, plugins).children[0]).toMatchObject({
      type: "paragraph",
      children: [{ type: "text", text: "Markdown notice" }]
    });
    expect(parseLatex("\\begin{notice}LaTeX notice\\end{notice}", 0, plugins).children[0]).toMatchObject({
      type: "paragraph",
      children: [{ type: "text", text: "LaTeX notice" }]
    });
    expect(parseLatex("\\vectornote{Command notice}", 0, plugins).children[0]).toMatchObject({
      type: "paragraph",
      children: [{ type: "text", text: "Command notice" }]
    });
  });

  it("uses registered document-class profiles", () => {
    const plugins = createFirstPartyPluginRegistry().register({
      name: "test/class",
      latex: {
        documentClasses: {
          compact: () => ({ sourceFormat: "latex", pageSize: "letter", margin: 18 })
        }
      }
    });
    const options = applySourceFormatDefaults("\\documentclass{compact}", { sourceFormat: "latex", plugins });

    expect(options.margin).toBe(18);
  });

  it("matches nested environments structurally", () => {
    const source = "before \\begin{notice}outer \\begin{notice}inner\\end{notice} tail\\end{notice} after";
    const match = findNextLatexEnvironment(source, 0, ["notice"]);

    expect(match?.body).toContain("\\begin{notice}inner\\end{notice}");
    expect(match?.source).toBe("\\begin{notice}outer \\begin{notice}inner\\end{notice} tail\\end{notice}");
  });
});

describe("markdown parser", () => {
  it("keeps TikZ fences as code in Markdown", () => {
    const ast = parseMarkdown("```tikz\n\\draw (0,0) -- (1,0);\n```");

    expect(ast.children[0]).toMatchObject({ type: "codeBlock", language: "tikz" });
  });

  it("uses Latin Modern Roman for Markdown without front matter", async () => {
    const { layout } = await createDocumentEngine().layout("Plain Markdown text.");
    const text = layout.pages[0].objects.find((object) => object.type === "text");

    expect(layout.theme.fontFamily).toContain("Latin Modern Roman");
    expect(layout.theme.fontFaceCss).toContain("Latin Modern Roman");
    expect(text?.type === "text" ? text.fontFamily : "").toContain("Latin Modern Roman");
  });

  it("records Markdown block source spans", () => {
    const source = `# Heading

Paragraph text.
`;
    const ast = parseMarkdown(source);

    expect(ast.children[0]).toMatchObject({ sourceSpan: { start: 0, end: 10 } });
    expect(ast.children[1]).toMatchObject({ sourceSpan: { start: 11, end: source.length } });
  });

  it("maps source offsets to laid-out preview anchors", async () => {
    const source = `# Heading

Paragraph text.`;
    const { layout } = await createDocumentEngine().layout(source);
    const anchor = findSourceAnchor(layout, source.indexOf("Paragraph") + 3);

    expect(anchor?.source).toEqual({ start: 11, end: source.length });
    expect(anchor?.page).toBe(0);
  });

  it("keeps preview navigation offsets relative to the full front-matter document", async () => {
    const source = `---
page:
  size: letter
---

# Heading

Paragraph text.`;
    const { layout } = await createDocumentEngine().layout(source);
    const anchor = findSourceAnchor(layout, source.indexOf("Paragraph") + 3);

    expect(anchor?.source.start).toBe(source.indexOf("Paragraph"));
  });

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

  it("parses labels on headings, math, images, and tables", () => {
    const ast = parseMarkdown(`# Intro {#sec:intro}

$$
E=mc^2
$$
{#eq:energy}

![Phase](plot.svg "Phase portrait"){#fig:phase width=70%}

| A |
| - |
| B |
{: #tbl:data}
`);

    expect(ast.children[0]).toMatchObject({ type: "heading", label: "sec:intro" });
    expect(ast.children[1]).toMatchObject({ type: "mathBlock", label: "eq:energy" });
    expect(ast.children[2]).toMatchObject({ type: "image", label: "fig:phase" });
    expect(ast.children[3]).toMatchObject({ type: "table", label: "tbl:data" });
  });

  it("resolves section, equation, figure, and table references", () => {
    const ast = resolveCrossReferences(parseMarkdown(`# Intro {#sec:intro}

See @sec:intro, @eq:energy, @fig:phase, and @tbl:data.

$$
E=mc^2
$$
{#eq:energy}

![Phase](plot.svg "Phase portrait"){#fig:phase}

| A |
| - |
| B |
{: #tbl:data}
`), undefined, { titleFromFirstHeading: false });
    const paragraph = ast.children[1];

    expect(ast.children[0]).toMatchObject({ type: "heading", labelNumber: "1" });
    expect(ast.children[2]).toMatchObject({ type: "mathBlock", labelNumber: "1" });
    expect(ast.children[3]).toMatchObject({ type: "image", labelNumber: "1" });
    expect(ast.children[4]).toMatchObject({ type: "table", labelNumber: "1" });
    expect(paragraph?.type).toBe("paragraph");
    if (paragraph?.type === "paragraph") {
      expect(paragraph.children).toEqual([
        { type: "text", text: "See " },
        { type: "link", href: "#sec:intro", children: [{ type: "text", text: "Section 1" }] },
        { type: "text", text: ", " },
        { type: "link", href: "#eq:energy", children: [{ type: "text", text: "(1)" }] },
        { type: "text", text: ", " },
        { type: "link", href: "#fig:phase", children: [{ type: "text", text: "Figure 1" }] },
        { type: "text", text: ", and " },
        { type: "link", href: "#tbl:data", children: [{ type: "text", text: "Table 1" }] },
        { type: "text", text: "." }
      ]);
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

describe("latex parser", () => {
  const tikzPicture = String.raw`\begin{tikzpicture}
\node[draw] (a) at (0,0) {$A$};
\draw[->] (a.east) -- (1,0);
\end{tikzpicture}`;

  it("parses standalone TikZ pictures as LaTeX-only graph blocks", () => {
    const ast = parseLatex(`\\begin{document}\n${tikzPicture}\n\\end{document}`);

    expect(ast.children).toHaveLength(1);
    expect(ast.children[0]).toMatchObject({ type: "graphsx", syntax: "tikz", align: "center" });
  });

  it("applies preamble TikZ styles and pics to later pictures", () => {
    const definition = String.raw`\tikzset{
  global node/.style={draw, thick},
  global pair/.pic={\node[global node] (-body) at (0,0) {$U$};}
}`;
    const ast = parseLatex(String.raw`\documentclass{article}
${definition}
\begin{document}
\begin{tikzpicture}
  \pic (u) at (0,0) {global pair};
\end{tikzpicture}
\end{document}`);
    const graph = ast.children.find((node) => node.type === "graphsx");

    expect(graph?.type).toBe("graphsx");
    if (graph?.type === "graphsx") {
      expect(graph.source.indexOf(definition)).toBe(0);
      expect(graph.source).toContain("\\pic (u) at (0,0) {global pair}");
      const artifact = renderGraphSX(graph.source, undefined, "openmath", "tikz");
      expect(artifact.summary).not.toMatch(/error/i);
      expect(artifact.displayList.items.some((item) => item.type === "rect")).toBe(true);
    }
  });

  it("applies body TikZ definitions only to following pictures", () => {
    const ast = parseLatex(String.raw`\begin{document}
\begin{tikzpicture}\node (a) at (0,0) {$A$};\end{tikzpicture}

\tikzset{later/.style={draw, thick}}

\begin{tikzpicture}\node[later] (b) at (0,0) {$B$};\end{tikzpicture}
\end{document}`);
    const graphs = ast.children.filter((node) => node.type === "graphsx");

    expect(graphs).toHaveLength(2);
    expect(graphs[0]?.type === "graphsx" ? graphs[0].source : "").not.toContain("later/.style");
    expect(graphs[1]?.type === "graphsx" ? graphs[1].source : "").toContain("later/.style");
  });

  it("keeps transparent TikZ definitions from splitting surrounding prose", () => {
    const ast = parseLatex(String.raw`\begin{document}
Before \tikzset{inline/.style={draw}} after.
\end{document}`);
    const paragraphs = ast.children.filter((node) => node.type === "paragraph");

    expect(paragraphs).toHaveLength(1);
    expect(JSON.stringify(paragraphs[0])).toContain("Before");
    expect(JSON.stringify(paragraphs[0])).toContain("after.");
    expect(JSON.stringify(paragraphs[0])).not.toContain("tikzset");
  });

  it("injects visible global TikZ definitions into pictures inside math", () => {
    const ast = parseLatex(String.raw`\documentclass{article}
\tikzset{math node/.style={draw, thick}}
\begin{document}
\begin{equation}
A\begin{tikzpicture}\node[math node] (u) at (0,0) {$U$};\end{tikzpicture}B
\end{equation}
\end{document}`);
    const math = ast.children.find((node) => node.type === "mathBlock");

    expect(math?.type).toBe("mathBlock");
    if (math?.type === "mathBlock") {
      expect(math.text).toContain("\\begin{tikzpicture}\n\\tikzset{math node/.style={draw, thick}}");
      expect(math.text).toContain("\\node[math node]");
    }
  });

  it("maps one TikZ centimeter to PDF document points", () => {
    const artifact = renderGraphSX(
      String.raw`\begin{tikzpicture}\draw (0,0) -- (1,0);\end{tikzpicture}`,
      undefined,
      "openmath",
      "tikz"
    );

    expect(artifact.displayList.bounds).toMatchObject({ minX: 0, maxX: 72 / 2.54 });
  });

  it("maps one TikZ point to one Vector document unit", () => {
    const artifact = renderGraphSX(
      String.raw`\begin{tikzpicture}\node[draw, minimum width=100pt, minimum height=100pt] (a) at (0,0) {};\end{tikzpicture}`,
      undefined,
      "openmath",
      "tikz"
    );
    const rect = artifact.displayList.items.find((item) => item.type === "rect") as { props?: { width?: number; height?: number } } | undefined;

    expect(rect?.props?.width).toBeCloseTo(100);
    expect(rect?.props?.height).toBeCloseTo(100);
  });

  it("never duplicates math font data inside a TikZ page body", () => {
    const artifact = renderGraphSX(
      String.raw`\begin{tikzpicture}\node (x) at (0,0) {$x$};\node (y) at (1,0) {$y$};\end{tikzpicture}`,
      undefined,
      "openmath",
      "tikz"
    );

    expect((artifact.svg.match(/<style>/g) ?? []).length).toBeLessThanOrEqual(1);
    expect(artifact.svgBody).not.toContain("<style>");
    expect(artifact.svgBody).not.toContain("data:font/");
    const mathLabels = artifact.displayList.items.filter((item) => item.type === "math") as Array<{ box?: { width: number } }>;
    expect(mathLabels).toHaveLength(2);
    expect(mathLabels.every((item) => (item.box?.width ?? Infinity) < 20)).toBe(true);
    expect(artifact.width).toBeLessThan(50);
  });

  it("keeps TikZ figure captions and labels", () => {
    const ast = parseLatex(String.raw`\begin{document}
\begin{figure}
${tikzPicture}
\caption{A TikZ diagram}
\label{fig:tikz}
\end{figure}
\end{document}`);

    expect(ast.children).toHaveLength(1);
    expect(ast.children[0]).toMatchObject({
      type: "graphsx",
      syntax: "tikz",
      caption: "A TikZ diagram",
      label: "fig:tikz"
    });
  });

  it("uses the original TikZ coordinate axis as its natural math baseline", () => {
    const verticalTikz = String.raw`\begin{tikzpicture}\draw (0,0) -- (0,1);\end{tikzpicture}`;
    const artifact = renderGraphSX(verticalTikz, undefined, "openmath", "tikz");
    const layout = layoutNativeMath(`x ${verticalTikz} y`, false, 12, defaultOpenMathMetrics, "openmath");
    const graph = layout.nodes.find((node) => node.type === "graphsx");

    expect(graph?.type).toBe("graphsx");
    if (!graph || graph.type !== "graphsx") return;
    expect(layout.baseline - graph.y).toBeCloseTo(artifact.baseline, 4);
  });

  it("preserves a TikZ natural baseline through hbox and centers it only through vcenter", () => {
    const verticalTikz = String.raw`\begin{tikzpicture}\draw (0,0) -- (0,1);\end{tikzpicture}`;
    const raw = layoutNativeMath(verticalTikz, false, 12, defaultOpenMathMetrics, "openmath");
    const hbox = layoutNativeMath(String.raw`\hbox{${verticalTikz}}`, false, 12, defaultOpenMathMetrics, "openmath");
    const centered = layoutNativeMath(String.raw`\vcenter{\hbox{${verticalTikz}}}`, false, 12, defaultOpenMathMetrics, "openmath");
    const rawGraph = raw.nodes.find((node) => node.type === "graphsx");
    const hboxGraph = hbox.nodes.find((node) => node.type === "graphsx");
    const centeredGraph = centered.nodes.find((node) => node.type === "graphsx");

    expect(rawGraph?.type).toBe("graphsx");
    expect(hboxGraph?.type).toBe("graphsx");
    expect(centeredGraph?.type).toBe("graphsx");
    if (rawGraph?.type !== "graphsx" || hboxGraph?.type !== "graphsx" || centeredGraph?.type !== "graphsx") return;
    expect(hbox.baseline - hboxGraph.y).toBeCloseTo(raw.baseline - rawGraph.y, 4);
    expect(centeredGraph.y + centeredGraph.height / 2).toBeCloseTo(
      centered.baseline - 12 * defaultOpenMathMetrics.fractionAxisOffset,
      4
    );
  });

  it("lays out hbox text upright while preserving spaces", () => {
    const layout = layoutNativeMath(String.raw`x+\hbox{plain text}+y`, false, 12, defaultOpenMathMetrics, "openmath");
    const text = layout.nodes.find((node) => node.type === "glyph" && node.text === "plain text");

    expect(text).toMatchObject({ type: "glyph", text: "plain text", italic: false });
    expect(text?.type === "glyph" ? text.fontFamily : "").toContain("Latin Modern Roman");
  });

  it("exports TikZ figures through the neutral vector PDF path", async () => {
    const source = String.raw`\documentclass{article}
\begin{document}
\begin{figure}
${tikzPicture}
\caption{A TikZ diagram}
\end{figure}
\end{document}`;
    const { layout } = await createDocumentEngine({
      sourceFormat: "latex",
      mathRenderer: "native-openmath",
      nativeMathProfile: "openmath"
    }).layout(source);
    const graph = layout.pages.flatMap((page) => page.objects).find((object) => object.type === "graphsx");
    const svg = renderPageToSvg(layout.pages[0]);
    const pdf = await renderToPdf(layout, { subsetFonts: true });

    expect(graph?.type === "graphsx" ? graph.displayList?.type : undefined).toBe("tikz");
    expect(svg).toContain("tikz-path");
    expect(svg).toContain("tikz-node");
    expect(pdf.byteLength).toBeGreaterThan(1_000);
  });

  it("does not parse title matter again as normal body paragraphs", () => {
    const source = `\\documentclass{article}
\\title{Unique document title}
\\author{Ada Vector \\and Emmy Layout}
\\begin{document}
\\maketitle
\\begin{abstract}
Unique abstract content.
\\end{abstract}
\\section{Introduction}
Body content.
\\end{document}`;
    const ast = parseLatex(source);
    const serialized = JSON.stringify(ast);

    expect(serialized).not.toContain("Unique document title");
    expect(serialized).not.toContain("Ada Vector");
    expect(serialized).not.toContain("Emmy Layout");
    expect(serialized).not.toContain("Unique abstract content");
    expect(serialized).toContain("Body content");
  });

  it("extracts in-document title declarations without parsing them as body text", () => {
    const source = `\\begin{document}

\\title{Fast Live Preview for Scientific Writing}
\\author{Ada Vector}
\\affiliation{Department of Computational Glyphs, Asteria University}
\\author{Emmy Layout}
\\email{emmy.layout@meridian-moon.example}
\\affiliation{Department of Computational Glyphs, Asteria University}

\\section{Introduction}
Body content.
\\end{document}`;
    const ast = parseLatex(source);
    const serialized = JSON.stringify(ast);
    const options = applySourceFormatDefaults(source, { sourceFormat: "latex" });

    expect(options.document?.title).toBe("Fast Live Preview for Scientific Writing");
    expect(options.document?.authors).toEqual([
      {
        name: "Ada Vector",
        affiliations: ["Department of Computational Glyphs, Asteria University"]
      },
      {
        name: "Emmy Layout",
        affiliations: ["Department of Computational Glyphs, Asteria University"],
        email: "emmy.layout@meridian-moon.example"
      }
    ]);
    expect(serialized).not.toContain("Original title declaration");
    expect(serialized).not.toContain("Ada Vector");
    expect(serialized).not.toContain("Emmy Layout");
    expect(serialized).not.toContain("emmy.layout@meridian-moon.example");
    expect(serialized).not.toContain("Original affiliation");
    expect(serialized).toContain("Body content");
  });

  it("records LaTeX block source spans", () => {
    const source = `\\section{Heading}

Paragraph text.`;
    const ast = parseLatex(source);

    expect(ast.children[0]).toMatchObject({ type: "heading", sourceSpan: { start: 0, end: 17 } });
    expect(ast.children[1]).toMatchObject({ type: "paragraph", sourceSpan: { start: 19, end: source.length } });
  });

  it("preserves VS Code offsets for LaTeX documents with CRLF line endings", () => {
    const source = "\\begin{document}\r\n\\section{Heading}\r\n\r\nParagraph text.\r\n\\end{document}";
    const ast = parseLatex(source);
    const paragraph = ast.children.find((node) => node.type === "paragraph");

    expect(paragraph?.sourceSpan?.start).toBe(source.indexOf("Paragraph text."));
  });

  it("does not render environments whose lines are commented out", () => {
    const ast = parseLatex(`\\begin{document}
% \\begin{equation}
% x
% \\end{equation}
Visible text.
\\end{document}`);
    const serialized = JSON.stringify(ast);

    expect(ast.children.some((node) => node.type === "mathBlock")).toBe(false);
    expect(serialized).not.toContain('"text":"x"');
    expect(serialized).toContain("Visible text.");
  });

  it("renders missing LaTeX equation references as unresolved markers", () => {
    const ast = resolveCrossReferences(parseLatex(`\\begin{document}
See \\eqref{eq:decomp_U}; raw \\ref{eq:decomp_U}.
\\end{document}`));
    const paragraph = ast.children.find((node) => node.type === "paragraph");

    expect(paragraph?.type).toBe("paragraph");
    if (paragraph?.type === "paragraph") {
      const unresolved = paragraph.children.filter((node) => node.type === "text" && node.color === "#b42318");
      expect(unresolved).toEqual([
        { type: "text", text: "(??)", color: "#b42318" },
        { type: "text", text: "??", color: "#b42318" }
      ]);
    }
  });

  it("supports apostrophes in LaTeX labels and references", () => {
    const ast = resolveCrossReferences(parseLatex(`\\begin{document}
\\begin{equation}
y = k
\\label{eq:yk'}
\\end{equation}
See \\eqref{eq:yk'}.
\\end{document}`));
    const equation = ast.children.find((node) => node.type === "mathBlock");
    const paragraph = ast.children.find((node) => node.type === "paragraph");

    expect(equation?.type).toBe("mathBlock");
    if (equation?.type === "mathBlock") expect(equation.label).toBe("eq:yk'");
    expect(paragraph?.type).toBe("paragraph");
    if (paragraph?.type === "paragraph") {
      expect(paragraph.children).toContainEqual({
        type: "link",
        href: "#eq:yk'",
        children: [{ type: "text", text: "(1)" }]
      });
    }
  });

  it("expands document-order LaTeX macro definitions before parsing", () => {
    const ast = parseLatex(`Before $\\R$.

\\newcommand{\\R}{\\mathbb{R}}
\\newcommand{\\pair}[2]{\\left\\langle #1, #2 \\right\\rangle}

After $x \\in \\R$ and $\\pair{a}{b}$.`);
    const paragraphs = ast.children.filter((node) => node.type === "paragraph");
    const before = paragraphs[0];
    const after = paragraphs[1];

    expect(before?.type).toBe("paragraph");
    expect(after?.type).toBe("paragraph");
    if (before?.type === "paragraph" && after?.type === "paragraph") {
      const beforeMath = before.children.find((child) => child.type === "math");
      const afterMath = after.children.filter((child) => child.type === "math");
      expect(beforeMath).toMatchObject({ text: "\\R" });
      expect(afterMath).toEqual([
        { type: "math", text: "x \\in \\mathbb{R}" },
        { type: "math", text: "\\left\\langle a, b \\right\\rangle" }
      ]);
    }
  });

  it("expands def and LaTeX optional macro arguments", () => {
    const ast = parseLatex(`\\def\\ket#1{|#1\\rangle}
\\newcommand{\\norm}[2][2]{\\lVert #2 \\rVert_{#1}}

$\\ket{0}$, $\\norm{x}$, and $\\norm[1]{y}$.`);
    const paragraph = ast.children.find((node) => node.type === "paragraph");

    expect(paragraph?.type).toBe("paragraph");
    if (paragraph?.type === "paragraph") {
      expect(paragraph.children.filter((child) => child.type === "math")).toEqual([
        { type: "math", text: "|0\\rangle" },
        { type: "math", text: "\\lVert x \\rVert_{2}" },
        { type: "math", text: "\\lVert y \\rVert_{1}" }
      ]);
    }
  });

  it("honors renewcommand and providecommand definition rules", () => {
    const ast = parseLatex(`\\newcommand{\\state}{first}
\\providecommand{\\state}{provided}
\\renewcommand{\\state}{second}

$\\state$`);
    const paragraph = ast.children.find((node) => node.type === "paragraph");

    expect(paragraph?.type).toBe("paragraph");
    if (paragraph?.type === "paragraph") {
      expect(paragraph.children).toEqual([{ type: "math", text: "second" }]);
    }
  });

  it("converts practical latex structure into the shared document ast", () => {
    const ast = parseLatex(`\\title{Live Preview}
\\author{A. Writer \\and B. Author}
\\begin{document}
\\maketitle
\\section{Math}\\label{sec:math}
See \\ref{sec:math}.
\\begin{equation}
E = mc^2
\\label{eq:energy}
\\end{equation}
\\begin{itemize}
\\item \\textbf{Fast} preview
\\end{itemize}
\\end{document}`);

    expect(ast.children.map((node) => node.type)).toContain("heading");
    expect(ast.children.some((node) => node.type === "mathBlock" && node.label === "eq:energy")).toBe(true);
    expect(ast.children.some((node) => node.type === "list")).toBe(true);
  });

  it("associates LaTeX affiliations and email with the preceding author", () => {
    const preamble = readLatexPreamble(`\\documentclass{revtex4-2}
\\author{Ada Vector}
\\affiliation{Department of Computational Glyphs \\& Symbolic Systems}
\\author{Emmy Layout}
\\email{emmy.layout@meridian-moon.example}
\\affiliation{Department of Computational Glyphs \\& Symbolic Systems}
\\begin{document}
\\end{document}`);

    expect(preamble.authors).toEqual([
      {
        name: "Ada Vector",
        affiliations: ["Department of Computational Glyphs & Symbolic Systems"]
      },
      {
        name: "Emmy Layout",
        affiliations: ["Department of Computational Glyphs & Symbolic Systems"],
        email: "emmy.layout@meridian-moon.example"
      }
    ]);
  });

  it("lays out latex through the document engine", async () => {
    const engine = createDocumentEngine({
      sourceFormat: "latex",
      mathRenderer: "native-openmath"
    });
    const result = await engine.layout(`\\title{Vector}
\\begin{document}
\\section{One}
Inline $x^2$.
\\[
\\int_0^1 x^2 dx = \\frac{1}{3}
\\]
\\end{document}`);

    expect(result.layout.pages.length).toBeGreaterThan(0);
  });

  it("insets a LaTeX abstract from the full text width", async () => {
    const engine = createDocumentEngine({ sourceFormat: "latex" });
    const result = await engine.layout(`\\documentclass{article}
\\title{Inset Abstract}
\\begin{document}
\\begin{abstract}
Distinct abstract prose that is long enough to produce a normal line of text.
\\end{abstract}
\\section{Introduction}
Body text.
\\end{document}`);
    const abstractText = result.layout.pages[0].objects.find((object) =>
      object.type === "text" && object.text.includes("Distinct abstract prose")
    );

    expect(abstractText?.type).toBe("text");
    if (abstractText?.type === "text") {
      expect(abstractText.x).toBeGreaterThan(result.layout.page.margin.left);
    }
  });

  it("preserves LaTeX commands inside inline math", () => {
    const ast = parseLatex(`\\begin{document}
Greek inline math $\\alpha + \\beta = \\gamma$ should survive.
\\end{document}`);
    const paragraph = ast.children.find((node) => node.type === "paragraph");

    expect(paragraph?.type).toBe("paragraph");
    if (paragraph?.type === "paragraph") {
      expect(paragraph.children).toContainEqual({ type: "math", text: "\\alpha + \\beta = \\gamma" });
    }
  });

  it("parses latex tilde as a non-breaking space", () => {
    const ast = parseLatex(`\\begin{document}
Figure~1 stays together.
\\end{document}`);
    const paragraph = ast.children.find((node) => node.type === "paragraph");

    expect(paragraph?.type).toBe("paragraph");
    if (paragraph?.type === "paragraph") {
      expect(paragraph.children).toContainEqual({ type: "text", text: " ", nonBreak: true });
    }
  });

  it("parses latex citations into shared citation nodes", () => {
    const ast = parseLatex(`\\begin{document}
Prior work\\cite{einstein1905} is pending bibliography support.
\\end{document}`);
    const paragraph = ast.children.find((node) => node.type === "paragraph");

    expect(paragraph?.type).toBe("paragraph");
    if (paragraph?.type === "paragraph") {
      expect(paragraph.children).toContainEqual({
        type: "citation",
        items: [{ key: "einstein1905" }]
      });
    }
  });

  it("converts latex figures with includegraphics into image blocks", () => {
    const ast = parseLatex(`\\begin{document}
\\begin{figure}
\\includegraphics[width=0.65\\textwidth]{figures/phase-space.svg}
\\caption{A figure imported from a LaTeX-style includegraphics command.}
\\label{fig:phase}
\\end{figure}
\\end{document}`);
    const image = ast.children.find((node) => node.type === "image");

    expect(image?.type).toBe("image");
    if (image?.type === "image") {
      expect(image.src).toBe("figures/phase-space.svg");
      expect(image.caption).toBe("A figure imported from a LaTeX-style includegraphics command.");
      expect(image.label).toBe("fig:phase");
      expect(image.width).toEqual({ value: 65, unit: "percent" });
    }
  });

  it("collects multiple includegraphics commands into one figure group", () => {
    const ast = parseLatex(`\\begin{document}
\\begin{figure}
\\centering
\\includegraphics[width=\\columnwidth]{sv_ran.pdf}
\\includegraphics[width=0.48\\columnwidth]{fid_vs_k_ran.pdf}
\\caption{Two related panels.}
\\label{fig:panels}
\\end{figure}
\\end{document}`);
    const figure = ast.children.find((node) => node.type === "figure");

    expect(figure).toMatchObject({
      type: "figure",
      caption: "Two related panels.",
      label: "fig:panels",
      align: "center"
    });
    if (figure?.type === "figure") {
      expect(figure.images).toHaveLength(2);
      expect(figure.images[0]).toMatchObject({
        src: "sv_ran.pdf",
        width: { value: 100, unit: "percent" }
      });
      expect(figure.images[1]).toMatchObject({
        src: "fid_vs_k_ran.pdf",
        width: { value: 48, unit: "percent" }
      });
    }
  });

  it("stacks full-width figure images and packs narrower images into rows", async () => {
    const engine = createDocumentEngine({ sourceFormat: "latex", mathRenderer: "native-openmath" });
    const stacked = await engine.layout(`\\begin{document}
\\begin{figure}
\\includegraphics[width=\\columnwidth]{first.pdf}
\\includegraphics[width=\\columnwidth]{second.pdf}
\\caption{Stacked panels.}
\\label{fig:stacked}
\\end{figure}
\\end{document}`);
    const stackedImages = stacked.layout.pages.flatMap((page) => page.objects).filter((object) => object.type === "image");

    expect(stackedImages).toHaveLength(2);
    expect(stackedImages[1].y).toBeGreaterThan(stackedImages[0].y + stackedImages[0].height);
    expect(stackedImages[0].anchorId).toBe("fig:stacked");
    expect(stackedImages[1].anchorId).toBeUndefined();

    const sideBySide = await engine.layout(`\\begin{document}
\\begin{figure}
\\includegraphics[width=0.48\\columnwidth]{left.pdf}
\\includegraphics[width=0.48\\columnwidth]{right.pdf}
\\caption{Side-by-side panels.}
\\end{figure}
\\end{document}`);
    const rowImages = sideBySide.layout.pages.flatMap((page) => page.objects).filter((object) => object.type === "image");

    expect(rowImages).toHaveLength(2);
    expect(rowImages[1].y).toBeCloseTo(rowImages[0].y, 5);
    expect(rowImages[1].x).toBeGreaterThan(rowImages[0].x + rowImages[0].width);
  });

  it("resolves graphicspath folders and omitted figure extensions", () => {
    const ast = parseLatex(`\\documentclass{article}
\\graphicspath{{figure/}{assets/plots/}}
\\begin{document}
\\begin{figure}
\\includegraphics[width=0.5\\textwidth]{phase-space}
\\caption{Phase space}
\\end{figure}
\\end{document}`);
    const image = ast.children.find((node) => node.type === "image");

    expect(image).toMatchObject({
      type: "image",
      src: "figure/phase-space.pdf"
    });
    if (image?.type === "image") {
      expect(image.sources).toEqual([
        "figure/phase-space.pdf",
        "figure/phase-space.png",
        "figure/phase-space.jpg",
        "figure/phase-space.jpeg",
        "figure/phase-space.svg",
        "assets/plots/phase-space.pdf",
        "assets/plots/phase-space.png",
        "assets/plots/phase-space.jpg",
        "assets/plots/phase-space.jpeg",
        "assets/plots/phase-space.svg",
        "phase-space.pdf",
        "phase-space.png",
        "phase-space.jpg",
        "phase-space.jpeg",
        "phase-space.svg"
      ]);
    }
  });

  it("renders inline math inside LaTeX figure captions", async () => {
    const engine = createDocumentEngine({ sourceFormat: "latex", mathRenderer: "native-openmath" });
    const { layout } = await engine.layout(`\\begin{document}
\\begin{figure}
\\includegraphics{figures/phase-space.svg}
\\caption{Energy $E=mc^2$ is conserved.}
\\end{figure}
\\end{document}`);
    const captionMath = layout.pages[0].objects.find((object) => object.type === "math" && object.latex === "E=mc^2");
    const literalCaptionMath = layout.pages[0].objects.find((object) => object.type === "text" && object.text.includes("$E=mc^2$"));

    expect(captionMath?.type).toBe("math");
    expect(literalCaptionMath).toBeUndefined();
    if (captionMath?.type === "math") expect(captionMath.displayMode).toBe(false);
  });

  it("does not route latex figures through markdown image syntax", () => {
    const ast = parseLatex(`\\begin{document}
\\begin{figure}
\\includegraphics[width=120pt]{figures/raw.svg}
\\caption{Caption with \\textbf{bold} braces}
\\label{fig:raw}
\\end{figure}
\\end{document}`);

    expect(ast.children).toHaveLength(1);
    expect(ast.children[0]).toMatchObject({
      type: "image",
      src: "figures/raw.svg",
      label: "fig:raw",
      width: { value: 120, unit: "px" }
    });
  });

  it("uses article-like Latin Modern defaults for latex input", () => {
    const prepared = prepareMarkdownLayout(`\\begin{document}
\\section{One}
Text with $\\alpha$.
\\end{document}`, { sourceFormat: "latex" });

    expect(prepared.theme.fontSize).toBe(10);
    expect(prepared.theme.lineHeight).toBe(1.2);
    expect(prepared.theme.fontFamily).toContain("Latin Modern Roman");
    expect(prepared.page.margin.top).toBe(72);
    expect(prepared.page.margin.left).toBe(134);
    expect(prepared.mathRenderer).toBe("native-openmath");
    expect(prepared.nativeMathProfile).toBe("openmath");
    expect(prepared.layoutConfig.textAlign).toBe("justify");
    expect(prepared.layoutConfig.lineBreaking.hyphenation).toBe(true);
    expect(prepared.layoutConfig.headingFontSizes[2]).toBe(12);
  });

  it("applies the twocolumn documentclass option", () => {
    const prepared = prepareMarkdownLayout(`\\documentclass[twocolumn,12pt]{article}
\\begin{document}
\\section{Two Columns}
Text.
\\end{document}`, { sourceFormat: "latex" });

    expect(prepared.theme.fontSize).toBe(12);
    expect(prepared.layoutConfig.columns.count).toBe(2);
    expect(prepared.layoutConfig.headingFontSizes[2]).toBeCloseTo(14.4);
  });

  it("applies revtex4-2 document class defaults", () => {
    const prepared = prepareMarkdownLayout(`\\documentclass[aps,prd]{revtex4-2}
\\title{REVTeX Style}
\\author{Ada Vector}
\\begin{document}
\\maketitle
\\begin{abstract}
Compact abstract text.
\\end{abstract}
\\section{Introduction}
\\subsection{Lists}
Text.
\\end{document}`, { sourceFormat: "latex" });

    expect(prepared.page.margin.left).toBe(72);
    expect(prepared.theme.fontFamily).toContain("Latin Modern Roman");
    expect(prepared.layoutConfig.headingStyle).toBe("revtex");
    expect(prepared.titleMatter?.style).toBe("revtex");
    expect(prepared.titleMatter?.abstractTitle).toBe("");
    expect(prepared.titleMatter?.date).toBeUndefined();
  });

  it("renders revtex section numbers and headings", async () => {
    const engine = createDocumentEngine({ sourceFormat: "latex" });
    const { layout } = await engine.layout(`\\documentclass{revtex4-2}
\\begin{document}
\\section{Introduction}
\\subsection{Lists}
\\section{Math}
\\end{document}`);
    const text = layout.pages[0].objects
      .filter((object) => object.type === "text")
      .map((object) => object.type === "text" ? object.text : "")
      .join(" ");

    expect(text).toContain("I.");
    expect(text).toContain("INTRODUCTION");
    expect(text).toContain("A.");
    expect(text).toContain("LISTS");
    expect(text).toContain("II.");
    expect(text).toContain("MATH");
  });

  it("renders unresolved latex citations in red", async () => {
    const engine = createDocumentEngine({ sourceFormat: "latex" });
    const { layout } = await engine.layout(`\\begin{document}
Text with citation\\cite{future}.
\\end{document}`);
    const citation = layout.pages[0].objects.find((object) => object.type === "text" && object.text === "[1]");

    expect(citation?.type).toBe("text");
    if (citation?.type === "text") expect(citation.color).toBe("#b42318");
  });

  it("resolves Markdown and LaTeX citations from BibTeX sources", async () => {
    const bibliography = [
      "@article{einstein1905,",
      "  author = {Albert Einstein},",
      "  title = {On the Electrodynamics of Moving Bodies},",
      "  journal = {Annalen der Physik},",
      "  year = {1905}",
      "}"
    ].join("\n");
    const markdown = [
      "---",
      "bibliography: references.bib",
      "---",
      "Relativity follows [@einstein1905].",
      "",
      "::: bibliography",
      ":::"
    ].join("\n");
    const latex = [
      "\\begin{document}",
      "Relativity follows \\cite{einstein1905}.",
      "\\bibliography{references}",
      "\\end{document}"
    ].join("\n");

    for (const [sourceFormat, source] of [["markdown", markdown], ["latex", latex]] as const) {
      const engine = createDocumentEngine({
        sourceFormat,
        bibliographyFiles: { "references.bib": bibliography }
      });
      const { layout } = await engine.layout(source);
      const text = layout.pages.flatMap((page) => page.objects)
        .filter((object) => object.type === "text")
        .map((object) => object.type === "text" ? object.text : "")
        .join(" ");
      expect(text).toContain("[1]");
      expect(text).toContain("References");
      expect(text).toContain("Albert Einstein");
    }
  });

  it("resolves bibliography files relative to the source document", async () => {
    const bibliography = [
      "@book{knuth1984,",
      "  author = {Donald E. Knuth},",
      "  title = {The TeXbook},",
      "  publisher = {Addison-Wesley},",
      "  year = {1984}",
      "}"
    ].join("\n");
    const source = [
      "\\begin{document}",
      "See \\cite{knuth1984}.",
      "\\bibliography{references}",
      "\\end{document}"
    ].join("\n");
    const engine = createDocumentEngine({
      sourceFormat: "latex",
      sourcePath: "latex/article.tex",
      bibliographyFiles: { "latex/references.bib": bibliography }
    });
    const { layout } = await engine.layout(source);
    const text = layout.pages.flatMap((page) => page.objects)
      .filter((object) => object.type === "text")
      .map((object) => object.type === "text" ? object.text : "")
      .join(" ");

    expect(text).toContain("[1]");
    expect(text).toContain("Donald E. Knuth");
  });

  it("uses compact bracketed and justified bibliography entries", async () => {
    const bibliography = [
      "@article{layout2026,",
      "  author = {Ada Vector and Emmy Layout},",
      "  title = {A deliberately long reference title that wraps across multiple justified lines in the bibliography},",
      "  journal = {Journal of Fast Typesetting Systems},",
      "  year = {2026}",
      "}"
    ].join("\n");
    const source = [
      "\\documentclass{article}",
      "\\begin{document}",
      "See \\cite{layout2026}.",
      "\\bibliography{references}",
      "\\end{document}"
    ].join("\n");
    const engine = createDocumentEngine({
      sourceFormat: "latex",
      bibliographyFiles: { "references.bib": bibliography }
    });
    const prepared = prepareMarkdownLayout(source, {
      sourceFormat: "latex",
      bibliographyFiles: { "references.bib": bibliography }
    });
    expect(prepared.blocks.some((block) => block.type === "referenceList")).toBe(true);
    expect(prepared.blocks.some((block) => block.type === "list")).toBe(false);
    const { layout } = await engine.layout(source);
    const textObjects = layout.pages.flatMap((page) => page.objects).filter((object) => object.type === "text");
    const marker = textObjects.find((object) => object.text === "[1]" && object.color === layout.theme.text);

    expect(marker?.type).toBe("text");
    if (marker?.type !== "text") return;
    const firstEntryLine = textObjects.find((object) => object.y === marker.y && object.x > marker.x);
    expect(firstEntryLine?.type).toBe("text");
    if (firstEntryLine?.type !== "text") return;
    expect(firstEntryLine.x - marker.x).toBeLessThan(28);
    expect(firstEntryLine.x - marker.x).toBeGreaterThan(4);
    expect(firstEntryLine.x + (firstEntryLine.width ?? 0)).toBeCloseTo(layout.page.width - layout.page.margin.right, 1);
  });

  it("keeps revtex figure captions inside the active column with normal text color", async () => {
    const engine = createDocumentEngine({ sourceFormat: "latex" });
    const source = `\\documentclass[twocolumn]{revtex4-2}
\\begin{document}
\\section{Figures}
\\begin{figure}
\\includegraphics[width=0.8\\columnwidth]{missing-phase-space.svg}
\\caption{A long figure caption that should wrap inside one active column instead of drifting into the column gap.}
\\label{fig:phase}
\\end{figure}
\\end{document}`;
    const prepared = prepareMarkdownLayout(source, { sourceFormat: "latex" });
    const { layout } = await engine.layout(source);
    const captionObjects = layout.pages[0].objects.filter(
      (object) => object.type === "text" && object.text.includes("FIG. 1.")
    );
    const contentWidth = layout.page.width - layout.page.margin.left - layout.page.margin.right;
    const columnWidth = (contentWidth - prepared.layoutConfig.columns.gap) / 2;
    const leftColumnX = layout.page.margin.left;
    const rightColumnX = layout.page.margin.left + columnWidth + prepared.layoutConfig.columns.gap;

    expect(captionObjects.length).toBeGreaterThan(0);
    for (const caption of captionObjects) {
      if (caption.type !== "text") continue;
      const inLeftColumn = caption.x >= leftColumnX - 0.5 && caption.x + (caption.width ?? 0) <= leftColumnX + columnWidth + 0.5;
      const inRightColumn = caption.x >= rightColumnX - 0.5 && caption.x + (caption.width ?? 0) <= rightColumnX + columnWidth + 0.5;
      expect(inLeftColumn || inRightColumn).toBe(true);
      expect(caption.color).toBe(layout.theme.text);
    }
    const justifiedLine = captionObjects.find((caption) => caption.type === "text" && caption.width && caption.width > columnWidth - 1);
    expect(justifiedLine).toBeTruthy();
  });

  it("applies paragraph indentation from the resolved latex stylesheet", async () => {
    const engine = createDocumentEngine({ sourceFormat: "latex" });
    const { layout } = await engine.layout(`\\documentclass{revtex4-2}
\\begin{document}
\\section{Intro}
First paragraph after the heading should use the resolved stylesheet indent.

Second paragraph should use the resolved stylesheet indent.
\\end{document}`);
    const first = layout.pages[0].objects.find((object) => object.type === "text" && object.text.startsWith("First paragraph"));
    const second = layout.pages[0].objects.find((object) => object.type === "text" && object.text.startsWith("Second paragraph"));

    expect(first?.type).toBe("text");
    expect(second?.type).toBe("text");
    if (first?.type === "text" && second?.type === "text") {
      expect(first.x).toBeGreaterThan(layout.page.margin.left + 10);
      expect(second.x).toBeCloseTo(first.x);
    }
  });

  it("indents a new revtex paragraph after display math", async () => {
    const engine = createDocumentEngine({ sourceFormat: "latex" });
    const { layout } = await engine.layout(`\\documentclass{revtex4-2}
\\begin{document}
\\[
x^2 + y^2 = r^2
\\]

This is a new paragraph after display math.
\\end{document}`);
    const paragraph = layout.pages[0].objects.find(
      (object) => object.type === "text" && object.text.startsWith("This is a new paragraph")
    );

    expect(paragraph?.type).toBe("text");
    if (paragraph?.type === "text") {
      expect(paragraph.x).toBeGreaterThan(layout.page.margin.left + 10);
    }
  });

  it("does not indent revtex text that continues directly after display math", async () => {
    const engine = createDocumentEngine({ sourceFormat: "latex" });
    const source = `\\documentclass{revtex4-2}
\\begin{document}
Before the equation:
\\begin{equation}
x^2 + y^2 = r^2
\\end{equation}
Following text continues the same paragraph.
\\end{document}`;
    const ast = parseLatex(source);
    const continuation = ast.children.find(
      (node) => node.type === "paragraph" && node.children.some((child) => child.type === "text" && child.text.includes("Following text"))
    );
    const { layout } = await engine.layout(source);
    const rendered = layout.pages[0].objects.find(
      (object) => object.type === "text" && object.text.startsWith("Following text")
    );

    expect(continuation?.type).toBe("paragraph");
    if (continuation?.type === "paragraph") expect(continuation.continuation).toBe(true);
    expect(rendered?.type).toBe("text");
    if (rendered?.type === "text") expect(rendered.x).toBeCloseTo(layout.page.margin.left);
  });

  it("accepts separate page margins from front matter", async () => {
    const engine = createDocumentEngine();
    const { layout } = await engine.layout(`---
page:
  margin:
    top: 30
    right: 80
    bottom: 40
    left: 90
---

Text`);

    const firstText = layout.pages[0].objects.find((object) => object.type === "text");
    expect(firstText?.type).toBe("text");
    if (firstText?.type === "text") {
      expect(firstText.x).toBe(90);
      expect(firstText.y).toBeCloseTo(30 + defaultTheme.fontSize);
    }
  });
});

describe("document engine", () => {
  it("measures bundled text fonts from font files", async () => {
    await loadHarfbuzzTextShaper();
    loadTextFontFromBytes("libertinus:regular", readFileSync("src/assets/fonts/libertinus-serif-regular.otf"));
    const width = measureText("This sample", {
      fontSize: 12,
      fontFamily: libertinusSerifFontFamily,
      monoFontFamily: defaultTheme.monoFontFamily
    });

    expect(width).toBeGreaterThan(0);
  });

  it("shapes bundled text fonts with HarfBuzz", async () => {
    await loadHarfbuzzTextShaper();
    loadTextFontFromBytes("latin-modern:regular", readFileSync("src/assets/fonts/lmroman10-regular.otf"));
    const shaped = shapeTextWithFontFile("office", {
      fontSize: 12,
      fontFamily: "\"Latin Modern Roman\", \"Times New Roman\", serif",
      monoFontFamily: defaultTheme.monoFontFamily
    });

    expect(shaped).toBeDefined();
    expect(shaped?.glyphs.length).toBeLessThan("office".length);
    expect(shaped?.width).toBeGreaterThan(0);
  });

  it("renders HarfBuzz-measured text as browser SVG text", async () => {
    const engine = createDocumentEngine({
      theme: { fontFamily: latinModernRomanFontFamily }
    });
    const { layout } = await engine.layout("office");
    const svg = renderPageToSvg(layout.pages[0]);

    expect(svg).toContain("<text");
    expect(svg).toContain("textLength=");
    expect(svg).toContain("office");
  });

  it("creates a paged display list", async () => {
    const engine = createDocumentEngine();
    const { layout, stats } = await engine.layout("# Title\n\nBody text\n\n$$\nE = mc^2\n$$");

    expect(stats.pageCount).toBeGreaterThan(0);
    expect(layout.pages[0].objects.some((object) => object.type === "text")).toBe(true);
    expect(layout.pages[0].objects.some((object) => object.type === "math")).toBe(true);
  });

  it("splits long paragraphs across pages by line", () => {
    const words = Array.from({ length: 90 }, (_, index) => `word${index}`).join(" ");
    const page: PageConfig = {
      size: "letter",
      width: 220,
      height: 86,
      margin: { top: 12, right: 12, bottom: 12, left: 12 }
    };
    const pages = paginate(normalizeAst(parseMarkdown(words)), page, defaultTheme);
    const textPages = pages
      .map((displayPage, index) => ({
        index,
        textCount: displayPage.objects.filter((object) => object.type === "text").length
      }))
      .filter((item) => item.textCount > 0);

    expect(textPages.length).toBeGreaterThan(1);
    expect(textPages[0].index).toBe(0);
    expect(textPages[1].index).toBe(1);
  });

  it("renders selectable svg text", async () => {
    const engine = createDocumentEngine();
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

  it("renders a visible fallback for missing svg images", () => {
    const svg = renderPageToSvg({
      index: 0,
      width: 220,
      height: 120,
      objects: [{
        type: "image",
        src: "figures/missing.svg",
        alt: "Missing figure",
        x: 20,
        y: 20,
        width: 120,
        height: 60
      }]
    });

    expect(svg).toContain("Fail to load");
    expect(svg).toContain("svg-md-image-fallback");
  });

  it("embeds PDF figures as vector form objects", async () => {
    const figure = await PDFDocument.create();
    const figurePage = figure.addPage([200, 100]);
    figurePage.drawRectangle({ x: 20, y: 20, width: 160, height: 60 });
    const figureBytes = await figure.save();
    const engine = createDocumentEngine();
    const { layout } = await engine.layout("![PDF figure](figure.pdf){width=240px}");
    const output = await renderToPdf(layout, {
      imageServices: { load: async () => figureBytes }
    });

    expect(new TextDecoder().decode(output)).toContain("/Subtype /Form");
  });

  it("renders cross references as SVG links and PDF link annotations", async () => {
    const engine = createDocumentEngine();
    const { layout } = await engine.layout(`---
document:
  titleFromFirstHeading: false
---

# Intro {#sec:intro}

See @sec:intro.
`);
    const svg = renderPageToSvg(layout.pages[0]);
    const pdfBytes = await renderToPdf(layout);
    const pdf = await PDFDocument.load(pdfBytes);
    const annotations = pdf.getPages()[0].node.Annots();

    expect(svg).toContain('id="sec:intro"');
    expect(svg).toContain('href="#sec:intro"');
    expect(annotations?.size()).toBeGreaterThan(0);
  });

  it("uses front matter cross-reference formats", async () => {
    const engine = createDocumentEngine();
    const { layout } = await engine.layout(`---
crossref:
  figure:
    captionFormat: "Fig. {number}:"
    referenceFormat: "Fig. {number}"
  equation:
    referenceFormat: "Eq. ({number})"
---

See @fig:phase and @eq:energy.

$$
E=mc^2
$$
{#eq:energy}

![Phase](data:image/svg+xml,%3Csvg%2F%3E "Phase plot"){#fig:phase width=50%}
`);
    const text = layout.pages.flatMap((page) => page.objects)
      .filter((object) => object.type === "text")
      .map((object) => object.text)
      .join("");

    expect(text).toContain("See Fig. 1 and Eq. (1).");
    expect(text).toContain("Fig. 1: Phase plot");
  });

  it("uses section captionFormat for visible heading numbers", async () => {
    const engine = createDocumentEngine();
    const { layout } = await engine.layout(`---
document:
  titleFromFirstHeading: false
crossref:
  section:
    captionFormat: "{number})"
    referenceFormat: "Sec. {number}"
---

# Intro {#sec:intro}

See @sec:intro.
`);
    const text = layout.pages[0].objects
      .filter((object) => object.type === "text")
      .map((object) => object.text)
      .join("");

    expect(text).toContain("1) Intro");
    expect(text).toContain("See Sec. 1.");
  });

  it("allows section captionFormat to hide heading numbers", async () => {
    const engine = createDocumentEngine();
    const { layout } = await engine.layout(`---
document:
  titleFromFirstHeading: false
crossref:
  section:
    captionFormat: ""
    referenceFormat: "Section {number}"
---

# Intro {#sec:intro}

See @sec:intro.
`);
    const text = layout.pages[0].objects
      .filter((object) => object.type === "text")
      .map((object) => object.text)
      .join("");

    expect(text).toContain("Intro");
    expect(text).not.toContain("1 Intro");
    expect(text).toContain("See Section 1.");
  });

  it("treats the first H1 as a full-width title before multi-column flow", async () => {
    const engine = createDocumentEngine();
    const repeated = Array.from({ length: 300 }, (_, index) => `body${index}`).join(" ");
    const { layout } = await engine.layout(`---
page:
  size: letter
  margin: 72
layout:
  columns: 2
  columnGap: 24
crossref:
  section:
    referenceFormat: "Sec. {number}"
---

# Document Title

# First Section {#sec:first}

See @sec:first.

${repeated}
`);
    const textObjects = layout.pages[0].objects.filter((object) => object.type === "text");
    const joinedText = textObjects.map((object) => object.text).join("");
    const title = textObjects.find((object) => object.text === "Document Title");
    const section = textObjects.find((object) => object.text.includes("1 First"));
    const secondColumnX = 72 + ((612 - 144 - 24) / 2) + 24;
    const secondColumnText = textObjects.find((object) => Math.abs(object.x - secondColumnX) < 1);

    expect(title?.type).toBe("text");
    expect(section?.type).toBe("text");
    expect(joinedText).toContain("1 First Section");
    expect(joinedText).toContain("See Sec. 1.");
    expect(secondColumnText?.type).toBe("text");
    if (title?.type === "text" && secondColumnText?.type === "text") {
      expect(secondColumnText.y).toBeGreaterThan(title.y);
    }
  });

  it("renders YAML title matter before normal section flow", async () => {
    const engine = createDocumentEngine();
    const { layout } = await engine.layout(`---
document:
  title: "YAML Title"
  titleFontSize: 30
  authors: ["Ada Lovelace", "Grace Hopper"]
  abstract: "This abstract has inline math $x^2$."
layout:
  columns: 2
  columnGap: 24
---

# First Section {#sec:first}

See @sec:first.
`);
    const text = layout.pages[0].objects.filter((object) => object.type === "text");
    const joinedText = text.map((object) => object.text).join("");
    const title = text.find((object) => object.text === "YAML Title");
    const author = text.find((object) => object.text === "Ada Lovelace");
    const abstractLabel = text.find((object) => object.text === "Abstract");
    const section = text.find((object) => object.text.includes("1 First"));

    expect(title?.type).toBe("text");
    expect(title?.fontSize).toBe(30);
    expect(author?.type).toBe("text");
    expect(abstractLabel?.type).toBe("text");
    expect(joinedText).toContain("1 First Section");
    if (title?.type === "text" && section?.type === "text") {
      expect(section.y).toBeGreaterThan(title.y);
    }
  });

  it("lets front matter choose the supported native OpenMath path", async () => {
    const engine = createDocumentEngine({
      mathRenderer: "native-openmath",
      nativeMathMetrics: {
        ...defaultOpenMathMetrics,
        displayPadding: 3,
        inlineFractionScale: 0.42
      }
    });
    const { layout } = await engine.layout(`---
typography:
  family: libertinus
---

Inline $x^2$.
`);
    const math = layout.pages[0].objects.find((object) => object.type === "math");

    expect(layout.theme.fontFamily).toContain("Libertinus Serif");
    expect(math?.type).toBe("math");
    if (math?.type === "math") {
      const defaults = getDefaultOpenMathMetricsForProfile("openmath-libertinus");
      expect(math.renderer).toBe("native-openmath");
      expect(math.nativeMathProfile).toBe("openmath-libertinus");
      expect(math.nativeMetrics?.displayPadding).toBe(defaults.displayPadding);
      expect(math.nativeMetrics?.inlineFractionScale).toBe(defaults.inlineFractionScale);
    }
  });

  it("parses typography front matter as the document font family", () => {
    const document = parseMarkdownDocument(`---
typography:
  family: latin-modern
  fontSize: 11
  lineHeight: 1.5
---

Body
`);

    expect(document.frontMatter?.typography).toEqual({
      family: "latin-modern",
      fontSize: 11,
      lineHeight: 1.5
    });
  });

  it("parses document title matter front matter", () => {
    const document = parseMarkdownDocument(`---
document:
  title: "A Small Paper"
  titleFontSize: 30
  authors: ["Ada Lovelace", "Grace Hopper"]
  abstractTitle: "Summary"
  abstract: "A short abstract with $x$."
---

Body
`);

    expect(document.frontMatter?.document).toMatchObject({
      title: "A Small Paper",
      titleFontSize: 30,
      authors: ["Ada Lovelace", "Grace Hopper"],
      abstractTitle: "Summary",
      abstract: "A short abstract with $x$."
    });
  });

  it("parses layout front matter for line breaking and text alignment", () => {
    const document = parseMarkdownDocument(`---
layout:
  textAlign: justify
  columns: 2
  columnGap: 18
  headingFontSizes:
    h1: 16
    h2: 13
  lineBreaking:
    algorithm: greedy
    hyphenation: false
    language: en-US
---

Body
`);

    expect(document.frontMatter?.layout).toEqual({
      textAlign: "justify",
      columns: {
        count: 2,
        gap: 18
      },
      headingFontSizes: {
        1: 16,
        2: 13
      },
      lineBreaking: {
        algorithm: "greedy",
        hyphenation: false,
        language: "en-US"
      }
    });
  });

  it("applies front matter heading font sizes during layout", async () => {
    const engine = createDocumentEngine();
    const { layout } = await engine.layout(`---
document:
  titleFromFirstHeading: false
layout:
  headingFontSizes: [16, 13, 11]
---

# First

## Second

### Third
`);
    const text = layout.pages[0].objects.filter((object) => object.type === "text");
    const first = text.find((object) => object.text.includes("First"));
    const second = text.find((object) => object.text.includes("Second"));
    const third = text.find((object) => object.text.includes("Third"));

    expect(first?.fontSize).toBe(16);
    expect(second?.fontSize).toBe(13);
    expect(third?.fontSize).toBe(11);
  });

  it("flows paragraph lines into multiple columns", async () => {
    const engine = createDocumentEngine();
    const repeated = Array.from({ length: 220 }, (_, index) => `word${index}`).join(" ");
    const { layout } = await engine.layout(`---
page:
  size: letter
  margin: 72
layout:
  columns: 2
  columnGap: 24
---

${repeated}
`);
    const textObjects = layout.pages[0].objects.filter((object) => object.type === "text");
    const firstColumnX = 72;
    const secondColumnX = 72 + ((612 - 144 - 24) / 2) + 24;

    expect(textObjects.some((object) => Math.abs(object.x - firstColumnX) < 1)).toBe(true);
    expect(textObjects.some((object) => Math.abs(object.x - secondColumnX) < 1)).toBe(true);
  });

  it("moves headings to the next column with the new column x position", () => {
    const page: PageConfig = {
      size: "letter",
      width: 320,
      height: 180,
      margin: { top: 20, right: 20, bottom: 20, left: 20 }
    };
    const pages = paginate([
      { type: "code", code: ["a", "b", "c", "d", "e"].join("\n") },
      { type: "heading", level: 2, runs: [{ text: "Boundary Heading" }] }
    ], page, defaultTheme, undefined, "native-openmath", undefined, undefined, undefined, {
      ...defaultLayoutConfig,
      columns: { count: 2, gap: 20 }
    });
    const secondColumnX = 20 + ((320 - 40 - 20) / 2) + 20;
    const heading = pages[0].objects.find(
      (object) => object.type === "text" && object.text.includes("Boundary")
    );

    expect(heading?.type).toBe("text");
    if (heading?.type === "text") {
      expect(Math.abs(heading.x - secondColumnX)).toBeLessThan(1);
    }
  });

  it("uses bold heading width when breaking heading lines", () => {
    const text = "Second Column Pressure";
    const fontSize = headingSize(2, defaultTheme.fontSize);
    const regularWidth = measureText(text, {
      fontSize,
      fontFamily: defaultTheme.fontFamily,
      monoFontFamily: defaultTheme.monoFontFamily
    });
    const boldWidth = measureText(text, {
      fontSize,
      fontFamily: defaultTheme.fontFamily,
      monoFontFamily: defaultTheme.monoFontFamily,
      bold: true
    });
    const contentWidth = (regularWidth + boldWidth) / 2;
    const page: PageConfig = {
      size: "letter",
      width: contentWidth + 40,
      height: 180,
      margin: { top: 20, right: 20, bottom: 20, left: 20 }
    };
    const pages = paginate([
      { type: "heading", level: 2, runs: [{ text }] }
    ], page, defaultTheme);
    const headingText = pages[0].objects
      .filter((object) => object.type === "text")
      .map((object) => object.text);

    expect(regularWidth).toBeLessThan(contentWidth);
    expect(boldWidth).toBeGreaterThan(contentWidth);
    expect(headingText).not.toContain(text);
    expect(headingText.join("")).toBe(text);
  });

  it("keeps closing punctuation with the previous linked run", () => {
    const word = "reference";
    const wordWidth = measureText(word, {
      fontSize: 12,
      fontFamily: defaultTheme.fontFamily,
      monoFontFamily: defaultTheme.monoFontFamily
    });
    const lines = breakRunsIntoLines(
      [
        { text: word, link: "#sec:intro" },
        { text: "." }
      ],
      wordWidth + 1,
      12,
      defaultTheme
    );

    expect(lines).toHaveLength(1);
    expect(lines[0].runs.map((run) => run.text).join("")).toBe("reference.");
  });

  it("keeps non-breaking spaces attached to the following token", () => {
    const fontSize = 12;
    const options = {
      fontSize,
      fontFamily: defaultTheme.fontFamily,
      monoFontFamily: defaultTheme.monoFontFamily
    };
    const maxWidth = measureText("Figure ", options) + 1;
    const lines = breakRunsIntoLines(
      [
        { text: "Figure" },
        { text: " ", nonBreak: true },
        { text: "1" }
      ],
      maxWidth,
      fontSize,
      defaultTheme
    );

    expect(lines).toHaveLength(1);
    expect(lines[0].runs.map((run) => run.text).join("")).toBe("Figure 1");
    expect(lines[0].width).toBeGreaterThan(maxWidth);
  });

  it("hyphenates long words when enabled", () => {
    const lines = breakRunsIntoLines(
      [{ text: "electromagnetohydrodynamics" }],
      92,
      12,
      defaultTheme,
      undefined,
      "native-openmath",
      undefined,
      undefined,
      {
        ...defaultLayoutConfig,
        textAlign: "left",
        lineBreaking: {
          algorithm: "greedy",
          hyphenation: true,
          language: "en-US"
        }
      }
    );

    const rendered = lines.map((line) => line.runs.map((run) => run.text).join(""));
    expect(rendered.length).toBeGreaterThan(1);
    expect(rendered.some((line) => line.endsWith("-"))).toBe(true);
  });

  it("allows representation to break at represent-ation", () => {
    const fontSize = 12;
    const maxWidth = measureText("represent-", {
      fontSize,
      fontFamily: defaultTheme.fontFamily,
      monoFontFamily: defaultTheme.monoFontFamily
    }) + 0.5;
    const lines = breakRunsIntoLines(
      [{ text: "representation" }],
      maxWidth,
      fontSize,
      defaultTheme,
      undefined,
      "native-openmath",
      undefined,
      undefined,
      {
        ...defaultLayoutConfig,
        lineBreaking: {
          algorithm: "greedy",
          hyphenation: true,
          language: "en-US"
        }
      }
    );
    const rendered = lines.map((line) => line.runs.map((run) => run.text).join(""));

    expect(rendered[0]).toBe("represent-");
    expect(rendered.slice(1).join("")).toBe("ation");
  });

  it("hyphenates words before trailing punctuation", () => {
    const fontSize = 12;
    const maxWidth = measureText("represent-", {
      fontSize,
      fontFamily: defaultTheme.fontFamily,
      monoFontFamily: defaultTheme.monoFontFamily
    }) + 0.5;
    const lines = breakRunsIntoLines(
      [{ text: "representation, " }],
      maxWidth,
      fontSize,
      defaultTheme,
      undefined,
      "native-openmath",
      undefined,
      undefined,
      {
        ...defaultLayoutConfig,
        lineBreaking: {
          algorithm: "greedy",
          hyphenation: true,
          language: "en-US"
        }
      }
    );
    const rendered = lines.map((line) => line.runs.map((run) => run.text).join(""));

    expect(rendered[0]).toBe("represent-");
    expect(rendered.slice(1).join("")).toBe("ation, ");
  });

  it("does not hyphenate URL-like words", () => {
    const lines = breakRunsIntoLines(
      [{ text: "https://example.com/electromagnetohydrodynamics" }],
      92,
      12,
      defaultTheme,
      undefined,
      "native-openmath",
      undefined,
      undefined,
      {
        ...defaultLayoutConfig,
        textAlign: "left",
        lineBreaking: {
          algorithm: "greedy",
          hyphenation: true,
          language: "en-US"
        }
      }
    );

    const rendered = lines.map((line) => line.runs.map((run) => run.text).join(""));
    expect(rendered.some((line) => line.endsWith("-"))).toBe(false);
  });

  it("breaks at explicit hyphens without automatic hyphenation", () => {
    const maxWidth = measureText("document-", {
      fontSize: 12,
      fontFamily: defaultTheme.fontFamily,
      monoFontFamily: defaultTheme.monoFontFamily
    }) + 1;
    const lines = breakRunsIntoLines(
      [{ text: "document-level" }],
      maxWidth,
      12,
      defaultTheme
    );
    const rendered = lines.map((line) => line.runs.map((run) => run.text).join(""));

    expect(rendered[0]).toBe("document-");
    expect(lines[0].runs).toHaveLength(1);
    expect(rendered.join("")).toBe("document-level");
  });

  it("stretches non-final paragraph lines when textAlign is justify", async () => {
    const engine = createDocumentEngine();
    const { layout } = await engine.layout(`---
page:
  size: letter
  margin: 72
layout:
  textAlign: justify
---

This paragraph has enough words to wrap into more than one line and the first rendered line should stretch to the content width.
`);
    const contentWidth = layout.page.width - layout.page.margin.left - layout.page.margin.right;
    const firstLineText = layout.pages[0].objects.find((object) => object.type === "text" && object.text.startsWith("This paragraph"));

    expect(firstLineText?.type).toBe("text");
    if (firstLineText?.type === "text") {
      expect(firstLineText.width).toBeCloseTo(contentWidth, 1);
    }
  });

  it("renders markdown images with captions into SVG pages", async () => {
    const engine = createDocumentEngine();
    const { layout } = await engine.layout(`![Plot](data:image/svg+xml,%3Csvg%2F%3E "Figure 1. Plot"){width=50% align=center}`);
    const svg = renderPageToSvg(layout.pages[0]);
    const image = layout.pages[0].objects.find((object) => object.type === "image");
    const caption = layout.pages[0].objects.find((object) => object.type === "text" && object.text === "Figure 1. Plot");

    expect(image?.type).toBe("image");
    expect(caption?.type).toBe("text");
    expect(svg).toContain("<image");
    expect(svg).toContain("Figure 1. Plot");
    expect(svg).toContain('role="img" aria-label="Plot"');
    expect(svg).not.toContain("<title>Plot</title>");
    if (image?.type === "image") {
      expect(image.width).toBeGreaterThan(100);
      expect(image.width).toBeLessThan(400);
    }
  });

  it("renders fenced GraphSX blocks into SVG pages", async () => {
    const engine = createDocumentEngine();
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
    const engine = createDocumentEngine();
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
      expect(firstMath.width).toBeGreaterThanOrEqual(firstMath.advance ?? 0);
      expect(firstMath.width).toBeGreaterThan(34);
      expect(nextText.x).toBeGreaterThanOrEqual(firstMath.x + (firstMath.advance ?? 0));
      expect(nextText.text.startsWith(" ") || nextText.x > firstMath.x + (firstMath.advance ?? 0)).toBe(true);
      expect(nextText.x - (firstMath.x + (firstMath.advance ?? 0))).toBeLessThan(5);
      expect(fraction.width).toBeLessThan(firstMath.width);
      expect(fraction.width).toBeGreaterThan(8);
    }
  });

  it("exports a PDF", async () => {
    const engine = createDocumentEngine();
    const { layout } = await engine.layout("# Title");
    const bytes = await renderToPdf(layout);

    expect(bytes.length).toBeGreaterThan(100);
  });

  it("subsets bundled PDF text fonts", async () => {
    const fontBytes = readFileSync("src/assets/fonts/lmroman10-regular.otf");
    const createPdf = async (subsetFont: boolean) => {
      const pdf = await PDFDocument.create();
      pdf.registerFontkit(fontkit);
      const font = await pdf.embedFont(fontBytes, { subset: subsetFont });
      const page = pdf.addPage([320, 120]);
      page.drawText("This sample uses a bundled Latin Modern text font.", {
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
    const fontBytes = readFileSync("src/assets/fonts/lmroman10-regular.otf");
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

  it("renders native math without a foreignObject fallback", async () => {
    const engine = createDocumentEngine({ mathRenderer: "native-openmath" });
    const { layout } = await engine.layout("Native $E = mc^2$ and unsupported $\\begin{pmatrix} a \\end{pmatrix}$");
    const svg = renderPageToSvg(layout.pages[0]);

    expect(svg).toContain("svg-md-native-math");
    expect(svg).toContain("a");
    expect(svg).toContain("(");
    expect(svg).not.toContain("⟦begin⟧");
    expect(svg).not.toContain("foreignObject");
  });

  it("renders native OpenMath mode through the native display path", async () => {
    const engine = createDocumentEngine({ mathRenderer: "native-openmath" });
    const { layout } = await engine.layout("OpenMath $\\sqrt{x^2 + y^2} = r$");
    const math = layout.pages[0].objects.find((object) => object.type === "math");
    const svg = renderPageToSvg(layout.pages[0]);

    expect(math?.type).toBe("math");
    if (math?.type === "math") {
      expect(math.renderer).toBe("native-openmath");
      expect(math.nativeMetrics).toBeDefined();
    }
    expect(svg).toContain("svg-md-native-math");
    expect(svg).toContain("Latin Modern Math");
    expect(svg).not.toContain("foreignObject");
  });

  it("renders table cell math through the selected math renderer", async () => {
    const engine = createDocumentEngine({ mathRenderer: "native-openmath" });
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
    const engine = createDocumentEngine({ mathRenderer: "native-openmath" });
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
    const engine = createDocumentEngine({ mathRenderer: "native-openmath" });
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

  it("maps OpenMath mathcal to mathematical script glyphs", () => {
    const layout = layoutNativeMath("\\mathcal{E} + \\mathcal{R}", false, 12, defaultOpenMathMetrics, "openmath");
    const text = layout.nodes
      .filter((node) => node.type === "glyph")
      .map((node) => node.text)
      .join("");

    expect(text).toContain("ℰ");
    expect(text).toContain("ℛ");
    expect(text).not.toContain("mathcal");
  });

  it("renders common symbolic commands as native glyphs", () => {
    const layout = layoutNativeMath("A \\otimes B \\circ C^\\dagger", false, 12, defaultOpenMathMetrics, "openmath");
    const text = layout.nodes
      .filter((node) => node.type === "glyph")
      .map((node) => node.text)
      .join("");

    expect(text).toContain("⊗");
    expect(text).toContain("∘");
    expect(text).toContain("†");
    expect(text).not.toContain("otimes");
    expect(text).not.toContain("dagger");
  });

  it("renders perp as an upright relation with relation spacing", () => {
    const layout = layoutNativeMath("x \\perp y", false, 12, defaultOpenMathMetrics, "openmath");
    const compact = layoutNativeMath("x \\perp y", false, 12, {
      ...defaultOpenMathMetrics,
      relationMargin: 0
    }, "openmath");
    const glyphs = layout.nodes.filter((node) => node.type === "glyph");

    expect(glyphs.map((node) => node.text)).toContain("⟂");
    expect(glyphs.find((node) => node.text === "⟂")?.italic).not.toBe(true);
    expect(layout.width).toBeGreaterThan(compact.width);
  });

  it("renders common comparison commands as spaced relations", () => {
    const latex = "a \\geq b \\gg c \\ll d \\leq e \\neq f";
    const layout = layoutNativeMath(latex, false, 12, defaultOpenMathMetrics, "openmath");
    const compact = layoutNativeMath(latex, false, 12, {
      ...defaultOpenMathMetrics,
      relationMargin: 0
    }, "openmath");
    const glyphs = layout.nodes.filter((node) => node.type === "glyph");

    expect(glyphs.map((node) => node.text)).toEqual(["𝑎", "≥", "𝑏", "≫", "𝑐", "≪", "𝑑", "≤", "𝑒", "≠", "𝑓"]);
    expect(glyphs.filter((node) => ["≥", "≫", "≪", "≤", "≠"].includes(node.text)).every((node) => node.italic !== true)).toBe(true);
    expect(layout.width).toBeGreaterThan(compact.width);
  });

  it("renders arrow and escaped brace commands as native glyphs", () => {
    const layout = layoutNativeMath("\\uparrow \\downarrow \\leftarrow \\rightarrow \\{ x \\}", false, 12, defaultOpenMathMetrics, "openmath");
    const text = layout.nodes
      .filter((node) => node.type === "glyph")
      .map((node) => node.text)
      .join("");

    expect(text).toContain("↑");
    expect(text).toContain("↓");
    expect(text).toContain("←");
    expect(text).toContain("→");
    expect(text).toContain("{");
    expect(text).toContain("}");
    expect(text).not.toContain("uparrow");
    expect(text).not.toContain("rightarrow");
  });

  it("renders mathrm and mathbb grouped commands", () => {
    const layout = layoutNativeMath("\\mathrm{tr} + \\mathbb{R} + \\mathbb{1}", false, 12, defaultOpenMathMetrics, "openmath");
    const glyphs = layout.nodes.filter((node) => node.type === "glyph");
    const text = glyphs.map((node) => node.text).join("");
    const roman = glyphs.find((node) => node.text === "tr");

    expect(text).toContain("tr");
    expect(text).toContain("ℝ");
    expect(text).toContain("𝟙");
    expect(text).not.toContain("mathrm");
    expect(text).not.toContain("mathbb");
    expect(roman?.italic).toBe(false);
  });

  it("renders text command as upright math text", () => {
    const layout = layoutNativeMath("F_{\\text{EPR}} = \\text{ok}", false, 12, defaultOpenMathMetrics, "openmath");
    const glyphs = layout.nodes.filter((node) => node.type === "glyph");
    const text = glyphs.map((node) => node.text).join("");
    const epr = glyphs.find((node) => node.text === "EPR");
    const ok = glyphs.find((node) => node.text === "ok");

    expect(text).toContain("EPR");
    expect(text).toContain("ok");
    expect(text).not.toContain("⟦text⟧");
    expect(epr?.italic).toBe(false);
    expect(ok?.italic).toBe(false);
  });

  it("uses TeX-style atom spacing for binary operators", () => {
    const binary = layoutNativeMath("x+y", false, 12, defaultNativeMathMetrics, "openmath");
    const unary = layoutNativeMath("+x", false, 12, defaultNativeMathMetrics, "openmath");
    const binaryGlyphs = binary.nodes.filter((node) => node.type === "glyph");
    const unaryGlyphs = unary.nodes.filter((node) => node.type === "glyph");
    const binaryGap = binaryGlyphs[2].x - binaryGlyphs[1].x;
    const unaryGap = unaryGlyphs[1].x - unaryGlyphs[0].x;

    expect(binaryGlyphs.map((node) => node.text)).toEqual(["𝑥", "+", "𝑦"]);
    expect(unaryGlyphs.map((node) => node.text)).toEqual(["+", "𝑥"]);
    expect(binaryGap - unaryGap).toBeGreaterThan(12 * defaultNativeMathMetrics.binaryMargin * 0.8);
  });

  it("does not add ink-edge gap after display named operators when thin space is zero", () => {
    const metrics = { ...defaultOpenMathMetrics, thinMathSpace: 0 };
    const layout = layoutNativeMath("\\max x \\sin x", true, 12, metrics, "openmath");
    const spacedLayout = layoutNativeMath(
      "\\max x \\sin x",
      true,
      12,
      { ...defaultOpenMathMetrics, thinMathSpace: 0.2 },
      "openmath"
    );
    const glyphs = layout.nodes.filter((node) => node.type === "glyph");
    const spacedGlyphs = spacedLayout.nodes.filter((node) => node.type === "glyph");
    const max = glyphs.find((node) => node.text === "max");
    const firstX = glyphs.find((node) => node.text === "𝑥");
    const spacedMax = spacedGlyphs.find((node) => node.text === "max");
    const spacedFirstX = spacedGlyphs.find((node) => node.text === "𝑥");

    expect(max?.type).toBe("glyph");
    expect(firstX?.type).toBe("glyph");
    expect(spacedMax?.type).toBe("glyph");
    expect(spacedFirstX?.type).toBe("glyph");
    if (max?.type === "glyph" && firstX?.type === "glyph" && spacedMax?.type === "glyph" && spacedFirstX?.type === "glyph") {
      expect(spacedFirstX.x - spacedMax.x - (firstX.x - max.x)).toBeCloseTo(12 * 0.2, 3);
    }
  });

  it("exports native math with the native PDF path", async () => {
    const engine = createDocumentEngine({ mathRenderer: "native-openmath" });
    const { layout } = await engine.layout("Native $\\sqrt{x^2 + y^2} = r$ and $$\n\\frac{1}{3}\n$$");
    const bytes = await renderToPdf(layout);

    expect(bytes.length).toBeGreaterThan(0);
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
  });

  it("exports native OpenMath math-italic glyphs with the OpenMath PDF font", async () => {
    const engine = createDocumentEngine({ mathRenderer: "native-openmath" });
    const { layout } = await engine.layout("OpenMath $x^2 + \\alpha = y$ and $\\sin x$ and $\\mathbf{B}$");
    const bytes = await renderToPdf(layout);

    expect(bytes.length).toBeGreaterThan(0);
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
  });

  it("keeps native inline math near the surrounding text baseline", async () => {
    const engine = createDocumentEngine({ mathRenderer: "native-openmath" });
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
    const delimiterPaths = layout.nodes.filter((node) => node.type === "glyphPath");
    const a = glyphs.find((node) => node.text === "a" || node.text === "𝑎");
    const c = glyphs.find((node) => node.text === "c" || node.text === "𝑐");

    expect(text.includes("(") || delimiterPaths.length >= 2).toBe(true);
    expect(text.includes(")") || delimiterPaths.length >= 2).toBe(true);
    expect(text).toContain("𝑎");
    expect(text).toContain("𝑏");
    expect(text).toContain("𝑐");
    expect(text).toContain("𝑑");
    expect(a?.type).toBe("glyph");
    expect(c?.type).toBe("glyph");
    if (a?.type === "glyph" && c?.type === "glyph") expect(c.y).toBeGreaterThan(a.y);
    expect(text).not.toContain("⟦begin⟧");
  });

  it("lays out aligned rows on shared ampersand axes", () => {
    const layout = layoutNativeMath(`\\begin{aligned}
      x &= y \\\\
      &= \\frac{a}{b}
    \\end{aligned}`, true, 12, defaultOpenMathMetrics, "openmath");
    const glyphs = layout.nodes.filter((node) => node.type === "glyph");
    const equals = glyphs.filter((node) => node.text === "=");

    expect(equals).toHaveLength(2);
    expect(equals[0].x).toBeCloseTo(equals[1].x, 5);
    expect(equals[1].y).toBeGreaterThan(equals[0].y);
    expect(layout.nodes.some((node) => node.type === "rule")).toBe(true);
    expect(glyphs.map((node) => node.text).join("")).not.toContain("aligned");
  });

  it("collapses unknown native math environments without parsing their body", () => {
    const layout = layoutNativeMath("\\begin{unknownenv} q + z \\end{unknownenv}", false, 12);
    const glyphs = layout.nodes.filter((node) => node.type === "glyph");
    const text = glyphs.map((node) => node.text).join("");
    const marker = glyphs.find((node) => node.text.includes("unknown environment"));

    expect(text).toContain("unknown environment: unknownenv");
    expect(text).not.toContain("q");
    expect(text).not.toContain("z");
    expect(marker?.type).toBe("glyph");
    if (marker?.type === "glyph") expect(marker.color).toBe("#b42318");
  });

  it("renders tikzpicture math environments as measured graph atoms", () => {
    const layout = layoutNativeMath(
      "\\begin{tikzpicture}\\node[draw] (a) at (0,0) {$x$};\\end{tikzpicture}",
      false,
      12
    );
    const graph = layout.nodes.find((node) => node.type === "graphsx");

    expect(graph?.type).toBe("graphsx");
    if (graph?.type === "graphsx") {
      expect(graph.displayList.type).toBe("tikz");
      expect(graph.width).toBeGreaterThan(0);
      expect(graph.height).toBeGreaterThan(0);
      expect(layout.width).toBeGreaterThanOrEqual(graph.width);
    }
  });

  it("renders native left/right delimiters around tall content", () => {
    const layout = layoutNativeMath("\\left(\\frac{x}{y}\\right)^2", true, 12);
    const glyphs = layout.nodes.filter((node) => node.type === "glyph");
    const text = glyphs.map((node) => node.text).join("");
    const left = glyphs.find((node) => node.text === "(");
    const right = glyphs.find((node) => node.text === ")");
    const delimiterPaths = layout.nodes.filter((node) => node.type === "glyphPath");

    expect(text.includes("(") || delimiterPaths.length >= 2).toBe(true);
    expect(text.includes(")") || delimiterPaths.length >= 2).toBe(true);
    expect(text).toContain("2");
    expect(text).not.toContain("⟦left⟧");
    expect(text).not.toContain("⟦right⟧");
    expect((left?.type === "glyph" && right?.type === "glyph") || delimiterPaths.length >= 2).toBe(true);
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
    loadNativeFontFromBytes("openMathLibertinus", readFileSync("src/assets/fonts/libertinus-math.otf"));
    const layout = layoutNativeMath("\\int_a^b x", false, 12, defaultOpenMathMetrics, "openmath-libertinus");
    const glyphs = layout.nodes.filter((node) => node.type === "glyph");
    const upper = glyphs.find((node) => node.text === "𝑏");
    const next = glyphs.find((node) => node.text === "𝑥");
    const integralGlyphId = getNativeGlyphId("openMathLibertinus", "∫");

    expect(integralGlyphId).toBeDefined();
    expect(upper?.type).toBe("glyph");
    expect(next?.type).toBe("glyph");
    if (upper?.type === "glyph" && next?.type === "glyph") {
      const upperMetrics = getNativeGlyphMetrics("openMathLibertinus", upper.text, upper.fontSize);
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

  it("renders cdots and treats approx as a relation", () => {
    const layout = layoutNativeMath("a \\cdots b \\approx c", false, 12, defaultOpenMathMetrics, "openmath");
    const compact = layoutNativeMath("a \\cdots b \\approx c", false, 12, {
      ...defaultOpenMathMetrics,
      relationMargin: 0
    }, "openmath");
    const text = layout.nodes
      .filter((node) => node.type === "glyph")
      .map((node) => node.text)
      .join("");

    expect(text).toContain("⋯");
    expect(text).toContain("≈");
    expect(text).not.toContain("cdots");
    expect(text).not.toContain("approx");
    expect(layout.width).toBeGreaterThan(compact.width);
  });

  it("normalizes meaningless inline math spaces for measurement keys", () => {
    expect(normalizeMathLatex("E=   mc^2")).toBe("E=mc^2");
    expect(mathMeasureKey("E=mc^2", false, 12)).toBe(mathMeasureKey("E=   mc^2", false, 12));
  });

  it("includes native math metrics in native measurement keys", () => {
    expect(mathMeasureKey("E=mc^2", false, 12, "native-openmath", defaultNativeMathMetrics)).not.toBe(
      mathMeasureKey("E=mc^2", false, 12, "native-openmath", {
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

    expect(glyphs.map((node) => node.text)).toEqual(["𝛼", "𝑥"]);
    expect(spaced.width).toBeCloseTo(compact.width, 5);
  });

  it("ignores literal spaces in native math but keeps explicit spacing commands", () => {
    const spaced = layoutNativeMath("x y", false, 12);
    const compact = layoutNativeMath("xy", false, 12);
    const explicit = layoutNativeMath("x\\quad y", false, 12);
    const glyphs = spaced.nodes.filter((node) => node.type === "glyph");

    expect(glyphs.map((node) => node.text)).toEqual(["𝑥", "𝑦"]);
    expect(spaced.width).toBeCloseTo(compact.width, 5);
    expect(explicit.width).toBeGreaterThan(compact.width);
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

  it("centers TikZ math labels by their native glyph ink bounds", () => {
    loadNativeFontFromBytes("openMath", readFileSync("src/assets/fonts/latinmodern-math.otf"));
    const artifact = renderGraphSX(
      String.raw`\begin{tikzpicture}\node[draw, minimum width=1.6cm, minimum height=1cm] (u) at (0,0) {$U$};\end{tikzpicture}`,
      { ...defaultTheme, fontSize: 10 },
      "openmath",
      "tikz"
    );
    const mathItem = artifact.displayList.items.find((item) => item.type === "math" && item.source === "U") as { y?: number } | undefined;
    const glyphMetrics = getNativeGlyphMetrics("openMath", "𝑈", 10);
    const svgGlyph = artifact.svgBody.match(/<text[^>]*y="([^"]+)"[^>]*>𝑈<\/text>/);

    expect(mathItem?.y).toBeTypeOf("number");
    expect(glyphMetrics).toBeDefined();
    expect(svgGlyph).not.toBeNull();
    if (typeof mathItem?.y === "number" && glyphMetrics && svgGlyph) {
      const renderedBaseline = Number(svgGlyph[1]);
      const renderedInkCenter = renderedBaseline - (glyphMetrics.actualAscent - glyphMetrics.actualDescent) / 2;
      expect(renderedInkCenter).toBeCloseTo(mathItem.y, 2);
    }
  });

});
