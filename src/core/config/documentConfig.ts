import { defaultDocumentOptions, type MathRendererName, type EngineOptions } from "../engine/engineTypes";
import { defaultLayoutConfig, type LayoutConfig } from "../layout/layoutConfig";
import type { PageMarginInput, PageSizeName } from "../layout/pageConfig";
import { getDefaultOpenMathMetricsForProfile } from "../renderers/math/nativeMath";
import type { NativeMathFontProfileName } from "../renderers/math/nativeMathProfiles";
import { isOpenMathFontProfileName, type OpenMathFontProfileName } from "../renderers/math/openMathFont";
import { openMathTextFontFaceCss, openMathTextFontStack } from "../renderers/text/latinModernRomanFont";
import type { DocumentTheme } from "../theme/themeTypes";
import { defaultCrossRefConfig, type CrossRefConfig } from "../xref/xrefTypes";
import { readLatexDocumentClass, readLatexPreamble } from "../latex/parseLatex";
import { builtinPlugins, resolvePluginRegistry } from "../plugins/builtin";

export type DocumentFrontMatter = {
  bibliography?: string;
  document?: {
    titleFromFirstHeading?: boolean;
    title?: string;
    titleFontSize?: number;
    authors?: string[];
    abstract?: string;
    abstractTitle?: string;
  };
  page?: {
    size?: PageSizeName;
    margin?: PageMarginInput;
  };
  typography?: {
    family?: OpenMathFontProfileName;
    fontSize?: number;
    lineHeight?: number;
  };
  theme?: Partial<DocumentTheme>;
  layout?: Partial<LayoutConfig>;
  math?: {
    renderer?: "native-openmath";
  };
  crossref?: Partial<Record<keyof CrossRefConfig, Partial<CrossRefConfig[keyof CrossRefConfig]>>>;
};

export type ParsedMarkdownDocument = {
  markdown: string;
  sourceOffset: number;
  frontMatter?: DocumentFrontMatter;
  warnings: string[];
};

type YamlValue = string | number | boolean | YamlObject;
type YamlObject = {
  [key: string]: YamlValue;
};

export function parseMarkdownDocument(source: string): ParsedMarkdownDocument {
  const normalized = source.replace(/^\uFEFF/, "");
  if (!normalized.startsWith("---")) return { markdown: source, sourceOffset: 0, warnings: [] };

  const lines = normalized.split(/\r?\n/);
  if (lines[0].trim() !== "---") return { markdown: source, sourceOffset: 0, warnings: [] };

  const endIndex = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
  if (endIndex < 0) {
    return {
      markdown: source,
      sourceOffset: 0,
      warnings: ["Front matter starts with --- but has no closing ---."]
    };
  }

  const warnings: string[] = [];
  const raw = parseSimpleYaml(lines.slice(1, endIndex), warnings);
  return {
    markdown: lines.slice(endIndex + 1).join("\n"),
    sourceOffset: lines.slice(0, endIndex + 1).join("\n").length + 1,
    frontMatter: normalizeFrontMatter(raw, warnings),
    warnings
  };
}

export function applySourceFormatDefaults(source: string, options: EngineOptions): EngineOptions {
  if (options.sourceFormat !== "latex") return options;
  return mergeEngineOptions(latexDocumentClassDefaults(source, options.plugins), options);
}

export function applyDocumentFrontMatter(options: EngineOptions, frontMatter: DocumentFrontMatter | undefined): EngineOptions {
  if (!frontMatter) return options;

  const typographyFamily = frontMatter.typography?.family;
  const themeOverrides = frontMatter.theme ?? {};
  const nativeMathProfile = typographyFamily ? nativeMathProfileForOpenMathFont(typographyFamily) : options.nativeMathProfile;
  const nativeMathMetrics = typographyFamily ? getDefaultOpenMathMetricsForProfile(nativeMathProfile) : options.nativeMathMetrics;
  const themeFromTypography: Partial<DocumentTheme> | undefined = typographyFamily
    ? {
        fontFamily: openMathTextFontStack(typographyFamily),
        fontFaceCss: openMathTextFontFaceCss(typographyFamily)
      }
    : undefined;
  const typographyTheme: Partial<DocumentTheme> = {
    ...(frontMatter.typography?.fontSize === undefined ? {} : { fontSize: frontMatter.typography.fontSize }),
    ...(frontMatter.typography?.lineHeight === undefined ? {} : { lineHeight: frontMatter.typography.lineHeight })
  };

  return {
    ...options,
    pageSize: frontMatter.page?.size ?? options.pageSize,
    margin: frontMatter.page?.margin ?? options.margin,
    theme: {
      ...(options.theme ?? {}),
      ...(themeFromTypography ?? {}),
      ...typographyTheme,
      ...themeOverrides
    },
    mathRenderer: typographyFamily || frontMatter.math?.renderer ? "native-openmath" : options.mathRenderer,
    nativeMathMetrics,
    nativeMathProfile,
    document: {
      ...defaultDocumentOptions,
      ...(options.document ?? {}),
      ...(frontMatter.document ?? {})
    },
    crossRef: mergeCrossRefConfig(options.crossRef, frontMatter.crossref),
    layout: mergeLayoutConfig(options.layout, frontMatter.layout)
  };
}

function latexDocumentClassDefaults(source: string, plugins: EngineOptions["plugins"] = builtinPlugins): EngineOptions {
  const registry = resolvePluginRegistry(plugins);
  const documentClass = readLatexDocumentClass(source);
  const preamble = readLatexPreamble(source);
  const handler = registry.latexDocumentClass(documentClass.name)
    ?? registry.latexDocumentClass("article")
    ?? builtinPlugins.latexDocumentClass("article");
  if (!handler) throw new Error("The first-party LaTeX article document class is not registered.");
  return handler({ source, ...documentClass, preamble });
}

function mergeEngineOptions(base: EngineOptions, override: EngineOptions): EngineOptions {
  return {
    ...base,
    ...override,
    theme: {
      ...(base.theme ?? {}),
      ...(override.theme ?? {})
    },
    layout: mergeLayoutConfig(base.layout, override.layout),
    crossRef: mergeCrossRefConfig(base.crossRef, override.crossRef),
    document: {
      ...(base.document ?? {}),
      ...(override.document ?? {})
    }
  };
}

export function mergeLayoutConfig(
  base: Partial<LayoutConfig> | undefined,
  override: Partial<LayoutConfig> | undefined
): LayoutConfig {
  return {
    ...defaultLayoutConfig,
    ...(base ?? {}),
    ...(override ?? {}),
    lineBreaking: {
      ...defaultLayoutConfig.lineBreaking,
      ...(base?.lineBreaking ?? {}),
      ...(override?.lineBreaking ?? {})
    },
    columns: {
      ...defaultLayoutConfig.columns,
      ...(base?.columns ?? {}),
      ...(override?.columns ?? {})
    },
    paragraph: {
      ...defaultLayoutConfig.paragraph,
      ...(base?.paragraph ?? {}),
      ...(override?.paragraph ?? {})
    },
    headingFontSizes: {
      ...defaultLayoutConfig.headingFontSizes,
      ...(base?.headingFontSizes ?? {}),
      ...(override?.headingFontSizes ?? {})
    }
  };
}

export function mergeCrossRefConfig(
  base: Partial<CrossRefConfig> | undefined,
  override: DocumentFrontMatter["crossref"] | undefined
): CrossRefConfig {
  const merged: CrossRefConfig = {
    section: { ...defaultCrossRefConfig.section, ...(base?.section ?? {}) },
    equation: { ...defaultCrossRefConfig.equation, ...(base?.equation ?? {}) },
    figure: { ...defaultCrossRefConfig.figure, ...(base?.figure ?? {}) },
    table: { ...defaultCrossRefConfig.table, ...(base?.table ?? {}) }
  };

  if (!override) return merged;
  return {
    section: { ...merged.section, ...(override.section ?? {}) },
    equation: { ...merged.equation, ...(override.equation ?? {}) },
    figure: { ...merged.figure, ...(override.figure ?? {}) },
    table: { ...merged.table, ...(override.table ?? {}) }
  };
}

export function nativeMathProfileForOpenMathFont(font: OpenMathFontProfileName): NativeMathFontProfileName {
  if (font === "libertinus") return "openmath-libertinus";
  return "openmath";
}

function parseSimpleYaml(lines: string[], warnings: string[]): Record<string, YamlValue> {
  const root: Record<string, YamlValue> = {};
  const stack: Array<{ indent: number; value: Record<string, YamlValue> }> = [{ indent: -1, value: root }];

  for (const originalLine of lines) {
    const withoutComment = stripYamlComment(originalLine);
    if (!withoutComment.trim()) continue;

    const indent = withoutComment.match(/^ */)?.[0].length ?? 0;
    const trimmed = withoutComment.trim();
    const separator = trimmed.indexOf(":");
    if (separator < 0) {
      warnings.push(`Ignoring front matter line without ":" separator: ${trimmed}`);
      continue;
    }

    const key = trimmed.slice(0, separator).trim();
    const rawValue = trimmed.slice(separator + 1).trim();
    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) stack.pop();
    const parent = stack[stack.length - 1].value;

    if (!rawValue) {
      const child: Record<string, YamlValue> = {};
      parent[key] = child;
      stack.push({ indent, value: child });
      continue;
    }

    parent[key] = parseScalar(rawValue);
  }

  return root;
}

function normalizeFrontMatter(raw: Record<string, YamlValue>, warnings: string[]): DocumentFrontMatter {
  const config: DocumentFrontMatter = {};
  const page = readObject(raw.page);
  const bibliography = readString(raw.bibliography);
  const document = readObject(raw.document);
  const typography = readObject(raw.typography);
  const theme = readObject(raw.theme);
  const math = readObject(raw.math);
  const crossref = readObject(raw.crossref);
  const layout = readObject(raw.layout);

  if (bibliography !== undefined) config.bibliography = bibliography;

  if (document) {
    const titleFromFirstHeading = readBoolean(document.titleFromFirstHeading);
    const title = readString(document.title);
    const titleFontSize = readNumber(document.titleFontSize ?? document.fontSize);
    const authors = readStringList(document.authors);
    const abstract = readString(document.abstract);
    const abstractTitle = readString(document.abstractTitle);
    config.document = {};
    if (titleFromFirstHeading !== undefined) config.document.titleFromFirstHeading = titleFromFirstHeading;
    if (title !== undefined) config.document.title = title;
    if (titleFontSize !== undefined) config.document.titleFontSize = titleFontSize;
    if (authors !== undefined) config.document.authors = authors;
    if (abstract !== undefined) config.document.abstract = abstract;
    if (abstractTitle !== undefined) config.document.abstractTitle = abstractTitle;
  }

  if (page) {
    const size = readString(page.size);
    const margin = readMargin(page.margin, warnings);
    config.page = {};
    if (size === "letter" || size === "a4") config.page.size = size;
    else if (size) warnings.push(`Unsupported page.size "${size}". Use "letter" or "a4".`);
    if (margin !== undefined) config.page.margin = margin;
  }

  if (theme) {
    config.theme = {};
    if (readString(theme.font)) warnings.push("theme.font is deprecated in front matter; use typography.family instead.");
    copyThemeNumber(theme, config.theme, "fontSize");
    copyThemeNumber(theme, config.theme, "lineHeight");
    copyThemeString(theme, config.theme, "text");
    copyThemeString(theme, config.theme, "mutedText");
    copyThemeString(theme, config.theme, "link");
    copyThemeString(theme, config.theme, "pageBackground");
  }

  if (typography) {
    const family = readString(typography.family);
    const fontSize = readNumber(typography.fontSize);
    const lineHeight = readNumber(typography.lineHeight);
    config.typography = {};
    if (family) {
      if (isOpenMathFontProfileName(family)) config.typography.family = family;
      else warnings.push(`Unsupported typography.family "${family}". Use "latin-modern" or "libertinus".`);
    }
    if (fontSize !== undefined) config.typography.fontSize = fontSize;
    if (lineHeight !== undefined) config.typography.lineHeight = lineHeight;
  }

  if (math) {
    const renderer = readString(math.renderer) as MathRendererName | undefined;
    config.math = {};
    if (renderer === "native-openmath") {
      config.math.renderer = renderer;
      warnings.push("math.renderer is redundant in front matter; typography.family selects the native OpenMath document path.");
    } else if (renderer) warnings.push(`Unsupported math.renderer "${renderer}" in front matter. Front matter always uses the native OpenMath document path when typography.family is set.`);
    const legacyFont = readString(math.font);
    if (legacyFont) warnings.push("math.font is deprecated in front matter; use typography.family instead.");
  }

  if (crossref) config.crossref = normalizeCrossRef(crossref, warnings);
  if (layout) config.layout = normalizeLayoutConfig(layout, warnings);
  return config;
}

function normalizeLayoutConfig(raw: Record<string, YamlValue>, warnings: string[]): Partial<LayoutConfig> {
  const config: Partial<LayoutConfig> = {};
  const textAlign = readString(raw.textAlign);
  if (textAlign === "left" || textAlign === "justify") config.textAlign = textAlign;
  else if (textAlign) warnings.push(`Unsupported layout.textAlign "${textAlign}". Use "left" or "justify".`);

  const headingStyle = readString(raw.headingStyle);
  if (headingStyle === "default" || headingStyle === "revtex") config.headingStyle = headingStyle;
  else if (headingStyle) warnings.push(`Unsupported layout.headingStyle "${headingStyle}". Use "default" or "revtex".`);

  const columns = normalizeColumns(raw, warnings);
  if (columns) config.columns = columns;

  const headingFontSizes = normalizeHeadingFontSizes(raw.headingFontSizes ?? raw.headings, warnings);
  if (headingFontSizes) config.headingFontSizes = headingFontSizes;

  const paragraph = normalizeParagraph(raw.paragraph, warnings);
  if (paragraph) config.paragraph = paragraph;

  const lineBreaking = readObject(raw.lineBreaking);
  if (lineBreaking) {
    const algorithm = readString(lineBreaking.algorithm);
    const hyphenation = readBoolean(lineBreaking.hyphenation);
    const language = readString(lineBreaking.language);
    config.lineBreaking = { ...defaultLayoutConfig.lineBreaking };
    if (algorithm === "greedy" || algorithm === "knuth-plass") config.lineBreaking.algorithm = algorithm;
    else if (algorithm) warnings.push(`Unsupported layout.lineBreaking.algorithm "${algorithm}". Use "greedy" or "knuth-plass".`);
    if (hyphenation !== undefined) {
      config.lineBreaking.hyphenation = hyphenation;
    }
    if (language) config.lineBreaking.language = language;
    if (config.lineBreaking.algorithm === "knuth-plass") {
      warnings.push("layout.lineBreaking.algorithm = knuth-plass is parsed but not implemented yet; using greedy line breaking.");
    }
  }

  return config;
}

function normalizeParagraph(rawValue: YamlValue | undefined, warnings: string[]): Partial<LayoutConfig>["paragraph"] | undefined {
  const raw = readObject(rawValue);
  if (!raw) return undefined;
  const indent = readNumber(raw.indent);
  const suppressAfter = readStringList(raw.suppressAfter);
  const paragraph: Partial<LayoutConfig["paragraph"]> = {};
  if (indent !== undefined) paragraph.indent = indent;
  if (suppressAfter) {
    const allowed = new Set(defaultLayoutConfig.paragraph.suppressAfter);
    const valid = suppressAfter.filter((kind) => allowed.has(kind as never));
    const invalid = suppressAfter.filter((kind) => !allowed.has(kind as never));
    if (invalid.length) warnings.push(`Unsupported layout.paragraph.suppressAfter values: ${invalid.join(", ")}.`);
    paragraph.suppressAfter = valid as LayoutConfig["paragraph"]["suppressAfter"];
  }
  return Object.keys(paragraph).length ? paragraph as LayoutConfig["paragraph"] : undefined;
}

function normalizeColumns(raw: Record<string, YamlValue>, warnings: string[]): Partial<LayoutConfig>["columns"] | undefined {
  const columnValue = raw.columns ?? raw.columnCount;
  const columnGap = readNumber(raw.columnGap);
  if (columnValue === undefined && columnGap === undefined) return undefined;

  let count: number | undefined;
  let gap = columnGap;
  if (typeof columnValue === "number") {
    count = columnValue;
  } else if (typeof columnValue === "string") {
    const parsed = Number(columnValue);
    if (Number.isFinite(parsed)) count = parsed;
  } else if (columnValue && typeof columnValue === "object") {
    const object = columnValue as YamlObject;
    count = readNumber(object.count);
    gap = readNumber(object.gap) ?? gap;
  }

  const normalizedCount = count === undefined
    ? defaultLayoutConfig.columns.count
    : Math.floor(count);
  if (normalizedCount < 1 || normalizedCount > 4) {
    warnings.push("layout.columns must be between 1 and 4.");
    return undefined;
  }
  if (gap !== undefined && gap < 0) {
    warnings.push("layout.columnGap/layout.columns.gap must be non-negative.");
    return undefined;
  }
  return {
    count: normalizedCount,
    gap: gap ?? defaultLayoutConfig.columns.gap
  };
}

function normalizeHeadingFontSizes(
  value: YamlValue | undefined,
  warnings: string[]
): LayoutConfig["headingFontSizes"] | undefined {
  const object = readObject(value);
  if (!object) return undefined;

  const sizes: LayoutConfig["headingFontSizes"] = {};
  const entries = Object.entries(object);
  const arrayLike = entries.length > 0 && entries.every(([key]) => /^\d+$/.test(key));
  for (const [rawKey, rawValue] of entries) {
    const key = rawKey.toLowerCase();
    const level = key.startsWith("h") ? Number(key.slice(1)) : arrayLike ? Number(key) + 1 : Number(key);
    const size = readNumber(rawValue);
    if (!Number.isInteger(level) || level < 1 || level > 6) {
      warnings.push(`Unsupported layout.headingFontSizes key "${rawKey}". Use h1 through h6.`);
      continue;
    }
    if (size === undefined || size <= 0) {
      warnings.push(`layout.headingFontSizes.${rawKey} must be a positive number.`);
      continue;
    }
    sizes[level as keyof LayoutConfig["headingFontSizes"]] = size;
  }

  return Object.keys(sizes).length ? sizes : undefined;
}

function normalizeCrossRef(raw: Record<string, YamlValue>, warnings: string[]): DocumentFrontMatter["crossref"] {
  const crossref: DocumentFrontMatter["crossref"] = {};
  for (const kind of ["section", "equation", "figure", "table"] as const) {
    const value = readObject(raw[kind]);
    if (!value) continue;
    const captionFormat = readString(value.captionFormat);
    const referenceFormat = readString(value.referenceFormat);
    crossref[kind] = {};
    if (captionFormat !== undefined) crossref[kind].captionFormat = validateFormat(captionFormat, `${kind}.captionFormat`, warnings);
    if (referenceFormat !== undefined) crossref[kind].referenceFormat = validateFormat(referenceFormat, `${kind}.referenceFormat`, warnings);
  }
  return crossref;
}

function validateFormat(format: string, name: string, warnings: string[]): string {
  if (format && !format.includes("{number}")) warnings.push(`crossref.${name} does not include {number}.`);
  return format;
}

function stripYamlComment(line: string): string {
  let quote: string | undefined;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if ((char === "\"" || char === "'") && line[index - 1] !== "\\") {
      quote = quote === char ? undefined : quote ?? char;
    }
    if (char === "#" && !quote) return line.slice(0, index);
  }
  return line;
}

function parseScalar(value: string): YamlValue {
  if (value === "true") return true;
  if (value === "false") return false;
  if (value.startsWith("[") && value.endsWith("]")) {
    const items = value.slice(1, -1)
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => parseScalar(item));
    return Object.fromEntries(items.map((item, index) => [String(index), item]));
  }
  if (/^-?\d+(?:\.\d+)?$/.test(value)) return Number(value);
  if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function readObject(value: YamlValue | undefined): Record<string, YamlValue> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value : undefined;
}

function readString(value: YamlValue | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function readNumber(value: YamlValue | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readMargin(value: YamlValue | undefined, warnings: string[]): PageMarginInput | undefined {
  const scalar = readNumber(value);
  if (scalar !== undefined) return scalar;
  const object = readObject(value);
  if (!object) return undefined;

  const top = readNumber(object.top);
  const right = readNumber(object.right);
  const bottom = readNumber(object.bottom);
  const left = readNumber(object.left);
  const horizontal = readNumber(object.horizontal ?? object.x);
  const vertical = readNumber(object.vertical ?? object.y);

  const margin = {
    top: top ?? vertical,
    right: right ?? horizontal,
    bottom: bottom ?? vertical,
    left: left ?? horizontal
  };
  if (Object.values(margin).every((entry) => entry === undefined)) {
    warnings.push("page.margin object must include top/right/bottom/left or horizontal/vertical values.");
    return undefined;
  }
  return Object.fromEntries(
    Object.entries(margin).filter(([, entry]) => entry !== undefined)
  ) as Partial<NonNullable<Extract<PageMarginInput, object>>>;
}

function readBoolean(value: YamlValue | undefined): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function readStringList(value: YamlValue | undefined): string[] | undefined {
  if (typeof value === "string") return [value];
  const object = readObject(value);
  if (!object) return undefined;
  const items = Object.entries(object)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([, item]) => readString(item))
    .filter((item): item is string => item !== undefined);
  return items.length ? items : undefined;
}

function copyThemeString(source: Record<string, YamlValue>, target: Partial<DocumentTheme>, key: keyof DocumentTheme): void {
  const value = readString(source[key]);
  if (value !== undefined) (target as Record<string, unknown>)[key] = value;
}

function copyThemeNumber(source: Record<string, YamlValue>, target: Partial<DocumentTheme>, key: keyof DocumentTheme): void {
  const value = readNumber(source[key]);
  if (value !== undefined) (target as Record<string, unknown>)[key] = value;
}
