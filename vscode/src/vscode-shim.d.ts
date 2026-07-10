declare module "vscode" {
  export type Disposable = { dispose(): void };
  export type Uri = {
    fsPath: string;
    path: string;
    toString(): string;
    with(change: { path?: string }): Uri;
  };
  export type TextDocument = {
    uri: Uri;
    fileName: string;
    languageId: string;
    getText(): string;
    offsetAt(position: Position): number;
    positionAt(offset: number): Position;
  };
  export type Position = { line: number; character: number };
  export type Range = { start: Position; end: Position };
  export const Range: { new(start: Position, end: Position): Range };
  export const Selection: { new(anchor: Position, active: Position): Selection };
  export type Selection = Range & { active: Position };
  export enum TextEditorRevealType { InCenter = 0 }
  export type TextEditor = {
    document: TextDocument;
    selection: Selection;
    revealRange(range: Range, revealType?: TextEditorRevealType): void;
  };
  export enum ViewColumn {
    Beside = -2
  }
  export type ExtensionContext = {
    extensionUri: Uri;
    subscriptions: Disposable[];
  };
  export type Webview = {
    html: string;
    postMessage(message: unknown): Thenable<boolean>;
  };
  export type WebviewPanel = Disposable & {
    title: string;
    webview: Webview;
    onDidDispose(listener: () => void): Disposable;
    reveal(column?: ViewColumn): void;
  };
  export const window: {
    activeTextEditor?: TextEditor;
    visibleTextEditors: readonly TextEditor[];
    createWebviewPanel(
      viewType: string,
      title: string,
      showOptions: ViewColumn,
      options?: { enableScripts?: boolean; localResourceRoots?: Uri[] }
    ): WebviewPanel;
    showWarningMessage(message: string): Thenable<string | undefined>;
    showInformationMessage(message: string): Thenable<string | undefined>;
    onDidChangeActiveTextEditor(listener: (editor: TextEditor | undefined) => void): Disposable;
  };
  export const commands: {
    registerCommand(command: string, callback: (...args: unknown[]) => unknown): Disposable;
  };
  export const workspace: {
    onDidChangeTextDocument(listener: (event: { document: TextDocument }) => void): Disposable;
  };
}
