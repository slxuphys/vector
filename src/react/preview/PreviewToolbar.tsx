import type { MathRendererName } from "../../core/engine/engineTypes";
import { isNativeMathRenderer } from "../../core/renderers/math/nativeMath";
import type { DocumentLayoutState } from "../useDocumentLayout";

export type PreviewToolbarProps = {
  layoutState: DocumentLayoutState;
  zoom: number;
  onZoomChange: (zoom: number) => void;
  pdfPending: boolean;
  onDownloadPdf: () => void;
  mathRenderer?: MathRendererName;
  experimentalVectorMath: boolean;
  onExperimentalVectorMathChange: (value: boolean) => void;
};

export function PreviewToolbar({
  layoutState,
  zoom,
  onZoomChange,
  pdfPending,
  onDownloadPdf,
  mathRenderer,
  experimentalVectorMath,
  onExperimentalVectorMathChange
}: PreviewToolbarProps) {
  const usingKatexGlyph = mathRenderer === "katex-glyph";
  const usingNativeMath = isNativeMathRenderer(mathRenderer);
  const usingMathJaxVector = mathRenderer === "mathjax-vector";
  const usingMathJaxGlyph = mathRenderer === "mathjax-glyph";
  const usingGlyphPdf = usingKatexGlyph || usingMathJaxGlyph;
  const lockedPdfMode = usingNativeMath || usingGlyphPdf || usingMathJaxVector;

  return (
    <div className="svg-md-toolbar">
      <button
        type="button"
        className="svg-md-download-button"
        disabled={!layoutState.layout || pdfPending}
        onClick={onDownloadPdf}
      >
        {pdfPending ? <span className="svg-md-spinner" aria-hidden="true" /> : null}
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
      <label>
        Zoom <span className="svg-md-zoom-value">{Math.round(zoom * 100)}%</span>
        <input
          type="range"
          min="0.55"
          max="1.4"
          step="0.05"
          value={zoom}
          onChange={(event) => onZoomChange(Number(event.target.value))}
        />
      </label>
      <span>{layoutState.stats ? `${layoutState.stats.pageCount} pages` : "Laying out..."}</span>
    </div>
  );
}
