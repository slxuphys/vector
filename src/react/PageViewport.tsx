import { useEffect, useMemo, useRef } from "react";
import type { DisplayPage } from "../core/display-list/displayTypes";
import { renderPageToSvg } from "../core/renderers/svg/renderPageToSvg";

export type PageViewportProps = {
  page: DisplayPage;
  zoom: number;
};

export function PageViewport({ page, zoom }: PageViewportProps) {
  const svgContainerRef = useRef<HTMLDivElement>(null);
  const svg = useMemo(() => {
    const rendered = renderPageToSvg(page, { className: "svg-md-page-svg" });
    return rendered;
  }, [page]);
  const warnings = page.objects
    .filter((object) => object.type === "graphsx" && object.warnings?.length)
    .flatMap((object) => object.type === "graphsx"
      ? object.warnings?.map((message) => ({ message, x: object.x, y: object.y + object.height })) ?? []
    : []);

  useEffect(() => {
    const container = svgContainerRef.current;
    if (!container) return undefined;
    const images = Array.from(container.querySelectorAll<SVGImageElement>("image[data-fallback-id]"));
    const cleanups = images.map((image) => {
      const fallbackId = image.dataset.fallbackId;
      const fallback = fallbackId ? container.querySelector<SVGGElement>(`#${CSS.escape(fallbackId)}`) : undefined;
      const hideFallback = () => {
        if (fallback) fallback.style.display = "none";
      };
      const showFallback = () => {
        if (fallback) fallback.style.display = "";
      };
      image.addEventListener("load", hideFallback);
      image.addEventListener("error", showFallback);
      return () => {
        image.removeEventListener("load", hideFallback);
        image.removeEventListener("error", showFallback);
      };
    });
    return () => {
      cleanups.forEach((cleanup) => cleanup());
    };
  }, [svg]);

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
        ref={svgContainerRef}
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
