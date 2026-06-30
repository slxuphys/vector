# Selectable Math Size Fonts

## Goal

Make large math delimiters and extensible symbols render as selectable text where possible, instead of always converting OpenType math variant glyphs into SVG/PDF paths.

## Problem

OpenType Math fonts expose larger delimiters through internal glyph IDs. For example, a tall `|` may live as a font-internal variant glyph rather than as a Unicode character. Our current native OpenMath path can draw that variant accurately by extracting the glyph outline and emitting a vector path, but the result is not selectable because the document contains geometry, not text.

KaTeX avoids this by packaging large variants into separate size fonts such as `KaTeX_Size1`, `KaTeX_Size2`, `KaTeX_Size3`, and `KaTeX_Size4`. The browser can then render a large delimiter through a normal text glyph in a chosen font family.

## Proposed Direction

Add a selectable-size-font path for native math:

1. Keep the current OpenType variant path as a reliable visual fallback.
2. Add support for rendering selected large delimiters/operators through companion size fonts.
3. Start by testing KaTeX size fonts for `(`, `)`, `[`, `]`, `{`, `}`, `|`, `‖`, `√`, `∫`, `∑`, and `∏`.
4. If the visual style mismatch is too large, generate our own Latin Modern Math companion size fonts.
5. In PDF export, preserve text semantics where the backend can embed those size fonts as text.

## Possible Implementation Paths

### Reuse KaTeX Size Fonts

- Fastest experiment.
- Mostly selectable because output remains text.
- May visually differ from Latin Modern Math.
- Good for proving the rendering pipeline.

### Generate Latin Modern Size Fonts

- Extract OpenType Math variant glyphs from Latin Modern Math.
- Map them to known private-use characters or reusable command slots.
- Add a renderer table from base symbol and size level to font family and character.
- Best long-term visual consistency.
- Requires font generation tooling and copy/search mapping decisions.

### Hybrid

- Use selectable size-font glyphs for common variants.
- Fall back to OpenType glyph paths for rare or missing variants.
- Gives practical selectability without blocking correctness.

## Open Questions

- Should private-use glyphs copy as their original symbol through PDF `/ToUnicode` mapping?
- Should SVG preview include hidden semantic text for path-only delimiters?
- How much visual mismatch is acceptable if we reuse KaTeX size fonts?
- Which delimiters/operators should be included in V1?
- Can the same size-font table serve both SVG preview and PDF export?

## First Experiment

Implement a feature flag in the native OpenMath profile:

```ts
largeDelimiterMode: "path" | "size-font" | "hybrid"
```

Then route `\left...\right` delimiters through size fonts when a matching variant exists, while keeping the current glyph-path renderer as fallback.
