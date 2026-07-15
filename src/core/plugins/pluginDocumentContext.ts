export type VectorPluginDocumentContext = {
  getState<T>(pluginName: string, initialize: () => T): T;
  peekState<T>(pluginName: string): T | undefined;
};

export function createVectorPluginDocumentContext(): VectorPluginDocumentContext {
  const states = new Map<string, unknown>();
  return {
    getState<T>(pluginName: string, initialize: () => T): T {
      if (!states.has(pluginName)) states.set(pluginName, initialize());
      return states.get(pluginName) as T;
    },
    peekState<T>(pluginName: string): T | undefined {
      return states.get(pluginName) as T | undefined;
    }
  };
}
