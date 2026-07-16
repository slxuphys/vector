import { useEffect, useMemo, useRef, useState, type FormEvent, type MouseEvent as ReactMouseEvent } from "react";
import {
  Check, ChevronDown, ChevronRight, Download, FileArchive, FileCode2, FileImage, FileQuestion,
  FileText, Folder, FolderOpen, FolderPlus, FolderUp, Pencil, Plus, Trash2, Upload, X
} from "lucide-react";
import { buildProjectTree, type ProjectTreeNode } from "./projectTree";
import type { ProjectFile } from "./projectTypes";

export type ProjectSidebarProps = {
  files: ProjectFile[];
  directories: string[];
  activePath: string;
  onFileSelect: (path: string) => void;
  onFileAdd: (path: string) => Promise<string | undefined>;
  onFolderAdd: (path: string) => Promise<string | undefined>;
  onUpload: (files: File[], targetDirectory?: string, preserveFolders?: boolean) => Promise<void>;
  onRename: (path: string, nextPath: string) => Promise<string | undefined>;
  onDelete: (path: string) => Promise<void>;
  onDownload: (path: string, directory: boolean) => Promise<void>;
};

type DialogState = { kind: "file" | "folder" | "rename" | "delete"; node?: ProjectTreeNode };
type ContextState = { x: number; y: number; node: ProjectTreeNode };

export function ProjectSidebar(props: ProjectSidebarProps) {
  const tree = useMemo(() => buildProjectTree(props.files, props.directories), [props.files, props.directories]);
  const [expanded, setExpanded] = useState(() => new Set(props.directories));
  const [dialog, setDialog] = useState<DialogState | undefined>();
  const [draftPath, setDraftPath] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [context, setContext] = useState<ContextState | undefined>();
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const uploadTarget = useRef("");

  useEffect(() => {
    if (!context) return;
    const close = () => setContext(undefined);
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    window.addEventListener("pointerdown", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [context]);

  const openDialog = (next: DialogState) => {
    const parent = next.node?.kind === "directory" ? next.node.path : parentOf(next.node?.path ?? "");
    const initial = next.kind === "rename" ? next.node?.path ?? "" : parent ? `${parent}/` : "";
    setDraftPath(initial);
    setError(undefined);
    setDialog(next);
    setContext(undefined);
  };

  const closeDialog = () => {
    setDialog(undefined);
    setDraftPath("");
    setError(undefined);
  };

  const submitDialog = async (event: FormEvent) => {
    event.preventDefault();
    if (!dialog) return;
    if (dialog.kind === "delete") {
      if (dialog.node) await props.onDelete(dialog.node.path);
      closeDialog();
      return;
    }
    const nextError = dialog.kind === "file"
      ? await props.onFileAdd(draftPath)
      : dialog.kind === "folder"
        ? await props.onFolderAdd(draftPath)
        : dialog.node ? await props.onRename(dialog.node.path, draftPath) : undefined;
    if (nextError) {
      setError(nextError);
      return;
    }
    closeDialog();
  };

  const openUpload = (folder: boolean, target = "") => {
    uploadTarget.current = target;
    (folder ? folderInput : fileInput).current?.click();
    setContext(undefined);
  };

  const handleUpload = async (input: HTMLInputElement, preserveFolders: boolean) => {
    await props.onUpload(Array.from(input.files ?? []), uploadTarget.current, preserveFolders);
    input.value = "";
  };

  const showContext = (event: ReactMouseEvent, node: ProjectTreeNode) => {
    event.preventDefault();
    event.stopPropagation();
    setContext({
      x: Math.max(6, Math.min(event.clientX, window.innerWidth - 200)),
      y: Math.max(6, Math.min(event.clientY, window.innerHeight - 250)),
      node
    });
  };

  return (
    <div className="project-sidebar" onContextMenu={(event) => event.preventDefault()}>
      <div className="project-sidebar-header">
        <span><FolderOpen size={15} aria-hidden="true" /> Files</span>
        <div className="project-sidebar-tools">
          <button type="button" className="icon-button" onClick={() => openDialog({ kind: "file" })} title="New file" aria-label="New file"><Plus size={16} /></button>
          <button type="button" className="icon-button" onClick={() => openDialog({ kind: "folder" })} title="New folder" aria-label="New folder"><FolderPlus size={16} /></button>
          <button type="button" className="icon-button" onClick={() => openUpload(false)} title="Upload files" aria-label="Upload files"><Upload size={16} /></button>
          <button type="button" className="icon-button" onClick={() => openUpload(true)} title="Upload folder" aria-label="Upload folder"><FolderUp size={16} /></button>
        </div>
      </div>
      <input ref={fileInput} className="project-hidden-input" type="file" multiple onChange={(event) => void handleUpload(event.currentTarget, false)} />
      <input
        ref={(element) => {
          folderInput.current = element;
          element?.setAttribute("webkitdirectory", "");
          element?.setAttribute("directory", "");
        }}
        className="project-hidden-input"
        type="file"
        multiple
        onChange={(event) => void handleUpload(event.currentTarget, true)}
      />
      <nav className="project-file-list" aria-label="Project files">
        {tree.map((node) => (
          <TreeEntry
            key={node.path}
            node={node}
            depth={0}
            activePath={props.activePath}
            expanded={expanded}
            onExpandedChange={setExpanded}
            onFileSelect={props.onFileSelect}
            onContextMenu={showContext}
          />
        ))}
      </nav>
      {dialog ? (
        <div className="project-dialog-backdrop" role="presentation" onPointerDown={closeDialog}>
          <form className="project-entry-dialog" onSubmit={submitDialog} onPointerDown={(event) => event.stopPropagation()}>
            <div className="project-entry-dialog-title">
              <span>{dialog.kind === "file" ? "New file" : dialog.kind === "folder" ? "New folder" : dialog.kind === "rename" ? "Rename" : "Delete entry"}</span>
              <button type="button" className="icon-button" onClick={closeDialog} aria-label="Close"><X size={16} /></button>
            </div>
            {dialog.kind === "delete" ? (
              <p>Delete <strong>{dialog.node?.name}</strong>{dialog.node?.kind === "directory" ? " and everything inside it" : ""}?</p>
            ) : (
              <input autoFocus value={draftPath} onChange={(event) => { setDraftPath(event.target.value); setError(undefined); }} aria-label="Project path" />
            )}
            {error ? <span className="project-file-create-error">{error}</span> : null}
            <div className="project-entry-dialog-actions">
              <button type="button" className="secondary-button" onClick={closeDialog}>Cancel</button>
              <button type="submit" className={dialog.kind === "delete" ? "danger-button" : "primary-button"}>
                {dialog.kind === "delete" ? <Trash2 size={15} /> : <Check size={15} />}
                {dialog.kind === "delete" ? "Delete" : "Confirm"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
      {context ? (
        <div className="project-context-menu" style={{ left: context.x, top: context.y }} onPointerDown={(event) => event.stopPropagation()}>
          {context.node.kind === "directory" ? (
            <>
              <button type="button" onClick={() => openDialog({ kind: "file", node: context.node })}><Plus size={15} /> New file inside</button>
              <button type="button" onClick={() => openDialog({ kind: "folder", node: context.node })}><FolderPlus size={15} /> New folder inside</button>
              <button type="button" onClick={() => openUpload(false, context.node.path)}><Upload size={15} /> Upload files here</button>
            </>
          ) : null}
          <button type="button" onClick={() => openDialog({ kind: "rename", node: context.node })}><Pencil size={15} /> Rename</button>
          <button type="button" onClick={() => { setContext(undefined); void props.onDownload(context.node.path, context.node.kind === "directory"); }}><Download size={15} /> Download</button>
          <div className="project-context-separator" />
          <button type="button" className="project-context-danger" onClick={() => openDialog({ kind: "delete", node: context.node })}><Trash2 size={15} /> Delete</button>
        </div>
      ) : null}
    </div>
  );
}

type TreeEntryProps = {
  node: ProjectTreeNode;
  depth: number;
  activePath: string;
  expanded: Set<string>;
  onExpandedChange: (value: Set<string>) => void;
  onFileSelect: (path: string) => void;
  onContextMenu: (event: ReactMouseEvent, node: ProjectTreeNode) => void;
};

function TreeEntry(props: TreeEntryProps) {
  const { node, depth } = props;
  const open = props.expanded.has(node.path);
  if (node.kind === "directory") {
    return (
      <div className="project-tree-directory">
        <button
          type="button"
          className="project-file project-directory"
          style={{ paddingLeft: 8 + depth * 14 }}
          onClick={() => {
            const next = new Set(props.expanded);
            if (open) next.delete(node.path); else next.add(node.path);
            props.onExpandedChange(next);
          }}
          onContextMenu={(event) => props.onContextMenu(event, node)}
        >
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          {open ? <FolderOpen size={15} /> : <Folder size={15} />}
          <span>{node.name}</span>
        </button>
        {open ? node.children.map((child) => (
          <TreeEntry key={child.path} {...props} node={child} depth={depth + 1} />
        )) : null}
      </div>
    );
  }
  const Icon = fileIcon(node.file);
  return (
    <button
      type="button"
      className={node.path === props.activePath ? "project-file project-file-active" : "project-file"}
      style={{ paddingLeft: 23 + depth * 14 }}
      onClick={() => props.onFileSelect(node.path)}
      onContextMenu={(event) => props.onContextMenu(event, node)}
    >
      <Icon size={15} aria-hidden="true" />
      <span>{node.name}</span>
    </button>
  );
}

function fileIcon(file: ProjectFile | undefined) {
  if (!file) return FileQuestion;
  if (file.kind === "asset") return file.mimeType === "application/pdf" ? FileArchive : FileImage;
  if (file.kind === "binary") return FileArchive;
  if (file.kind === "text" && file.language === "latex") return FileCode2;
  if (file.kind === "text" && file.language === "markdown") return FileText;
  return FileQuestion;
}

function parentOf(path: string): string {
  const index = path.lastIndexOf("/");
  return index < 0 ? "" : path.slice(0, index);
}
