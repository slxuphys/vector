import { useEffect, useMemo, useState } from "react";
import { FlaskConical } from "lucide-react";
import { MarkdownEditorPreview, type WorkspaceLayoutMode } from "../../react/MarkdownEditorPreview";
import {
  openMathTextFontFaceCss,
  openMathTextFontStack
} from "../../core/renderers/text/latinModernRomanFont";
import type { EngineOptions } from "../../core/engine/engineTypes";
import { ProjectSidebar } from "./ProjectSidebar";
import { ProjectSelector } from "./ProjectSelector";
import { useProjectFileSystem } from "./useProjectFileSystem";
import { WorkspaceRibbon } from "./WorkspaceRibbon";

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
  const previewAvailable = activeFile.language === "markdown" || activeFile.language === "latex";
  const sourceFormat = activeFile.language === "latex" ? "latex" : "markdown";
  const options = useMemo<EngineOptions>(() => ({
    pageSize: "letter",
    sourceFormat,
    mathRenderer: "native-openmath",
    nativeMathProfile: "openmath",
    theme: {
      fontFamily: openMathTextFontStack("latin-modern"),
      fontFaceCss: openMathTextFontFaceCss("latin-modern")
    },
    bibliographyFiles: Object.fromEntries(
      project.files
        .filter((file) => file.language === "bibtex")
        .map((file) => [file.path, file.content])
    )
  }), [project.files, sourceFormat]);

  return (
    <main className={`app app-product app-theme-${theme}`}>
      <header className="product-header">
        <div className="product-brand">
          <span className="product-mark">V</span>
          <h1>Vector</h1>
        </div>
        <ProjectSelector projects={projects} projectId={projectId} onProjectSelect={fileSystem.selectProject} />
        <a className="app-lab-link" href="?mode=lab" title="Open debug lab">
          <FlaskConical size={16} aria-hidden="true" />
          <span>Debug lab</span>
        </a>
      </header>
      <MarkdownEditorPreview
        key={`${project.id}:${activeFile.path}`}
        initialMarkdown={activeFile.content}
        options={options}
        toolbarPlacement="preview"
        onSourceChange={fileSystem.updateActiveFile}
        layoutMode={layoutMode}
        leftPanelCompact={!filesVisible}
        editorTheme={theme}
        editorSourceFormat={activeFile.language === "latex" ? "latex" : activeFile.language === "markdown" ? "markdown" : "text"}
        previewAvailable={previewAvailable}
        previewUnavailableMessage={`Preview is not available for ${activeFile.path}.`}
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
                files={project.files}
                activePath={activeFile.path}
                onFileSelect={fileSystem.selectFile}
                onFileAdd={fileSystem.addFile}
              />
            ) : null}
          </div>
        )}
      />
    </main>
  );
}
