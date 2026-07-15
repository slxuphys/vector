import type {
  LatexDocumentClassHandler,
  LatexCommandDefinition,
  LatexMathTransform,
  AstNodeNormalizer,
  LatexEnvironmentHandler,
  MarkdownFenceHandler,
  VectorPlugin
} from "./pluginTypes";

export class VectorPluginRegistry {
  private readonly plugins = new Map<string, VectorPlugin>();
  private readonly markdownFences = new Map<string, MarkdownFenceHandler>();
  private readonly latexCommands = new Map<string, LatexCommandDefinition>();
  private readonly latexEnvironments = new Map<string, LatexEnvironmentHandler>();
  private readonly latexDocumentClasses = new Map<string, LatexDocumentClassHandler>();
  private readonly latexMathTransforms: LatexMathTransform[] = [];
  private readonly astNormalizers = new Map<string, AstNodeNormalizer>();

  register(plugin: VectorPlugin): this {
    if (this.plugins.has(plugin.name)) throw new Error(`Vector plugin "${plugin.name}" is already registered.`);
    this.plugins.set(plugin.name, plugin);
    registerEntries(this.markdownFences, plugin.markdown?.fences, plugin.name, "Markdown fence");
    registerEntries(this.latexCommands, plugin.latex?.commands, plugin.name, "LaTeX command");
    registerEntries(this.latexEnvironments, plugin.latex?.environments, plugin.name, "LaTeX environment");
    registerEntries(this.latexDocumentClasses, plugin.latex?.documentClasses, plugin.name, "LaTeX document class");
    if (plugin.latex?.transformMath) this.latexMathTransforms.push(plugin.latex.transformMath);
    registerEntries(this.astNormalizers, plugin.ast?.normalizers, plugin.name, "AST normalizer");
    return this;
  }

  pluginNames(): string[] {
    return [...this.plugins.keys()];
  }

  markdownFence(language: string): MarkdownFenceHandler | undefined {
    return this.markdownFences.get(normalizeName(language));
  }

  latexEnvironment(name: string): LatexEnvironmentHandler | undefined {
    return this.latexEnvironments.get(normalizeName(name));
  }

  latexCommand(name: string): LatexCommandDefinition | undefined {
    return this.latexCommands.get(normalizeName(name));
  }

  latexCommandNames(): string[] {
    return [...this.latexCommands.keys()];
  }

  latexEnvironmentNames(): string[] {
    return [...this.latexEnvironments.keys()];
  }

  latexDocumentClass(name: string): LatexDocumentClassHandler | undefined {
    return this.latexDocumentClasses.get(normalizeName(name));
  }

  transformLatexMath(context: Parameters<LatexMathTransform>[0]): string {
    return this.latexMathTransforms.reduce(
      (source, transform) => transform({ ...context, source }),
      context.source
    );
  }

  astNormalizer(nodeType: string): AstNodeNormalizer | undefined {
    return this.astNormalizers.get(normalizeName(nodeType));
  }
}

function registerEntries<T>(
  target: Map<string, T>,
  entries: Record<string, T> | undefined,
  pluginName: string,
  kind: string
): void {
  if (!entries) return;
  for (const [rawName, handler] of Object.entries(entries)) {
    const name = normalizeName(rawName);
    if (target.has(name)) throw new Error(`${kind} "${name}" is already registered; plugin "${pluginName}" cannot replace it.`);
    target.set(name, handler);
  }
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}
