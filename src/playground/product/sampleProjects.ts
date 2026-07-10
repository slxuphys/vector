import { productExamples } from "./productExamples";
import type { PlaygroundProject } from "./projectTypes";

export const sampleProjects: PlaygroundProject[] = [
  {
    id: "markdown-note",
    name: "Markdown note",
    kind: "example",
    entryFile: "note.md",
    files: [{ path: "note.md", language: "markdown", content: productExamples.markdownNote }]
  },
  {
    id: "latex-article",
    name: "LaTeX article",
    kind: "example",
    entryFile: "article.tex",
    files: [{ path: "article.tex", language: "latex", content: productExamples.latexArticle }]
  },
  {
    id: "revtex-paper",
    name: "REVTeX two-column",
    kind: "example",
    entryFile: "paper.tex",
    files: [{ path: "paper.tex", language: "latex", content: productExamples.latexRevtex }]
  }
];
