export type ProductFormat = "markdown" | "latex";
export type ProductExampleKey = "markdownNote" | "latexArticle" | "latexRevtex";

export const sampleBibliography = `@article{shor1995,
  author = {Peter W. Shor},
  title = {Scheme for reducing decoherence in quantum computer memory},
  journal = {Physical Review A},
  year = {1995}
}

@book{knuth1984,
  author = {Donald E. Knuth},
  title = {The TeXbook},
  publisher = {Addison-Wesley},
  year = {1984}
}`;

export const productExamples = {
  markdownNote: `---
document:
  title: "Vector Preview"
  authors: ["Fast SVG/PDF text engine"]
  abstract: "A compact product-mode document for testing the normal editor and preview path without loading the full debug lab."
typography:
  family: latin-modern
  fontSize: 11
  lineHeight: 1.35
layout:
  textAlign: justify
bibliography: references.bib
---

# A Clean Preview

This product surface keeps the editor, paginated SVG preview, and PDF export while avoiding the debug lab controls. Inline math such as $E = mc^2$ and $\\frac{a}{b}$ should keep the same baseline as the surrounding text.

## Figure And Equation

$$
\\int_0^1 x^2\\,dx = \\frac{1}{3}
$$

The preview renders only nearby pages and uses the same display list for PDF export.

The underlying layout model remains intentionally small [@knuth1984].

::: bibliography
:::
`,
  latexArticle: `\\documentclass{article}
\\usepackage{amsmath}
\\title{Fast Live Preview for Scientific Writing}
\\author{Ada Vector \\and Emmy Layout}

\\begin{document}
\\maketitle

\\begin{abstract}
We demonstrate a practical LaTeX subset rendered by the Vector text engine. The preview path is intentionally fast while final edge cases can still be delegated to a full LaTeX compiler.
\\end{abstract}

\\section{Introduction}
Daily LaTeX writing often waits on the full compiler. A live engine can parse common structure, inline math such as $E = mc^2$, and references such as \\ref{sec:math} without leaving the editor.

\\section{Math}
\\label{sec:math}
Display equations keep labels and equation references.

\\begin{equation}
\\int_0^1 x^2\\,dx = \\frac{1}{3}
\\label{eq:integral}
\\end{equation}

Equation \\eqref{eq:integral} is generated from the same display list as the preview.

\\section{TikZ diagrams}
TikZ pictures are parsed into the same neutral vector display list used by GraphSX. The first example uses named styles, node anchors, math labels, and multiple path styles.

\\begin{figure}
\\begin{tikzpicture}
\\tikzset{
  state/.style={circle, draw=blue, fill=blue!10, very thick, minimum size=.8cm},
  process/.style={rectangle, draw=black, fill=white, thick, rounded corners=.08cm, minimum width=1.2cm, minimum height=.6cm}
}
\\node[state] (input) at (0,0) {$|\\psi\\rangle$};
\\node[process] (gate) at (2,0) {$U$};
\\node[state] (output) at (4,0) {$|\\phi\\rangle$};
\\draw[->, very thick] (input.east) -- (gate.west);
\\draw[->, very thick] (gate.east) -- (output.west);
\\draw[dashed] (input.south) |- (output.south);
\\end{tikzpicture}
\\caption{A TikZ state-transition diagram rendered as selectable SVG and vector PDF geometry.}
\\label{fig:tikz-flow}
\\end{figure}

Figure \\ref{fig:tikz-flow} follows normal figure layout and caption rules. A compact picture can also participate directly in a math sequence, following the preceding token and centering on the math axis:

\\begin{equation}
A \\;\\begin{tikzpicture}
\\coordinate (left) at (0,0);
\\coordinate (right) at (.8,0);
\\draw[->, thick] (left) -- (right);
\\end{tikzpicture}\\; B
\\end{equation}

This example cites \\cite{knuth1984}.

\\bibliography{references}

\\end{document}
`,
  latexRevtex: `\\documentclass[aps,prd,10pt,twocolumn]{revtex4-2}
\\usepackage{amsmath}
\\title{Fast Live Preview for Scientific Writing}
\\author{Ada Vector}
\\affiliation{Department of Computational Glyphs \& Symbolic Systems, Asteria University, College Station, Texas 77843, USA}
\\author{Emmy Layout}
\\email{emmy.layout@meridian-moon.example}
\\affiliation{Department of Computational Glyphs \& Symbolic Systems, Asteria University, College Station, Texas 77843, USA}

\\begin{document}
\\maketitle

\\begin{abstract}
This short REVTeX-style sample checks title matter, abstract layout, two-column flow, and compact equation rendering in product mode.
\\end{abstract}

\\section{Introduction}
Scientific notation and compact prose provide a useful stress test for dense technical layouts. The text engine should preserve compact columns and keep inline math such as $E=mc^2$ aligned with the surrounding text.

The standard error-correction construction is discussed in \\cite{shor1995}.

\\section{Setup and notation}
We consider a channel $\\mathcal{E}$ acting on a state $\\rho$ and write a representative expression as
\\begin{equation}
\\mathcal{E}(\\rho)=\\sum_i E_i \\rho E_i^\\dagger .
\\end{equation}

\\bibliography{references}

\\end{document}
`
} as const;

export const productExamplesByFormat = {
  markdown: {
    markdownNote: productExamples.markdownNote
  },
  latex: {
    latexArticle: productExamples.latexArticle,
    latexRevtex: productExamples.latexRevtex
  }
} as const;

export const productExampleLabels: Record<ProductExampleKey, string> = {
  markdownNote: "Markdown note",
  latexArticle: "LaTeX article",
  latexRevtex: "REVTeX two-column"
};
