import { markdown as markdownLanguage } from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { Compartment, EditorState, type Extension } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { latex } from "codemirror-lang-latex";
import { useEffect, useMemo, useRef } from "react";

export type MarkdownEditorController = {
  revealSource(source: { start: number; end: number }): void;
};

export type MarkdownEditorProps = {
  initialMarkdown: string;
  sourceFormat?: "markdown" | "latex" | "text";
  theme?: "light" | "dark";
  debounceMs?: number;
  onDebouncedChange: (markdown: string, timing: {
    editedAt: number;
    debounceFinishedAt: number;
    debounceMs: number;
  }) => void;
  onChange?: (markdown: string) => void;
  onReady?: () => void;
  onSelectionChange?: (offset: number) => void;
  onControllerReady?: (controller: MarkdownEditorController) => void;
};

export function MarkdownEditor({
  initialMarkdown,
  sourceFormat = "markdown",
  theme = "light",
  debounceMs = 150,
  onDebouncedChange,
  onChange,
  onReady,
  onSelectionChange,
  onControllerReady
}: MarkdownEditorProps) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | undefined>(undefined);
  const previewUpdateRef = useRef<number | undefined>(undefined);
  const callbacksRef = useRef({ onSelectionChange, onControllerReady, onChange });
  const languageCompartment = useMemo(() => new Compartment(), []);
  const themeCompartment = useMemo(() => new Compartment(), []);
  const initialMarkdownRef = useRef(initialMarkdown);
  const initialSourceFormatRef = useRef(sourceFormat);
  const initialThemeRef = useRef(theme);

  useEffect(() => {
    callbacksRef.current = { onSelectionChange, onControllerReady, onChange };
  }, [onChange, onControllerReady, onSelectionChange]);

  const extensions = useMemo(
    () => [
      history(),
      languageCompartment.of(editorLanguage(initialSourceFormatRef.current)),
      themeCompartment.of(editorTheme(initialThemeRef.current)),
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
        callbacksRef.current.onChange?.(doc.toString());
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
    [debounceMs, languageCompartment, onDebouncedChange, themeCompartment]
  );

  useEffect(() => {
    if (!editorRef.current) return;
    const view = new EditorView({
      parent: editorRef.current,
      state: EditorState.create({ doc: initialMarkdownRef.current, extensions })
    });
    viewRef.current = view;
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
      if (viewRef.current === view) viewRef.current = undefined;
      view.destroy();
    };
  }, [extensions, onReady]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({ effects: languageCompartment.reconfigure(editorLanguage(sourceFormat)) });
  }, [languageCompartment, sourceFormat]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({ effects: themeCompartment.reconfigure(editorTheme(theme)) });
  }, [theme, themeCompartment]);

  return <div className="svg-md-editor" ref={editorRef} />;
}

const lightHighlightStyle = HighlightStyle.define([
  { tag: tags.heading, color: "#174f86", fontWeight: "700" },
  { tag: [tags.keyword, tags.controlKeyword, tags.definitionKeyword], color: "#7c3aed" },
  { tag: [tags.name, tags.variableName], color: "#243b53" },
  { tag: [tags.definition(tags.variableName), tags.function(tags.variableName)], color: "#075985" },
  { tag: [tags.string, tags.special(tags.string)], color: "#16794a" },
  { tag: [tags.number, tags.bool, tags.null], color: "#b45309" },
  { tag: [tags.operator, tags.arithmeticOperator, tags.logicOperator], color: "#9f1239" },
  { tag: [tags.comment, tags.lineComment, tags.blockComment], color: "#64748b", fontStyle: "italic" },
  { tag: [tags.link, tags.url], color: "#0369a1", textDecoration: "underline" },
  { tag: tags.emphasis, color: "#7c3aed", fontStyle: "italic" },
  { tag: tags.strong, color: "#9a3412", fontWeight: "700" },
  { tag: [tags.meta, tags.processingInstruction], color: "#be123c" },
  { tag: tags.invalid, color: "#c2410c", textDecoration: "underline wavy" }
]);

const darkHighlightStyle = HighlightStyle.define([
  { tag: tags.heading, color: "#82bfff", fontWeight: "700" },
  { tag: [tags.keyword, tags.controlKeyword, tags.definitionKeyword], color: "#c4a7ff" },
  { tag: [tags.name, tags.variableName], color: "#dbe7f3" },
  { tag: [tags.definition(tags.variableName), tags.function(tags.variableName)], color: "#80c8ff" },
  { tag: [tags.string, tags.special(tags.string)], color: "#9bdca8" },
  { tag: [tags.number, tags.bool, tags.null], color: "#ffbd7a" },
  { tag: [tags.operator, tags.arithmeticOperator, tags.logicOperator], color: "#ff9db0" },
  { tag: [tags.comment, tags.lineComment, tags.blockComment], color: "#8492a6", fontStyle: "italic" },
  { tag: [tags.link, tags.url], color: "#79c7ff", textDecoration: "underline" },
  { tag: tags.emphasis, color: "#c4a7ff", fontStyle: "italic" },
  { tag: tags.strong, color: "#ffc777", fontWeight: "700" },
  { tag: [tags.meta, tags.processingInstruction], color: "#ff8fa3" },
  { tag: tags.invalid, color: "#ff6b7a", textDecoration: "underline wavy" }
]);

function editorTheme(theme: "light" | "dark"): Extension {
  const dark = theme === "dark";
  return [
    EditorView.theme({
      "&": {
        color: dark ? "#e7edf4" : "#172033",
        backgroundColor: dark ? "#1d232c" : "#ffffff"
      },
      ".cm-content": {
        caretColor: dark ? "#ffffff" : "#102a43"
      },
      "&.cm-focused .cm-cursor": {
        borderLeftColor: dark ? "#ffffff" : "#102a43",
        borderLeftWidth: "2px"
      },
      "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {
        backgroundColor: dark ? "#31577d" : "#b9dcff"
      },
      ".cm-gutters": {
        backgroundColor: dark ? "#181e26" : "#f6f8fa",
        color: dark ? "#8190a1" : "#667085",
        borderRightColor: dark ? "#38424e" : "#d8e0e8"
      },
      ".cm-activeLine, .cm-activeLineGutter": {
        backgroundColor: dark ? "#252e39" : "#f3f7fb"
      },
      ".cm-matchingBracket": {
        backgroundColor: dark ? "#3b526b" : "#d7ebff",
        outline: dark ? "1px solid #74b9ff" : "1px solid #4b8dca"
      }
    }, { dark }),
    syntaxHighlighting(dark ? darkHighlightStyle : lightHighlightStyle)
  ];
}

function editorLanguage(sourceFormat: "markdown" | "latex" | "text"): Extension {
  if (sourceFormat === "text") return [];
  return sourceFormat === "latex"
    ? latex({
        autoCloseTags: false,
        autoCloseBrackets: false,
        enableAutocomplete: false,
        enableLinting: false,
        enableTooltips: false
      })
    : markdownLanguage();
}
