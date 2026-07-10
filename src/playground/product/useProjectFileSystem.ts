import { useCallback, useState } from "react";
import { sampleProjects } from "./sampleProjects";
import type { PlaygroundProject, ProjectFileLanguage } from "./projectTypes";

export function useProjectFileSystem() {
  const [projects, setProjects] = useState<PlaygroundProject[]>(() => structuredClone(sampleProjects));
  const [projectId, setProjectId] = useState(sampleProjects[1].id);
  const [activePath, setActivePath] = useState(sampleProjects[1].entryFile);

  const project = projects.find((candidate) => candidate.id === projectId) ?? projects[0];
  const activeFile = project.files.find((file) => file.path === activePath)
    ?? project.files.find((file) => file.path === project.entryFile)
    ?? project.files[0];

  const selectProject = useCallback((nextId: string) => {
    const nextProject = projects.find((candidate) => candidate.id === nextId);
    if (!nextProject) return;
    setProjectId(nextId);
    setActivePath(nextProject.entryFile);
  }, [projects]);

  const updateActiveFile = useCallback((content: string) => {
    setProjects((current) => current.map((candidate) => candidate.id !== project.id
      ? candidate
      : {
          ...candidate,
          files: candidate.files.map((file) => file.path === activeFile.path ? { ...file, content } : file)
        }));
  }, [activeFile.path, project.id]);

  const addFile = useCallback((requestedPath: string): string | undefined => {
    const path = requestedPath.trim().replaceAll("\\", "/");
    if (!path) return "Enter a file name.";
    if (path.endsWith("/") || path.includes("//")) return "Enter a valid file path.";
    if (project.files.some((file) => file.path.toLowerCase() === path.toLowerCase())) {
      return "A file with this name already exists.";
    }

    const language = languageForPath(path);
    setProjects((current) => current.map((candidate) => candidate.id !== project.id
      ? candidate
      : { ...candidate, files: [...candidate.files, { path, content: "", language }] }));
    setActivePath(path);
    return undefined;
  }, [project.files, project.id]);

  return {
    projects,
    project,
    activeFile,
    activePath,
    projectId,
    selectProject,
    selectFile: setActivePath,
    updateActiveFile,
    addFile
  };
}

export function languageForPath(path: string): ProjectFileLanguage {
  const extension = path.toLowerCase().split(".").pop();
  if (extension === "md" || extension === "markdown") return "markdown";
  if (extension === "tex" || extension === "latex") return "latex";
  if (extension === "bib") return "bibtex";
  return "text";
}
