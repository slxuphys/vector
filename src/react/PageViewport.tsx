import { useMemo } from "react";
import type { DisplayPage } from "../core/display-list/displayTypes";
import { renderPageToSvg } from "../core/renderers/svg/renderPageToSvg";

export type PageViewportProps = {
  page: DisplayPage;
  zoom: number;
  timingLabel?: string;
};

export function PageViewport({ page, zoom, timingLabel }: PageViewportProps) {
  const svg = useMemo(() => {
    const label = timingLabel ? `${timingLabel}:svg-page-${page.index + 1}` : undefined;
    if (label) console.time(label);
    const rendered = renderPageToSvg(page, { className: "svg-md-page-svg" });
    if (label) console.timeEnd(label);
    return rendered;
  }, [page, timingLabel]);
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
