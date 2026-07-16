import { ChevronDown, Folder, HardDrive, Sparkles, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { PlaygroundProject } from "./projectTypes";

export type ProjectSelectorProps = {
  projects: PlaygroundProject[];
  projectId: string;
  onProjectSelect: (id: string) => void;
  onProjectRemove: (id: string) => Promise<void>;
};

export function ProjectSelector({ projects, projectId, onProjectSelect, onProjectRemove }: ProjectSelectorProps) {
  const menuRef = useRef<HTMLDetailsElement | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<PlaygroundProject | undefined>();
  const [removing, setRemoving] = useState(false);
  const selected = projects.find((project) => project.id === projectId) ?? projects[0];
  const SelectedIcon = projectIcon(selected);

  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        menuRef.current?.removeAttribute("open");
        setPendingRemoval(undefined);
      }
    };
    window.addEventListener("pointerdown", closeOutside);
    return () => window.removeEventListener("pointerdown", closeOutside);
  }, []);

  return (
    <details className="project-menu" ref={menuRef}>
      <summary className="project-menu-trigger" aria-label="Choose project">
        <SelectedIcon size={15} aria-hidden="true" />
        <span>{selected.name}</span>
        <ChevronDown size={15} aria-hidden="true" />
      </summary>
      <div className="project-menu-popover">
        {pendingRemoval ? (
          <div className="project-menu-confirm" role="alertdialog" aria-label={removalLabel(pendingRemoval)}>
            <strong>{removalLabel(pendingRemoval)}?</strong>
            <span>{pendingRemoval.kind === "browser"
              ? `This permanently removes “${pendingRemoval.name}” from browser storage.`
              : `This closes “${pendingRemoval.name}” without changing its files.`}</span>
            <div>
              <button type="button" disabled={removing} onClick={() => setPendingRemoval(undefined)}>Cancel</button>
              <button
                type="button"
                className={pendingRemoval.kind === "browser" ? "project-menu-danger" : undefined}
                disabled={removing}
                onClick={async () => {
                  setRemoving(true);
                  try {
                    await onProjectRemove(pendingRemoval.id);
                    setPendingRemoval(undefined);
                    menuRef.current?.removeAttribute("open");
                  } catch {
                    // The project status area presents the storage error.
                  } finally {
                    setRemoving(false);
                  }
                }}
              >
                {removing ? "Working…" : pendingRemoval.kind === "browser" ? "Delete" : "Close"}
              </button>
            </div>
          </div>
        ) : projects.map((project) => {
          const Icon = projectIcon(project);
          return (
            <div
              className={project.id === projectId ? "project-menu-row project-menu-row-active" : "project-menu-row"}
              key={project.id}
            >
              <button
                type="button"
                className="project-menu-option"
                aria-current={project.id === projectId ? "true" : undefined}
                onClick={(event) => {
                  onProjectSelect(project.id);
                  event.currentTarget.closest("details")?.removeAttribute("open");
                }}
              >
                <Icon size={15} aria-hidden="true" />
                <span>{project.name}</span>
                <small>{projectLabel(project)}</small>
              </button>
              {project.kind !== "example" ? (
                <button
                  type="button"
                  className="project-menu-remove"
                  title={removalLabel(project)}
                  aria-label={`${removalLabel(project)} ${project.name}`}
                  onClick={() => setPendingRemoval(project)}
                >
                  {project.kind === "browser" ? <Trash2 size={14} /> : <X size={14} />}
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
    </details>
  );
}

function removalLabel(project: PlaygroundProject): string {
  return project.kind === "browser" ? "Delete project" : "Close project";
}

function projectIcon(project: PlaygroundProject) {
  if (project.kind === "example") return Sparkles;
  if (project.kind === "browser") return HardDrive;
  return Folder;
}

function projectLabel(project: PlaygroundProject): string {
  if (project.kind === "example") return "Example";
  if (project.kind === "browser") return "Browser";
  return "Local";
}
