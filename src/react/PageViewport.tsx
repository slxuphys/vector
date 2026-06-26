import { useMemo } from "react";
import type { DisplayPage } from "../core/display-list/displayTypes";
import { renderPageToSvg } from "../core/renderers/svg/renderPageToSvg";

export type PageViewportProps = {
  page: DisplayPage;
  zoom: number;
};

export function PageViewport({ page, zoom }: PageViewportProps) {
  const svg = useMemo(() => {
    const rendered = renderPageToSvg(page, { className: "svg-md-page-svg" });
    return rendered;
  }, [page]);

  return (
    <div
      className="svg-md-page"
      style={{
        width: page.width * zoom,
        height: page.height * zoom
      }}
    >
      <div
        style={{
          transform: `scale(${zoom})`,
          transformOrigin: "top left",
          width: page.width,
          height: page.height
        }}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    </div>
  );
}
