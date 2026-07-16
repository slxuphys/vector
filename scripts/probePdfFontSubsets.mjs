import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb } from "pdf-lib";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const fonts = [
  ["Latin Modern Math", "src/assets/fonts/latinmodern-math.otf"],
  ["Libertinus Math", "src/assets/fonts/libertinus-math.otf"],
  ["Latin Modern Roman", "src/assets/fonts/lmroman10-regular.otf"],
  ["Libertinus Serif", "src/assets/fonts/libertinus-serif-regular.otf"],
];

const samples = [
  ["x", "x"],
  ["abc", "abc"],
  ["ascii math", "E=mc2"],
  ["unicode italic x", "𝑥"],
  ["unicode italic abc", "𝑎𝑏𝑐"],
  ["operators", "+−=±⋅"],
  ["sqrt", "√"],
  ["integral", "∫"],
  ["greek", "αβγθλ"],
  ["frac-ish", "𝑎𝑏13/"],
  ["mixed", "∫𝑥2𝑑𝑥=13"]
];

const singleIndex = process.argv.indexOf("--single");
if (singleIndex >= 0) {
  const fontIndex = Number(process.argv[singleIndex + 1]);
  const sampleIndex = Number(process.argv[singleIndex + 2]);
  const [fontName, relativePath] = fonts[fontIndex];
  const [sampleName, text] = samples[sampleIndex];
  try {
    const result = await probe(fontName, relativePath, sampleName, text);
    console.log(JSON.stringify({ ok: true, ...result }));
  } catch (error) {
    const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    console.log(JSON.stringify({ ok: false, fontName, sampleName, message }));
    process.exitCode = 2;
  }
  process.exit();
}

for (const [fontName, relativePath] of fonts) {
  const fontIndex = fonts.findIndex((font) => font[0] === fontName);
  const stat = await fs.stat(path.join(root, relativePath));
  console.log(`\n${fontName} (${relativePath}, ${stat.size} bytes)`);
  for (let sampleIndex = 0; sampleIndex < samples.length; sampleIndex += 1) {
    const [sampleName] = samples[sampleIndex];
    const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url), "--single", String(fontIndex), String(sampleIndex)], {
      cwd: root,
      encoding: "utf8"
    });
    const lastLine = child.stdout.trim().split(/\r?\n/).filter(Boolean).at(-1);
    const parsed = safeJson(lastLine);
    if (child.status === 0 && parsed?.ok) {
      console.log(`  ok   ${sampleName.padEnd(18)} ${String(parsed.bytes).padStart(7)} bytes ${parsed.ms} ms`);
    } else {
      const message = parsed?.message || child.stderr.trim().split(/\r?\n/).at(-1) || `process exited ${child.status}`;
      console.log(`  fail ${sampleName.padEnd(18)} ${message}`);
    }
  }
}

async function probe(fontName, relativePath, sampleName, text) {
  const bytes = await fs.readFile(path.join(root, relativePath));
  const start = performance.now();
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(bytes, { subset: true });
  const page = pdf.addPage([240, 80]);
  page.drawText(text, {
    x: 16,
    y: 40,
    size: 18,
    font,
    color: rgb(0, 0, 0)
  });
  const output = await pdf.save();
  return {
    fontName,
    sampleName,
    bytes: output.byteLength,
    ms: Math.round((performance.now() - start) * 10) / 10
  };
}

function safeJson(value) {
  if (!value) return undefined;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}
