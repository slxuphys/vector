import { ChevronDown, Folder, HardDrive, Sparkles } from "lucide-react";
import { useEffect, useRef } from "react";
import type { PlaygroundProject } from "./projectTypes";

export type ProjectSelectorProps = {
  projects: PlaygroundProject[];
  projectId: string;
  onProjectSelect: (id: string) => void;
};

export function ProjectSelector({ projects, projectId, onProjectSelect }: ProjectSelectorProps) {
  const menuRef = useRef<HTMLDetailsElement | null>(null);
  const selected = projects.find((project) => project.id === projectId) ?? projects[0];
  const SelectedIcon = projectIcon(selected);

  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) menuRef.current?.removeAttribute("open");
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
        {projects.map((project) => {
          const Icon = projectIcon(project);
          return (
            <button
              type="button"
              key={project.id}
              className={project.id === projectId ? "project-menu-option project-menu-option-active" : "project-menu-option"}
              onClick={(event) => {
                onProjectSelect(project.id);
                event.currentTarget.closest("details")?.removeAttribute("open");
              }}
            >
              <Icon size={15} aria-hidden="true" />
              <span>{project.name}</span>
              <small>{projectLabel(project)}</small>
            </button>
          );
        })}
      </div>
    </details>
  );
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
