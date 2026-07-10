import { ChevronDown, Folder, Sparkles } from "lucide-react";
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
  const SelectedIcon = selected.kind === "example" ? Sparkles : Folder;

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
          const Icon = project.kind === "example" ? Sparkles : Folder;
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
              {project.kind === "example" ? <small>Example</small> : null}
            </button>
          );
        })}
      </div>
    </details>
  );
}
