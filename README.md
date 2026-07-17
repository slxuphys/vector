# Vector

[Open Vector in your browser](https://slxuphys.github.io/vector/)

Vector is a frontend-first scientific typesetting engine for Markdown and a practical LaTeX subset. It produces a fast, paginated SVG preview and exports PDF from the same canonical display list.

The project currently includes:

- selectable SVG text with virtualized page rendering;
- native OpenType math layout and font-driven metrics;
- Markdown and LaTeX parsers targeting a shared document model;
- figures, tables, citations, cross-references, multi-column layouts, and PDF export;
- GraphSX and TikZ display-list integration;
- browser projects, local-folder editing, and a VS Code extension.

Vector is under active development. It aims to cover practical scientific-writing workflows while keeping preview updates substantially faster than a full LaTeX compilation.

## Try It

The debug lab is intentionally excluded from GitHub Pages. It remains available during local development for math-metric tuning and diagnostics.

## Local Development

Requirements: Node.js 22 or newer and npm.

```sh
npm ci
npm run dev
```

Open the URL printed by Vite. The normal URL opens the product; append `?mode=lab` to open the local debug lab.

## Build And Test

```sh
npm test
npm run build
npm run build:playground
npm run build:product
```

- `build` creates the reusable library bundle in `dist/`.
- `build:playground` creates the complete local playground, including the lab, in `dist-playground/`.
- `build:product` creates the public product-only site in `dist-product/`.
- `preview:product` serves the product build locally after it has been built.

## Repository Layout

```text
src/core/        parsing, layout, pagination, display lists, SVG, and PDF
src/react/       reusable editor and preview components
src/playground/  product workspace and local debug lab
src/assets/      bundled text and math fonts
vscode/          VS Code extension host and webview
tests/           unit and integration coverage
```

## GitHub Pages

The Pages workflow compiles the playground with `VITE_PRODUCT_BUILD=true`. Vite removes the unreachable lab import, so the lab code and controls are absent from the deployed artifact.

In the repository settings, set **Pages > Build and deployment > Source** to **GitHub Actions**. Pushes to `master` then test, build, and deploy `dist-product/` automatically.

## License

No license has been selected yet.
