import {
  VectorPluginRegistry,
  createVectorPluginHost,
  type VectorPlugin,
  type VectorPluginHost
} from "../api";
import { latexDocumentClassesPackage } from "./document-classes";
import { graphsxPackage } from "./graphsx";
import { latexCorePackage } from "./latex-core";
import { bibliographyPackage } from "./bibliography";

export function createBuiltinPluginRegistry(host: VectorPluginHost = createVectorPluginHost()): VectorPluginRegistry {
  return new VectorPluginRegistry(host)
    .register(latexCorePackage)
    .register(bibliographyPackage)
    .register(graphsxPackage)
    .register(latexDocumentClassesPackage);
}

export const builtinPlugins = createBuiltinPluginRegistry();

const pluginArrayRegistries = new WeakMap<readonly VectorPlugin[], VectorPluginRegistry>();

export function resolvePluginRegistry(
  plugins: VectorPluginRegistry | readonly VectorPlugin[] | undefined
): VectorPluginRegistry {
  if (!plugins) return builtinPlugins;
  if (plugins instanceof VectorPluginRegistry) return plugins;
  const cached = pluginArrayRegistries.get(plugins);
  if (cached) return cached;
  const registry = createBuiltinPluginRegistry();
  for (const plugin of plugins) registry.register(plugin);
  pluginArrayRegistries.set(plugins, registry);
  return registry;
}

// Compatibility aliases for the original public API.
export const createFirstPartyPluginRegistry = createBuiltinPluginRegistry;
export const firstPartyPlugins = builtinPlugins;
