import { markdown as markdownLanguage } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { useEffect, useMemo, useRef, useState } from "react";
import type { EngineOptions } from "../core/engine/workerProtocol";
import { downloadPdf } from "../core/renderers/pdf/renderToPdf";
import { SvgPagedPreview } from "./SvgPagedPreview";
import { useDocumentLayout } from "./useDocumentLayout";

export type MarkdownEditorPreviewProps = {
  initialMarkdown?: string;
  options?: EngineOptions;
};

export function MarkdownEditorPreview({ initialMarkdown = "", options = {} }: MarkdownEditorPreviewProps) {
  const [markdown, setMarkdown] = useState(initialMarkdown);
  const [zoom, setZoom] = useState(0.9);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const previewUpdateRef = useRef<number | undefined>(undefined);
  const layoutState = useDocumentLayout(markdown, options);

  const extensions = useMemo(
    () => [
      history(),
      markdownLanguage(),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      EditorView.lineWrapping,
      EditorView.updateListener.of((update) => {
        if (!update.docChanged) return;
        const doc = update.state.doc;
        window.clearTimeout(previewUpdateRef.current);
        previewUpdateRef.current = window.setTimeout(() => {
          setMarkdown(doc.toString());
        }, 220);
      })
    ],
    []
  );

  useEffect(() => {
    if (!editorRef.current) return;
    const view = new EditorView({
      parent: editorRef.current,
      state: EditorState.create({ doc: initialMarkdown, extensions })
    });
    return () => {
      window.clearTimeout(previewUpdateRef.current);
      view.destroy();
    };
  }, [extensions, initialMarkdown]);

  return (
    <div className="svg-md-shell">
      <div className="svg-md-toolbar">
        <button
          type="button"
          disabled={!layoutState.layout}
          onClick={() => layoutState.layout && downloadPdf(layoutState.layout, "document.pdf")}
        >
          Download PDF
        </button>
        <label>
          Zoom
          <input
            type="range"
            min="0.55"
            max="1.4"
            step="0.05"
            value={zoom}
            onChange={(event) => setZoom(Number(event.target.value))}
          />
        </label>
        <span>{layoutState.stats ? `${layoutState.stats.pageCount} pages` : "Laying out..."}</span>
      </div>
      <div className="svg-md-workspace">
        <div className="svg-md-editor" ref={editorRef} />
        <div className="svg-md-preview-pane">
          {layoutState.error ? <div className="svg-md-error">{layoutState.error.message}</div> : null}
          {layoutState.layout ? (
            <SvgPagedPreview layout={layoutState.layout} zoom={zoom} timingLabel="svg-preview-render" />
          ) : null}
        </div>
      </div>
    </div>
  );
}
