# GraphSX Integration

## Goal

Treat GraphSX as a first-class layout producer inside the paginated Markdown engine, not as an opaque SVG blob.

## Markdown Surface

Use fenced code blocks for GraphSX figures:

```md
```graphsx
<Graph>
  <Rect id="A" at={[70, 82]} size={[100, 60]} label="$A_i$">
    <Port id="out" right />
  </Rect>
  <Circle id="B" at={[280, 112]} r={40} label="B">
    <Port id="in" left />
  </Circle>
  <Link headArrow from="A.out" to="B.in" />
</Graph>
```
```

The Markdown parser can keep this as a normal `codeBlock` with `language: "graphsx"` first. The layout layer should route it to a figure layout adapter.

## Core Idea

GraphSX should own:

- JSX-like DSL parsing.
- Component expansion, repeats, and reusable shapes.
- Diagram geometry.
- Ports, links, arrows, axes, plots, and routing.

The text engine should own:

- Label measurement.
- Text and math layout.
- Font metrics and baselines.
- SVG text/glyph rendering.
- PDF text/math export.

This avoids duplicating math/text behavior inside GraphSX and keeps document preview/PDF output aligned.

## Suggested Boundary

GraphSX core should accept a host label measurer:

```ts
type LabelBox = {
  width: number;
  height: number;
  baseline: number;
};

type GraphSXHost = {
  measureLabel(source: string, options: LabelOptions): LabelBox;
};
```

GraphSX layout returns positioned figure primitives:

```ts
type FigureLayout = {
  width: number;
  height: number;
  objects: FigureObject[];
};

type FigureObject =
  | { type: "rect"; x: number; y: number; width: number; height: number; style: ShapeStyle }
  | { type: "circle"; cx: number; cy: number; r: number; style: ShapeStyle }
  | { type: "path"; d: string; style: ShapeStyle }
  | { type: "line"; x1: number; y1: number; x2: number; y2: number; style: ShapeStyle }
  | { type: "label"; source: string; x: number; y: number; width: number; height: number; baseline: number; anchor: LabelAnchor };
```

The Markdown engine then maps `FigureObject` into the canonical display list.

## Rendering Path

Preferred long-term path:

```text
GraphSX source
  -> GraphSX scene/layout model
  -> text engine measures labels
  -> GraphSX returns figure primitives
  -> Markdown layout paginates the figure block
  -> SVG preview renders display objects
  -> PDF export renders the same display objects
```

Avoid making GraphSX-only SVG the canonical representation when possible. SVG can remain a standalone GraphSX output format, but this document engine should prefer display-list primitives for PDF parity.

## V1 Bridge

If needed, start with:

- Parse fenced `graphsx` blocks.
- Render GraphSX to SVG.
- Measure the SVG viewBox as a figure block.
- Embed in preview.
- Rasterize or temporarily convert for PDF.

Then replace the bridge with the display-list adapter.

## Label Strategy

GraphSX labels should become renderer-agnostic:

- Standalone GraphSX playground can use its own label renderer.
- This Markdown engine should provide a native text/math label renderer.

That lets labels in diagrams match surrounding document text, native math fonts, baselines, and PDF output.
