import type { PageConfig } from "../layout/pageConfig";
import type { NativeMathLayout, NativeMathMetrics } from "../renderers/math/nativeMath";
import type { NativeMathFontProfileName } from "../renderers/math/nativeMathProfiles";
import type { GraphSXDisplayList } from "@slxu/graphsx";
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
      renderer?: "katex-raster" | "katex-glyph" | "mathjax-vector" | "mathjax-glyph" | "native" | "native-openmath";
      latex: string;
      html: string;
      svg: string;
      svgBody?: string;
      viewBox?: string;
      displayMode: boolean;
      x: number;
      y: number;
      width: number;
      height: number;
      advance?: number;
      baseline?: number;
      fontSize: number;
      color: string;
      nativeMetrics?: NativeMathMetrics;
      nativeMathProfile?: NativeMathFontProfileName;
      nativeLayout?: NativeMathLayout;
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
      type: "image";
      src: string;
      alt: string;
      x: number;
      y: number;
      width: number;
      height: number;
    }
  | {
      type: "graphsx";
      source: string;
      svg: string;
      svgBody: string;
      viewBox: string;
      summary: string;
      displayList?: GraphSXDisplayList;
      x: number;
      y: number;
      width: number;
      height: number;
      warnings?: string[];
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
  fontFaceCss?: string;
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
