import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";
import { createServer } from "vite";

const root = process.cwd();
const output = path.join(root, "tmp", `parity-node-${process.pid}.cjs`);
await mkdir(path.dirname(output), { recursive: true });
await run(process.execPath, [path.join(root, "vscode", "esbuild.cjs")], {
  VECTOR_ENTRY: "tests/parity/node.ts",
  VECTOR_OUTFILE: output
});

const nodeSummary = JSON.parse(await run(process.execPath, [output]));
const server = await createServer({ root, server: { host: "127.0.0.1", port: 0 } });
await server.listen();
const address = server.httpServer.address();
if (!address || typeof address === "string") throw new Error("Parity server did not expose a TCP port");

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${address.port}/tests/parity/index.html`);
  await page.waitForFunction(() => typeof window.runVectorParity === "function");
  const browserSummary = await page.evaluate(() => window.runVectorParity());
  if (nodeSummary.displayListJson !== browserSummary.displayListJson) {
    const index = firstDifference(nodeSummary.displayListJson, browserSummary.displayListJson);
    throw new Error(`displayList differs at ${index}\nNode: ${nodeSummary.displayListJson.slice(index - 100, index + 180)}\nBrowser: ${browserSummary.displayListJson.slice(index - 100, index + 180)}`);
  }
  for (const key of ["displayList", "fontStreams", "contentStreams"]) {
    const left = JSON.stringify(nodeSummary[key]);
    const right = JSON.stringify(browserSummary[key]);
    if (left !== right) throw new Error(`${key} differs\nNode: ${left}\nBrowser: ${right}`);
  }
  const { displayListJson: _displayListJson, ...report } = browserSummary;
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} finally {
  await browser.close();
  await server.close();
}

function firstDifference(left, right) {
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) if (left[index] !== right[index]) return index;
  return length;
}

function run(command, args, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      env: { ...process.env, ...extraEnv },
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`${command} exited ${code}\n${stderr}`));
    });
  });
}
