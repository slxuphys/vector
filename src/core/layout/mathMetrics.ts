import type { LayoutBlock, InlineRun } from "./layoutBlocks";
import type { DocumentTheme } from "../theme/themeTypes";

export type MathMeasureRequest = {
  key: string;
  latex: string;
  displayMode: boolean;
  fontSize: number;
  color: string;
};

export type MathMeasurement = {
  width: number;
  height: number;
  advance: number;
};

export type MathMeasurementMap = Record<string, MathMeasurement>;

export function mathMeasureKey(latex: string, displayMode: boolean, fontSize: number): string {
  return `${displayMode ? "display" : "inline"}:${round(fontSize)}:${normalizeMathLatex(latex)}`;
}

export function normalizeMathLatex(latex: string): string {
  return latex.replace(/\s+/g, "");
}

export function collectMathMeasureRequests(blocks: LayoutBlock[], theme: DocumentTheme): MathMeasureRequest[] {
  const requests = new Map<string, MathMeasureRequest>();

  const addRun = (run: InlineRun, fontSize: number, color: string) => {
    if (!run.math) return;
    const latex = run.text.trim();
    const key = mathMeasureKey(latex, false, fontSize);
    requests.set(key, { key, latex, displayMode: false, fontSize, color });
  };

  for (const block of blocks) {
    if (block.type === "heading") {
      block.runs.forEach((run) => addRun(run, headingSize(block.level, theme.fontSize), theme.text));
    } else if (block.type === "paragraph") {
      block.runs.forEach((run) => addRun(run, theme.fontSize, theme.text));
    } else if (block.type === "list") {
      block.items.forEach((item) => item.forEach((run) => addRun(run, theme.fontSize, theme.text)));
    } else if (block.type === "table") {
      const fontSize = theme.fontSize * 0.92;
      block.headers.forEach((cell) => cell.forEach((run) => addRun(run, fontSize, theme.text)));
      block.rows.forEach((row) => row.forEach((cell) => cell.forEach((run) => addRun(run, fontSize, theme.text))));
    } else if (block.type === "math") {
      const fontSize = theme.fontSize * 1.05;
      const latex = block.text.replace(/\s+/g, " ").trim();
      const key = mathMeasureKey(latex, true, fontSize);
      requests.set(key, { key, latex, displayMode: true, fontSize, color: theme.text });
    }
  }

  return [...requests.values()];
}

export function getMeasuredMath(
  measurements: MathMeasurementMap | undefined,
  latex: string,
  displayMode: boolean,
  fontSize: number
): MathMeasurement | undefined {
  return measurements?.[mathMeasureKey(latex, displayMode, fontSize)];
}

export function headingSize(level: number, base: number): number {
  return [0, 28, 22, 18, 15, 13, 12][level] ?? base;
}

function round(value: number): string {
  return Number(value.toFixed(2)).toString();
}
