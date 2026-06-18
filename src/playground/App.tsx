import { useMemo, useState } from "react";
import { MarkdownEditorPreview } from "../react/MarkdownEditorPreview";
import { darkTheme, defaultTheme } from "../core/theme/defaultTheme";
import { playgroundSamples } from "./sampleMarkdown";

export function App() {
  const [sample, setSample] = useState<keyof typeof playgroundSamples>("short");
  const [pageSize, setPageSize] = useState<"letter" | "a4">("letter");
  const [margin, setMargin] = useState(64);
  const [dark, setDark] = useState(false);
  const options = useMemo(
    () => ({
      pageSize,
      margin,
      theme: dark ? darkTheme : defaultTheme,
      useWorker: true
    }),
    [pageSize, margin, dark]
  );

  return (
    <main className="app">
      <header className="app-header">
        <h1>SVG Markdown Preview</h1>
        <div className="app-controls">
          <label>
            Example
            <select value={sample} onChange={(event) => setSample(event.target.value as keyof typeof playgroundSamples)}>
              <option value="short">Short</option>
              <option value="long">Long</option>
            </select>
          </label>
          <label>
            Page
            <select value={pageSize} onChange={(event) => setPageSize(event.target.value as "letter" | "a4")}>
              <option value="letter">Letter</option>
              <option value="a4">A4</option>
            </select>
          </label>
          <label>
            Margin
            <input
              type="number"
              min="24"
              max="120"
              value={margin}
              onChange={(event) => setMargin(Number(event.target.value))}
            />
          </label>
          <label className="toggle">
            <input type="checkbox" checked={dark} onChange={(event) => setDark(event.target.checked)} />
            Dark page
          </label>
        </div>
      </header>
      <MarkdownEditorPreview key={sample} initialMarkdown={playgroundSamples[sample]} options={options} />
    </main>
  );
}
