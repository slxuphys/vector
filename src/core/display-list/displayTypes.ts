import type { PageConfig } from "../layout/pageConfig";
import type { DocumentTheme } from "../theme/themeTypes";

export type DisplayTextRun = {
  text: string;
  x: number;
  y: number;
  fontSize: number;
  fontFamily: string;
  color: string;
  bold?: boolean;
  italic?: boolean;
  link?: string;
};

export type DisplayObject =
  | ({ type: "text" } & DisplayTextRun)
  | {
      type: "math";
      latex: string;
      html: string;
      svg: string;
      displayMode: boolean;
      x: number;
      y: number;
      width: number;
      height: number;
      advance?: number;
      fontSize: number;
      color: string;
    }
  | {
      type: "rect";
      x: number;
      y: number;
      width: number;
      height: number;
      fill?: string;
      stroke?: string;
      strokeWidth?: number;
      radius?: number;
    }
  | {
      type: "line";
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      stroke: string;
      strokeWidth: number;
    };

export type DisplayPage = {
  index: number;
  width: number;
  height: number;
  objects: DisplayObject[];
};

export type PagedDisplayList = {
  pages: DisplayPage[];
  page: PageConfig;
  theme: DocumentTheme;
};

export type PreviewStats = {
  pageCount: number;
  parseMs: number;
  layoutMs: number;
  svgMs: number;
  pdfMs?: number;
  totalMs: number;
};
