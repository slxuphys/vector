import type {
  AstNodeNormalizer,
  LatexCommandDefinition,
  LatexDocumentClassHandler,
  LatexEnvironmentHandler,
  LatexMathTransform,
  LatexInlineTransform,
  MarkdownDirectiveHandler,
  MarkdownFenceHandler,
  MarkdownInlineHandler,
  MarkdownInlineMatch,
  PluginLayoutHandler,
  PluginDocumentLifecycleContext,
  PluginDocumentHooks,
  VectorPlugin
} from "./pluginTypes";
import type { MarkdownAst } from "../../markdown/markdownTypes";
import type { VectorPluginDocumentContext } from "./pluginDocumentContext";
import { isPromiseLike } from "../../resources";
import {
  createVectorPluginHost,
  VECTOR_PLUGIN_API_VERSION,
  type VectorPluginHost
} from "./pluginHost";

export class VectorPluginRegistry {
  private readonly plugins = new Map<string, VectorPlugin>();
  private readonly markdownFences = new Map<string, MarkdownFenceHandler>();
  private readonly markdownInlineHandlers: MarkdownInlineHandler[] = [];
  private readonly markdownDirectives = new Map<string, MarkdownDirectiveHandler>();
  private readonly latexCommands = new Map<string, LatexCommandDefinition>();
  private readonly latexEnvironments = new Map<string, LatexEnvironmentHandler>();
  private readonly latexDocumentClasses = new Map<string, LatexDocumentClassHandler>();
  private readonly latexMathTransforms: LatexMathTransform[] = [];
  private readonly latexInlineTransforms: LatexInlineTransform[] = [];
  private readonly astNormalizers = new Map<string, AstNodeNormalizer>();
  private readonly pluginAstNormalizers = new Map<string, AstNodeNormalizer>();
  private readonly layoutHandlers = new Map<string, PluginLayoutHandler>();
  private readonly documentHooks: Array<{ pluginName: string; hooks: PluginDocumentHooks }> = [];

  constructor(private readonly host: VectorPluginHost = createVectorPluginHost()) {}

  register(plugin: VectorPlugin): this {
    const name = pluginName(plugin);
    validatePlugin(plugin, name, this.plugins);
    if (this.plugins.has(name)) throw new Error(`Vector plugin "${name}" is already registered.`);
    assertEntriesAvailable(this.markdownFences, plugin.markdown?.fences, name, "Markdown fence");
    assertEntriesAvailable(this.markdownDirectives, plugin.markdown?.directives, name, "Markdown directive");
    assertEntriesAvailable(this.latexCommands, plugin.latex?.commands, name, "LaTeX command");
    assertEntriesAvailable(this.latexEnvironments, plugin.latex?.environments, name, "LaTeX environment");
    assertEntriesAvailable(this.latexDocumentClasses, plugin.latex?.documentClasses, name, "LaTeX document class");
    if (plugin.metadata) {
      assertEntriesAvailable(this.pluginAstNormalizers, plugin.ast?.normalizers, name, "AST normalizer", name);
    } else {
      assertEntriesAvailable(this.astNormalizers, plugin.ast?.normalizers, name, "AST normalizer");
    }
    assertEntriesAvailable(this.layoutHandlers, plugin.layout?.handlers, name, "layout handler", name);
    plugin.setup?.(this.host);
    this.plugins.set(name, plugin);
    registerEntries(this.markdownFences, plugin.markdown?.fences);
    registerEntries(this.markdownDirectives, plugin.markdown?.directives);
    if (plugin.markdown?.inline) this.markdownInlineHandlers.push(plugin.markdown.inline);
    registerEntries(this.latexCommands, plugin.latex?.commands);
    registerEntries(this.latexEnvironments, plugin.latex?.environments);
    registerEntries(this.latexDocumentClasses, plugin.latex?.documentClasses);
    if (plugin.latex?.transformMath) this.latexMathTransforms.push(plugin.latex.transformMath);
    if (plugin.latex?.transformInline) this.latexInlineTransforms.push(plugin.latex.transformInline);
    if (plugin.metadata) registerNamespacedEntries(this.pluginAstNormalizers, plugin.ast?.normalizers, name);
    else registerEntries(this.astNormalizers, plugin.ast?.normalizers);
    registerNamespacedEntries(this.layoutHandlers, plugin.layout?.handlers, name);
    if (plugin.document) this.documentHooks.push({ pluginName: name, hooks: plugin.document });
    return this;
  }

  pluginNames(): string[] {
    return [...this.plugins.keys()];
  }

  markdownFence(language: string): MarkdownFenceHandler | undefined {
    return this.markdownFences.get(normalizeName(language));
  }

  markdownDirective(name: string): MarkdownDirectiveHandler | undefined {
    return this.markdownDirectives.get(normalizeName(name));
  }

  matchMarkdownInline(source: string, document: VectorPluginDocumentContext): MarkdownInlineMatch | undefined {
    let earliest: MarkdownInlineMatch | undefined;
    for (const handler of this.markdownInlineHandlers) {
      const match = handler({ source, document });
      if (!match || match.index < 0 || match.length <= 0 || match.index + match.length > source.length) continue;
      if (!earliest || match.index < earliest.index) earliest = match;
    }
    return earliest;
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

  transformLatexInline(context: Parameters<LatexInlineTransform>[0]): string {
    return this.latexInlineTransforms.reduce(
      (source, transform) => transform({ ...context, source }),
      context.source
    );
  }

  astNormalizer(nodeType: string, pluginName?: string, kind?: string): AstNodeNormalizer | undefined {
    if (pluginName && kind) return this.pluginAstNormalizers.get(pluginEntryKey(pluginName, kind));
    return this.astNormalizers.get(normalizeName(nodeType));
  }

  layoutHandler(pluginName: string, kind: string): PluginLayoutHandler | undefined {
    return this.layoutHandlers.get(pluginEntryKey(pluginName, kind));
  }

  createDocumentLifecycleContext(
    context: Omit<PluginDocumentLifecycleContext, "host">
  ): PluginDocumentLifecycleContext {
    return { ...context, host: this.host };
  }

  prepareDocument(context: PluginDocumentLifecycleContext): void {
    for (const { hooks } of this.documentHooks) assertSync(hooks.prepareDocument?.(context));
  }

  async prepareDocumentAsync(context: PluginDocumentLifecycleContext): Promise<void> {
    for (const { hooks } of this.documentHooks) await hooks.prepareDocument?.(context);
  }

  transformDocumentAst(ast: MarkdownAst, context: PluginDocumentLifecycleContext): MarkdownAst {
    return this.documentHooks.reduce(
      (current, { hooks }) => assertSync(hooks.transformAst?.(current, context)) ?? current,
      ast
    );
  }

  async transformDocumentAstAsync(ast: MarkdownAst, context: PluginDocumentLifecycleContext): Promise<MarkdownAst> {
    let current = ast;
    for (const { hooks } of this.documentHooks) current = await hooks.transformAst?.(current, context) ?? current;
    return current;
  }

  finalizeDocument(ast: MarkdownAst, context: PluginDocumentLifecycleContext): MarkdownAst {
    return this.documentHooks.reduce(
      (current, { hooks }) => assertSync(hooks.finalizeDocument?.(current, context)) ?? current,
      ast
    );
  }

  async finalizeDocumentAsync(ast: MarkdownAst, context: PluginDocumentLifecycleContext): Promise<MarkdownAst> {
    let current = ast;
    for (const { hooks } of this.documentHooks) current = await hooks.finalizeDocument?.(current, context) ?? current;
    return current;
  }

  disposeDocument(context: PluginDocumentLifecycleContext): void {
    for (let index = this.documentHooks.length - 1; index >= 0; index -= 1) {
      assertSync(this.documentHooks[index].hooks.disposeDocument?.(context));
    }
  }

  async disposeDocumentAsync(context: PluginDocumentLifecycleContext): Promise<void> {
    for (let index = this.documentHooks.length - 1; index >= 0; index -= 1) {
      await this.documentHooks[index].hooks.disposeDocument?.(context);
    }
  }
}

function assertSync<T>(value: T | Promise<T> | undefined): T | undefined {
  if (value !== undefined && isPromiseLike(value)) {
    throw new Error("An asynchronous plugin/resource hook requires createDocumentEngine().layout().");
  }
  return value;
}

function registerEntries<T>(
  target: Map<string, T>,
  entries: Record<string, T> | undefined
): void {
  if (!entries) return;
  for (const [rawName, handler] of Object.entries(entries)) {
    const name = normalizeName(rawName);
    target.set(name, handler);
  }
}

function assertEntriesAvailable<T>(
  target: Map<string, T>,
  entries: Record<string, T> | undefined,
  pluginName: string,
  kind: string,
  namespace?: string
): void {
  if (!entries) return;
  for (const rawName of Object.keys(entries)) {
    const name = namespace ? pluginEntryKey(namespace, rawName) : normalizeName(rawName);
    if (target.has(name)) throw new Error(`${kind} "${name}" is already registered; plugin "${pluginName}" cannot replace it.`);
  }
}

function registerNamespacedEntries<T>(
  target: Map<string, T>,
  entries: Record<string, T> | undefined,
  namespace: string
): void {
  if (!entries) return;
  for (const [name, handler] of Object.entries(entries)) {
    target.set(pluginEntryKey(namespace, name), handler);
  }
}

function pluginEntryKey(pluginName: string, kind: string): string {
  return `${normalizeName(pluginName)}:${normalizeName(kind)}`;
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

function pluginName(plugin: VectorPlugin): string {
  const name = plugin.metadata?.name ?? plugin.name;
  if (!name?.trim()) throw new Error("Vector plugins must declare metadata.name.");
  return name.trim();
}

function validatePlugin(plugin: VectorPlugin, name: string, registered: Map<string, VectorPlugin>): void {
  const metadata = plugin.metadata;
  if (!metadata) return;
  if (metadata.apiVersion !== VECTOR_PLUGIN_API_VERSION) {
    throw new Error(`Vector plugin "${name}" uses API ${metadata.apiVersion}; this engine supports API ${VECTOR_PLUGIN_API_VERSION}.`);
  }
  for (const dependency of metadata.dependencies ?? []) {
    if (!registered.has(dependency)) {
      throw new Error(`Vector plugin "${name}" requires "${dependency}" to be registered first.`);
    }
  }
}
