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
  const warnings = page.objects
    .filter((object) => object.type === "graphsx" && object.warnings?.length)
    .flatMap((object) => object.type === "graphsx"
      ? object.warnings?.map((message) => ({ message, x: object.x, y: object.y + object.height })) ?? []
      : []);

  return (
    <div
      className="svg-md-page"
      style={{
        width: page.width * zoom,
        height: page.height * zoom,
        position: "relative"
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
      {warnings.map((warning, index) => (
        <div
          key={`${warning.x}-${warning.y}-${index}`}
          className="svg-md-page-warning"
          style={{
            left: warning.x * zoom,
            top: (warning.y + 6) * zoom,
            maxWidth: Math.max(180, (page.width - warning.x - 16) * zoom)
          }}
        >
          {warning.message}
        </div>
      ))}
    </div>
  );
}
