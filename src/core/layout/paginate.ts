import type { DisplayObject, DisplayPage } from "../display-list/displayTypes";
import type { DocumentTheme } from "../theme/themeTypes";
import type { LayoutBlock, InlineRun } from "./layoutBlocks";
import type { PageConfig } from "./pageConfig";
import { breakRunsIntoLines } from "./lineBreaking";
import { measureText } from "./measureText";
import { renderKatex, renderKatexSvg } from "../renderers/math/renderKatex";
import { getMeasuredMath, headingSize, normalizeMathLatex, type MathMeasurementMap } from "./mathMetrics";

type Cursor = {
  page: DisplayPage;
  x: number;
  y: number;
  contentWidth: number;
  bottom: number;
};

export function paginate(
  blocks: LayoutBlock[],
  page: PageConfig,
  theme: DocumentTheme,
  mathMeasurements?: MathMeasurementMap
): DisplayPage[] {
  const pages: DisplayPage[] = [];
  const newPage = (): Cursor => {
    const displayPage: DisplayPage = {
      index: pages.length,
      width: page.width,
      height: page.height,
      objects: [
        {
          type: "rect",
          x: 0,
          y: 0,
          width: page.width,
          height: page.height,
          fill: theme.pageBackground
        }
      ]
    };
    pages.push(displayPage);
    return {
      page: displayPage,
      x: page.margin.left,
      y: page.margin.top,
      contentWidth: page.width - page.margin.left - page.margin.right,
      bottom: page.height - page.margin.bottom
    };
  };

  let cursor = newPage();
  const ensure = (height: number) => {
    if (cursor.y + height > cursor.bottom) cursor = newPage();
  };

  for (const block of blocks) {
    if (block.type === "pageBreak") {
      cursor = newPage();
      continue;
    }

    if (block.type === "heading") {
      const fontSize = headingSize(block.level, theme.fontSize);
      const before = block.level === 1 ? 4 : 10;
      const after = block.level <= 2 ? 10 : 7;
      const lines = breakRunsIntoLines(block.runs, cursor.contentWidth, fontSize, theme, mathMeasurements);
      ensure(before + lines.length * fontSize * 1.2 + after);
      cursor.y += before;
      drawLines(cursor, lines, fontSize, theme, { bold: true, color: theme.text, lineHeight: 1.2 }, mathMeasurements);
      cursor.y += after;
      continue;
    }

    if (block.type === "paragraph") {
      const fontSize = theme.fontSize;
      const lines = breakRunsIntoLines(block.runs, cursor.contentWidth, fontSize, theme, mathMeasurements);
      ensure(lines.length * fontSize * theme.lineHeight + 10);
      drawLines(cursor, lines, fontSize, theme, { color: theme.text, lineHeight: theme.lineHeight }, mathMeasurements);
      cursor.y += 10;
      continue;
    }

    if (block.type === "list") {
      const fontSize = theme.fontSize;
      for (let index = 0; index < block.items.length; index += 1) {
        const marker = block.checked?.[index] !== undefined
          ? `[${block.checked[index] ? "x" : " "}]`
          : block.ordered
            ? `${index + 1}.`
            : "•";
        const markerWidth = 28;
        const lines = breakRunsIntoLines(block.items[index], cursor.contentWidth - markerWidth, fontSize, theme, mathMeasurements);
        ensure(lines.length * fontSize * theme.lineHeight + 4);
        cursor.page.objects.push(textObject(marker, cursor.x, cursor.y + fontSize, fontSize, theme, { color: theme.mutedText }));
        drawLines(cursor, lines, fontSize, theme, {
          color: theme.text,
          lineHeight: theme.lineHeight,
          xOffset: markerWidth
        }, mathMeasurements);
        cursor.y += 4;
      }
      cursor.y += 6;
      continue;
    }

    if (block.type === "code") {
      const fontSize = theme.fontSize * 0.92;
      const lines = block.code.split("\n");
      const lineHeight = fontSize * 1.45;
      const height = lines.length * lineHeight + 18;
      ensure(height + 10);
      cursor.page.objects.push({
        type: "rect",
        x: cursor.x,
        y: cursor.y,
        width: cursor.contentWidth,
        height,
        fill: theme.codeBackground,
        stroke: theme.tableBorder,
        strokeWidth: 0.5,
        radius: 3
      });
      lines.forEach((line, index) => {
        cursor.page.objects.push(textObject(line, cursor.x + 10, cursor.y + 12 + (index + 1) * lineHeight - 4, fontSize, theme, {
          color: theme.codeText,
          code: true
        }));
      });
      cursor.y += height + 12;
      continue;
    }

    if (block.type === "table") {
      cursor = drawTable(cursor, block.headers, block.rows, theme, ensure);
      continue;
    }

    if (block.type === "math") {
      const fontSize = theme.fontSize * 1.05;
      const text = block.text.replace(/\s+/g, " ").trim();
      const measured = getMeasuredMath(mathMeasurements, text, true, fontSize);
      const width = Math.min(cursor.contentWidth, measured?.width ?? Math.max(cursor.contentWidth * 0.35, measureText(text, {
        fontSize,
        fontFamily: theme.fontFamily,
        monoFontFamily: theme.monoFontFamily,
        italic: true
      }) * 1.15));
      const height = measured?.height ?? fontSize * 3.2;
      const html = renderKatex(text, true);
      ensure(height + 10);
      cursor.page.objects.push({
        type: "math",
        latex: text,
        html,
        svg: renderKatexSvg({
          latex: text,
          html,
          displayMode: true,
          width,
          height,
          fontSize,
          color: theme.text
        }),
        displayMode: true,
        x: cursor.x + (cursor.contentWidth - width) / 2,
        y: cursor.y,
        width,
        height,
        fontSize,
        color: theme.text
      });
      cursor.y += height + 12;
      continue;
    }

    if (block.type === "rule") {
      ensure(20);
      cursor.page.objects.push({
        type: "line",
        x1: cursor.x,
        y1: cursor.y + 8,
        x2: cursor.x + cursor.contentWidth,
        y2: cursor.y + 8,
        stroke: theme.rule,
        strokeWidth: 1
      });
      cursor.y += 24;
    }
  }

  return pages;
}

function drawLines(
  cursor: Cursor,
  lines: Array<{ runs: InlineRun[]; height: number }>,
  fontSize: number,
  theme: DocumentTheme,
  options: { color: string; bold?: boolean; lineHeight: number; xOffset?: number },
  mathMeasurements?: MathMeasurementMap
) {
  for (const line of lines) {
    let x = cursor.x + (options.xOffset ?? 0);
    const baseline = cursor.y + fontSize;
    for (const run of line.runs) {
      if (run.math) {
        const latex = run.text.trim();
        const measured = getMeasuredMath(mathMeasurements, latex, false, fontSize);
        const width = measured?.width ?? measureInlineMathBoxWidth(latex, fontSize, theme);
        const advance = measured?.advance ?? measureInlineMathAdvance(latex, fontSize, theme);
        const height = measured?.height ?? fontSize * options.lineHeight;
        const html = renderKatex(latex, false);
        const y = cursor.y + Math.max(0, (height - (measured?.height ?? height)) / 2) - fontSize * 0.12;
        cursor.page.objects.push({
          type: "math",
          latex,
          html,
          svg: renderKatexSvg({
            latex,
            html,
            displayMode: false,
            width,
            height,
            fontSize,
            color: run.link ? theme.link : options.color
          }),
          displayMode: false,
          x,
          y,
          width,
          height,
          advance,
          fontSize,
          color: run.link ? theme.link : options.color
        });
        x += advance;
        continue;
      }
      const font = run.code ? theme.monoFontFamily : theme.fontFamily;
      cursor.page.objects.push({
        type: "text",
        text: run.text,
        x,
        y: baseline,
        fontSize,
        fontFamily: font,
        color: run.link ? theme.link : options.color,
        bold: options.bold || run.bold,
        italic: run.italic || run.math,
        link: run.link
      });
      x += measureText(run.text, {
        fontSize,
        fontFamily: theme.fontFamily,
        monoFontFamily: theme.monoFontFamily,
        ...run,
        bold: options.bold || run.bold
      });
    }
    cursor.y += Math.max(line.height, fontSize * options.lineHeight);
  }
}

function measureInlineMathBoxWidth(text: string, fontSize: number, theme: DocumentTheme): number {
  return estimateInlineMathWidth(text, fontSize, theme) + fontSize * 0.35;
}

function measureInlineMathAdvance(text: string, fontSize: number, theme: DocumentTheme): number {
  return estimateInlineMathWidth(text, fontSize, theme) + fontSize * 0.08;
}

function estimateInlineMathWidth(text: string, fontSize: number, theme: DocumentTheme): number {
  let width = 0;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (char === "\\") {
      const command = text.slice(index).match(/^\\[a-zA-Z]+/);
      if (command?.[0] === "\\frac") {
        const numerator = readLatexGroup(text, index + command[0].length);
        const denominator = numerator ? readLatexGroup(text, numerator.end + 1) : undefined;
        if (numerator && denominator) {
          width += Math.max(
            estimateInlineMathWidth(numerator.value, fontSize * 0.86, theme),
            estimateInlineMathWidth(denominator.value, fontSize * 0.86, theme)
          ) + fontSize * 0.5;
          index = denominator.end;
          continue;
        }
      }

      if (command) {
        width += measureInlineMathText(commandToText(command[0]), fontSize, theme);
        index += command[0].length - 1;
        continue;
      }
    }

    if (char === "^" || char === "_") {
      const script = readLatexScript(text, index + 1);
      width += estimateInlineMathWidth(script.value, fontSize * 0.68, theme);
      index = script.end;
      continue;
    }

    if (char === "{" || char === "}") continue;

    if (/^[=+\-]$/.test(char)) {
      width += measureInlineMathText(` ${char} `, fontSize, theme);
      continue;
    }

    width += measureInlineMathText(char, fontSize, theme);
  }
  return width;
}

function measureInlineMathText(text: string, fontSize: number, theme: DocumentTheme): number {
  return measureText(text, {
    fontSize,
    fontFamily: theme.fontFamily,
    monoFontFamily: theme.monoFontFamily,
    italic: true
  });
}

function readLatexScript(text: string, start: number): { value: string; end: number } {
  const group = readLatexGroup(text, start);
  if (group) return group;
  return { value: text[start] ?? "", end: start };
}

function readLatexGroup(text: string, start: number): { value: string; end: number } | undefined {
  if (text[start] !== "{") return undefined;
  let depth = 0;
  for (let index = start; index < text.length; index += 1) {
    if (text[index] === "{") depth += 1;
    if (text[index] === "}") depth -= 1;
    if (depth === 0) return { value: text.slice(start + 1, index), end: index };
  }
  return undefined;
}

function commandToText(command: string): string {
  const commands: Record<string, string> = {
    "\\alpha": "a",
    "\\beta": "b",
    "\\gamma": "g",
    "\\delta": "d",
    "\\theta": "th",
    "\\lambda": "l",
    "\\mu": "m",
    "\\pi": "p",
    "\\sigma": "s",
    "\\cdot": " · ",
    "\\times": " x ",
    "\\int": "∫"
  };
  return commands[command] ?? command.slice(1);
}

function textObject(
  text: string,
  x: number,
  y: number,
  fontSize: number,
  theme: DocumentTheme,
  options: { color: string; bold?: boolean; italic?: boolean; code?: boolean }
): DisplayObject {
  return {
    type: "text",
    text,
    x,
    y,
    fontSize,
    fontFamily: options.code ? theme.monoFontFamily : theme.fontFamily,
    color: options.color,
    bold: options.bold,
    italic: options.italic
  };
}

function drawTable(
  cursor: Cursor,
  headers: InlineRun[][],
  rows: InlineRun[][][],
  theme: DocumentTheme,
  ensure: (height: number) => void
): Cursor {
  const fontSize = theme.fontSize * 0.92;
  const columns = Math.max(headers.length, ...rows.map((row) => row.length));
  const colWidth = cursor.contentWidth / Math.max(columns, 1);
  const rowHeight = fontSize * 2.2;
  const drawRow = (cells: InlineRun[][], y: number, header: boolean) => {
    for (let column = 0; column < columns; column += 1) {
      const x = cursor.x + column * colWidth;
      cursor.page.objects.push({
        type: "rect",
        x,
        y,
        width: colWidth,
        height: rowHeight,
        fill: header ? theme.tableHeaderBackground : theme.pageBackground,
        stroke: theme.tableBorder,
        strokeWidth: 0.7
      });
      const text = (cells[column] ?? []).map((run) => run.text).join("");
      cursor.page.objects.push(textObject(text, x + 6, y + fontSize * 1.45, fontSize, theme, {
        color: theme.text,
        bold: header
      }));
    }
  };

  ensure(rowHeight * (rows.length + 1) + 12);
  drawRow(headers, cursor.y, true);
  cursor.y += rowHeight;
  for (const row of rows) {
    if (cursor.y + rowHeight > cursor.bottom) cursor = {
      ...cursor,
      page: {
        index: cursor.page.index,
        width: cursor.page.width,
        height: cursor.page.height,
        objects: cursor.page.objects
      }
    };
    drawRow(row, cursor.y, false);
    cursor.y += rowHeight;
  }
  cursor.y += 14;
  return cursor;
}
