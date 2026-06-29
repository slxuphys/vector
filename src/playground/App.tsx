import { useMemo, useState } from "react";
import { MarkdownEditorPreview } from "../react/MarkdownEditorPreview";
import { darkTheme, defaultTheme } from "../core/theme/defaultTheme";
import type { MathRendererName } from "../core/engine/workerProtocol";
import { defaultNativeMathMetrics, type NativeMathMetrics } from "../core/renderers/math/nativeMath";
import { playgroundSamples } from "./sampleMarkdown";

export function App() {
  const [sample, setSample] = useState<keyof typeof playgroundSamples>("mathHeavy");
  const [font, setFont] = useState<"sans" | "tex">("sans");
  const [mathRenderer, setMathRenderer] = useState<MathRendererName>("native");
  const [pageSize, setPageSize] = useState<"letter" | "a4">("letter");
  const [margin, setMargin] = useState(64);
  const [dark, setDark] = useState(false);
  const [nativeMetrics, setNativeMetrics] = useState<NativeMathMetrics>(defaultNativeMathMetrics);
  const options = useMemo(
    () => {
      const theme = dark ? darkTheme : defaultTheme;
      return {
        pageSize,
        margin,
        mathRenderer,
        theme: font === "tex"
          ? {
              ...theme,
              fontFamily: "KaTeX_Main, 'Times New Roman', serif"
            }
          : theme,
        nativeMathMetrics: nativeMetrics,
        useWorker: false
      };
    },
    [pageSize, margin, dark, font, mathRenderer, nativeMetrics]
  );

  const updateNativeMetric = (key: keyof NativeMathMetrics, value: number) => {
    setNativeMetrics((current) => ({ ...current, [key]: value }));
  };

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
              <option value="hundred">100 pages</option>
              <option value="mathHeavy">Math heavy</option>
            </select>
          </label>
          <label>
            Math
            <select
              value={mathRenderer}
              onChange={(event) => setMathRenderer(event.target.value as MathRendererName)}
            >
              <option value="katex-raster">KaTeX raster</option>
              <option value="katex-glyph">KaTeX glyph</option>
              <option value="mathjax-vector">MathJax vector</option>
              <option value="mathjax-glyph">MathJax glyph</option>
              <option value="native">Native engine</option>
            </select>
          </label>
          <label>
            Font
            <select value={font} onChange={(event) => setFont(event.target.value as "sans" | "tex")}>
              <option value="sans">Sans</option>
              <option value="tex">TeX</option>
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
      <MarkdownEditorPreview
        key={sample}
        initialMarkdown={playgroundSamples[sample]}
        options={options}
        sidePanel={(
          <NativeMathTuner
            metrics={nativeMetrics}
            disabled={mathRenderer !== "native"}
            onChange={updateNativeMetric}
            onReset={() => setNativeMetrics(defaultNativeMathMetrics)}
          />
        )}
      />
    </main>
  );
}

type MetricControl = {
  key: keyof NativeMathMetrics;
  label: string;
  min: number;
  max: number;
  step: number;
};

const metricGroups: Array<{ title: string; controls: MetricControl[] }> = [
  {
    title: "Box",
    controls: [
      { key: "inlinePadding", label: "Inline padding", min: 0, max: 0.4, step: 0.01 },
      { key: "displayPadding", label: "Display padding", min: 0, max: 0.6, step: 0.01 },
      { key: "inlineBaseline", label: "Inline baseline", min: 0.55, max: 1.15, step: 0.01 },
      { key: "inlineGlyphGap", label: "Inline glyph gap", min: 0, max: 0.16, step: 0.005 },
      { key: "displayGlyphGap", label: "Display glyph gap", min: 0, max: 0.16, step: 0.005 }
    ]
  },
  {
    title: "Scripts",
    controls: [
      { key: "scriptScale", label: "Script scale", min: 0.45, max: 0.9, step: 0.01 },
      { key: "superscriptBaseline", label: "Sup baseline", min: -0.8, max: -0.05, step: 0.01 },
      { key: "subscriptBaseline", label: "Sub baseline", min: 0.05, max: 0.7, step: 0.01 },
      { key: "scriptGap", label: "Script gap", min: 0, max: 0.24, step: 0.005 }
    ]
  },
  {
    title: "Fractions",
    controls: [
      { key: "inlineFractionScale", label: "Inline child scale", min: 0.45, max: 1, step: 0.01 },
      { key: "displayFractionScale", label: "Display child scale", min: 0.55, max: 1.1, step: 0.01 },
      { key: "fractionGap", label: "Vertical gap", min: 0.05, max: 0.5, step: 0.01 },
      { key: "fractionRuleThickness", label: "Rule thickness", min: 0.01, max: 0.12, step: 0.005 },
      { key: "fractionSidePadding", label: "Side padding", min: 0, max: 1.2, step: 0.01 },
      { key: "fractionRuleInset", label: "Rule inset", min: 0, max: 0.5, step: 0.01 },
      { key: "displayFractionDenominatorBaseline", label: "Display denom baseline", min: 0, max: 1, step: 0.01 },
      { key: "inlineFractionAxisOffset", label: "Inline axis offset", min: -0.2, max: 0.3, step: 0.01 }
    ]
  },
  {
    title: "Roots",
    controls: [
      { key: "sqrtBodyScale", label: "Body scale", min: 0.5, max: 1.2, step: 0.01 },
      { key: "sqrtRadicalWidth", label: "Radical width", min: 0.3, max: 1.2, step: 0.01 },
      { key: "sqrtTopGap", label: "Bar-body gap", min: 0, max: 0.3, step: 0.005 },
      { key: "sqrtRuleThickness", label: "Rule thickness", min: 0.01, max: 0.12, step: 0.005 },
      { key: "sqrtRuleStart", label: "Rule start", min: 0.2, max: 1.1, step: 0.01 },
      { key: "sqrtOverbarExtra", label: "Overbar extra", min: 0, max: 0.5, step: 0.01 }
    ]
  },
  {
    title: "Operators",
    controls: [
      { key: "displayLargeOperatorSuperscriptBaseline", label: "Large op sup baseline", min: -1.4, max: -0.2, step: 0.01 },
      { key: "displayLargeOperatorSubscriptBaseline", label: "Large op sub baseline", min: 0.2, max: 1.2, step: 0.01 },
      { key: "displayLargeOperatorSuperscriptGap", label: "Large op sup gap", min: 0, max: 1, step: 0.01 },
      { key: "displayLargeOperatorSubscriptGap", label: "Large op sub gap", min: 0, max: 1, step: 0.01 },
      { key: "displayLimitOperatorSuperscriptBaseline", label: "Limit op sup baseline", min: -1.4, max: -0.2, step: 0.01 },
      { key: "displayLimitOperatorSubscriptBaseline", label: "Limit op sub baseline", min: 0.2, max: 1.2, step: 0.01 },
      { key: "namedOperatorRightMargin", label: "Named op right margin", min: 0, max: 0.5, step: 0.01 },
      { key: "relationMargin", label: "Relation margin", min: 0, max: 0.5, step: 0.01 },
      { key: "binaryMargin", label: "Binary margin", min: 0, max: 0.5, step: 0.01 }
    ]
  }
];

function NativeMathTuner({
  metrics,
  disabled,
  onChange,
  onReset
}: {
  metrics: NativeMathMetrics;
  disabled?: boolean;
  onChange: (key: keyof NativeMathMetrics, value: number) => void;
  onReset: () => void;
}) {
  return (
    <div className={disabled ? "native-tuner native-tuner-disabled" : "native-tuner"}>
      <div className="native-tuner-header">
        <h2>Native Math</h2>
        <button type="button" disabled={disabled} onClick={onReset}>Reset</button>
      </div>
      {metricGroups.map((group) => (
        <section key={group.title} className="native-tuner-group">
          <h3>{group.title}</h3>
          {group.controls.map((control) => {
            const changed = Math.abs(metrics[control.key] - defaultNativeMathMetrics[control.key]) > 0.0005;
            return (
              <label
                key={control.key}
                className={changed ? "native-metric-control native-metric-control-changed" : "native-metric-control"}
              >
                <span>
                  {control.label}
                  {changed ? <i aria-label="Changed from default" title="Changed from default" /> : null}
                </span>
                <input
                  type="range"
                  disabled={disabled}
                  min={control.min}
                  max={control.max}
                  step={control.step}
                  value={metrics[control.key]}
                  onChange={(event) => onChange(control.key, Number(event.target.value))}
                />
                <input
                  type="number"
                  disabled={disabled}
                  min={control.min}
                  max={control.max}
                  step={control.step}
                  value={Number(metrics[control.key].toFixed(3))}
                  onChange={(event) => onChange(control.key, Number(event.target.value))}
                />
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onChange(control.key, defaultNativeMathMetrics[control.key])}
                >
                  Reset
                </button>
              </label>
            );
          })}
        </section>
      ))}
    </div>
  );
}
