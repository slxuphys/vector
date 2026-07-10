import { useEffect, useRef, type MouseEvent } from "react";
import type { DisplayPage } from "../core/display-list/displayTypes";

export type PageViewportProps = {
  page: DisplayPage;
  svg: string;
  zoom: number;
  onSourceClick?: (source: { start: number; end: number }) => void;
  sourceHighlight?: { start: number; end: number; id: number };
};

export function PageViewport({ page, svg, zoom, onSourceClick, sourceHighlight }: PageViewportProps) {
  const svgContainerRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    const container = svgContainerRef.current;
    if (!container || !sourceHighlight) return;
    const selector = `[data-vector-source-start="${sourceHighlight.start}"][data-vector-source-end="${sourceHighlight.end}"]`;
    const targets = Array.from(container.querySelectorAll<SVGGElement>(selector));
    for (const target of targets) {
      target.classList.remove("vector-source-highlight");
      target.getBoundingClientRect();
      target.classList.add("vector-source-highlight");
    }
    const timeout = window.setTimeout(() => {
      targets.forEach((target) => target.classList.remove("vector-source-highlight"));
    }, 1200);
    return () => window.clearTimeout(timeout);
  }, [sourceHighlight]);

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
        onClick={(event: MouseEvent<HTMLDivElement>) => {
          if (!event.ctrlKey && !event.metaKey) return;
          const target = event.target instanceof Element
            ? event.target.closest<SVGGElement>("[data-vector-source-start]")
            : undefined;
          const start = Number(target?.dataset.vectorSourceStart);
          const end = Number(target?.dataset.vectorSourceEnd);
          if (Number.isInteger(start) && Number.isInteger(end)) onSourceClick?.({ start, end });
        }}
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
