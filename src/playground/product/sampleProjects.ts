import {
  hundredPageSampleMarkdown,
  mathHeavySampleMarkdown,
  multiColumnSampleMarkdown
} from "../sampleMarkdown";
import { productExamples, sampleBibliography } from "./productExamples";
import type { PlaygroundProject } from "./projectTypes";

export const sampleProjects: PlaygroundProject[] = [
  {
    id: "vector-examples",
    name: "Vector examples",
    kind: "example",
    entryFile: "markdown/math-heavy.md",
    directories: ["markdown", "latex", "stress-tests"],
    files: [
      { kind: "text", path: "markdown/math-heavy.md", language: "markdown", content: mathHeavySampleMarkdown },
      { kind: "text", path: "markdown/two-column.md", language: "markdown", content: multiColumnSampleMarkdown },
      { kind: "text", path: "latex/article.tex", language: "latex", content: productExamples.latexArticle },
      { kind: "text", path: "latex/revtex.tex", language: "latex", content: productExamples.latexRevtex },
      { kind: "text", path: "stress-tests/hundred-pages.md", language: "markdown", content: hundredPageSampleMarkdown },
      { kind: "text", path: "latex/references.bib", language: "bibtex", content: sampleBibliography }
    ]
  }
];
