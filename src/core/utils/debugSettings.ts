export type DebugLogKey = "math" | "graph" | "preview" | "pdf" | "text" | "parser" | "assets";

export type DebugLogSettings = Record<DebugLogKey, boolean>;

export const defaultDebugLogSettings: DebugLogSettings = {
  math: false,
  graph: false,
  preview: false,
  pdf: false,
  text: false,
  parser: false,
  assets: false
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

export function debugLog(key: DebugLogKey, label: string, details?: unknown): void {
  if (!isDebugLogEnabled(key) || typeof console === "undefined") return;
  if (details === undefined) console.log(label);
  else console.log(label, details);
}

export function debugWarn(key: DebugLogKey, label: string, details?: unknown): void {
  if (!isDebugLogEnabled(key) || typeof console === "undefined") return;
  if (details === undefined) console.warn(label);
  else console.warn(label, details);
}

export function debugError(key: DebugLogKey, label: string, details?: unknown): void {
  if (!isDebugLogEnabled(key) || typeof console === "undefined") return;
  if (details === undefined) console.error(label);
  else console.error(label, details);
}

export function debugGroup(
  key: DebugLogKey,
  label: string,
  entries: ReadonlyArray<readonly [label: string, details: unknown]>
    | (() => ReadonlyArray<readonly [label: string, details: unknown]>),
  level: "log" | "warn" | "error" = "log"
): void {
  if (!isDebugLogEnabled(key) || typeof console === "undefined") return;
  const resolvedEntries = typeof entries === "function" ? entries() : entries;
  const openGroup = console.groupCollapsed?.bind(console);
  if (!openGroup) {
    console[level](label, Object.fromEntries(resolvedEntries));
    return;
  }
  openGroup(label);
  for (const [entryLabel, details] of resolvedEntries) console[level](entryLabel, details);
  console.groupEnd();
}
