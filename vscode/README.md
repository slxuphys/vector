# Vector VS Code Extension

This package is the VS Code shell for the shared Vector text engine.

The extension uses:

- VS Code's built-in editor for source editing.
- VS Code's workspace filesystem for project assets.
- A webview for the paginated preview.
- The shared core engine for parsing, layout, SVG preview, and PDF export.

The current implementation wires the command shell and live document bridge. The next step is to bundle the shared React preview pane into the webview.
