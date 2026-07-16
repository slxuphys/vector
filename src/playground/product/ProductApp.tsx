import { useEffect, useMemo, useState } from "react";
import { FlaskConical } from "lucide-react";
import { MarkdownEditorPreview, type WorkspaceLayoutMode } from "../../react/MarkdownEditorPreview";
import {
  openMathTextFontFaceCss,
  openMathTextFontStack
} from "../../core/renderers/text/latinModernRomanFont";
import type { EngineOptions } from "../../core/engine/engineTypes";
import { ProjectSidebar } from "./ProjectSidebar";
import { ProjectActions } from "./ProjectActions";
import { ProjectSelector } from "./ProjectSelector";
import { useProjectFileSystem } from "./useProjectFileSystem";
import { WorkspaceRibbon } from "./WorkspaceRibbon";
import { isProjectTextFile, type ProjectAssetFile } from "./projectTypes";

export function ProductApp() {
  const fileSystem = useProjectFileSystem();
  const [filesVisible, setFilesVisible] = useState(true);
  const [layoutMode, setLayoutMode] = useState<WorkspaceLayoutMode>("split");
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    const saved = window.localStorage.getItem("vector-ui-theme");
    return saved === "dark" ? "dark" : "light";
  });

  useEffect(() => {
    window.localStorage.setItem("vector-ui-theme", theme);
  }, [theme]);

  const { projects, project, activeFile, activePath, projectId } = fileSystem;
  const activeTextFile = activeFile && isProjectTextFile(activeFile) ? activeFile : undefined;
  const previewAvailable = activeTextFile?.language === "markdown" || activeTextFile?.language === "latex";
  const sourceFormat = activeTextFile?.language === "latex" ? "latex" : "markdown";
  const bibliographyEntries = project.files
    .filter(isProjectTextFile)
    .filter((file) => file.language === "bibtex")
    .map((file) => [file.path, file.content] as const);
  const bibliographyKey = JSON.stringify(bibliographyEntries);
  const bibliographyFiles = useMemo(
    () => Object.fromEntries(bibliographyEntries),
    [bibliographyKey]
  );
  const assetEntries = project.files
    .filter((file): file is ProjectAssetFile => file.kind === "asset")
    .map((file) => [file.path, /\.pdf$/i.test(file.path) ? `${file.url}#asset.pdf` : file.url] as const);
  const assetKey = JSON.stringify(assetEntries);
  const assetUrls = useMemo(
    () => Object.fromEntries(assetEntries),
    [assetKey]
  );
  const options = useMemo<EngineOptions>(() => ({
    pageSize: "letter",
    sourceFormat,
    mathRenderer: "native-openmath",
    nativeMathProfile: "openmath",
    theme: {
      fontFamily: openMathTextFontStack("latin-modern"),
      fontFaceCss: openMathTextFontFaceCss("latin-modern")
    },
    bibliographyFiles,
    sourcePath: activeTextFile?.path,
    assetUrls
  }), [activeTextFile?.path, assetUrls, bibliographyFiles, sourceFormat]);

  return (
    <main className={`app app-product app-theme-${theme}`}>
      <header className="product-header">
        <div className="product-brand">
          <span className="product-mark">V</span>
          <h1>Vector</h1>
        </div>
        <div className="project-switcher">
          <ProjectSelector projects={projects} projectId={projectId} onProjectSelect={fileSystem.selectProject} />
          <ProjectActions
            storageStatus={fileSystem.storageStatus}
            storageError={fileSystem.storageError}
            onBrowserProjectCreate={(name) => void fileSystem.createBrowserProject(name)}
            onLocalFolderOpen={() => void fileSystem.openLocalFolder()}
          />
        </div>
        <a className="app-lab-link" href="?mode=lab" title="Open debug lab">
          <FlaskConical size={16} aria-hidden="true" />
          <span>Debug lab</span>
        </a>
      </header>
      <MarkdownEditorPreview
        documentKey={`${project.id}:${activeFile?.path ?? "empty"}`}
        initialMarkdown={activeTextFile?.content ?? ""}
        options={options}
        toolbarPlacement="preview"
        onSourceChange={fileSystem.updateActiveFile}
        layoutMode={layoutMode}
        leftPanelCompact={!filesVisible}
        editorTheme={theme}
        editorSourceFormat={activeTextFile?.language === "latex" ? "latex" : activeTextFile?.language === "markdown" ? "markdown" : "text"}
        previewAvailable={previewAvailable}
        previewUnavailableMessage={`Preview is not available for ${activeFile?.path ?? "this project"}.`}
        leftPanel={(
          <div className={filesVisible ? "project-navigation" : "project-navigation project-navigation-collapsed"}>
            <WorkspaceRibbon
              filesVisible={filesVisible}
              layoutMode={layoutMode}
              theme={theme}
              onFilesToggle={() => setFilesVisible((visible) => !visible)}
              onLayoutChange={setLayoutMode}
              onThemeToggle={() => setTheme((current) => current === "dark" ? "light" : "dark")}
            />
            {filesVisible ? (
              <ProjectSidebar
                key={project.id}
                files={project.files}
                directories={project.directories}
                activePath={activeFile?.path ?? activePath}
                onFileSelect={fileSystem.selectFile}
                onFileAdd={fileSystem.addFile}
                onFolderAdd={fileSystem.addFolder}
                onUpload={fileSystem.uploadFiles}
                onRename={fileSystem.renameEntry}
                onDelete={fileSystem.deleteEntry}
                onDownload={fileSystem.downloadEntry}
              />
            ) : null}
          </div>
        )}
      />
    </main>
  );
}
