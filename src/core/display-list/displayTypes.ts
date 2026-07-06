import type { PageConfig } from "../layout/pageConfig";
import type { NativeMathLayout, NativeMathMetrics } from "../renderers/math/nativeMath";
import type { NativeMathFontProfileName } from "../renderers/math/nativeMathProfiles";
import type { GraphSXDisplayList } from "@slxu/graphsx";
import type { DocumentTheme } from "../theme/themeTypes";

export type DisplayTextRun = {
  text: string;
  x: number;
  y: number;
  width?: number;
  fontSize: number;
  fontFamily: string;
  color: string;
  bold?: boolean;
  italic?: boolean;
  link?: string;
  anchorId?: string;
};

export type DisplayAnchor = {
  anchorId?: string;
};

export type DisplayObject =
  | ({ type: "text" } & DisplayTextRun)
  | ({
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
    } & DisplayAnchor)
  | ({
      type: "rect";
      x: number;
      y: number;
      width: number;
      height: number;
      fill?: string;
      stroke?: string;
      strokeWidth?: number;
      radius?: number;
    } & DisplayAnchor)
  | ({
      type: "image";
      src: string;
      alt: string;
      x: number;
      y: number;
      width: number;
      height: number;
    } & DisplayAnchor)
  | ({
      type: "graphsx";
      source: string;
      svg: string;
      svgBody: string;
      viewBox: string;
      summary: string;
      displayList?: GraphSXDisplayList;
      nativeMathProfile?: NativeMathFontProfileName;
      x: number;
      y: number;
      width: number;
      height: number;
      warnings?: string[];
    } & DisplayAnchor)
  | ({
      type: "line";
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      stroke: string;
      strokeWidth: number;
    } & DisplayAnchor);

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
