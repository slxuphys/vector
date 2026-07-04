import { readFileSync } from "node:fs";
import fontkit from "@pdf-lib/fontkit";
import * as hb from "harfbuzzjs";

const samples = [
  "x",
  "This is a test",
  "office affine",
  "E = mc^2",
  "AVATAR",
  "ffi"
];

const fonts = [
  ["Latin Modern Roman", "src/assets/fonts/lmroman10-regular.otf"],
  ["CMU Serif", "src/assets/fonts/cmu-serif-regular.otf"],
  ["Libertinus Serif", "src/assets/fonts/libertinus-serif-regular.otf"]
];

for (const [name, path] of fonts) {
  const bytes = readFileSync(path);
  const fontkitFont = fontkit.create(bytes);
  const blob = new hb.Blob(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  const face = new hb.Face(blob, 0);
  const font = new hb.Font(face);
  const upem = face.upem;

  console.log(`\n${name}`);
  console.log({ path, upem, fontkitUnitsPerEm: fontkitFont.unitsPerEm });

  for (const text of samples) {
    const buffer = new hb.Buffer();
    buffer.addText(text);
    buffer.guessSegmentProperties();
    hb.shape(font, buffer);
    const glyphs = buffer.getGlyphInfosAndPositions();
    const hbDesignWidth = glyphs.reduce((sum, glyph) => sum + glyph.xAdvance, 0);
    const fkRun = fontkitFont.layout(text);
    const fkDesignWidth = fkRun.positions.reduce((sum, position) => sum + position.xAdvance, 0);
    console.log({
      text,
      glyphs: glyphs.map((glyph) => ({
        id: glyph.codepoint,
        cluster: glyph.cluster,
        xAdvance: glyph.xAdvance,
        xOffset: glyph.xOffset,
        yOffset: glyph.yOffset
      })),
      hbDesignWidth,
      fontkitDesignWidth: fkDesignWidth
    });
  }

  font.destroy?.();
  face.destroy?.();
  blob.destroy?.();
}
