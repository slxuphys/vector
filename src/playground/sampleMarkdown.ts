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

export const playgroundSamples = {
  short: sampleMarkdown,
  long: longSampleMarkdown,
  hundred: hundredPageSampleMarkdown
} as const;
