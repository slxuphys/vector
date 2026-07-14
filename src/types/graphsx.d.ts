declare module "@slxu/graphsx" {
  export type GraphSXDocumentModel = {
    type: "graph" | "plot" | "tikz";
    attrs?: Record<string, unknown>;
  };

  export function parseGraphSXDocument(source: string, options?: Record<string, unknown>): GraphSXDocumentModel;
  export function buildGraphDisplayList(model: GraphSXDocumentModel, options?: Record<string, unknown>): GraphSXDisplayList;
  export function buildPlotDisplayList(model: GraphSXDocumentModel, options?: Record<string, unknown>): GraphSXDisplayList;
  export function renderGraphSXDocument(svg: SVGSVGElement, documentModel: GraphSXDocumentModel, options?: Record<string, unknown>): {
    width: number;
    height: number;
    bounds?: unknown;
  };
  export function graphSXDocumentSummary(documentModel: GraphSXDocumentModel): {
    text: string;
    [key: string]: unknown;
  };

  export type GraphSXDisplayList = {
    type: "graph" | "plot" | "tikz";
    width: number;
    height: number;
    bounds?: unknown;
    arrowMarkers?: Set<string> | string[];
    arrowMarkerPrefix?: string;
    clips?: GraphSXClip[];
    items: GraphSXDisplayItem[];
  };

  export type GraphSXPathCommand =
    | { op: "moveTo" | "lineTo"; x: number; y: number }
    | { op: "quadraticTo"; x1: number; y1: number; x: number; y: number }
    | { op: "cubicTo"; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
    | { op: "closePath" };

  export type GraphSXTransform =
    | { type: "translate"; x: number; y: number }
    | { type: "rotate"; angle: number; cx?: number; cy?: number }
    | { type: "matrix"; a: number; b: number; c: number; d: number; e: number; f: number };

  export type GraphSXClip = {
    id: string;
    type: "rect";
    x: number;
    y: number;
    width: number;
    height: number;
  };

  export type GraphSXDisplayItem = {
    type: string;
    layer?: "edge" | "path" | "node";
    tag?: string;
    attrs?: Record<string, unknown>;
    props?: Record<string, unknown> & {
      commands?: GraphSXPathCommand[];
      transform?: GraphSXTransform | GraphSXTransform[];
      clip?: GraphSXClip;
    };
    style?: Record<string, unknown>;
    text?: string;
    children?: GraphSXDisplayItem[];
    displayList?: GraphSXDisplayList;
    source?: string;
    fallback?: string;
    className?: string;
    x?: number;
    y?: number;
    left?: number;
    top?: number;
    width?: number;
    height?: number;
    fontSize?: number;
    textStyle?: Record<string, unknown>;
    anchor?: string;
    rotate?: number;
    baseline?: string;
  };
}

declare module "@slxu/graphsx/tikz" {
  import type { GraphSXDisplayList } from "@slxu/graphsx";

  export type TikzModel = {
    type: "tikz";
    units: {
      cm: number;
      mm: number;
      pt: number;
      px: number;
    };
    nodes: unknown[];
    paths: unknown[];
    coordinates: unknown[];
  };

  export type TikzParseOptions = {
    units?: Partial<TikzModel["units"]>;
    defaults?: Record<string, unknown>;
  };

  export function parseTikz(source: string, options?: TikzParseOptions): TikzModel;
  export function buildTikzDisplayList(model: TikzModel, options?: Record<string, unknown>): GraphSXDisplayList;
  export function tikzSummary(model: TikzModel): { text: string; [key: string]: unknown };
}
