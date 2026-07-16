import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearDebugLogs,
  debugLog,
  getDebugLogEntries,
  subscribeDebugLogs,
  type DebugLogSettings
} from "../src/core/utils/debugSettings";

const globalDebugSettings = globalThis as { __SVG_MD_DEBUG_LOGS__?: Partial<DebugLogSettings> };

describe("debug log event store", () => {
  beforeEach(() => {
    clearDebugLogs();
    globalDebugSettings.__SVG_MD_DEBUG_LOGS__ = {};
  });

  it("captures enabled categories and ignores disabled categories", () => {
    globalDebugSettings.__SVG_MD_DEBUG_LOGS__ = { math: true, preview: false };
    debugLog("math", "math event", { value: 1 });
    debugLog("preview", "preview event", { value: 2 });

    expect(getDebugLogEntries()).toHaveLength(1);
    expect(getDebugLogEntries()[0]).toMatchObject({ key: "math", label: "math event", details: { value: 1 } });
  });

  it("notifies subscribers when entries change", () => {
    globalDebugSettings.__SVG_MD_DEBUG_LOGS__ = { parser: true };
    const listener = vi.fn();
    const unsubscribe = subscribeDebugLogs(listener);
    debugLog("parser", "parsed");
    clearDebugLogs();
    unsubscribe();

    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("keeps only the newest 500 entries", () => {
    globalDebugSettings.__SVG_MD_DEBUG_LOGS__ = { text: true };
    for (let index = 0; index < 520; index += 1) debugLog("text", `entry ${index}`);

    expect(getDebugLogEntries()).toHaveLength(500);
    expect(getDebugLogEntries()[0].label).toBe("entry 20");
    expect(getDebugLogEntries()[499].label).toBe("entry 519");
  });
});
