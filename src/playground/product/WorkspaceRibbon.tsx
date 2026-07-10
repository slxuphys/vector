import { Columns2, FileText, LayoutTemplate, Moon, PanelLeft, PanelRight, Sun } from "lucide-react";
import type { WorkspaceLayoutMode } from "../../react/MarkdownEditorPreview";

export type WorkspaceRibbonProps = {
  filesVisible: boolean;
  layoutMode: WorkspaceLayoutMode;
  theme: "light" | "dark";
  onFilesToggle: () => void;
  onLayoutChange: (mode: WorkspaceLayoutMode) => void;
  onThemeToggle: () => void;
};

const layoutOptions: Array<{
  mode: WorkspaceLayoutMode;
  label: string;
  icon: typeof Columns2;
}> = [
  { mode: "split", label: "Split", icon: Columns2 },
  { mode: "editor", label: "Editor only", icon: PanelLeft },
  { mode: "preview", label: "Preview only", icon: PanelRight }
];

export function WorkspaceRibbon({
  filesVisible,
  layoutMode,
  theme,
  onFilesToggle,
  onLayoutChange,
  onThemeToggle
}: WorkspaceRibbonProps) {
  return (
    <div className="workspace-ribbon" aria-label="Workspace tools">
      <button
        type="button"
        className={filesVisible ? "ribbon-button ribbon-button-active" : "ribbon-button"}
        onClick={onFilesToggle}
        title={filesVisible ? "Hide files" : "Show files"}
        aria-label={filesVisible ? "Hide files" : "Show files"}
      >
        <FileText size={19} aria-hidden="true" />
      </button>
      <details className="layout-menu">
        <summary className="ribbon-button" title="Change layout" aria-label="Change layout">
          <LayoutTemplate size={19} aria-hidden="true" />
        </summary>
        <div className="layout-menu-popover">
          {layoutOptions.map(({ mode, label, icon: Icon }) => (
            <button
              type="button"
              key={mode}
              className={mode === layoutMode ? "layout-menu-option layout-menu-option-active" : "layout-menu-option"}
              onClick={(event) => {
                onLayoutChange(mode);
                event.currentTarget.closest("details")?.removeAttribute("open");
              }}
            >
              <Icon size={16} aria-hidden="true" />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </details>
      <button
        type="button"
        className="ribbon-button ribbon-theme-button"
        onClick={onThemeToggle}
        title={theme === "dark" ? "Use light theme" : "Use dark theme"}
        aria-label={theme === "dark" ? "Use light theme" : "Use dark theme"}
      >
        {theme === "dark" ? <Sun size={19} aria-hidden="true" /> : <Moon size={19} aria-hidden="true" />}
      </button>
    </div>
  );
}
