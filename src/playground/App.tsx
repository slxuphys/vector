import { useEffect, useMemo, useState } from "react";
import { MarkdownEditorPreview } from "../react/MarkdownEditorPreview";
import { darkTheme, defaultTheme } from "../core/theme/defaultTheme";
import type { MathRendererName } from "../core/engine/workerProtocol";
import {
  defaultDebugLogSettings,
  readDebugLogSettings,
  writeDebugLogSettings,
  type DebugLogKey,
  type DebugLogSettings
} from "../core/utils/debugSettings";
import {
  defaultNativeMathMetrics,
  defaultOpenMathMetrics,
  getDefaultOpenMathMetricsForProfile,
  isNativeMathRenderer,
  type NativeMathMetrics
} from "../core/renderers/math/nativeMath";
import type { NativeMathFontProfileName } from "../core/renderers/math/nativeMathProfiles";
import { loadNativeMathFonts, setActiveOpenMathFontProfile } from "../core/renderers/math/nativeFontMetrics";
import {
  openMathTextFontFaceCss,
  openMathTextFontStack
} from "../core/renderers/text/latinModernRomanFont";
import type { OpenMathFontProfileName } from "../core/renderers/math/openMathFont";
import { playgroundSamples } from "./sampleMarkdown";

type PlaygroundFont = "sans" | "tex";
type FontSelectValue = PlaygroundFont | OpenMathFontProfileName;

export function App() {
  const [sample, setSample] = useState<keyof typeof playgroundSamples>("mathHeavy");
  const [font, setFont] = useState<PlaygroundFont>("sans");
  const [openMathFont, setOpenMathFont] = useState<OpenMathFontProfileName>("latin-modern");
  const [mathRenderer, setMathRenderer] = useState<MathRendererName>("native-openmath");
  const [pageSize, setPageSize] = useState<"letter" | "a4">("letter");
  const [margin, setMargin] = useState(64);
  const [dark, setDark] = useState(false);
  const [nativeMetrics, setNativeMetrics] = useState<NativeMathMetrics>(defaultNativeMathMetrics);
  const [openMathMetrics, setOpenMathMetrics] = useState<NativeMathMetrics>(defaultOpenMathMetrics);
  const [openMathDefaults, setOpenMathDefaults] = useState<NativeMathMetrics>(defaultOpenMathMetrics);
  const [debugLogs, setDebugLogs] = useState<DebugLogSettings>(() => readDebugLogSettings());
  const nativeMathProfile: NativeMathFontProfileName | undefined = mathRenderer === "native-openmath"
    ? openMathFont === "new-computer-modern"
      ? "openmath-new-computer-modern"
      : openMathFont === "libertinus"
        ? "openmath-libertinus"
        : "openmath"
    : undefined;
  const activeNativeMetrics = mathRenderer === "native-openmath" ? openMathMetrics : nativeMetrics;
  const activeNativeDefaults = mathRenderer === "native-openmath" ? openMathDefaults : defaultNativeMathMetrics;
  const effectiveFont: FontSelectValue = mathRenderer === "native-openmath" ? openMathFont : font;
  const options = useMemo(
    () => {
      const theme = dark ? darkTheme : defaultTheme;
      return {
        pageSize,
        margin,
        mathRenderer,
        theme: mathRenderer === "native-openmath"
          ? {
              ...theme,
              fontFamily: openMathTextFontStack(openMathFont),
              fontFaceCss: openMathTextFontFaceCss(openMathFont)
            }
          : font === "tex"
          ? {
              ...theme,
              fontFamily: "KaTeX_Main, 'Times New Roman', serif"
            }
          : theme,
        nativeMathMetrics: activeNativeMetrics,
        nativeMathProfile,
        useWorker: false
      };
    },
    [pageSize, margin, dark, font, mathRenderer, activeNativeMetrics, nativeMathProfile, openMathFont]
  );

  useEffect(() => {
    let cancelled = false;
    loadNativeMathFonts().then(() => {
      if (cancelled) return;
      setActiveOpenMathFontProfile(openMathFont);
      const nextDefaults = getDefaultOpenMathMetricsForProfile(nativeMathProfile ?? "openmath");
      setOpenMathDefaults(nextDefaults);
      setOpenMathMetrics(nextDefaults);
    });
    return () => {
      cancelled = true;
    };
  }, [nativeMathProfile, openMathFont]);

  useEffect(() => {
    writeDebugLogSettings(debugLogs);
    (globalThis as { __SVG_MD_DEBUG_LOGS__?: Partial<DebugLogSettings> }).__SVG_MD_DEBUG_LOGS__ = debugLogs;
  }, [debugLogs]);

  const updateNativeMetric = (key: keyof NativeMathMetrics, value: number) => {
    if (mathRenderer === "native-openmath") {
      setOpenMathMetrics((current) => ({ ...current, [key]: value }));
      return;
    }
    setNativeMetrics((current) => ({ ...current, [key]: value }));
  };

  const resetNativeMetrics = () => {
    if (mathRenderer === "native-openmath") setOpenMathMetrics(openMathDefaults);
    else setNativeMetrics(defaultNativeMathMetrics);
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
              <option value="graphsxDebug">GraphSX debug</option>
            </select>
          </label>
          <label>
            Math
            <select
              value={mathRenderer}
              onChange={(event) => setMathRenderer(event.target.value as MathRendererName)}
            >
              <option value="native-openmath">Native + OpenMath</option>
              <option value="native">Native engine</option>
              <option value="katex-raster">KaTeX raster</option>
            </select>
          </label>
          <label>
            Font
            <select
              value={effectiveFont}
              onChange={(event) => {
                const value = event.target.value as FontSelectValue;
                if (mathRenderer === "native-openmath") {
                  if (value === "latin-modern" || value === "libertinus" || value === "new-computer-modern") setOpenMathFont(value);
                } else if (value === "sans" || value === "tex") {
                  setFont(value);
                }
              }}
            >
              {mathRenderer === "native-openmath" ? (
                <>
                  <option value="latin-modern">Latin Modern</option>
                  <option value="libertinus">Libertinus</option>
                  <option value="new-computer-modern">New Computer Modern</option>
                </>
              ) : (
                <>
                  <option value="sans">Sans</option>
                  <option value="tex">TeX</option>
                </>
              )}
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
          <DebugLogDropdown
            settings={debugLogs}
            onChange={(key, value) => setDebugLogs((current) => ({ ...current, [key]: value }))}
            onReset={() => setDebugLogs(defaultDebugLogSettings)}
          />
        </div>
      </header>
      <MarkdownEditorPreview
        key={sample}
        initialMarkdown={playgroundSamples[sample]}
        options={options}
        sidePanel={(
          <NativeMathTuner
            mode={mathRenderer === "native-openmath" ? "openmath" : "katex"}
            metrics={activeNativeMetrics}
            defaults={activeNativeDefaults}
            disabled={!isNativeMathRenderer(mathRenderer)}
            onChange={updateNativeMetric}
            onReset={resetNativeMetrics}
          />
        )}
      />
    </main>
  );
}

const debugLogOptions: Array<{ key: DebugLogKey; label: string }> = [
  { key: "math", label: "Math parse" },
  { key: "graph", label: "GraphSX" },
  { key: "preview", label: "Preview timing" },
  { key: "pdf", label: "PDF export" },
  { key: "text", label: "Text fallback" }
];

function DebugLogDropdown({
  settings,
  onChange,
  onReset
}: {
  settings: DebugLogSettings;
  onChange: (key: DebugLogKey, value: boolean) => void;
  onReset: () => void;
}) {
  const activeCount = debugLogOptions.filter((option) => settings[option.key]).length;
  return (
    <details className="debug-log-dropdown">
      <summary>Logs {activeCount ? `(${activeCount})` : ""}</summary>
      <div className="debug-log-menu">
        {debugLogOptions.map((option) => (
          <label key={option.key} className="debug-log-option">
            <input
              type="checkbox"
              checked={settings[option.key]}
              onChange={(event) => onChange(option.key, event.target.checked)}
            />
            {option.label}
          </label>
        ))}
        <button type="button" onClick={onReset}>Reset</button>
      </div>
    </details>
  );
}

type MetricControl = {
  key: keyof NativeMathMetrics;
  label: string;
  min: number;
  max: number;
  step: number;
  openMath?: "font" | "engine" | "hidden";
};

const metricGroups: Array<{ title: string; controls: MetricControl[] }> = [
  {
    title: "Box",
    controls: [
      { key: "inlinePadding", label: "Inline padding", min: 0, max: 0.4, step: 0.01 },
      { key: "displayPadding", label: "Display padding", min: 0, max: 0.6, step: 0.01 },
      { key: "inlineBaseline", label: "Inline baseline", min: 0.55, max: 1.15, step: 0.01 },
      { key: "inlineGlyphGap", label: "Inline raw glyph gap", min: 0, max: 0.16, step: 0.005 },
      { key: "displayGlyphGap", label: "Display raw glyph gap", min: 0, max: 0.16, step: 0.005 }
    ]
  },
  {
    title: "Scripts",
    controls: [
      { key: "scriptScale", label: "Script scale", min: 0.45, max: 0.9, step: 0.01, openMath: "font" },
      { key: "superscriptBaseline", label: "Sup baseline", min: -0.8, max: -0.05, step: 0.01, openMath: "font" },
      { key: "subscriptBaseline", label: "Sub baseline", min: 0.05, max: 0.7, step: 0.01, openMath: "font" },
      { key: "scriptGap", label: "Script gap", min: 0, max: 0.24, step: 0.005, openMath: "font" }
    ]
  },
  {
    title: "Fractions",
    controls: [
      { key: "inlineFractionScale", label: "Inline child scale", min: 0.45, max: 1, step: 0.01, openMath: "font" },
      { key: "displayFractionScale", label: "Display child scale", min: 0.55, max: 1.1, step: 0.01, openMath: "font" },
      { key: "fractionAxisOffset", label: "Axis offset", min: -0.1, max: 0.5, step: 0.01, openMath: "font" },
      { key: "fractionNumeratorShiftUp", label: "Num shift", min: 0.2, max: 1.5, step: 0.01, openMath: "font" },
      { key: "fractionNumeratorDisplayShiftUp", label: "Display num shift", min: 0.2, max: 2, step: 0.01, openMath: "font" },
      { key: "fractionDenominatorShiftDown", label: "Den shift", min: 0.2, max: 1.5, step: 0.01, openMath: "font" },
      { key: "fractionDenominatorDisplayShiftDown", label: "Display den shift", min: 0.2, max: 2, step: 0.01, openMath: "font" },
      { key: "fractionNumeratorGap", label: "Num gap", min: 0, max: 0.6, step: 0.01, openMath: "font" },
      { key: "fractionNumeratorDisplayGap", label: "Display num gap", min: 0, max: 0.8, step: 0.01, openMath: "font" },
      { key: "fractionDenominatorGap", label: "Den gap", min: 0, max: 0.6, step: 0.01, openMath: "font" },
      { key: "fractionDenominatorDisplayGap", label: "Display den gap", min: 0, max: 0.8, step: 0.01, openMath: "font" },
      { key: "fractionRuleThickness", label: "Rule thickness", min: 0.01, max: 0.12, step: 0.005, openMath: "font" },
      { key: "fractionSidePadding", label: "Side padding", min: 0, max: 1.2, step: 0.01 },
      { key: "fractionRuleInset", label: "Rule inset", min: 0, max: 0.5, step: 0.01 }
    ]
  },
  {
    title: "Roots",
    controls: [
      { key: "sqrtBodyScale", label: "Body scale", min: 0.5, max: 1.2, step: 0.01, openMath: "hidden" },
      { key: "sqrtRadicalWidth", label: "Radical width", min: 0.3, max: 1.2, step: 0.01, openMath: "hidden" },
      { key: "sqrtTopGap", label: "Bar-body gap", min: 0, max: 0.3, step: 0.005, openMath: "font" },
      { key: "displaySqrtTopGap", label: "Display bar-body gap", min: 0, max: 0.4, step: 0.005, openMath: "font" },
      { key: "sqrtMinBodyAscent", label: "Min body ascent", min: 0, max: 1.2, step: 0.01, openMath: "engine" },
      { key: "sqrtMinBodyDescent", label: "Min body descent", min: 0, max: 0.6, step: 0.01, openMath: "engine" },
      { key: "sqrtRuleThickness", label: "Rule thickness", min: 0.01, max: 0.12, step: 0.005, openMath: "font" },
      { key: "sqrtRuleStart", label: "Rule start", min: 0.2, max: 1.1, step: 0.01, openMath: "hidden" },
      { key: "sqrtOverbarExtra", label: "Overbar extra", min: 0, max: 0.5, step: 0.01, openMath: "font" },
      { key: "sqrtVariantTolerance", label: "Variant tolerance", min: 0, max: 0.2, step: 0.005, openMath: "engine" }
    ]
  },
  {
    title: "Accents",
    controls: [
      { key: "accentGap", label: "Accent gap", min: 0, max: 0.25, step: 0.005, openMath: "font" }
    ]
  },
  {
    title: "Operators",
    controls: [
      { key: "integralSideSuperscriptBaseline", label: "Integral side sup baseline", min: -1.4, max: -0.2, step: 0.01, openMath: "font" },
      { key: "integralSideSubscriptBaseline", label: "Integral side sub baseline", min: 0.2, max: 1.2, step: 0.01, openMath: "font" },
      { key: "integralSideSuperscriptGap", label: "Integral sup x gap", min: 0, max: 1, step: 0.01, openMath: "engine" },
      { key: "integralSideSubscriptGap", label: "Integral sub x gap", min: 0, max: 1, step: 0.01, openMath: "engine" },
      { key: "integralSideSuperscriptAttachment", label: "Integral sup attachment", min: 0, max: 0.8, step: 0.01, openMath: "engine" },
      { key: "integralSideSubscriptAttachment", label: "Integral sub attachment", min: -0.8, max: 0.8, step: 0.01, openMath: "engine" },
      { key: "displayLimitOperatorSuperscriptBaseline", label: "Limit op sup baseline", min: -1.4, max: -0.2, step: 0.01, openMath: "font" },
      { key: "displayLimitOperatorSubscriptBaseline", label: "Limit op sub baseline", min: 0.2, max: 1.2, step: 0.01, openMath: "font" },
      { key: "displayLimitOperatorSuperscriptGap", label: "Limit op sup gap", min: 0, max: 1, step: 0.01, openMath: "font" },
      { key: "displayLimitOperatorSubscriptGap", label: "Limit op sub gap", min: 0, max: 1, step: 0.01, openMath: "font" },
      { key: "thinMathSpace", label: "Thin math space", min: 0, max: 0.5, step: 0.01 },
      { key: "relationMargin", label: "Relation margin", min: 0, max: 0.5, step: 0.01 },
      { key: "binaryMargin", label: "Binary margin", min: 0, max: 0.5, step: 0.01 }
    ]
  }
];

function NativeMathTuner({
  mode,
  metrics,
  defaults,
  disabled,
  onChange,
  onReset
}: {
  mode: "katex" | "openmath";
  metrics: NativeMathMetrics;
  defaults: NativeMathMetrics;
  disabled?: boolean;
  onChange: (key: keyof NativeMathMetrics, value: number) => void;
  onReset: () => void;
}) {
  const [showFontDerived, setShowFontDerived] = useState(false);
  const hideFontDerived = mode === "openmath" && !showFontDerived;

  return (
    <div className={disabled ? "native-tuner native-tuner-disabled" : "native-tuner"}>
      <div className="native-tuner-header">
        <h2>Native Math</h2>
        <button type="button" disabled={disabled} onClick={onReset}>Reset</button>
      </div>
      <p className="native-tuner-note">
        {mode === "openmath"
          ? "Most quiet controls use OpenType MATH/font-derived defaults; bordered controls are still engine-tuned."
          : "KaTeX-font native mode uses engine defaults tuned in this playground."}
      </p>
      {mode === "openmath" ? (
        <label className="native-tuner-toggle">
          <input
            type="checkbox"
            disabled={disabled}
            checked={showFontDerived}
            onChange={(event) => setShowFontDerived(event.target.checked)}
          />
          Reveal font-derived sliders
        </label>
      ) : null}
      {metricGroups.map((group) => {
        const controls = group.controls.filter((control) => {
          if (mode !== "openmath") return true;
          if (control.openMath === "hidden") return false;
          return !(hideFontDerived && control.openMath === "font");
        });

        if (!controls.length) {
          return null;
        }

        return (
          <section key={group.title} className="native-tuner-group">
            <h3>{group.title}</h3>
            {controls.map((control) => {
            const changed = Math.abs(metrics[control.key] - defaults[control.key]) > 0.0005;
            const source = mode === "openmath" ? control.openMath : undefined;
            return (
              <label
                key={control.key}
                className={[
                  "native-metric-control",
                  changed ? "native-metric-control-changed" : "",
                  mode === "openmath" && source !== "font" ? "native-metric-control-engine" : ""
                ].filter(Boolean).join(" ")}
              >
                <span>
                  {control.label}
                  {source === "engine" ? (
                    <b className="native-metric-badge native-metric-badge-engine" title="Default supplied by the layout engine">engine</b>
                  ) : null}
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
                  onClick={() => onChange(control.key, defaults[control.key])}
                >
                  Reset
                </button>
              </label>
            );
            })}
          </section>
        );
      })}
    </div>
  );
}
