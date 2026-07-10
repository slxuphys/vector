# Vector VS Code Extension

This package is the VS Code shell for the shared Vector text engine.

The extension uses:

- VS Code's built-in editor for source editing.
- VS Code's workspace filesystem for project assets.
- A webview for the paginated preview.
- The shared core engine for parsing, layout, SVG preview, and PDF export.

The extension is built as two independent bundles:

- `dist/extension.js` is the Node extension host and contains VS Code APIs, the engine, and message routing.
- `webview-dist/` is the browser bundle containing React, the VS Code webview adapter, and the shared `PreviewSurface` from `src/react/preview`.

Run `npm run compile` from this directory to build both bundles. `webview-dist` is generated output and is not committed.
