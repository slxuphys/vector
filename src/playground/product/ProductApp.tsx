import { useMemo, useState } from "react";
import { MarkdownEditorPreview } from "../../react/MarkdownEditorPreview";
import { defaultTheme } from "../../core/theme/defaultTheme";
import {
  openMathTextFontFaceCss,
  openMathTextFontStack
} from "../../core/renderers/text/latinModernRomanFont";
import type { EngineOptions } from "../../core/engine/engineTypes";
import type { OpenMathFontProfileName } from "../../core/renderers/math/openMathFont";
import type { NativeMathFontProfileName } from "../../core/renderers/math/nativeMathProfiles";
import {
  productExampleLabels,
  productExamples,
  productExamplesByFormat,
  type ProductExampleKey,
  type ProductFormat
} from "./productExamples";

type ProductFont = OpenMathFontProfileName;

export function ProductApp() {
  const [sourceFormat, setSourceFormat] = useState<ProductFormat>("latex");
  const [sampleByFormat, setSampleByFormat] = useState<Record<ProductFormat, ProductExampleKey>>({
    markdown: "markdownNote",
    latex: "latexArticle"
  });
  const [font, setFont] = useState<ProductFont>("latin-modern");
  const [pageSize, setPageSize] = useState<"letter" | "a4">("letter");

  const sample = sampleByFormat[sourceFormat];
  const sampleOptions = productExamplesByFormat[sourceFormat];
  const nativeMathProfile = useMemo<NativeMathFontProfileName>(() => {
    if (font === "new-computer-modern") return "openmath-new-computer-modern";
    if (font === "libertinus") return "openmath-libertinus";
    return "openmath";
  }, [font]);
  const options = useMemo<EngineOptions>(() => ({
    pageSize,
    sourceFormat,
    mathRenderer: "native-openmath",
    nativeMathProfile,
    theme: sourceFormat === "latex"
      ? {
          fontFamily: openMathTextFontStack(font),
          fontFaceCss: openMathTextFontFaceCss(font)
        }
      : {
          ...defaultTheme,
          fontFamily: openMathTextFontStack(font),
          fontFaceCss: openMathTextFontFaceCss(font)
        },
  }), [font, nativeMathProfile, pageSize, sourceFormat]);

  return (
    <main className="app app-product">
      <header className="app-header">
        <h1>Vector Preview</h1>
        <div className="app-controls">
          <label>
            Format
            <select
              value={sourceFormat}
              onChange={(event) => setSourceFormat(event.target.value as ProductFormat)}
            >
              <option value="markdown">Markdown</option>
              <option value="latex">LaTeX</option>
            </select>
          </label>
          <label>
            Example
            <select
              value={sample}
              onChange={(event) => setSampleByFormat((current) => ({
                ...current,
                [sourceFormat]: event.target.value as ProductExampleKey
              }))}
            >
              {Object.keys(sampleOptions).map((key) => (
                <option key={key} value={key}>{productExampleLabels[key as ProductExampleKey]}</option>
              ))}
            </select>
          </label>
          <label>
            Font
            <select value={font} onChange={(event) => setFont(event.target.value as ProductFont)}>
              <option value="latin-modern">Latin Modern</option>
              <option value="libertinus">Libertinus</option>
              <option value="new-computer-modern">New Computer Modern</option>
            </select>
          </label>
          <label>
            Page
            <select value={pageSize} onChange={(event) => setPageSize(event.target.value as "letter" | "a4")}>
              <option value="letter">Letter</option>
              <option value="a4">A4</option>
            </select>
          </label>
          <a className="app-lab-link" href="?mode=lab">Debug lab</a>
        </div>
      </header>
      <MarkdownEditorPreview
        key={`${sourceFormat}:${sample}`}
        initialMarkdown={productExamples[sample]}
        options={options}
      />
    </main>
  );
}
