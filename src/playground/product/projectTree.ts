import type { ProjectFile } from "./projectTypes";

export type ProjectTreeNode = {
  kind: "file" | "directory";
  name: string;
  path: string;
  file?: ProjectFile;
  children: ProjectTreeNode[];
};

export function buildProjectTree(files: ProjectFile[], directories: string[]): ProjectTreeNode[] {
  const root: ProjectTreeNode = { kind: "directory", name: "", path: "", children: [] };
  const directoryNodes = new Map<string, ProjectTreeNode>([["", root]]);
  const allDirectories = new Set(directories);
  for (const file of files) addParents(file.path, allDirectories);

  for (const path of [...allDirectories].sort(byDepthThenName)) {
    const parentPath = parentOf(path);
    const node: ProjectTreeNode = { kind: "directory", name: nameOf(path), path, children: [] };
    directoryNodes.set(path, node);
    directoryNodes.get(parentPath)?.children.push(node);
  }
  for (const file of files) {
    directoryNodes.get(parentOf(file.path))?.children.push({
      kind: "file",
      name: nameOf(file.path),
      path: file.path,
      file,
      children: []
    });
  }
  sortChildren(root);
  return root.children;
}

function addParents(path: string, directories: Set<string>) {
  let parent = parentOf(path);
  while (parent) {
    directories.add(parent);
    parent = parentOf(parent);
  }
}

function sortChildren(node: ProjectTreeNode) {
  node.children.sort((left, right) => left.kind === right.kind
    ? left.name.localeCompare(right.name)
    : left.kind === "directory" ? -1 : 1);
  for (const child of node.children) sortChildren(child);
}

function parentOf(path: string): string {
  const index = path.lastIndexOf("/");
  return index < 0 ? "" : path.slice(0, index);
}

function nameOf(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

function byDepthThenName(left: string, right: string): number {
  const depth = left.split("/").length - right.split("/").length;
  return depth || left.localeCompare(right);
}
