import type { MathRendererName } from "../../core/engine/engineTypes";
import { isNativeMathRenderer } from "../../core/renderers/math/nativeMath";
import type { DocumentLayoutState } from "../useDocumentLayout";
import { Download, LoaderCircle, ZoomIn, ZoomOut } from "lucide-react";

export type PreviewToolbarProps = {
  layoutState: DocumentLayoutState;
  zoom: number;
  onZoomChange: (zoom: number) => void;
  pdfPending: boolean;
  onDownloadPdf: () => void;
  mathRenderer?: MathRendererName;
  experimentalVectorMath: boolean;
  onExperimentalVectorMathChange: (value: boolean) => void;
  variant?: "lab" | "preview";
  previewAvailable?: boolean;
};

export function PreviewToolbar({
  layoutState,
  zoom,
  onZoomChange,
  pdfPending,
  onDownloadPdf,
  mathRenderer,
  experimentalVectorMath,
  onExperimentalVectorMathChange,
  variant = "lab",
  previewAvailable = true
}: PreviewToolbarProps) {
  const usingKatexGlyph = mathRenderer === "katex-glyph";
  const usingNativeMath = isNativeMathRenderer(mathRenderer);
  const usingMathJaxVector = mathRenderer === "mathjax-vector";
  const usingMathJaxGlyph = mathRenderer === "mathjax-glyph";
  const usingGlyphPdf = usingKatexGlyph || usingMathJaxGlyph;
  const lockedPdfMode = usingNativeMath || usingGlyphPdf || usingMathJaxVector;

  if (variant === "preview") {
    return (
      <div className="svg-md-toolbar svg-md-toolbar-preview">
        <div className="svg-md-preview-toolbar-left">
          <button
            type="button"
            className="icon-button"
            disabled={!previewAvailable || !layoutState.layout || pdfPending}
            onClick={onDownloadPdf}
            title={pdfPending ? "Generating PDF" : "Download PDF"}
            aria-label={pdfPending ? "Generating PDF" : "Download PDF"}
          >
            {pdfPending
              ? <LoaderCircle className="svg-md-spinner-icon" size={17} aria-hidden="true" />
              : <Download size={17} aria-hidden="true" />}
          </button>
        </div>
        <ZoomControl zoom={zoom} onZoomChange={onZoomChange} />
        <span className="svg-md-page-count">{previewAvailable
          ? layoutState.stats ? `${layoutState.stats.pageCount} pages` : "Laying out..."
          : "Preview unavailable"}</span>
      </div>
    );
  }

  return (
    <div className="svg-md-toolbar">
      <ZoomControl zoom={zoom} onZoomChange={onZoomChange} />
      <button
        type="button"
        className="svg-md-download-button"
        disabled={!layoutState.layout || pdfPending}
        onClick={onDownloadPdf}
      >
        {pdfPending ? <LoaderCircle className="svg-md-spinner-icon" size={16} aria-hidden="true" /> : <Download size={16} aria-hidden="true" />}
        <span>{pdfPending ? "Generating PDF" : "Download PDF"}</span>
      </button>
      <label className="toggle">
        <input
          type="checkbox"
          disabled={usingMathJaxVector || usingMathJaxGlyph || usingKatexGlyph || usingNativeMath}
          checked={lockedPdfMode || experimentalVectorMath}
          onChange={(event) => onExperimentalVectorMathChange(event.target.checked)}
        />
        {usingKatexGlyph ? "KaTeX glyph PDF" : usingMathJaxGlyph ? "MathJax glyph PDF" : usingMathJaxVector ? "MathJax vector PDF" : usingNativeMath ? "Native PDF" : "Experimental vector math"}
      </label>
      <span>{layoutState.stats ? `${layoutState.stats.pageCount} pages` : "Laying out..."}</span>
    </div>
  );
}

function ZoomControl({ zoom, onZoomChange }: Pick<PreviewToolbarProps, "zoom" | "onZoomChange">) {
  return (
    <div className="svg-md-zoom-control">
      <button type="button" className="icon-button" onClick={() => onZoomChange(Math.max(0.55, zoom - 0.05))} title="Zoom out" aria-label="Zoom out">
        <ZoomOut size={17} aria-hidden="true" />
      </button>
      <input
        aria-label="Preview zoom"
        type="range"
        min="0.55"
        max="1.4"
        step="0.05"
        value={zoom}
        onChange={(event) => onZoomChange(Number(event.target.value))}
      />
      <button type="button" className="icon-button" onClick={() => onZoomChange(Math.min(1.4, zoom + 0.05))} title="Zoom in" aria-label="Zoom in">
        <ZoomIn size={17} aria-hidden="true" />
      </button>
      <span className="svg-md-zoom-value">{Math.round(zoom * 100)}%</span>
    </div>
  );
}
