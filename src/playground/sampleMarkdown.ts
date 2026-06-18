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

const longSections = Array.from({ length: 10 }, (_, index) => {
  const chapter = index + 1;
  return `# Long Example ${chapter}

This longer sample is meant to exercise live pagination, math placement, tables, code blocks, and PDF export over a document that feels closer to real notes. Each section has enough mixed content to make layout changes visible while editing.

## Notes

- The preview should keep this page independent from the editor scroll.
- Inline math such as $E = mc^2$ and $\\frac{a}{b}$ should keep the next words close.
- Display math should stay centered and match the downloaded PDF.

$$
\\int_0^1 x^${chapter + 1} dx = \\frac{1}{${chapter + 2}}
$$

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

export const playgroundSamples = {
  short: sampleMarkdown,
  long: longSampleMarkdown
} as const;
