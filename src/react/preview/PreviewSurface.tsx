import { forwardRef, type MouseEvent, type ReactNode } from "react";
import "./previewSurface.css";

export type PreviewSurfaceProps = {
  toolbar?: ReactNode;
  children: ReactNode;
  className?: string;
  onClick?: (event: MouseEvent<HTMLDivElement>) => void;
};

export const PreviewSurface = forwardRef<HTMLDivElement, PreviewSurfaceProps>(function PreviewSurface(
  { toolbar, children, className = "", onClick },
  ref
) {
  return (
    <section className={`vector-preview-surface svg-md-preview-column ${className}`.trim()}>
      {toolbar}
      <div className="vector-preview-scroll svg-md-preview-pane" ref={ref} onClick={onClick}>
        {children}
      </div>
    </section>
  );
});
