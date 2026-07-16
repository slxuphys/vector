import { Check, CircleAlert, FolderOpen, LoaderCircle, Plus, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { ProjectStorageStatus } from "./useProjectFileSystem";

export type ProjectActionsProps = {
  storageStatus: ProjectStorageStatus;
  storageError?: string;
  onBrowserProjectCreate: (name: string) => void;
  onLocalFolderOpen: () => void;
};

export function ProjectActions({
  storageStatus,
  storageError,
  onBrowserProjectCreate,
  onLocalFolderOpen
}: ProjectActionsProps) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("Untitled project");
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setCreating(false);
    };
    window.addEventListener("pointerdown", closeOutside);
    return () => window.removeEventListener("pointerdown", closeOutside);
  }, []);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const projectName = name.trim();
    if (!projectName) return;
    onBrowserProjectCreate(projectName);
    setCreating(false);
    setName("Untitled project");
  };

  return (
    <div className="project-actions" ref={rootRef}>
      <button
        type="button"
        className="icon-button project-action-button"
        onClick={() => setCreating((current) => !current)}
        title="New browser project"
        aria-label="New browser project"
        aria-expanded={creating}
      >
        <Plus size={17} aria-hidden="true" />
      </button>
      {creating ? (
        <form className="project-create-popover" onSubmit={submit}>
          <label htmlFor="project-name">New browser project</label>
          <input
            id="project-name"
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            onFocus={(event) => event.currentTarget.select()}
          />
          <div className="project-create-actions">
            <button type="submit" className="icon-button" title="Create project" aria-label="Create project">
              <Check size={16} aria-hidden="true" />
            </button>
            <button type="button" className="icon-button" onClick={() => setCreating(false)} title="Cancel" aria-label="Cancel">
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        </form>
      ) : null}
      <button
        type="button"
        className="icon-button project-action-button"
        onClick={onLocalFolderOpen}
        title="Open local folder"
        aria-label="Open local folder"
      >
        <FolderOpen size={17} aria-hidden="true" />
      </button>
      <ProjectStorageIndicator status={storageStatus} error={storageError} />
    </div>
  );
}

function ProjectStorageIndicator({ status, error }: { status: ProjectStorageStatus; error?: string }) {
  const visibleStatus = error ? "error" : status;
  const label = visibleStatus === "loading" ? "Loading"
    : visibleStatus === "saving" ? "Saving"
      : visibleStatus === "saved" ? "Saved"
        : visibleStatus === "error" ? "Save failed"
          : "";
  return (
    <span
      className={`project-storage-status project-storage-${visibleStatus}`}
      role="status"
      title={error}
      aria-label={error ?? label}
    >
      {visibleStatus === "loading" || visibleStatus === "saving"
        ? <LoaderCircle className="svg-md-spinner-icon" size={13} aria-hidden="true" />
        : visibleStatus === "saved"
          ? <Check size={13} aria-hidden="true" />
          : visibleStatus === "error"
            ? <CircleAlert size={13} aria-hidden="true" />
            : null}
      <span>{label}</span>
    </span>
  );
}
