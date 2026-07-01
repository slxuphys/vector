import type { DisplayObject, DisplayPage } from "../display-list/displayTypes";
import type { MathRendererName } from "../engine/workerProtocol";
import type { DocumentTheme } from "../theme/themeTypes";
import type { LayoutBlock, InlineRun } from "./layoutBlocks";
import type { PageConfig } from "./pageConfig";
import { breakRunsIntoLines } from "./lineBreaking";
import type { LayoutLine } from "./lineBreaking";
import { layoutTable } from "./layoutTable";
import { measureText } from "./measureText";
import { renderKatex, renderKatexSvg } from "../renderers/math/renderKatex";
import { getCachedMathJaxSvgArtifact } from "../renderers/math/renderMathJax";
import {
  defaultNativeMathMetrics,
  getDefaultOpenMathMetrics,
  getDefaultOpenMathMetricsForProfile,
  isNativeMathRenderer,
  layoutNativeMath,
  nativeMathProfileForRenderer,
  type NativeMathMetrics
} from "../renderers/math/nativeMath";
import type { NativeMathFontProfileName } from "../renderers/math/nativeMathProfiles";
import { getMeasuredMath, headingSize, type MathMeasurementMap } from "./mathMetrics";

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
  mathMeasurements?: MathMeasurementMap,
  mathRenderer: MathRendererName = "katex-raster",
  nativeMathMetrics?: NativeMathMetrics,
  nativeMathProfile?: NativeMathFontProfileName
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
  const ensure = (height: number): Cursor => {
    if (cursor.y + height > cursor.bottom) cursor = newPage();
    return cursor;
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
      const lines = breakRunsIntoLines(block.runs, cursor.contentWidth, fontSize, theme, mathMeasurements, mathRenderer, nativeMathMetrics, nativeMathProfile);
      ensure(before + lines.length * fontSize * 1.2 + after);
      cursor.y += before;
      drawLines(cursor, lines, fontSize, theme, { bold: true, color: theme.text, lineHeight: 1.2 }, mathMeasurements, mathRenderer, nativeMathMetrics, nativeMathProfile);
      cursor.y += after;
      continue;
    }

    if (block.type === "paragraph") {
      const fontSize = theme.fontSize;
      const lines = breakRunsIntoLines(block.runs, cursor.contentWidth, fontSize, theme, mathMeasurements, mathRenderer, nativeMathMetrics, nativeMathProfile);
      ensure(lines.length * fontSize * theme.lineHeight + 10);
      drawLines(cursor, lines, fontSize, theme, { color: theme.text, lineHeight: theme.lineHeight }, mathMeasurements, mathRenderer, nativeMathMetrics, nativeMathProfile);
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
        const lines = breakRunsIntoLines(block.items[index], cursor.contentWidth - markerWidth, fontSize, theme, mathMeasurements, mathRenderer, nativeMathMetrics, nativeMathProfile);
        ensure(lines.length * fontSize * theme.lineHeight + 4);
        cursor.page.objects.push(textObject(marker, cursor.x, cursor.y + fontSize, fontSize, theme, { color: theme.mutedText }));
        drawLines(cursor, lines, fontSize, theme, {
          color: theme.text,
          lineHeight: theme.lineHeight,
          xOffset: markerWidth
        }, mathMeasurements, mathRenderer, nativeMathMetrics, nativeMathProfile);
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
      cursor = drawTable(cursor, block, theme, ensure, newPage, mathMeasurements, mathRenderer, nativeMathMetrics, nativeMathProfile);
      continue;
    }

    if (block.type === "math") {
      const fontSize = theme.fontSize;
      const text = block.text.replace(/\s+/g, " ").trim();
      const measured = getMeasuredMath(mathMeasurements, text, true, fontSize, mathRenderer, nativeMathMetrics, nativeMathProfile);
      const width = Math.min(cursor.contentWidth, measured?.width ?? Math.max(cursor.contentWidth * 0.35, measureText(text, {
        fontSize,
        fontFamily: theme.fontFamily,
        monoFontFamily: theme.monoFontFamily,
        italic: true
      }) * 1.15));
      const height = measured?.height ?? fontSize * 3.2;
      ensure(height + 10);
      const mathObject = createMathObject({
        latex: text,
        displayMode: true,
        x: cursor.x + (cursor.contentWidth - width) / 2,
        y: cursor.y,
        width,
        height,
        fontSize,
        color: theme.text,
        mathRenderer,
        nativeMathMetrics,
        nativeMathProfile
      });
      cursor.page.objects.push(mathObject);
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
  lines: LayoutLine[],
  fontSize: number,
  theme: DocumentTheme,
  options: { color: string; bold?: boolean; lineHeight: number; xOffset?: number; align?: "left" | "center" | "right"; maxWidth?: number },
  mathMeasurements?: MathMeasurementMap,
  mathRenderer: MathRendererName = "katex-raster",
  nativeMathMetrics?: NativeMathMetrics,
  nativeMathProfile?: NativeMathFontProfileName
) {
  for (const line of lines) {
    const alignOffset = options.align === "center" && options.maxWidth !== undefined
      ? Math.max(0, (options.maxWidth - line.width) / 2)
      : options.align === "right" && options.maxWidth !== undefined
        ? Math.max(0, options.maxWidth - line.width)
        : 0;
    let x = cursor.x + (options.xOffset ?? 0) + alignOffset;
    const baseline = cursor.y + fontSize;
    for (const run of line.runs) {
      if (run.math) {
        const latex = run.text.trim();
        const measured = getMeasuredMath(mathMeasurements, latex, false, fontSize, mathRenderer, nativeMathMetrics, nativeMathProfile);
        const width = measured?.width ?? measureInlineMathBoxWidth(latex, fontSize, theme);
        const advance = measured?.advance ?? measureInlineMathAdvance(latex, fontSize, theme);
        const height = measured?.height ?? fontSize * options.lineHeight;
        const y = isMathJaxRenderer(mathRenderer)
          ? cursor.y
          : measured?.baseline !== undefined
            ? baseline - measured.baseline
            : cursor.y + Math.max(0, (height - (measured?.height ?? height)) / 2) - fontSize * 0.12;
        cursor.page.objects.push(createMathObject({
          latex,
          displayMode: false,
          x,
          y,
          width,
          height,
          advance,
          fontSize,
          color: run.link ? theme.link : options.color,
          mathRenderer,
          nativeMathMetrics,
          nativeMathProfile
        }));
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

function createMathObject(options: {
  latex: string;
  displayMode: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  advance?: number;
  fontSize: number;
  color: string;
  mathRenderer: MathRendererName;
  nativeMathMetrics?: NativeMathMetrics;
  nativeMathProfile?: NativeMathFontProfileName;
}): Extract<DisplayObject, { type: "math" }> {
  if (isMathJaxRenderer(options.mathRenderer)) {
    const artifact = getCachedMathJaxSvgArtifact(options.latex, options.displayMode, options.fontSize, options.color);
    const y = options.displayMode ? options.y : options.y + options.fontSize - artifact.baseline;
    return {
      type: "math",
      renderer: options.mathRenderer,
      latex: options.latex,
      html: "",
      svg: artifact.svg,
      svgBody: artifact.body,
      viewBox: artifact.viewBox,
      displayMode: options.displayMode,
      x: options.x,
      y,
      width: artifact.width,
      height: artifact.height,
      advance: options.advance ?? artifact.width,
      baseline: artifact.baseline,
      fontSize: options.fontSize,
      color: options.color
    };
  }

  if (isNativeMathRenderer(options.mathRenderer)) {
    const profile = options.nativeMathProfile ?? nativeMathProfileForRenderer(options.mathRenderer);
    const nativeMetrics = options.nativeMathMetrics ?? (options.mathRenderer === "native-openmath" ? getDefaultOpenMathMetricsForProfile(profile) : defaultNativeMathMetrics);
    const layout = layoutNativeMath(options.latex, options.displayMode, options.fontSize, nativeMetrics, profile);
    const y = options.displayMode ? options.y : options.y;
    return {
      type: "math",
      renderer: options.mathRenderer,
      latex: options.latex,
      html: "",
      svg: "",
      displayMode: options.displayMode,
      x: options.x,
      y,
      width: layout.width,
      height: layout.height,
      advance: options.advance ?? layout.advance,
      baseline: layout.baseline,
      fontSize: options.fontSize,
      color: options.color,
      nativeMetrics,
      nativeMathProfile: profile
    };
  }

  const html = renderKatex(options.latex, options.displayMode);
  return {
    type: "math",
    renderer: options.mathRenderer,
    latex: options.latex,
    html,
    svg: renderKatexSvg({
      latex: options.latex,
      html,
      displayMode: options.displayMode,
      width: options.width,
      height: options.height,
      fontSize: options.fontSize,
      color: options.color
    }),
    displayMode: options.displayMode,
    x: options.x,
    y: options.y,
    width: options.width,
    height: options.height,
    advance: options.advance,
    fontSize: options.fontSize,
    color: options.color
  };
}

function isMathJaxRenderer(renderer: MathRendererName): boolean {
  return renderer === "mathjax-vector" || renderer === "mathjax-glyph";
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
  block: Extract<LayoutBlock, { type: "table" }>,
  theme: DocumentTheme,
  ensure: (height: number) => Cursor,
  newPage: () => Cursor,
  mathMeasurements?: MathMeasurementMap,
  mathRenderer: MathRendererName = "katex-raster",
  nativeMathMetrics?: NativeMathMetrics,
  nativeMathProfile?: NativeMathFontProfileName
): Cursor {
  const table = layoutTable(block, cursor.contentWidth, theme, mathMeasurements, mathRenderer, nativeMathMetrics, nativeMathProfile);
  const header = table.rows[0];
  const bodyRows = table.rows.slice(1);
  const spannedRowHeight = (start: number, span: number) =>
    table.rows.slice(start, start + span).reduce((sum, row) => sum + row.height, 0);
  const drawRow = (row: typeof table.rows[number], rowIndex: number, y: number) => {
    for (const cell of row.cells) {
      const x = cursor.x + cell.x;
      const height = spannedRowHeight(rowIndex, cell.rowSpan);
      cursor.page.objects.push({
        type: "rect",
        x,
        y,
        width: cell.width,
        height,
        fill: row.header ? theme.tableHeaderBackground : theme.pageBackground,
        stroke: theme.tableBorder,
        strokeWidth: 0.7
      });
      const cellCursor = {
        ...cursor,
        x: x + table.paddingX,
        y: y + table.paddingY,
        contentWidth: Math.max(0, cell.width - table.paddingX * 2)
      };
      drawLines(cellCursor, cell.lines, table.fontSize, theme, {
        color: theme.text,
        bold: row.header,
        lineHeight: theme.lineHeight,
        align: cell.align,
        maxWidth: cellCursor.contentWidth
      }, mathMeasurements, mathRenderer, nativeMathMetrics, nativeMathProfile);
    }
  };

  cursor = ensure(header.height + 12);
  drawRow(header, 0, cursor.y);
  cursor.y += header.height;
  for (let index = 0; index < bodyRows.length;) {
    const rowIndex = index + 1;
    const groupEnd = tableRowSpanGroupEnd(table.rows, rowIndex);
    const groupRows = table.rows.slice(rowIndex, groupEnd + 1);
    const groupHeight = groupRows.reduce((sum, row) => sum + row.height, 0);
    if (cursor.y + groupHeight > cursor.bottom) {
      cursor = newPage();
      drawRow(header, 0, cursor.y);
      cursor.y += header.height;
    }
    for (let absoluteRow = rowIndex; absoluteRow <= groupEnd; absoluteRow += 1) {
      const row = table.rows[absoluteRow];
      drawRow(row, absoluteRow, cursor.y);
      cursor.y += row.height;
    }
    index = groupEnd;
  }
  cursor.y += 14;
  return cursor;
}

function tableRowSpanGroupEnd(rows: ReturnType<typeof layoutTable>["rows"], startRow: number): number {
  let endRow = startRow;
  for (let rowIndex = startRow; rowIndex <= endRow && rowIndex < rows.length; rowIndex += 1) {
    for (const cell of rows[rowIndex].cells) {
      endRow = Math.max(endRow, rowIndex + cell.rowSpan - 1);
    }
  }
  return Math.min(endRow, rows.length - 1);
}
