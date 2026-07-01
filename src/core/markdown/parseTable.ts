import type { TableAlign, TableCellNode } from "./markdownTypes";
import { parseInline } from "./parseInline";

export type ParsedMarkdownTable = {
  headers: TableCellNode[];
  rows: TableCellNode[][];
  align: TableAlign[];
  end: number;
};

export function parseTableAt(lines: string[], index: number): ParsedMarkdownTable | undefined {
  if (!isTableStart(lines, index)) return undefined;

  const headerCells = splitTableRow(lines[index]);
  const align = splitTableRow(lines[index + 1]).map(parseAlignMarker);
  const rows: TableCellNode[][] = [];
  let cursor = index + 2;

  while (cursor < lines.length && isTableRow(lines[cursor])) {
    rows.push(splitTableRow(lines[cursor]).map(parseTableCell));
    cursor += 1;
  }

  return {
    headers: headerCells.map(parseTableCell),
    rows,
    align: normalizeAlignCount(align, Math.max(totalColSpan(headerCells.map(parseTableCell)), align.length)),
    end: cursor
  };
}

export function isTableStart(lines: string[], index: number): boolean {
  const header = lines[index];
  const delimiter = lines[index + 1];
  if (!header || !delimiter || !header.includes("|")) return false;

  const headerCells = splitTableRow(header);
  const delimiterCells = splitTableRow(delimiter);
  return (
    headerCells.length > 0 &&
    delimiterCells.length >= headerCells.length &&
    delimiterCells.every((cell) => /^:?-+:?$/.test(cell.trim()))
  );
}

function isTableRow(line: string): boolean {
  return line.includes("|") && line.trim().length > 0;
}

function splitTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  const cells: string[] = [];
  let current = "";
  let inCode = false;
  let inMath = false;

  for (let index = 0; index < trimmed.length; index += 1) {
    const char = trimmed[index];
    if (char === "\\") {
      const next = trimmed[index + 1];
      if (next === "|") {
        current += "|";
        index += 1;
      } else {
        current += char;
      }
      continue;
    }
    if (char === "`") {
      inCode = !inCode;
      current += char;
      continue;
    }
    if (char === "$" && !inCode) {
      inMath = !inMath;
      current += char;
      continue;
    }
    if (char === "|" && !inCode && !inMath) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }

  cells.push(current.trim());
  return cells;
}

function parseAlignMarker(marker: string): TableAlign {
  const value = marker.trim();
  const left = value.startsWith(":");
  const right = value.endsWith(":");
  if (left && right) return "center";
  if (right) return "right";
  return "left";
}

function normalizeAlignCount(align: TableAlign[], count: number): TableAlign[] {
  return Array.from({ length: count }, (_, index) => align[index] ?? "left");
}

function parseTableCell(cell: string): TableCellNode {
  const { text, colSpan, rowSpan } = parseCellAttributes(cell);
  return {
    children: parseInline(text),
    colSpan,
    rowSpan
  };
}

function parseCellAttributes(cell: string): { text: string; colSpan: number; rowSpan: number } {
  const match = cell.match(/\s*\{:\s*([^}]*)}\s*$/);
  if (!match) return { text: cell, colSpan: 1, rowSpan: 1 };

  const attrs = match[1];
  const colSpan = readPositiveIntegerAttr(attrs, "colspan");
  const rowSpan = readPositiveIntegerAttr(attrs, "rowspan");
  return {
    text: cell.slice(0, match.index).trim(),
    colSpan,
    rowSpan
  };
}

function readPositiveIntegerAttr(attrs: string, name: string): number {
  const match = attrs.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*"?([0-9]+)"?`, "i"));
  if (!match) return 1;
  return Math.max(1, Math.min(32, Number.parseInt(match[1], 10) || 1));
}

function totalColSpan(cells: TableCellNode[]): number {
  return cells.reduce((sum, cell) => sum + cell.colSpan, 0);
}
