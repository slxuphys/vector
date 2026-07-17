import { describe, expect, it } from "vitest";
import { collectDisplayAnchors, indexDisplayAnchors } from "../src/core/display-list/anchorIndex";
import type { DisplayPage } from "../src/core/display-list/displayTypes";

describe("display anchor index", () => {
  it("records the first page location for each anchor", () => {
    const pages: DisplayPage[] = [
      {
        index: 0,
        width: 612,
        height: 792,
        objects: [{
          type: "text",
          text: "Heading",
          x: 72,
          y: 120,
          fontSize: 18,
          fontFamily: "serif",
          color: "#000",
          anchorId: "sec:intro"
        }]
      },
      {
        index: 1,
        width: 612,
        height: 792,
        objects: [
          {
            type: "rect",
            x: 72,
            y: 240,
            width: 1,
            height: 1,
            anchorId: "eq:result"
          },
          {
            type: "rect",
            x: 72,
            y: 300,
            width: 1,
            height: 1,
            anchorId: "sec:intro"
          }
        ]
      }
    ];

    expect(collectDisplayAnchors(pages)).toEqual([
      { id: "sec:intro", page: 0, y: 102 },
      { id: "eq:result", page: 1, y: 240 }
    ]);
    expect(indexDisplayAnchors(pages).get("eq:result")).toEqual({
      id: "eq:result",
      page: 1,
      y: 240
    });
  });
});
