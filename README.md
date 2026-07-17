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
src/core/plugins/api/      public plugin contracts and host services
src/core/plugins/builtin/  Vector's first-party plugins
src/react/       reusable editor and preview components
src/playground/  product workspace and local debug lab
src/assets/      bundled text and math fonts
vscode/          VS Code extension host and webview
tests/           unit and integration coverage
```

## Plugins

Plugins can extend Markdown inline syntax, directives and fences; LaTeX inline transforms, commands, environments and document classes; document-wide AST transforms; normalization; and layout. Passing a plugin array adds it to Vector's built-in plugins:

```ts
import { createDocumentEngine, type VectorPlugin } from "vector-text-engine";

const noticePlugin: VectorPlugin = {
  metadata: {
    name: "example/notice",
    version: "1.0.0",
    apiVersion: "1"
  },
  markdown: {
    fences: {
      notice: ({ source, sourceSpan }) => ({
        type: "plugin",
        plugin: "example/notice",
        kind: "notice",
        data: { text: source.trim() },
        sourceSpan
      })
    }
  },
  ast: {
    normalizers: {
      notice: (node) => node.type === "plugin" ? {
        type: "plugin",
        plugin: node.plugin,
        kind: node.kind,
        data: node.data,
        source: node.sourceSpan
      } : undefined
    }
  },
  layout: {
    handlers: {
      notice: (block, context) => ({
        width: 120,
        height: 24,
        objects: [{
          type: "text",
          text: (block.data as { text: string }).text,
          x: 4,
          y: 16,
          fontSize: context.theme.fontSize,
          fontFamily: context.theme.fontFamily,
          color: context.theme.text
        }]
      })
    }
  }
};

const engine = createDocumentEngine({ plugins: [noticePlugin] });
```

Block and inline plugin nodes are namespaced by plugin and kind. Layout handlers return canonical display objects, so SVG preview and PDF export share the same geometry. `setup(host)` gives plugins controlled access to diagnostics, text measurement, native math layout, and namespaced caches. Document plugins can use `prepareDocument`, `transformAst`, `finalizeDocument`, and `disposeDocument`; the same per-document state is available to parser handlers and lifecycle hooks. Lifecycle hooks receive the document's `resources` provider for document-relative text, binary, and URL access. Hooks may be asynchronous when the document is laid out with `createDocumentEngine().layout()`.

```ts
import { createDocumentEngine, createMemoryResourceProvider } from "vector-text-engine";

const resources = createMemoryResourceProvider({
  text: { "paper/references.bib": bibtexSource },
  urls: { "paper/figures/result.svg": resultSvgUrl }
});

const engine = createDocumentEngine({
  sourcePath: "paper/main.md",
  resources
});
```

The built-in bibliography package owns Markdown citation syntax, the bibliography directive, LaTeX citation conversion, resource loading, and document-wide resolution without an engine-level special case. Advanced consumers can still pass a `VectorPluginRegistry` as a complete registry override.

## GitHub Pages

The Pages workflow compiles the playground with `VITE_PRODUCT_BUILD=true`. Vite removes the unreachable lab import, so the lab code and controls are absent from the deployed artifact.

In the repository settings, set **Pages > Build and deployment > Source** to **GitHub Actions**. Pushes to `master` then test, build, and deploy `dist-product/` automatically.

## License

No license has been selected yet.
