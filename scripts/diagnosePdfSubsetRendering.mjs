import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb } from "pdf-lib";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "tmp", "pdf-subset-diagnostics");
await fs.mkdir(outDir, { recursive: true });

const latinModernMath = await fs.readFile(path.join(root, "src/assets/fonts/latinmodern-math.otf"));
const latinModernRoman = await fs.readFile(path.join(root, "src/assets/fonts/lmroman10-regular.otf"));

const samples = [
  {
    name: "math-string-subset",
    subset: true,
    font: latinModernMath,
    mode: "string",
    text: "√𝑥²+𝑦² 𝑥 ∫ αβγ"
  },
  {
    name: "math-glyphs-subset",
    subset: true,
    font: latinModernMath,
    mode: "glyphs",
    text: "√𝑥²+𝑦² 𝑥 ∫ αβγ"
  },
  {
    name: "math-glyphs-full",
    subset: false,
    font: latinModernMath,
    mode: "glyphs",
    text: "√𝑥²+𝑦² 𝑥 ∫ αβγ"
  },
  {
    name: "roman-string-subset",
    subset: true,
    font: latinModernRoman,
    mode: "string",
    text: "Hello world ZX lim"
  },
  {
    name: "mixed-two-fonts-subset",
    subset: true,
    font: latinModernMath,
    romanFont: latinModernRoman,
    mode: "mixed",
    text: "Hello world ",
    mathText: "√𝑥²+𝑦²"
  }
];

for (const sample of samples) {
  try {
    const pdf = await PDFDocument.create();
    pdf.registerFontkit(fontkit);
    const mathFont = await pdf.embedFont(sample.font, { subset: sample.subset });
    const romanFont = sample.romanFont
      ? await pdf.embedFont(sample.romanFont, { subset: sample.subset })
      : undefined;
    const page = pdf.addPage([420, 120]);
    page.drawText(sample.name, { x: 16, y: 96, size: 8, color: rgb(0.4, 0.4, 0.4) });

    if (sample.mode === "glyphs") {
      let x = 16;
      for (const char of Array.from(sample.text)) {
        page.drawText(char, { x, y: 52, size: 18, font: mathFont, color: rgb(0, 0, 0) });
        x += char === " " ? 8 : 15;
      }
    } else if (sample.mode === "mixed") {
      page.drawText(sample.text, { x: 16, y: 52, size: 18, font: romanFont, color: rgb(0, 0, 0) });
      page.drawText(sample.mathText, { x: 130, y: 52, size: 18, font: mathFont, color: rgb(0, 0, 0) });
    } else {
      page.drawText(sample.text, { x: 16, y: 52, size: 18, font: mathFont, color: rgb(0, 0, 0) });
    }

    const bytes = await pdf.save();
    const file = path.join(outDir, `${sample.name}.pdf`);
    await fs.writeFile(file, bytes);
    console.log(`ok ${sample.name} ${bytes.byteLength} ${file}`);
  } catch (error) {
    console.log(`fail ${sample.name}`, error);
  }
}
