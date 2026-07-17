import { measureText, type TextStyle } from "../../layout/measureText";
import {
  getDefaultOpenMathMetricsForProfile,
  layoutNativeMath,
  type NativeMathLayout,
  type NativeMathMetrics
} from "../../renderers/math/nativeMath";
import type { NativeMathFontProfileName } from "../../renderers/math/nativeMathProfiles";

export const VECTOR_PLUGIN_API_VERSION = "1" as const;

export type VectorPluginDiagnostic = {
  plugin: string;
  severity: "info" | "warning" | "error";
  message: string;
  sourceStart?: number;
  sourceEnd?: number;
  code?: string;
};

export type VectorAssetResolveContext = {
  assetUrls?: Record<string, string>;
  sourcePath?: string;
};

export type VectorTextMeasureStyle = TextStyle;
export type VectorMathLayout = NativeMathLayout;
export type VectorMathMetrics = NativeMathMetrics;

export type VectorMathLayoutRequest = {
  source: string;
  displayMode?: boolean;
  fontSize: number;
  metrics?: VectorMathMetrics;
  profile?: NativeMathFontProfileName;
};

export type VectorPluginHost = {
  readonly apiVersion: typeof VECTOR_PLUGIN_API_VERSION;
  diagnostics: {
    report(diagnostic: VectorPluginDiagnostic): void;
  };
  assets: {
    resolve(path: string, context?: VectorAssetResolveContext): string | undefined;
  };
  text: {
    measure(text: string, style: VectorTextMeasureStyle): number;
  };
  math: {
    layout(request: VectorMathLayoutRequest): VectorMathLayout;
  };
  cache: {
    get<T>(namespace: string, key: string): T | undefined;
    set<T>(namespace: string, key: string, value: T): void;
    delete(namespace: string, key: string): void;
    clear(namespace: string): void;
  };
};

export type VectorPluginHostOptions = {
  onDiagnostic?: (diagnostic: VectorPluginDiagnostic) => void;
};

export function createVectorPluginHost(options: VectorPluginHostOptions = {}): VectorPluginHost {
  const cache = new Map<string, Map<string, unknown>>();
  return {
    apiVersion: VECTOR_PLUGIN_API_VERSION,
    diagnostics: {
      report(diagnostic) {
        options.onDiagnostic?.(diagnostic);
      }
    },
    assets: {
      resolve(path, context) {
        return resolveAsset(path, context);
      }
    },
    text: {
      measure: measureText
    },
    math: {
      layout(request) {
        const profile = request.profile ?? "openmath";
        return layoutNativeMath(
          request.source,
          request.displayMode ?? false,
          request.fontSize,
          request.metrics ?? getDefaultOpenMathMetricsForProfile(profile),
          profile
        );
      }
    },
    cache: {
      get<T>(namespace: string, key: string): T | undefined {
        return cache.get(namespace)?.get(key) as T | undefined;
      },
      set<T>(namespace: string, key: string, value: T): void {
        let entries = cache.get(namespace);
        if (!entries) {
          entries = new Map();
          cache.set(namespace, entries);
        }
        entries.set(key, value);
      },
      delete(namespace: string, key: string): void {
        cache.get(namespace)?.delete(key);
      },
      clear(namespace: string): void {
        cache.delete(namespace);
      }
    }
  };
}

function resolveAsset(path: string, context: VectorAssetResolveContext | undefined): string | undefined {
  const assets = context?.assetUrls;
  if (!assets) return undefined;
  const normalizedPath = normalizePath(path);
  const direct = assets[path] ?? assets[normalizedPath];
  if (direct) return direct;
  if (!context?.sourcePath) return undefined;
  const sourceDirectory = normalizePath(context.sourcePath).replace(/[^/]*$/, "");
  return assets[normalizePath(`${sourceDirectory}${normalizedPath}`)];
}

function normalizePath(path: string): string {
  const output: string[] = [];
  for (const part of path.replace(/\\/g, "/").split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") output.pop();
    else output.push(part);
  }
  return output.join("/");
}
