export type DebugLogKey = "math" | "graph" | "preview" | "pdf" | "text" | "parser" | "assets";

export type DebugLogSettings = Record<DebugLogKey, boolean>;

export type DebugLogLevel = "log" | "warn" | "error";

export type DebugLogEntry = {
  id: number;
  timestamp: number;
  elapsedMs: number;
  key: DebugLogKey;
  level: DebugLogLevel;
  label: string;
  details?: unknown;
};

export type DebugLogDetails = unknown | (() => unknown);

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
const maxEntries = 500;
const listeners = new Set<() => void>();
const startedAt = currentTime();
let nextEntryId = 1;
let entries: DebugLogEntry[] = [];

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

export function debugLog(key: DebugLogKey, label: string, details?: DebugLogDetails): void {
  emitDebugLog(key, "log", label, details);
}

export function debugWarn(key: DebugLogKey, label: string, details?: DebugLogDetails): void {
  emitDebugLog(key, "warn", label, details);
}

export function debugError(key: DebugLogKey, label: string, details?: DebugLogDetails): void {
  emitDebugLog(key, "error", label, details);
}

export function debugGroup(
  key: DebugLogKey,
  label: string,
  entries: ReadonlyArray<readonly [label: string, details: unknown]>
    | (() => ReadonlyArray<readonly [label: string, details: unknown]>),
  level: "log" | "warn" | "error" = "log"
): void {
  if (!isDebugLogEnabled(key)) return;
  const resolvedEntries = typeof entries === "function" ? entries() : entries;
  emitDebugLog(key, level, label, Object.fromEntries(resolvedEntries));
}

export function getDebugLogEntries(): readonly DebugLogEntry[] {
  return entries;
}

export function subscribeDebugLogs(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function clearDebugLogs(): void {
  if (!entries.length) return;
  entries = [];
  notifyListeners();
}

function emitDebugLog(key: DebugLogKey, level: DebugLogLevel, label: string, details?: DebugLogDetails): void {
  if (!isDebugLogEnabled(key)) return;
  const timestamp = currentTime();
  const resolvedDetails = typeof details === "function" ? details() : details;
  const entry: DebugLogEntry = {
    id: nextEntryId++,
    timestamp: Date.now(),
    elapsedMs: timestamp - startedAt,
    key,
    level,
    label,
    details: snapshotDebugDetails(resolvedDetails)
  };
  entries = entries.length >= maxEntries
    ? [...entries.slice(entries.length - maxEntries + 1), entry]
    : [...entries, entry];
  notifyListeners();
}

function notifyListeners(): void {
  for (const listener of listeners) listener();
}

function currentTime(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function snapshotDebugDetails(details: unknown): unknown {
  if (details === undefined || details === null || typeof details === "number" || typeof details === "boolean") return details;
  if (typeof details === "string") return details.length > 20_000 ? `${details.slice(0, 20_000)}\n… details truncated` : details;
  if (details instanceof Error) return { name: details.name, message: details.message, stack: details.stack };
  try {
    const seen = new WeakSet<object>();
    const serialized = JSON.stringify(details, (_key, candidate) => {
      if (candidate instanceof Error) return { name: candidate.name, message: candidate.message, stack: candidate.stack };
      if (typeof candidate === "object" && candidate !== null) {
        if (seen.has(candidate)) return "[Circular]";
        seen.add(candidate);
      }
      return candidate;
    });
    if (!serialized) return String(details);
    if (serialized.length > 20_000) {
      return { truncated: true, preview: `${serialized.slice(0, 20_000)}\n… details truncated` };
    }
    return JSON.parse(serialized) as unknown;
  } catch {
    return String(details);
  }
}
