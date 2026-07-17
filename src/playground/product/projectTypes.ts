export type ProjectFileLanguage = "markdown" | "latex" | "bibtex" | "text";

export type ProjectTextFile = {
  kind: "text";
  path: string;
  content: string;
  language: ProjectFileLanguage;
  lastModified?: number;
};

export type ProjectAssetFile = {
  kind: "asset" | "binary";
  path: string;
  mimeType: string;
  size: number;
  url: string;
  lastModified?: number;
};

export type ProjectFile = ProjectTextFile | ProjectAssetFile;

export type PlaygroundProject = {
  id: string;
  name: string;
  kind: "example" | "browser" | "local";
  entryFile: string;
  files: ProjectFile[];
  directories: string[];
};

export function isProjectTextFile(file: ProjectFile): file is ProjectTextFile {
  return file.kind === "text";
}
