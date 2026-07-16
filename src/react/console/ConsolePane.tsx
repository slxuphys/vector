import { ListX, Pause, Play, SquareTerminal, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  clearDebugLogs,
  defaultDebugLogSettings,
  getDebugLogEntries,
  readDebugLogSettings,
  subscribeDebugLogs,
  writeDebugLogSettings,
  type DebugLogEntry,
  type DebugLogKey,
  type DebugLogSettings
} from "../../core/utils/debugSettings";

export type ConsolePaneProps = {
  onClose: () => void;
};

const logOptions: Array<{ key: DebugLogKey; label: string }> = [
  { key: "math", label: "Math" },
  { key: "graph", label: "GraphSX" },
  { key: "preview", label: "Preview" },
  { key: "pdf", label: "PDF" },
  { key: "text", label: "Text" },
  { key: "parser", label: "Parser" },
  { key: "assets", label: "Assets" }
];

const minPaneHeight = 140;
const maxPaneHeight = 520;
const defaultPaneHeight = 220;

export function ConsolePane({ onClose }: ConsolePaneProps) {
  const [settings, setSettings] = useState<DebugLogSettings>(() => readDebugLogSettings());
  const entries = useDebugLogEntries();
  const [follow, setFollow] = useState(true);
  const [height, setHeight] = useState(readStoredHeight);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    writeDebugLogSettings(settings);
    (globalThis as { __SVG_MD_DEBUG_LOGS__?: Partial<DebugLogSettings> }).__SVG_MD_DEBUG_LOGS__ = settings;
  }, [settings]);

  useEffect(() => {
    if (!follow || !listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [entries, follow]);

  const beginResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = height;
    const handleMove = (moveEvent: PointerEvent) => {
      setHeight(clampHeight(startHeight + startY - moveEvent.clientY));
    };
    const handleUp = (upEvent: PointerEvent) => {
      const nextHeight = clampHeight(startHeight + startY - upEvent.clientY);
      setHeight(nextHeight);
      window.localStorage.setItem("vector-console-height", String(nextHeight));
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  };

  return (
    <section className="vector-console-pane" style={{ height }} aria-label="Console">
      <div
        className="vector-console-resize-handle"
        role="separator"
        aria-label="Resize console"
        aria-orientation="horizontal"
        tabIndex={0}
        onPointerDown={beginResize}
        onKeyDown={(event) => {
          if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
          event.preventDefault();
          const nextHeight = clampHeight(height + (event.key === "ArrowUp" ? 16 : -16));
          setHeight(nextHeight);
          window.localStorage.setItem("vector-console-height", String(nextHeight));
        }}
      />
      <header className="vector-console-header">
        <div className="vector-console-title">
          <SquareTerminal size={15} aria-hidden="true" />
          <strong>Console</strong>
          <span>{entries.length}</span>
        </div>
        <div className="vector-console-filters" aria-label="Console log categories">
          {logOptions.map((option) => (
            <label key={option.key} className={settings[option.key] ? "vector-console-filter vector-console-filter-active" : "vector-console-filter"}>
              <input
                type="checkbox"
                checked={settings[option.key]}
                onChange={(event) => setSettings((current) => ({ ...current, [option.key]: event.target.checked }))}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
        <div className="vector-console-actions">
          <button
            type="button"
            className="vector-console-icon-button"
            title="Disable all categories"
            aria-label="Disable all console categories"
            onClick={() => setSettings(defaultDebugLogSettings)}
          >
            <ListX size={14} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="vector-console-icon-button"
            title={follow ? "Pause auto-scroll" : "Resume auto-scroll"}
            aria-label={follow ? "Pause console auto-scroll" : "Resume console auto-scroll"}
            onClick={() => setFollow((current) => !current)}
          >
            {follow ? <Pause size={14} aria-hidden="true" /> : <Play size={14} aria-hidden="true" />}
          </button>
          <button
            type="button"
            className="vector-console-icon-button"
            title="Clear console"
            aria-label="Clear console"
            onClick={clearDebugLogs}
          >
            <Trash2 size={14} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="vector-console-icon-button"
            title="Close console"
            aria-label="Close console"
            onClick={onClose}
          >
            <X size={15} aria-hidden="true" />
          </button>
        </div>
      </header>
      <div className="vector-console-list" ref={listRef} role="log" aria-live="polite">
        {entries.length ? entries.map((entry) => <ConsoleEntry key={entry.id} entry={entry} />) : (
          <div className="vector-console-empty">
            Enable a category, then edit or export the document to collect diagnostics.
          </div>
        )}
      </div>
    </section>
  );
}

function ConsoleEntry({ entry }: { entry: DebugLogEntry }) {
  const details = entry.details === undefined ? undefined : formatDetails(entry.details);
  return (
    <article className={`vector-console-entry vector-console-entry-${entry.level}`}>
      <span className="vector-console-time">+{entry.elapsedMs.toFixed(1)} ms</span>
      <span className="vector-console-category">{entry.key}</span>
      {details ? (
        <details>
          <summary>{entry.label}</summary>
          <pre>{details}</pre>
        </details>
      ) : <span className="vector-console-label">{entry.label}</span>}
    </article>
  );
}

function useDebugLogEntries(): readonly DebugLogEntry[] {
  const [entries, setEntries] = useState<readonly DebugLogEntry[]>(() => getDebugLogEntries());
  useEffect(() => {
    let frame: number | undefined;
    const update = () => {
      if (frame !== undefined) return;
      frame = window.requestAnimationFrame(() => {
        frame = undefined;
        setEntries(getDebugLogEntries());
      });
    };
    const unsubscribe = subscribeDebugLogs(update);
    return () => {
      unsubscribe();
      if (frame !== undefined) window.cancelAnimationFrame(frame);
    };
  }, []);
  return entries;
}

function formatDetails(details: unknown): string {
  if (details instanceof Error) {
    return JSON.stringify({ name: details.name, message: details.message, stack: details.stack }, null, 2);
  }
  try {
    const seen = new WeakSet<object>();
    const value = JSON.stringify(details, (_key, candidate) => {
      if (candidate instanceof Error) return { name: candidate.name, message: candidate.message, stack: candidate.stack };
      if (typeof candidate === "object" && candidate !== null) {
        if (seen.has(candidate)) return "[Circular]";
        seen.add(candidate);
      }
      return candidate;
    }, 2);
    if (!value) return String(details);
    return value.length > 20_000 ? `${value.slice(0, 20_000)}\n… details truncated` : value;
  } catch {
    return String(details);
  }
}

function readStoredHeight(): number {
  if (typeof window === "undefined") return defaultPaneHeight;
  return clampHeight(Number(window.localStorage.getItem("vector-console-height")) || defaultPaneHeight);
}

function clampHeight(value: number): number {
  return Math.min(maxPaneHeight, Math.max(minPaneHeight, Math.round(value)));
}
