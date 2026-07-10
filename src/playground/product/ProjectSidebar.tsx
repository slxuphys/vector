import { useState, type FormEvent } from "react";
import { Check, FileCode2, FileQuestion, FileText, FolderOpen, Plus, X } from "lucide-react";
import type { ProjectFile } from "./projectTypes";

export type ProjectSidebarProps = {
  files: ProjectFile[];
  activePath: string;
  onFileSelect: (path: string) => void;
  onFileAdd: (path: string) => string | undefined;
};

export function ProjectSidebar({ files, activePath, onFileSelect, onFileAdd }: ProjectSidebarProps) {
  const [adding, setAdding] = useState(false);
  const [draftPath, setDraftPath] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);

  const cancelAdd = () => {
    setAdding(false);
    setDraftPath("");
    setError(undefined);
  };

  const submitAdd = (event: FormEvent) => {
    event.preventDefault();
    const nextError = onFileAdd(draftPath);
    if (nextError) {
      setError(nextError);
      return;
    }
    cancelAdd();
  };

  return (
    <div className="project-sidebar">
      <div className="project-sidebar-header">
        <span><FolderOpen size={15} aria-hidden="true" /> Files</span>
        <button type="button" className="icon-button" onClick={() => setAdding(true)} title="New file" aria-label="New file">
          <Plus size={17} aria-hidden="true" />
        </button>
      </div>
      {adding ? (
        <form className="project-file-create" onSubmit={submitAdd}>
          <input
            autoFocus
            value={draftPath}
            onChange={(event) => {
              setDraftPath(event.target.value);
              setError(undefined);
            }}
            placeholder="filename.md"
            aria-label="New file name"
          />
          <button type="submit" className="icon-button" title="Create file" aria-label="Create file">
            <Check size={15} aria-hidden="true" />
          </button>
          <button type="button" className="icon-button" onClick={cancelAdd} title="Cancel" aria-label="Cancel new file">
            <X size={15} aria-hidden="true" />
          </button>
          {error ? <span className="project-file-create-error">{error}</span> : null}
        </form>
      ) : null}
      <nav className="project-file-list" aria-label="Project files">
        {files.map((file) => {
          const Icon = file.language === "latex" ? FileCode2
            : file.language === "markdown" ? FileText
              : FileQuestion;
          return (
            <button
              type="button"
              key={file.path}
              className={file.path === activePath ? "project-file project-file-active" : "project-file"}
              onClick={() => onFileSelect(file.path)}
            >
              <Icon size={15} aria-hidden="true" />
              <span>{file.path}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
