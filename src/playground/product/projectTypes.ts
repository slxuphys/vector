export type ProjectFileLanguage = "markdown" | "latex" | "bibtex" | "text";

export type ProjectFile = {
  path: string;
  content: string;
  language: ProjectFileLanguage;
};

export type PlaygroundProject = {
  id: string;
  name: string;
  kind: "example" | "user";
  entryFile: string;
  files: ProjectFile[];
};
