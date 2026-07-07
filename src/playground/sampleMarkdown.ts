export const sampleMarkdown = `# SVG Markdown Preview

This playground renders **Markdown** into _positioned page objects_, then paints each page as selectable SVG text. The PDF download uses the same display list.

## Feature sample

- [x] Common headings and paragraphs
- [x] Task lists
- [ ] Tables, code blocks, math blocks, and page breaks

| Area | Preview | Export |
| --- | --- | --- |
| Pagination | SVG pages | PDF pages |
| Text | SVG text | PDF text |
| Source | Display list | Display list |

## Code

\`\`\`ts
export function hello(name: string) {
  return \`Hello, \${name}\`;
}
\`\`\`

## Math

$E = mc^2$ is inline math. Block math is shown as a positioned text line in this v1:

$$
\\int_0^1 x^2 dx = 1 / 3
$$

---

## Long paragraph

Markdown is parsed into an AST, normalized into layout blocks, measured, broken into lines, and paginated before anything is drawn. That means the SVG preview and PDF export share the same coordinates instead of letting HTML layout and PDF layout drift apart.

<!-- pagebreak -->

# Second Page

This page starts after an explicit page break. Try editing the document and watching the page count update.
`;

const mathSuites = [
  `Inline spacing checks: $E = mc^2$, $\\frac{a}{b}$, $x_i^2 + y_i^2 = r^2$, and $\\alpha + \\beta = \\gamma$ should sit naturally inside prose.

$$
\\int_0^1 x^2 dx = \\frac{1}{3}
$$

$$
\\sqrt{x^2 + y^2} = r
$$`,
  `Operators and scripts: $a_n = a_0 q^n$, $\\lim_{n \\to \\infty} \\frac{1}{n} = 0$, and $\\sum_{k=1}^n k$ appear inline.

$$
\\sum_{k=1}^{n} k = \\frac{n(n+1)}{2}
$$

$$
\\prod_{i=1}^{n} x_i = x_1 x_2 \\cdots x_n
$$`,
  `Fractions and nested fractions: $\\frac{1}{1+x}$, $\\frac{a+b}{c+d}$, and $\\frac{\\frac{1}{2}}{\\frac{3}{4}}$ are useful for baseline checks.

$$
\\frac{\\partial f}{\\partial x} = \\lim_{h\\to 0}\\frac{f(x+h)-f(x)}{h}
$$

$$
\\frac{1}{1 + \\frac{x}{1+x}} = \\frac{1+x}{1+2x}
$$`,
  `Roots and powers: $\\sqrt{2}$, $\\sqrt[3]{x}$, $e^{i\\pi}+1=0$, and $x^{y^z}$ should keep scripts compact.

$$
e^{i\\pi} + 1 = 0
$$

$$
\\sqrt{a^2 + b^2} = c
$$`,
  `Greek letters and relations: $\\mu$, $\\sigma^2$, $\\theta \\in [0, 2\\pi]$, and $\\lambda_1 \\le \\lambda_2$ should use the math fonts consistently.

$$
\\sigma^2 = \\frac{1}{n}\\sum_{i=1}^{n}(x_i - \\mu)^2
$$

$$
\\alpha + \\beta \\le \\gamma \\Rightarrow \\delta > 0
$$`,
  `Matrices and brackets are intentionally challenging for PDF glyph extraction.

$$
\\begin{pmatrix}
a & b \\\\
c & d
\\end{pmatrix}
\\begin{pmatrix}
x \\\\
y
\\end{pmatrix}
=
\\begin{pmatrix}
ax+by \\\\
cx+dy
\\end{pmatrix}
$$`,
  `Cases and piecewise layout test vertical alignment and brace sizing.

$$
f(x) =
\\begin{cases}
x^2, & x \\ge 0 \\\\
-x, & x < 0
\\end{cases}
$$

$$
|x| =
\\begin{cases}
x, & x \\ge 0 \\\\
-x, & x < 0
\\end{cases}
$$`,
  `Accents and decorated symbols: $\\hat{x}$, $\\bar{y}$, $\\vec{v}$, $\\tilde{f}$, and $\\dot{x}$ can reveal misplaced marks.

$$
\\vec{F} = m\\vec{a}
$$

$$
\\hat{\\theta} = \\arg\\max_{\\theta} L(\\theta)
$$`,
  `Delimiters and absolute values: $\\left(\\frac{x+1}{x-1}\\right)$, $\\left|x\\right|$, and $\\left\\lVert v \\right\\rVert$ should scale cleanly.

$$
\\left(\\frac{x+1}{x-1}\\right)^2 + \\left(\\frac{y+1}{y-1}\\right)^2 = 1
$$

$$
\\left\\lVert v \\right\\rVert = \\sqrt{v_1^2 + v_2^2 + \\cdots + v_n^2}
$$`,
  `Mixed equation stress test with integrals, fractions, sums, and symbols in one line.

$$
\\int_a^b f(x) dx \\approx \\sum_{i=1}^{n} f(x_i)\\Delta x
$$

$$
P(A \\mid B) = \\frac{P(B \\mid A)P(A)}{P(B)}
$$`
];

const longSections = Array.from({ length: 10 }, (_, index) => {
  const chapter = index + 1;
  return `# Long Example ${chapter}

This longer sample is meant to exercise live pagination, math placement, tables, code blocks, and PDF export over a document that feels closer to real notes. Each section has enough mixed content to make layout changes visible while editing.

## Notes

- The preview should keep this page independent from the editor scroll.
- Inline math such as $E = mc^2$ and $\\frac{a}{b}$ should keep the next words close.
- Display math should stay centered and match the downloaded PDF.

## Math Stress ${chapter}

${mathSuites[index % mathSuites.length]}

| Step | Operation | Expected result |
| --- | --- | --- |
| ${chapter}.1 | Parse Markdown | Stable normalized blocks |
| ${chapter}.2 | Measure content | Consistent text and math boxes |
| ${chapter}.3 | Paginate | Predictable page objects |
| ${chapter}.4 | Render | Matching SVG and PDF output |

## Code

\`\`\`ts
export function section${chapter}(value: number) {
  const scaled = value * ${chapter};
  return \`section-${chapter}: \${scaled}\`;
}
\`\`\`

## Discussion

Markdown is parsed into a small document model before layout begins. The page builder then walks blocks in order, measures line boxes, and creates display objects with absolute coordinates. This is the important idea behind the playground: preview and PDF export should not separately invent their own positions.

When formulas appear inline, the math renderer contributes a width, height, and advance. The surrounding words still belong to the same line, so editing a formula should only move nearby tokens by the amount the formula actually occupies.

The rest of this paragraph adds enough natural text to make the page feel lived in. A useful preview engine needs boring documents too: long paragraphs, repeated headings, dense tables, and plain prose are where small spacing errors become obvious.

${chapter < 10 ? "<!-- pagebreak -->" : ""}
`;
});

export const longSampleMarkdown = longSections.join("\n");

const hundredPageSections = Array.from({ length: 100 }, (_, index) => {
  const page = index + 1;
  const suite = mathSuites[index % mathSuites.length];
  return `# Hundred Page Stress ${page}

This synthetic page is designed to test scrolling, virtualized rendering, full-document layout, and PDF export across a larger Markdown document. It intentionally repeats a predictable structure while rotating through different math expressions.

## Inline Checks

Page ${page} includes inline math such as $E = mc^2$, $x_${page}^2 + y_${page}^2 = r^2$, $\\lambda_1 \\le \\lambda_2$, and $\\vec{v}_${page}$ inside ordinary prose. The text around the formulas should stay close and share a stable baseline.

## Rotating Math Suite

${suite}

## Table

| Page | Renderer focus | Expected behavior |
| --- | --- | --- |
| ${page} | Layout | Page objects stay stable |
| ${page} | Preview | Only nearby SVG pages render |
| ${page} | PDF | Export uses current display list |

## Paragraph

The rest of this page is plain prose so the stress test is not only equations. A large document needs predictable typography, stable scrolling, and quick edits even when most pages are off screen. This section gives the line breaker and paginator enough ordinary text to exercise common note-taking and report-writing workflows.

${page < 100 ? "<!-- pagebreak -->" : ""}
`;
});

export const hundredPageSampleMarkdown = hundredPageSections.join("\n");

export const mathHeavySampleMarkdown = `---
page:
  size: letter
  margin: 64
document:
  title: "Native Math Stress"
  titleFontSize: 34
  authors: ["SVG Markdown Preview Lab", "OpenType Math Engine"]
  abstract: "This sample exercises the native OpenMath path, cross references, GraphSX figures, tables, and multi-page pagination. It also demonstrates YAML-controlled title matter rendered before the document columns."
typography:
  family: libertinus
  fontSize: 12
  lineHeight: 1.45
layout:
  textAlign: justify
  lineBreaking:
    algorithm: greedy
    hyphenation: false
crossref:
  figure:
    captionFormat: "Fig. {number}:"
    referenceFormat: "Fig. {number}"
  table:
    captionFormat: "Table {number}."
    referenceFormat: "Table {number}"
  equation:
    captionFormat: "({number})"
    referenceFormat: "Eq. ({number})"
  section:
    referenceFormat: "Sec. {number}"
---

# Overview {#sec:native-math}

This sample is meant to be used with the **Native engine** math mode. It does not hide unsupported TeX behind KaTeX, so red markers show where our own parser/layout still needs work.

This note also tests YAML front matter. It asks for Libertinus OpenMath, custom cross-reference wording, and document-level page/theme settings. See @sec:native-math, @tbl:inline-math, @fig:phase, @fig:graphsx-routing, and @eq:energy.

## Inline Basics

Inline equations should keep the surrounding text close: $E = mc^2$, $x_i^2 + y_i^2 = r^2$, $\\alpha + \\beta = \\gamma$, and $\\lambda_1 \\le \\lambda_2$.

Fractions and roots should also stay on the baseline: $\\frac{a}{b}$, $\\frac{x+1}{x-1}$, $\\sqrt{x^2 + y^2}$, and $\\sqrt[3]{x}$.

## Tables With Math

| Quantity | Formula | Notes |
| :--- | :---: | ---: |
| Energy | $E = mc^2$ | inline baseline |
| Radius | $x_i^2 + y_i^2 = r^2$ | scripts |
| Ratio | $\\frac{a}{b}$ | fraction |
| Root | $\\sqrt{x^2 + y^2}$ | radical |
{: #tbl:inline-math}

| Operator | Display target | Check |
| :--- | :--- | :--- |
| Integral | $\\int_0^1 x^2 dx$ | limits sit near the symbol |
| Sum | $\\sum_{k=1}^{n} k$ | scripts stay attached |
| Limit | $\\lim_{n\\to\\infty} \\frac{1}{n}$ | operator remains upright |

| Family {: colspan=2} | Result |
| :--- | :---: | ---: |
| Quadratic {: rowspan=2} | $x^2 + y^2$ | baseline |
| $\\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$ | wide formula |
| Calculus | $\\left. \\frac{d}{dx}x^2 \\right|_{x=1}$ | delimiter scripts |

## Image With Caption

![Phase space sketch](data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20640%20360%22%3E%3Crect%20width%3D%22640%22%20height%3D%22360%22%20fill%3D%22%23f7fafc%22%2F%3E%3Cpath%20d%3D%22M70%20285H580M90%20310V45%22%20stroke%3D%22%231f2933%22%20stroke-width%3D%224%22%20fill%3D%22none%22%2F%3E%3Cpath%20d%3D%22M95%20255C170%20155%20245%20115%20320%20165S465%20255%20555%2095%22%20stroke%3D%22%23145ea8%22%20stroke-width%3D%226%22%20fill%3D%22none%22%2F%3E%3Ccircle%20cx%3D%22320%22%20cy%3D%22165%22%20r%3D%2210%22%20fill%3D%22%23b42318%22%2F%3E%3Ctext%20x%3D%22110%22%20y%3D%2275%22%20font-family%3D%22serif%22%20font-size%3D%2228%22%20fill%3D%22%231f2933%22%3E%CF%88(x)%3C%2Ftext%3E%3C%2Fsvg%3E "A small SVG image with a caption, centered under the image."){#fig:phase width=70% align=center}

## GraphSX Figure

\`\`\`graphsx width=80% align=center caption="GraphSX uses its own routing and anchors."
<Graph route="auto" corner={8}>
  <Style id="box" fill="#eef6ff" stroke="#1d4ed8" strokeWidth={2} />
  <Style id="wire" stroke="#7c3aed" strokeWidth={2.6} />

  <Rect id="A" at={[80, 90]} size={[110, 62]} label="$\\alpha$" useStyle="box">
    <Port id="out" right label="$x$" />
  </Rect>
  <Rect id="B" at={[310, 70]} size={[120, 72]} label="$H$" useStyle="box">
    <Port id="in" left />
    <Port id="out" bottom />
  </Rect>
  <Circle id="C" at={[292, 230]} r={38} label="$\\psi$">
    <Port id="in" top />
  </Circle>

  <Link headArrow from="A.out" to="B.in" useStyle="wire" />
  <Link headArrow from="B.out" to="C.in" useStyle="wire" />
</Graph>
\`\`\`
{#fig:graphsx-routing}

## Display Basics

$$
E = mc^2
$$
{#eq:energy}

$$
\\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}
$$

$$
\\int_0^1 x^2 dx = \\frac{1}{3}
$$

$$
\\sum_{k=1}^{n} k = \\frac{n(n+1)}{2}
$$

## Maxwell

$$
\\nabla \\cdot \\mathbf{E} = \\frac{\\rho}{\\varepsilon_0} \\qquad
\\nabla \\cdot \\mathbf{B} = 0
$$

$$
\\nabla \\times \\mathbf{E} = -\\frac{\\partial \\mathbf{B}}{\\partial t} \\qquad
\\nabla \\times \\mathbf{B} = \\mu_0\\mathbf{J} + \\mu_0\\varepsilon_0\\frac{\\partial \\mathbf{E}}{\\partial t}
$$

## Accents And Operators

These are expected to expose missing native rules: $\\hat{x}$, $\\bar{y}$, $\\vec{v}$, $\\tilde{f}$, $\\dot{x}$, $\\lim_{n \\to \\infty} \\frac{1}{n} = 0$.

$$
\\vec{F} = m\\vec{a}
$$

$$
\\hat{\\theta} = \\arg\\max_{\\theta} L(\\theta)
$$

## Unsupported Environments

Matrix-like environments should stack rows and scale their delimiters.

$$
\\begin{vmatrix} a & b \\\\ c & d \\end{vmatrix}
\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}
\\begin{pmatrix} x \\\\ y \\end{pmatrix} =
\\begin{pmatrix} ax + by \\\\ cx + dy \\end{pmatrix}
$$

$$
f(x) =
\\begin{cases}
x^2, & x \\ge 0 \\\\
-x, & x < 0
\\end{cases}
$$

## Delimiters

$$
\\left(\\frac{x+1}{x-1}\\right)^2 + \\left|x\\right| = 1
$$

$$
\\left[\\frac{1}{1 + \\frac{x}{y}}\\right]
+ \\left\\langle \\sqrt{x^2 + y^2} \\right\\rangle
+ \\left. \\frac{d}{dx} x^2 \\right|_{x=1}
$$

## Bra Ket

Inline quantum notation: $\\bra{\\psi} H \\ket{\\phi}$ and $\\left\\langle \\psi | \\phi \\right\\rangle$ should keep delimiters close to the content.

$$
\\bra{0} A \\ket{1} = \\frac{1}{\\sqrt{2}}
$$
`;

export const graphsxDebugSampleMarkdown = `# GraphSX Debug

This page is intentionally small so the GraphSX display list and PDF coordinates are easy to inspect.

## Simple Graph

\`\`\`graphsx width=80% align=center caption="GraphSX debug: two nodes, one routed link, one explicit path, and math labels."
<Graph route="auto" corner={8}>
  <Style id="node" fill="#eef6ff" stroke="#1d4ed8" strokeWidth={2} />
  <Style id="wire" stroke="#7c3aed" strokeWidth={2.5} />
  <Style id="path" stroke="#b42318" strokeWidth={3} fill="none" />

  <Rect id="A" at={[80, 80]} size={[96, 56]} label="$A$" useStyle="node">
    <Port id="out" right label="$x$" />
  </Rect>
  <Rect id="B" at={[300, 160]} size={[96, 56]} label="$B$" useStyle="node">
    <Port id="in" left label="$y$" />
  </Rect>

  <Link headArrow from="A.out" to="B.in" useStyle="wire" />
  <Path d="M 70 230 C 130 180 210 280 280 230 S 380 190 430 230" useStyle="path" />
</Graph>
\`\`\`

## Plot Path

\`\`\`graphsx width=80% align=center caption="GraphSX debug: plot path coordinates."
<Plot width={620} height={380} padding={[54, 64, 70, 74]} xDomain={[-1, 1]} yDomain={[-1.1, 1.1]} frame box>
  <Data id="root" y="sqrt(x)" domain={[-1, 1]} samples={220} />

  <Axis x label="$x$" ticks grid />
  <Axis y label="$\\sqrt{x}$" ticks grid />

  <Line data="root" stroke="#2563eb" strokeWidth={2.5} label="real" />
  <Line data="root" yMap="imag(y)" stroke="#dc2626" strokeWidth={2.5} strokeDasharray="7 5" label="imag" />
  <Line data="root" yMap="abs(y)" stroke="#16a34a" strokeWidth={2} strokeDasharray="2 4" label="abs" />
  <Text at={[-0.42, 0.68]} label="$y=\\sqrt{x}$" fontSize={22} />
  <Legend position="bottom-right" />
</Plot>
\`\`\`
`;

export const multiColumnSampleMarkdown = `---
page:
  size: letter
  margin: 64
typography:
  family: libertinus
  fontSize: 11
  lineHeight: 1.42
layout:
  columns:
    count: 2
    gap: 28
  textAlign: justify
  lineBreaking:
    algorithm: greedy
    hyphenation: true
---

# Two Column Note

This sample uses front matter to flow the document into two columns. The layout engine still generates positioned SVG page objects, so the preview and PDF export share the same page geometry. The point of this page is to exercise regular prose, inline math like $E = mc^2$, and ordinary headings inside a narrower measure.

## Motivation

Multi-column text is useful for compact notes, handouts, abstracts, and papers where a single wide measure would make each line too long. A good column layout should keep paragraphs readable, move to the next column when the current one fills, and continue onto the next page only after the last column is full.

The current implementation is intentionally document-level: the YAML option controls the whole page flow. Later we can add block-level spans for wide figures, tables, and display equations, but this version keeps the behavior predictable.

## Example Flow

Long paragraphs should wrap within the active column width. When hyphenation is enabled, extremely long words such as electromagnetohydrodynamics and pseudopseudohypoparathyroidism can break more gracefully instead of forcing awkward character-level wrapping.

Inline equations such as $x_i^2 + y_i^2 = r^2$, $\\alpha + \\beta = \\gamma$, and $\\frac{a}{b}$ should stay on the same baseline as the surrounding text. Display math is centered within the current column:

$$
\\int_0^1 x^2 dx = \\frac{1}{3}
$$

## Second Column Pressure

This paragraph exists to push the flow across the first column boundary. The preview should fill the left column first, continue at the top of the right column, and then create another page only when both columns have been used. The behavior should be visible in both the SVG preview and the downloaded PDF.

Tables and figures currently fit inside the active column rather than spanning across the page. That is conservative but useful for testing:

| Item | Value |
| --- | ---: |
| Width | column |
| Flow | sequential |
| Math | $\\sqrt{x}$ |

More prose fills out the remaining space. A balanced final page is not implemented yet; this is newspaper-style sequential flow rather than a balancing pass. That keeps live preview fast and makes pagination stable while editing.
`;

export const transformerReplicaSampleMarkdown = `---
page:
  size: letter
  margin: 54
document:
  title: "Sparse Attention Blocks for Sequence Modeling"
  titleFontSize: 24
  authors: ["Mira Chen    Theo Alvarez    Priya Nandakumar    Elias Hart", "Jun Park    Sofia Marin    Rowan Keller    Anika Bose", "Synthetic conference-paper layout replica for SVG Markdown Preview"]
  abstract: "This playground page mimics the visual shape of a Transformer-style research paper with our own text engine: title block, abstract, two-column flow, equations, figures, tables, captions, and references. The title, authors, and prose are synthetic so the example stresses layout without copying the original paper."
typography:
  family: latin-modern
  fontSize: 10
  lineHeight: 1.22
layout:
  columns:
    count: 2
    gap: 18
  headingFontSizes:
    h1: 13
    h2: 11.5
    h3: 10.5
  textAlign: justify
  lineBreaking:
    algorithm: greedy
    hyphenation: true
crossref:
  figure:
    captionFormat: "Figure {number}:"
    referenceFormat: "Figure {number}"
  table:
    captionFormat: "Table {number}:"
    referenceFormat: "Table {number}"
  equation:
    captionFormat: "({number})"
    referenceFormat: "Equation ({number})"
  section:
    captionFormat: "{number}"
    referenceFormat: "Section {number}"
---

# Introduction {#sec:introduction}

Sequence transduction systems traditionally process tokens through recurrent or convolutional structures. A compact alternative is to compare every position with every other position through attention, then use pointwise transformations to refine the representation. This replica is written to exercise page-level typography rather than to reproduce the paper text word for word.

The important visual target is the paper shape: narrow justified columns, small mathematical displays, numbered sections, figure captions below wide diagrams, and tables that sit naturally in a column. The example references @fig:architecture, @fig:attention, @tbl:complexity, and @eq:attention to test cross references.

The model maps an input sequence $(x_1, \\ldots, x_n)$ to latent states $(z_1, \\ldots, z_n)$ and then generates outputs $(y_1, \\ldots, y_m)$ autoregressively. The notation is intentionally close to the source paper because it exercises subscripts, ellipses, and inline math spacing.

# Background {#sec:background}

The synthetic discussion in this section is dense on purpose. A line breaker that works for notes can still show weaknesses in conference-paper columns, especially when a sentence contains citations, long technical words, or repeated inline variables such as $d_{model}$, $d_k$, and $d_v$.

Self-attention relates positions inside one sequence. Multi-head attention repeats that operation in several learned subspaces. The paper format places this explanation before the architecture figure, which means the first page must balance title matter, abstract, prose, and a figure anchor.

\`\`\`graphsx width=100% align=center caption="The Transformer - model architecture."
<Graph route="auto" corner={6}>
  <Style id="block" fill="#f8fafc" stroke="#334155" strokeWidth={1.2} />
  <Style id="attention" fill="#eef6ff" stroke="#2563eb" strokeWidth={1.3} />
  <Style id="ffn" fill="#fff7ed" stroke="#ea580c" strokeWidth={1.3} />
  <Style id="wire" stroke="#475569" strokeWidth={1.1} />

  <Rect id="input" at={[38, 250]} size={[110, 28]} label="Input Embedding" useStyle="block">
    <Port id="out" top />
  </Rect>
  <Rect id="pos" at={[38, 210]} size={[110, 28]} label="Positional Encoding" useStyle="block">
    <Port id="in" bottom />
    <Port id="out" top />
  </Rect>
  <Rect id="enc1" at={[38, 150]} size={[110, 36]} label="Multi-Head Attention" useStyle="attention">
    <Port id="in" bottom />
    <Port id="out" top />
  </Rect>
  <Rect id="enc2" at={[38, 92]} size={[110, 36]} label="Feed Forward" useStyle="ffn">
    <Port id="in" bottom />
    <Port id="out" top />
  </Rect>
  <Rect id="encN" at={[38, 38]} size={[110, 30]} label="$N\\\\times$" useStyle="block">
    <Port id="in" bottom />
    <Port id="toDecoder" right />
  </Rect>

  <Rect id="out" at={[230, 250]} size={[120, 28]} label="Output Embedding" useStyle="block">
    <Port id="out" top />
  </Rect>
  <Rect id="opos" at={[230, 210]} size={[120, 28]} label="Positional Encoding" useStyle="block">
    <Port id="in" bottom />
    <Port id="out" top />
  </Rect>
  <Rect id="dec1" at={[230, 162]} size={[120, 34]} label="Masked Attention" useStyle="attention">
    <Port id="in" bottom />
    <Port id="out" top />
  </Rect>
  <Rect id="dec2" at={[230, 112]} size={[120, 34]} label="Encoder Attention" useStyle="attention">
    <Port id="in" bottom />
    <Port id="memory" left />
    <Port id="out" top />
  </Rect>
  <Rect id="dec3" at={[230, 62]} size={[120, 34]} label="Feed Forward" useStyle="ffn">
    <Port id="in" bottom />
    <Port id="out" top />
  </Rect>
  <Rect id="softmax" at={[230, 16]} size={[120, 28]} label="Linear + Softmax" useStyle="block">
    <Port id="in" bottom />
  </Rect>

  <Link headArrow from="input.out" to="pos.in" useStyle="wire" />
  <Link headArrow from="pos.out" to="enc1.in" useStyle="wire" />
  <Link headArrow from="enc1.out" to="enc2.in" useStyle="wire" />
  <Link headArrow from="enc2.out" to="encN.in" useStyle="wire" />
  <Link headArrow from="out.out" to="opos.in" useStyle="wire" />
  <Link headArrow from="opos.out" to="dec1.in" useStyle="wire" />
  <Link headArrow from="dec1.out" to="dec2.in" useStyle="wire" />
  <Link headArrow from="dec2.out" to="dec3.in" useStyle="wire" />
  <Link headArrow from="dec3.out" to="softmax.in" useStyle="wire" />
  <Link headArrow from="encN.toDecoder" to="dec2.memory" useStyle="wire" />
</Graph>
\`\`\`
{#fig:architecture}

# Model Architecture {#sec:architecture}

The encoder and decoder are built from repeated layers. Each layer combines an attention sublayer, a position-wise feed-forward sublayer, residual connections, and normalization. The exact graphical fidelity is not the point here; the engine target is whether a figure of this size occupies one column, carries a caption, and can be referenced later.

The residual pattern is compact enough to expose inline formula spacing:

$$
LayerNorm(x + Sublayer(x))
$$

Both encoder and decoder use learned projections. The display equations below test stacked scripts, matrix products, and equation numbering.

# Attention {#sec:attention}

The scaled dot-product attention equation is one of the key stressors. It combines uppercase matrices, a transpose, a square root in the denominator, and a softmax expression.

$$
Attention(Q, K, V) = softmax\\left(\\frac{QK^T}{\\sqrt{d_k}}\\right)V
$$
{#eq:attention}

Multi-head attention concatenates separate attention results and applies a final output projection:

$$
MultiHead(Q, K, V) = Concat(head_1, \\ldots, head_h)W^O
$$

$$
head_i = Attention(QW_i^Q, KW_i^K, VW_i^V)
$$

\`\`\`graphsx width=100% align=center caption="Scaled dot-product attention and multi-head attention blocks."
<Graph route="auto" corner={8}>
  <Style id="box" fill="#f8fafc" stroke="#334155" strokeWidth={1.1} />
  <Style id="blue" fill="#eff6ff" stroke="#2563eb" strokeWidth={1.2} />
  <Style id="green" fill="#ecfdf5" stroke="#16a34a" strokeWidth={1.2} />
  <Style id="wire" stroke="#475569" strokeWidth={1.0} />
  <Rect id="qk" at={[34, 58]} size={[92, 28]} label="$QK^T$" useStyle="blue">
    <Port id="out" bottom />
  </Rect>
  <Rect id="scale" at={[34, 104]} size={[92, 28]} label="$1/\\\\sqrt{d_k}$" useStyle="box">
    <Port id="in" top />
    <Port id="out" bottom />
  </Rect>
  <Rect id="soft" at={[34, 150]} size={[92, 28]} label="Softmax" useStyle="green">
    <Port id="in" top />
    <Port id="out" bottom />
  </Rect>
  <Rect id="v" at={[34, 196]} size={[92, 28]} label="$V$" useStyle="box">
    <Port id="in" top />
  </Rect>

  <Rect id="heads" at={[200, 58]} size={[120, 36]} label="$h$ attention heads" useStyle="blue">
    <Port id="out" bottom />
  </Rect>
  <Rect id="concat" at={[200, 120]} size={[120, 30]} label="Concat" useStyle="green">
    <Port id="in" top />
    <Port id="out" bottom />
  </Rect>
  <Rect id="linear" at={[200, 176]} size={[120, 30]} label="Linear" useStyle="box">
    <Port id="in" top />
  </Rect>
  <Link headArrow from="qk.out" to="scale.in" useStyle="wire" />
  <Link headArrow from="scale.out" to="soft.in" useStyle="wire" />
  <Link headArrow from="soft.out" to="v.in" useStyle="wire" />
  <Link headArrow from="heads.out" to="concat.in" useStyle="wire" />
  <Link headArrow from="concat.out" to="linear.in" useStyle="wire" />
</Graph>
\`\`\`
{#fig:attention}

# Why Self-Attention {#sec:why}

The conference paper includes a comparison table for layer types. Here the values are compactly reproduced as a layout target: centered formulas, row borders, and narrow text in a two-column measure.

| Layer Type | Complexity per Layer | Sequential Operations | Maximum Path Length |
| --- | ---: | ---: | ---: |
| Self-Attention | $O(n^2 d)$ | $O(1)$ | $O(1)$ |
| Recurrent | $O(n d^2)$ | $O(n)$ | $O(n)$ |
| Convolutional | $O(k n d^2)$ | $O(1)$ | $O(log_k(n))$ |
| Restricted Self-Attention | $O(r n d)$ | $O(1)$ | $O(n/r)$ |
{: #tbl:complexity}

Narrow tables are particularly useful here because their columns invite overflow. If the text engine can keep this table readable while preserving math baselines, it is getting closer to a usable paper-writing tool.

# Training {#sec:training}

The original paper reports results for translation tasks and uses compact hyperparameter prose. This replica uses similar density without copying the original paragraphs. A training step consumes mini-batches of token pairs, computes cross-entropy, applies label smoothing, and updates parameters with Adam.

The learning-rate schedule is a useful equation test:

$$
lrate = d_{model}^{-0.5} \\cdot min(step^{-0.5}, step \\cdot warmup^{-1.5})
$$

The notation includes negative exponents, a function-like minimum, and products that should not collide in the small font size.

# Results {#sec:results}

| Model | EN-DE BLEU | EN-FR BLEU | Training Cost |
| --- | ---: | ---: | ---: |
| Base Transformer | 27.3 | 38.1 | 12 hours |
| Big Transformer | 28.4 | 41.8 | 3.5 days |
| Prior ensembles | 26-28 | 40-41 | larger |

This table is not intended as a source of truth for new research results; it is here to match the visual density of the paper and to test right-aligned numeric columns, captions, and multi-column flow.

# Conclusion {#sec:conclusion}

The Transformer paper format is a good target for the previewer because it combines almost every feature a technical text engine needs: title matter, dense columns, equations, diagrams, numbered captions, tables, references, and PDF export. A faithful production reproduction would still need footnotes, bibliography styling, figure spanning, better float placement, and richer math coverage.

# References

[1] A. Author. A compact reference entry with a title, venue, and year.

[2] B. Researcher and C. Collaborator. Another reference line that wraps across columns and tests hanging indentation in a future version.

[3] The real source for this layout target is arXiv:1706.03762, "Attention Is All You Need". This example is a structural replica, not a full-text copy.
`;

export const playgroundSamples = {
  short: sampleMarkdown,
  long: longSampleMarkdown,
  hundred: hundredPageSampleMarkdown,
  mathHeavy: mathHeavySampleMarkdown,
  graphsxDebug: graphsxDebugSampleMarkdown,
  multiColumn: multiColumnSampleMarkdown,
  transformerReplica: transformerReplicaSampleMarkdown
} as const;
