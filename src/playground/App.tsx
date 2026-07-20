import { useEffect, useMemo, useState } from "react";
import { MarkdownEditorPreview } from "../react/MarkdownEditorPreview";
import { ConsolePane } from "../react/console/ConsolePane";
import { defaultTheme } from "../core/theme/defaultTheme";
import {
  defaultOpenMathMetrics,
  getDefaultOpenMathMetricsForProfile,
  type NativeMathMetrics
} from "../core/renderers/math/nativeMath";
import type { NativeMathFontProfileName } from "../core/renderers/math/nativeMathProfiles";
import { loadNativeMathFonts, setActiveOpenMathFontProfile } from "../core/renderers/math/nativeFontMetrics";
import {
  openMathTextFontFaceCss,
  openMathTextFontStack
} from "../core/renderers/text/latinModernRomanFont";
import type { OpenMathFontProfileName } from "../core/renderers/math/openMathFont";
import { mathTuningSample } from "./mathTuningSample";
import { WorkspaceRibbon } from "./product/WorkspaceRibbon";

export function App() {
  const [openMathFont, setOpenMathFont] = useState<OpenMathFontProfileName>("latin-modern");
  const [openMathMetrics, setOpenMathMetrics] = useState<NativeMathMetrics>(defaultOpenMathMetrics);
  const [openMathDefaults, setOpenMathDefaults] = useState<NativeMathMetrics>(defaultOpenMathMetrics);
  const [consoleVisible, setConsoleVisible] = useState(() => window.localStorage.getItem("vector-console-visible") === "true");
  const nativeMathProfile: NativeMathFontProfileName = openMathFont === "libertinus"
    ? "openmath-libertinus"
    : "openmath";
  const options = useMemo(
    () => ({
        pageSize: "letter" as const,
        sourceFormat: "markdown" as const,
        margin: 64,
        mathRenderer: "native-openmath" as const,
        theme: {
          ...defaultTheme,
          fontFamily: openMathTextFontStack(openMathFont),
          fontFaceCss: openMathTextFontFaceCss(openMathFont)
        },
        nativeMathMetrics: openMathMetrics,
        nativeMathProfile
      }),
    [openMathMetrics, nativeMathProfile, openMathFont]
  );

  useEffect(() => {
    let cancelled = false;
    loadNativeMathFonts().then(() => {
      if (cancelled) return;
      setActiveOpenMathFontProfile(openMathFont);
      const nextDefaults = getDefaultOpenMathMetricsForProfile(nativeMathProfile);
      setOpenMathDefaults(nextDefaults);
      setOpenMathMetrics(nextDefaults);
    });
    return () => {
      cancelled = true;
    };
  }, [nativeMathProfile, openMathFont]);

  useEffect(() => {
    window.localStorage.setItem("vector-console-visible", String(consoleVisible));
  }, [consoleVisible]);

  const updateNativeMetric = (key: keyof NativeMathMetrics, value: number) => {
    setOpenMathMetrics((current) => ({ ...current, [key]: value }));
  };

  const resetNativeMetrics = () => {
    setOpenMathMetrics(openMathDefaults);
  };

  return (
    <main className="app">
      <header className="app-header">
        <h1>Vector Lab</h1>
        <div className="app-controls">
          <label>
            Font
            <select
              aria-label="Font"
              value={openMathFont}
              onChange={(event) => {
                setOpenMathFont(event.target.value as OpenMathFontProfileName);
              }}
            >
              <option value="latin-modern">Latin Modern</option>
              <option value="libertinus">Libertinus</option>
            </select>
          </label>
        </div>
      </header>
      <MarkdownEditorPreview
        initialMarkdown={mathTuningSample}
        options={options}
        leftPanelCompact
        leftPanel={(
          <div className="project-navigation project-navigation-collapsed">
            <WorkspaceRibbon
              consoleVisible={consoleVisible}
              onConsoleToggle={() => setConsoleVisible((visible) => !visible)}
            />
          </div>
        )}
        bottomPanel={consoleVisible ? <ConsolePane onClose={() => setConsoleVisible(false)} /> : undefined}
        sidePanel={(
          <NativeMathTuner
            metrics={openMathMetrics}
            defaults={openMathDefaults}
            onChange={updateNativeMetric}
            onReset={resetNativeMetrics}
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
  openMath?: "font" | "engine" | "hidden";
};

const metricGroups: Array<{ title: string; controls: MetricControl[] }> = [
  {
    title: "Box",
    controls: [
      { key: "inlinePadding", label: "Inline padding", min: 0, max: 0.4, step: 0.01 },
      { key: "displayPadding", label: "Display padding", min: 0, max: 0.6, step: 0.01, openMath: "font" },
      { key: "inlineBaseline", label: "Inline baseline", min: 0.55, max: 1.15, step: 0.01 },
      { key: "inlineGlyphGap", label: "Inline raw glyph gap", min: 0, max: 0.16, step: 0.005 },
      { key: "displayGlyphGap", label: "Display raw glyph gap", min: 0, max: 0.16, step: 0.005 },
      { key: "functionDelimiterMinGap", label: "Delimiter ink clearance", min: 0, max: 0.3, step: 0.005, openMath: "engine" }
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
  metrics,
  defaults,
  disabled,
  onChange,
  onReset
}: {
  metrics: NativeMathMetrics;
  defaults: NativeMathMetrics;
  disabled?: boolean;
  onChange: (key: keyof NativeMathMetrics, value: number) => void;
  onReset: () => void;
}) {
  const [showFontDerived, setShowFontDerived] = useState(false);
  const hideFontDerived = !showFontDerived;

  return (
    <div className={disabled ? "native-tuner native-tuner-disabled" : "native-tuner"}>
      <div className="native-tuner-header">
        <h2>Native Math</h2>
        <button type="button" disabled={disabled} onClick={onReset}>Reset</button>
      </div>
      <p className="native-tuner-note">
        Most quiet controls use OpenType MATH/font-derived defaults; bordered controls are still engine-tuned.
      </p>
      <label className="native-tuner-toggle">
          <input
            type="checkbox"
            disabled={disabled}
            checked={showFontDerived}
            onChange={(event) => setShowFontDerived(event.target.checked)}
          />
          Reveal font-derived sliders
      </label>
      {metricGroups.map((group) => {
        const controls = group.controls.filter((control) => {
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
            const source = control.openMath;
            return (
              <label
                key={control.key}
                className={[
                  "native-metric-control",
                  changed ? "native-metric-control-changed" : "",
                  source !== "font" ? "native-metric-control-engine" : ""
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
