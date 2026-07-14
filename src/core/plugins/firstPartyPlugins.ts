import { VectorPluginRegistry } from "./pluginRegistry";
import { graphsxPackage } from "./packages/graphsxPackage";
import { latexDocumentClassesPackage } from "./packages/latexDocumentClasses";
import { latexCorePackage } from "./packages/latexCorePackage";

export function createFirstPartyPluginRegistry(): VectorPluginRegistry {
  return new VectorPluginRegistry()
    .register(latexCorePackage)
    .register(graphsxPackage)
    .register(latexDocumentClassesPackage);
}

export const firstPartyPlugins = createFirstPartyPluginRegistry();
