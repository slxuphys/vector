import type { TableAlign } from "../markdown/markdownTypes";
import type { LayoutLine } from "./lineBreaking";

export type TableColumnLayout = {
  x: number;
  width: number;
  align: TableAlign;
};

export type TableCellLayout = {
  lines: LayoutLine[];
  align: TableAlign;
  x: number;
  width: number;
  height: number;
  colSpan: number;
  rowSpan: number;
  column: number;
};

export type TableRowLayout = {
  cells: TableCellLayout[];
  height: number;
  header: boolean;
};

export type TableLayout = {
  columns: TableColumnLayout[];
  rows: TableRowLayout[];
  fontSize: number;
  paddingX: number;
  paddingY: number;
  width: number;
};
