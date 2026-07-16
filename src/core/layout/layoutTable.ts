import type { MathRendererName } from "../engine/engineTypes";
import type { DocumentTheme } from "../theme/themeTypes";
import type { NativeMathMetrics } from "../renderers/math/nativeMath";
import type { NativeMathFontProfileName } from "../renderers/math/nativeMathProfiles";
import type { LayoutBlock, InlineRun, TableCellBlock } from "./layoutBlocks";
import { breakRunsIntoLines } from "./lineBreaking";
import type { MathMeasurementMap } from "./mathMetrics";
import { measureText } from "./measureText";
import type { TableLayout } from "./tableLayoutTypes";

export function layoutTable(
  block: Extract<LayoutBlock, { type: "table" }>,
  contentWidth: number,
  theme: DocumentTheme,
  mathMeasurements?: MathMeasurementMap,
  mathRenderer: MathRendererName = "native-openmath",
  nativeMathMetrics?: NativeMathMetrics,
  nativeMathProfile?: NativeMathFontProfileName
): TableLayout {
  const fontSize = theme.fontSize * 0.92;
  const paddingX = 7;
  const paddingY = 6;
  const sourceRows = [
    { cells: block.headers, header: true },
    ...block.rows.map((cells) => ({ cells, header: false }))
  ];
  const columns = Math.max(block.align.length, ...sourceRows.map((row) => totalColSpan(row.cells)), 1);
  const preferred = preferredColumnWidths(block, columns, fontSize, paddingX, theme);
  const widths = fitColumnWidths(preferred, contentWidth);
  const columnLayouts = widths.map((width, index) => ({
    x: widths.slice(0, index).reduce((sum, item) => sum + item, 0),
    width,
    align: block.align[index] ?? "left"
  }));
  const placements = placeTableCells(sourceRows, columns);
  const minRowHeight = fontSize * theme.lineHeight + paddingY * 2;
  const rowHeights = Array.from({ length: placements.rowCount }, () => minRowHeight);
  const laidOutCells = placements.cells.map((placed) => {
      const x = columnLayouts[placed.column].x;
      const width = sumWidths(widths, placed.column, placed.colSpan);
      const lines = breakRunsIntoLines(
        placed.cell.runs,
        Math.max(8, width - paddingX * 2),
        fontSize,
        theme,
        mathMeasurements,
        mathRenderer,
        nativeMathMetrics,
        nativeMathProfile
      );
      const height = lines.reduce((sum, line) => sum + line.height, 0) + paddingY * 2;
      return {
        sourceRow: placed.row,
        lines,
        align: block.align[placed.column] ?? "left",
        x,
        width,
        height,
        colSpan: placed.colSpan,
        rowSpan: placed.rowSpan,
        column: placed.column
      };
  });

  for (const cell of laidOutCells) {
    if (cell.rowSpan === 1) {
      rowHeights[cell.sourceRow] = Math.max(rowHeights[cell.sourceRow], cell.height);
    }
  }
  for (const cell of laidOutCells) {
    if (cell.rowSpan <= 1) continue;
    const currentHeight = sumWidths(rowHeights, cell.sourceRow, cell.rowSpan);
    if (currentHeight >= cell.height) continue;
    const extra = (cell.height - currentHeight) / cell.rowSpan;
    for (let row = cell.sourceRow; row < Math.min(rowHeights.length, cell.sourceRow + cell.rowSpan); row += 1) {
      rowHeights[row] += extra;
    }
  }

  const rows = rowHeights.map((height, rowIndex) => {
    return {
      cells: laidOutCells
        .filter((cell) => cell.sourceRow === rowIndex)
        .map(({ sourceRow: _sourceRow, ...cell }) => cell),
      header: placements.headerRows.has(rowIndex),
      height
    };
  });

  return {
    columns: columnLayouts,
    rows,
    fontSize,
    paddingX,
    paddingY,
    width: widths.reduce((sum, width) => sum + width, 0)
  };
}

function preferredColumnWidths(
  block: Extract<LayoutBlock, { type: "table" }>,
  columns: number,
  fontSize: number,
  paddingX: number,
  theme: DocumentTheme
): number[] {
  const widths = Array.from({ length: columns }, () => 44);
  const rows = [block.headers, ...block.rows];
  for (const row of rows) {
    let column = 0;
    for (const cell of row) {
      while (column < columns && widths[column] < 0) column += 1;
      const span = Math.max(1, Math.min(cell.colSpan, columns - column));
      const widthPerColumn = (measureRuns(cell.runs, fontSize, theme) + paddingX * 2) / span;
      for (let offset = 0; offset < span; offset += 1) {
        widths[column + offset] = Math.max(widths[column + offset], widthPerColumn);
      }
      column += span;
    }
  }
  return widths;
}

function fitColumnWidths(preferred: number[], contentWidth: number): number[] {
  const totalPreferred = preferred.reduce((sum, width) => sum + width, 0);
  if (totalPreferred <= contentWidth) {
    const extra = (contentWidth - totalPreferred) / preferred.length;
    return preferred.map((width) => width + extra);
  }

  const minWidth = Math.min(72, contentWidth / preferred.length);
  const minimums = preferred.map((width) => Math.min(width, minWidth));
  const totalMinimum = minimums.reduce((sum, width) => sum + width, 0);
  if (totalMinimum >= contentWidth) return preferred.map(() => contentWidth / preferred.length);

  const shrinkable = preferred.map((width, index) => Math.max(0, width - minimums[index]));
  const totalShrinkable = shrinkable.reduce((sum, width) => sum + width, 0);
  const overflow = totalPreferred - contentWidth;
  return preferred.map((width, index) => width - overflow * (shrinkable[index] / totalShrinkable));
}

function measureRuns(runs: InlineRun[], fontSize: number, theme: DocumentTheme): number {
  return runs.reduce((sum, run) => {
    if (run.math) return sum + fontSize * Math.max(1, run.text.trim().length * 0.56);
    return sum + measureText(run.text, {
      fontSize,
      fontFamily: theme.fontFamily,
      monoFontFamily: theme.monoFontFamily,
      ...run
    });
  }, 0);
}

type SourceTableRow = {
  cells: TableCellBlock[];
  header: boolean;
};

type PlacedTableCell = {
  cell: TableCellBlock;
  row: number;
  column: number;
  colSpan: number;
  rowSpan: number;
};

function placeTableCells(sourceRows: SourceTableRow[], columns: number): {
  cells: PlacedTableCell[];
  rowCount: number;
  headerRows: Set<number>;
} {
  const occupied: boolean[][] = [];
  const cells: PlacedTableCell[] = [];
  const headerRows = new Set<number>();

  sourceRows.forEach((sourceRow, rowIndex) => {
    if (sourceRow.header) headerRows.add(rowIndex);
    occupied[rowIndex] ??= [];
    let column = 0;
    for (const cell of sourceRow.cells) {
      while (column < columns && occupied[rowIndex][column]) column += 1;
      if (column >= columns) break;
      const colSpan = Math.max(1, Math.min(cell.colSpan, columns - column));
      const rowSpan = Math.max(1, cell.rowSpan);
      cells.push({ cell, row: rowIndex, column, colSpan, rowSpan });
      for (let rowOffset = 0; rowOffset < rowSpan; rowOffset += 1) {
        const targetRow = rowIndex + rowOffset;
        occupied[targetRow] ??= [];
        for (let columnOffset = 0; columnOffset < colSpan; columnOffset += 1) {
          occupied[targetRow][column + columnOffset] = true;
        }
      }
      column += colSpan;
    }
  });

  return {
    cells,
    rowCount: Math.max(sourceRows.length, occupied.length),
    headerRows
  };
}

function totalColSpan(cells: TableCellBlock[]): number {
  return cells.reduce((sum, cell) => sum + Math.max(1, cell.colSpan), 0);
}

function sumWidths(widths: number[], start: number, span: number): number {
  return widths.slice(start, start + span).reduce((sum, width) => sum + width, 0);
}
