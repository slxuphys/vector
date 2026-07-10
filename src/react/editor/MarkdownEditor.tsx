import { markdown as markdownLanguage } from "@codemirror/lang-markdown";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { useEffect, useMemo, useRef } from "react";

export type MarkdownEditorController = {
  revealSource(source: { start: number; end: number }): void;
};

export type MarkdownEditorProps = {
  initialMarkdown: string;
  debounceMs?: number;
  onDebouncedChange: (markdown: string, timing: {
    editedAt: number;
    debounceFinishedAt: number;
    debounceMs: number;
  }) => void;
  onReady?: () => void;
  onSelectionChange?: (offset: number) => void;
  onControllerReady?: (controller: MarkdownEditorController) => void;
};

export function MarkdownEditor({
  initialMarkdown,
  debounceMs = 150,
  onDebouncedChange,
  onReady,
  onSelectionChange,
  onControllerReady
}: MarkdownEditorProps) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const previewUpdateRef = useRef<number | undefined>(undefined);
  const callbacksRef = useRef({ onSelectionChange, onControllerReady });

  useEffect(() => {
    callbacksRef.current = { onSelectionChange, onControllerReady };
  }, [onControllerReady, onSelectionChange]);

  const extensions = useMemo(
    () => [
      history(),
      markdownLanguage(),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      EditorView.lineWrapping,
      EditorView.domEventHandlers({
        mousedown(event, view) {
          if (!event.ctrlKey && !event.metaKey) return false;
          const position = view.posAtCoords({ x: event.clientX, y: event.clientY });
          if (position !== null) callbacksRef.current.onSelectionChange?.(position);
          return false;
        }
      }),
      EditorView.updateListener.of((update) => {
        if (!update.docChanged) return;
        const doc = update.state.doc;
        const editedAt = performance.now();
        window.clearTimeout(previewUpdateRef.current);
        previewUpdateRef.current = window.setTimeout(() => {
          const debounceFinishedAt = performance.now();
          onDebouncedChange(doc.toString(), {
            editedAt,
            debounceFinishedAt,
            debounceMs: debounceFinishedAt - editedAt
          });
        }, debounceMs);
      })
    ],
    [debounceMs, onDebouncedChange]
  );

  useEffect(() => {
    if (!editorRef.current) return;
    const view = new EditorView({
      parent: editorRef.current,
      state: EditorState.create({ doc: initialMarkdown, extensions })
    });
    callbacksRef.current.onControllerReady?.({
      revealSource(source) {
        view.dispatch({
          selection: { anchor: source.start, head: source.start },
          effects: EditorView.scrollIntoView(source.start, { y: "center" })
        });
        view.focus();
      }
    });
    onReady?.();
    return () => {
      window.clearTimeout(previewUpdateRef.current);
      view.destroy();
    };
  }, [extensions, initialMarkdown, onReady]);

  return <div className="svg-md-editor" ref={editorRef} />;
}
