import { describe, expect, it } from "vitest";
import { BoundedStringCache } from "../src/react/boundedStringCache";

describe("bounded string cache", () => {
  it("evicts the least recently used entry when its entry limit is exceeded", () => {
    const cache = new BoundedStringCache(2, 100);
    cache.set("first", "a");
    cache.set("second", "b");
    expect(cache.get("first")).toBe("a");
    cache.set("third", "c");
    expect(cache.get("second")).toBeUndefined();
    expect(cache.get("first")).toBe("a");
    expect(cache.get("third")).toBe("c");
  });

  it("evicts entries until its character budget is respected", () => {
    const cache = new BoundedStringCache(10, 5);
    cache.set("first", "123");
    cache.set("second", "456");
    expect(cache.size).toBe(1);
    expect(cache.get("first")).toBeUndefined();
    expect(cache.get("second")).toBe("456");
  });
});
