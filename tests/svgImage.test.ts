import { describe, expect, it } from "vitest";
import { renderPageToSvg } from "../src/core/renderers/svg/renderPageToSvg";

describe("SVG image rendering", () => {
  it("keeps blob-backed PDF figures as hydration targets", () => {
    const svg = renderPageToSvg({
      index: 0,
      width: 612,
      height: 792,
      objects: [{
        type: "image",
        src: "blob:http://127.0.0.1:5173/example#asset.pdf",
        sources: ["blob:http://127.0.0.1:5173/example#asset.pdf"],
        alt: "PDF figure",
        x: 72,
        y: 72,
        width: 240,
        height: 160
      }]
    });

    expect(svg).toContain("<image");
    expect(svg).toContain("data-fallback-id=");
    expect(svg).toContain("data-image-sources=");
    expect(svg).toContain("blob:http://127.0.0.1:5173/example#asset.pdf");
  });
});
