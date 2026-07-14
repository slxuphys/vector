import type { EngineOptions } from "../engine/engineTypes";
import type { InlineNode, MarkdownNode } from "../markdown/markdownTypes";
import type { SourceSpan } from "../source/sourceTypes";
import type { LayoutBlock } from "../layout/layoutBlocks";

export type LatexParserMode = "preamble" | "vertical" | "horizontal" | "math";

export type MarkdownFenceContext = {
  language: string;
  info: string;
  source: string;
  sourceSpan: SourceSpan;
};

export type MarkdownFenceHandler = (context: MarkdownFenceContext) => MarkdownNode | undefined;

export type LatexEnvironmentContext = {
  name: string;
  source: string;
  body: string;
  options?: string;
  mode: LatexParserMode;
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
};

export type LatexCommandDefinition = {
  arguments?: LatexCommandArgument[];
  modes: LatexParserMode[];
  trailingLabel?: boolean;
  handler: (context: LatexCommandContext) => MarkdownNode[] | undefined;
};

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

export type VectorPlugin = {
  name: string;
  markdown?: {
    fences?: Record<string, MarkdownFenceHandler>;
  };
  latex?: {
    commands?: Record<string, LatexCommandDefinition>;
    environments?: Record<string, LatexEnvironmentHandler>;
    documentClasses?: Record<string, LatexDocumentClassHandler>;
  };
  ast?: {
    normalizers?: Record<string, AstNodeNormalizer>;
  };
};
