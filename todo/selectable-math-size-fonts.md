# Selectable Math Size Fonts

## Goal

Make large math delimiters and extensible symbols render as selectable text where possible, instead of always converting OpenType math variant glyphs into SVG/PDF paths.

## Problem

OpenType Math fonts expose larger delimiters through internal glyph IDs. For example, a tall `|` may live as a font-internal variant glyph rather than as a Unicode character. Our current native OpenMath path can draw that variant accurately by extracting the glyph outline and emitting a vector path, but the result is not selectable because the document contains geometry, not text.

A selectable alternative is to package internal variants into generated companion size fonts. The browser can then render a large delimiter through a normal text glyph in a chosen font family.

## Proposed Direction

Add a selectable-size-font path for native math:

1. Keep the current OpenType variant path as the canonical visual representation.
2. Add support for rendering selected large delimiters/operators through companion size fonts.
3. Generate companion fonts from the selected OpenType MATH font for `(`, `)`, `[`, `]`, `{`, `}`, `|`, `‖`, `√`, `∫`, `∑`, and `∏`.
4. In PDF export, preserve text semantics where the backend can embed those size fonts as text.

## Possible Implementation Paths

### Generate Latin Modern Size Fonts

- Extract OpenType Math variant glyphs from Latin Modern Math.
- Map them to known private-use characters or reusable command slots.
- Add a renderer table from base symbol and size level to font family and character.
- Best long-term visual consistency.
- Requires font generation tooling and copy/search mapping decisions.

### Hybrid

- Use selectable size-font glyphs for common variants.
- Keep OpenType glyph paths for rare or missing variants.
- Gives practical selectability without blocking correctness.

## Open Questions

- Should private-use glyphs copy as their original symbol through PDF `/ToUnicode` mapping?
- Should SVG preview include hidden semantic text for path-only delimiters?
- Which delimiters/operators should be included in V1?
- Can the same size-font table serve both SVG preview and PDF export?

## First Experiment

Implement a feature flag in the native OpenMath profile:

```ts
largeDelimiterMode: "path" | "size-font" | "hybrid"
```

Then route `\left...\right` delimiters through size fonts when a matching variant exists, while keeping the current glyph-path renderer as the canonical geometry path.
