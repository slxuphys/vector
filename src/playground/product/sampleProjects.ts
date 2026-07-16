import { productExamples, sampleBibliography } from "./productExamples";
import type { PlaygroundProject } from "./projectTypes";

export const sampleProjects: PlaygroundProject[] = [
  {
    id: "markdown-note",
    name: "Markdown note",
    kind: "example",
    entryFile: "note.md",
    directories: [],
    files: [
      { kind: "text", path: "note.md", language: "markdown", content: productExamples.markdownNote },
      { kind: "text", path: "references.bib", language: "bibtex", content: sampleBibliography }
    ]
  },
  {
    id: "latex-article",
    name: "LaTeX article",
    kind: "example",
    entryFile: "article.tex",
    directories: [],
    files: [
      { kind: "text", path: "article.tex", language: "latex", content: productExamples.latexArticle },
      { kind: "text", path: "references.bib", language: "bibtex", content: sampleBibliography }
    ]
  },
  {
    id: "revtex-paper",
    name: "REVTeX two-column",
    kind: "example",
    entryFile: "paper.tex",
    directories: [],
    files: [
      { kind: "text", path: "paper.tex", language: "latex", content: productExamples.latexRevtex },
      { kind: "text", path: "references.bib", language: "bibtex", content: sampleBibliography }
    ]
  }
];
