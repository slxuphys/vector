import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument } from "pdf-lib";
import subsetFont from "subset-font";

const outDir = join(process.cwd(), "tmp", "pdfs");
mkdirSync(outDir, { recursive: true });

const samples = [
  ["lmroman", "src/assets/fonts/lmroman10-regular.otf", "This is a test"],
  ["libertinus", "src/assets/fonts/libertinus-serif-regular.otf", "This is a test"],
];

for (const [name, fontPath, text] of samples) {
  const originalBytes = readFileSync(fontPath);
  const subsetBytes = await subsetFont(originalBytes, text, {
    targetFormat: "sfnt"
  });

  const subsetFontPath = join(outDir, `${name}-hb-subset.otf`);
  writeFileSync(subsetFontPath, subsetBytes);

  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(subsetBytes, { subset: false });
  const page = pdf.addPage([612, 792]);
  page.drawText(text, { x: 72, y: 720, size: 12, font });
  const pdfBytes = await pdf.save();
  const pdfPath = join(outDir, `${name}-hb-subset.pdf`);
  writeFileSync(pdfPath, pdfBytes);

  console.log({
    name,
    text,
    originalBytes: originalBytes.length,
    subsetBytes: subsetBytes.length,
    pdfBytes: pdfBytes.length,
    subsetFontPath,
    pdfPath
  });
}
