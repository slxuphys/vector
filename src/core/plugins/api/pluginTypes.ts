import type { EngineOptions } from "../../engine/engineTypes";
import type { InlineNode, MarkdownAst, MarkdownNode } from "../../markdown/markdownTypes";
import type { SourceSpan } from "../../source/sourceTypes";
import type { LayoutBlock } from "../../layout/layoutBlocks";
import type { PluginLayoutBlock } from "../../layout/layoutBlocks";
import type { DisplayObject } from "../../display-list/displayTypes";
import type { DocumentTheme } from "../../theme/themeTypes";
import type { MathRendererName } from "../../engine/engineTypes";
import type { NativeMathMetrics } from "../../renderers/math/nativeMath";
import type { NativeMathFontProfileName } from "../../renderers/math/nativeMathProfiles";
import type { LayoutConfig } from "../../layout/layoutConfig";
import type { VectorPluginDocumentContext } from "./pluginDocumentContext";
import type { VectorPluginHost } from "./pluginHost";
import type { DocumentFrontMatter } from "../../config/documentConfig";
import type { DocumentResourceProvider, ResourceResult } from "../../resources";

export type VectorPluginMetadata = {
  name: string;
  version: string;
  apiVersion: "1";
  dependencies?: string[];
  runtimes?: Array<"browser" | "node">;
};

export type LatexParserMode = "preamble" | "vertical" | "horizontal" | "math";

export type MarkdownFenceContext = {
  language: string;
  info: string;
  source: string;
  sourceSpan: SourceSpan;
  document: VectorPluginDocumentContext;
};

export type MarkdownFenceHandler = (context: MarkdownFenceContext) => MarkdownNode | undefined;

export type MarkdownInlineContext = {
  source: string;
  document: VectorPluginDocumentContext;
};

export type MarkdownInlineMatch = {
  index: number;
  length: number;
  nodes: InlineNode[];
};

export type MarkdownInlineHandler = (context: MarkdownInlineContext) => MarkdownInlineMatch | undefined;

export type MarkdownDirectiveContext = {
  name: string;
  info: string;
  source: string;
  sourceSpan: SourceSpan;
  document: VectorPluginDocumentContext;
};

export type MarkdownDirectiveHandler = (context: MarkdownDirectiveContext) => MarkdownNode | undefined;

export type LatexEnvironmentContext = {
  name: string;
  source: string;
  body: string;
  options?: string;
  mode: LatexParserMode;
  document: VectorPluginDocumentContext;
};

export type LatexEnvironmentHandler = (context: LatexEnvironmentContext) => MarkdownNode[] | undefined;

export type LatexCommandArgument = "required" | "optional";

export type LatexCommandContext = {
  name: string;
  source: string;
  starred: boolean;
  requiredArguments: string[];
  optionalArguments: string[];
  trailingLabel?: string;
  mode: LatexParserMode;
  parseInline: (source: string) => InlineNode[];
  document: VectorPluginDocumentContext;
};

export type LatexCommandDefinition = {
  arguments?: LatexCommandArgument[];
  modes: LatexParserMode[];
  trailingLabel?: boolean;
  transparent?: boolean;
  handler: (context: LatexCommandContext) => MarkdownNode[] | undefined;
};

export type LatexMathTransformContext = {
  source: string;
  mode: LatexParserMode;
  document: VectorPluginDocumentContext;
};

export type LatexMathTransform = (context: LatexMathTransformContext) => string;

export type LatexInlineTransformContext = {
  source: string;
  mode: LatexParserMode;
  document: VectorPluginDocumentContext;
};

export type LatexInlineTransform = (context: LatexInlineTransformContext) => string;

export type LatexAuthorMetadata = {
  name: string;
  affiliations: string[];
  email?: string;
};

export type LatexPreambleMetadata = {
  title?: string;
  authors: LatexAuthorMetadata[];
  date?: string;
  abstract?: string;
};

export type LatexDocumentClassContext = {
  source: string;
  name: string;
  options: string[];
  preamble: LatexPreambleMetadata;
};

export type LatexDocumentClassHandler = (context: LatexDocumentClassContext) => EngineOptions;

export type AstNodeNormalizer = (node: MarkdownNode) => LayoutBlock | undefined;

export type PluginLayoutContext = {
  contentWidth: number;
  theme: DocumentTheme;
  mathRenderer: MathRendererName;
  nativeMathMetrics?: NativeMathMetrics;
  nativeMathProfile?: NativeMathFontProfileName;
  layoutConfig: LayoutConfig;
};

export type PluginLayoutResult = {
  width: number;
  height: number;
  objects: DisplayObject[];
  align?: "left" | "center" | "right";
};

export type PluginLayoutHandler = (
  block: PluginLayoutBlock,
  context: PluginLayoutContext
) => PluginLayoutResult;

export type PluginDocumentLifecycleContext = {
  source: string;
  sourceOffset: number;
  sourceFormat: NonNullable<EngineOptions["sourceFormat"]>;
  sourcePath?: string;
  options: EngineOptions;
  frontMatter?: DocumentFrontMatter;
  document: VectorPluginDocumentContext;
  resources?: DocumentResourceProvider;
  host: VectorPluginHost;
};

export type PluginDocumentHooks = {
  prepareDocument?: (context: PluginDocumentLifecycleContext) => ResourceResult<void>;
  transformAst?: (ast: MarkdownAst, context: PluginDocumentLifecycleContext) => ResourceResult<MarkdownAst>;
  finalizeDocument?: (ast: MarkdownAst, context: PluginDocumentLifecycleContext) => ResourceResult<MarkdownAst>;
  disposeDocument?: (context: PluginDocumentLifecycleContext) => ResourceResult<void>;
};

export type VectorPlugin = {
  /** @deprecated Use metadata.name for new plugins. */
  name?: string;
  metadata?: VectorPluginMetadata;
  setup?: (host: VectorPluginHost) => void;
  document?: PluginDocumentHooks;
  markdown?: {
    fences?: Record<string, MarkdownFenceHandler>;
    inline?: MarkdownInlineHandler;
    directives?: Record<string, MarkdownDirectiveHandler>;
  };
  latex?: {
    commands?: Record<string, LatexCommandDefinition>;
    environments?: Record<string, LatexEnvironmentHandler>;
    documentClasses?: Record<string, LatexDocumentClassHandler>;
    transformMath?: LatexMathTransform;
    transformInline?: LatexInlineTransform;
  };
  ast?: {
    normalizers?: Record<string, AstNodeNormalizer>;
  };
  layout?: {
    handlers?: Record<string, PluginLayoutHandler>;
  };
};
