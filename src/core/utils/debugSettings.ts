export type DebugLogKey = "math" | "graph" | "preview" | "pdf";

export type DebugLogSettings = Record<DebugLogKey, boolean>;

export const defaultDebugLogSettings: DebugLogSettings = {
  math: false,
  graph: false,
  preview: true,
  pdf: false
};

const storageKey = "svg-md-debug-log-settings";

export function readDebugLogSettings(): DebugLogSettings {
  if (typeof localStorage === "undefined") return defaultDebugLogSettings;
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) ?? "{}") as Partial<DebugLogSettings>;
    return { ...defaultDebugLogSettings, ...parsed };
  } catch {
    return defaultDebugLogSettings;
  }
}

export function writeDebugLogSettings(settings: DebugLogSettings): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(storageKey, JSON.stringify(settings));
}

export function isDebugLogEnabled(key: DebugLogKey): boolean {
  const globalSettings = (globalThis as { __SVG_MD_DEBUG_LOGS__?: Partial<DebugLogSettings> }).__SVG_MD_DEBUG_LOGS__;
  if (globalSettings?.[key] !== undefined) return Boolean(globalSettings[key]);
  return readDebugLogSettings()[key];
}
