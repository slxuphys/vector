// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MarkdownEditor } from "../src/react/editor/MarkdownEditor";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("MarkdownEditor external updates", () => {
  const containers: HTMLDivElement[] = [];

  afterEach(() => {
    for (const container of containers.splice(0)) container.remove();
  });

  it("updates the mounted document without reporting an editor change", () => {
    const container = document.createElement("div");
    document.body.append(container);
    containers.push(container);
    const root = createRoot(container);
    const onChange = vi.fn();
    const onDebouncedChange = vi.fn();

    act(() => {
      root.render(
        <MarkdownEditor
          initialMarkdown="Before"
          onChange={onChange}
          onDebouncedChange={onDebouncedChange}
        />
      );
    });
    expect(container.querySelector(".cm-content")?.textContent).toBe("Before");
    const scroller = container.querySelector<HTMLElement>(".cm-scroller");
    if (!scroller) throw new Error("CodeMirror scroller was not created");
    scroller.scrollTop = 120;
    scroller.scrollLeft = 18;

    act(() => {
      root.render(
        <MarkdownEditor
          initialMarkdown="Changed externally"
          onChange={onChange}
          onDebouncedChange={onDebouncedChange}
        />
      );
    });
    expect(container.querySelector(".cm-content")?.textContent).toBe("Changed externally");
    expect(scroller.scrollTop).toBe(120);
    expect(scroller.scrollLeft).toBe(18);
    expect(container.querySelector("[role=status]")?.textContent).toBe("Updated from disk");
    expect(onChange).not.toHaveBeenCalled();
    expect(onDebouncedChange).not.toHaveBeenCalled();

    act(() => root.unmount());
  });
});
