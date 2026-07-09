import { markdown as markdownLanguage } from "@codemirror/lang-markdown";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { useEffect, useMemo, useRef } from "react";

export type MarkdownEditorProps = {
  initialMarkdown: string;
  debounceMs?: number;
  onDebouncedChange: (markdown: string, timing: {
    editedAt: number;
    debounceFinishedAt: number;
    debounceMs: number;
  }) => void;
  onReady?: () => void;
};

export function MarkdownEditor({
  initialMarkdown,
  debounceMs = 150,
  onDebouncedChange,
  onReady
}: MarkdownEditorProps) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const previewUpdateRef = useRef<number | undefined>(undefined);

  const extensions = useMemo(
    () => [
      history(),
      markdownLanguage(),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      EditorView.lineWrapping,
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
    onReady?.();
    return () => {
      window.clearTimeout(previewUpdateRef.current);
      view.destroy();
    };
  }, [extensions, initialMarkdown, onReady]);

  return <div className="svg-md-editor" ref={editorRef} />;
}
