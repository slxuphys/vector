import type { DisplayObject, DisplayPage } from "../display-list/displayTypes";
import type { MathRendererName } from "../engine/engineTypes";
import type { DocumentTheme } from "../theme/themeTypes";
import { flattenInline, type LayoutBlock, type InlineRun, type TitleMatter } from "./layoutBlocks";
import type { PageConfig } from "./pageConfig";
import { breakRunsIntoLines } from "./lineBreaking";
import type { LayoutLine } from "./lineBreaking";
import { defaultLayoutConfig, type LayoutConfig, type ParagraphSuppressAfter } from "./layoutConfig";
import { layoutTable } from "./layoutTable";
import { measureText } from "./measureText";
import { renderKatex, renderKatexSvg } from "../renderers/math/renderKatex";
import { renderGraphSX } from "../renderers/graphsx/renderGraphSX";
import { getCachedMathJaxSvgArtifact } from "../renderers/math/renderMathJax";
import {
  defaultNativeMathMetrics,
  getDefaultOpenMathMetrics,
  getDefaultOpenMathMetricsForProfile,
  isNativeMathRenderer,
  layoutNativeMath,
  nativeMathProfileForRenderer,
  type NativeMathMetrics
} from "../renderers/math/nativeMath";
import type { NativeMathFontProfileName } from "../renderers/math/nativeMathProfiles";
import { getMeasuredMath, headingSize, type MathMeasurementMap } from "./mathMetrics";
import { applyCrossRefFormat, defaultCrossRefConfig, type CrossRefConfig } from "../xref/xrefTypes";
import type { SourceSpan } from "../source/sourceTypes";
import { parseInline } from "../markdown/parseInline";

type Cursor = {
  page: DisplayPage;
  x: number;
  y: number;
  top: number;
  contentWidth: number;
  bottom: number;
  column: number;
};

export function paginate(
  blocks: LayoutBlock[],
  page: PageConfig,
  theme: DocumentTheme,
  mathMeasurements?: MathMeasurementMap,
  mathRenderer: MathRendererName = "katex-raster",
  nativeMathMetrics?: NativeMathMetrics,
  nativeMathProfile?: NativeMathFontProfileName,
  crossRef: CrossRefConfig = defaultCrossRefConfig,
  layoutConfig: LayoutConfig = defaultLayoutConfig,
  titleMatter?: TitleMatter
): DisplayPage[] {
  const pages: DisplayPage[] = [];
  const columnCount = Math.max(1, Math.min(4, Math.floor(layoutConfig.columns.count)));
  const columnGap = Math.max(0, layoutConfig.columns.gap);
  const fullContentWidth = page.width - page.margin.left - page.margin.right;
  const columnWidth = (fullContentWidth - columnGap * (columnCount - 1)) / columnCount;
  const columnX = (column: number) => page.margin.left + column * (columnWidth + columnGap);
  let columnFlowTop = page.margin.top;
  const cursorForPage = (displayPage: DisplayPage, column = 0): Cursor => ({
    page: displayPage,
    x: columnX(column),
    y: columnFlowTop,
    top: columnFlowTop,
    contentWidth: columnWidth,
    bottom: page.height - page.margin.bottom,
    column
  });
  const newPage = (): Cursor => {
    columnFlowTop = page.margin.top;
    const displayPage: DisplayPage = {
      index: pages.length,
      width: page.width,
      height: page.height,
      objects: [
        {
          type: "rect",
          x: 0,
          y: 0,
          width: page.width,
          height: page.height,
          fill: theme.pageBackground
        }
      ]
    };
    pages.push(displayPage);
    return cursorForPage(displayPage);
  };
  const advanceFlow = (from: Cursor = cursor): Cursor => {
    if (from.column + 1 < columnCount) return cursorForPage(from.page, from.column + 1);
    return newPage();
  };

  let cursor = newPage();
  if (titleMatter) {
    const titleCursor = {
      ...cursor,
      x: page.margin.left,
      contentWidth: fullContentWidth
    };
    drawTitleMatter(titleCursor, titleMatter, theme, mathMeasurements, mathRenderer, nativeMathMetrics, nativeMathProfile, layoutConfig);
    columnFlowTop = titleCursor.y;
    cursor = cursorForPage(titleCursor.page, 0);
  }
  let previousBlockKind: ParagraphSuppressAfter | undefined = titleMatter ? "title" : undefined;
  const ensure = (height: number): Cursor => {
    if (cursor.y + height > cursor.bottom && cursor.y > cursor.top) cursor = advanceFlow();
    return cursor;
  };

  for (const block of blocks) {
    if (block.type === "pageBreak") {
      cursor = newPage();
      previousBlockKind = "pageBreak";
      continue;
    }

    if (block.type === "heading") {
      const fontSize = headingSize(block.level, theme.fontSize, block.title, layoutConfig.headingFontSizes);
      const revtexHeading = layoutConfig.headingStyle === "revtex" && !block.title;
      const before = block.title ? 0 : revtexHeading ? 22 : block.level === 1 ? 4 : 10;
      const after = block.title ? 18 : revtexHeading ? 16 : block.level <= 2 ? 10 : 7;
      const runs = sectionHeadingRuns(block, crossRef, layoutConfig.headingStyle);
      const measuredRuns = runs.map((run) => ({ ...run, bold: true }));
      const titleSpan = Boolean(block.title && columnCount > 1);
      if (titleSpan && (cursor.column !== 0 || cursor.y > cursor.top)) cursor = newPage();
      const headingCursor = titleSpan
        ? { ...cursor, x: page.margin.left, contentWidth: fullContentWidth }
        : cursor;
      const lines = breakRunsIntoLines(measuredRuns, headingCursor.contentWidth, fontSize, theme, mathMeasurements, mathRenderer, nativeMathMetrics, nativeMathProfile, layoutConfig);
      cursor = ensure(before + lines.length * fontSize * 1.2 + after);
      headingCursor.page = cursor.page;
      headingCursor.x = titleSpan ? page.margin.left : cursor.x;
      headingCursor.y = cursor.y;
      headingCursor.bottom = cursor.bottom;
      headingCursor.top = cursor.top;
      headingCursor.contentWidth = titleSpan ? fullContentWidth : cursor.contentWidth;
      headingCursor.column = cursor.column;
      if (block.label) pushAnchor(headingCursor, block.label, block.source);
      headingCursor.y += before;
      drawLines(headingCursor, lines, fontSize, theme, {
        bold: true,
        color: theme.text,
        lineHeight: 1.2,
        align: revtexHeading ? "center" : undefined,
        maxWidth: revtexHeading ? headingCursor.contentWidth : undefined,
        source: block.source
      }, mathMeasurements, mathRenderer, nativeMathMetrics, nativeMathProfile);
      headingCursor.y += after;
      if (titleSpan) {
        columnFlowTop = headingCursor.y;
        cursor = cursorForPage(headingCursor.page, 0);
      } else {
        cursor = headingCursor;
      }
      previousBlockKind = "heading";
      continue;
    }

    if (block.type === "paragraph") {
      const fontSize = theme.fontSize;
      const indent = paragraphIndent(layoutConfig, previousBlockKind);
      const paragraphRuns = indent > 0 && block.runs.length > 0
        ? [
            { ...block.runs[0], text: "\u2003", nonBreak: true },
            { ...block.runs[0], text: "\u2003", nonBreak: true },
            ...block.runs
          ]
        : block.runs;
      const lines = breakRunsIntoLines(paragraphRuns, cursor.contentWidth, fontSize, theme, mathMeasurements, mathRenderer, nativeMathMetrics, nativeMathProfile, layoutConfig);
      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        ensure(Math.max(line.height, fontSize * theme.lineHeight));
        drawLines(cursor, [line], fontSize, theme, {
          color: theme.text,
          lineHeight: theme.lineHeight,
          textAlign: index === lines.length - 1 ? "left" : layoutConfig.textAlign,
          maxWidth: cursor.contentWidth,
          source: block.source
        }, mathMeasurements, mathRenderer, nativeMathMetrics, nativeMathProfile);
      }
      cursor.y += 10;
      previousBlockKind = "paragraph";
      continue;
    }

    if (block.type === "list") {
      const fontSize = theme.fontSize;
      for (let index = 0; index < block.items.length; index += 1) {
        const marker = block.checked?.[index] !== undefined
          ? `[${block.checked[index] ? "x" : " "}]`
          : block.ordered
            ? `${index + 1}.`
            : "•";
        const markerWidth = 28;
        const lines = breakRunsIntoLines(block.items[index], cursor.contentWidth - markerWidth, fontSize, theme, mathMeasurements, mathRenderer, nativeMathMetrics, nativeMathProfile, layoutConfig);
        ensure(lines.length * fontSize * theme.lineHeight + 4);
        cursor.page.objects.push(textObject(marker, cursor.x, cursor.y + fontSize, fontSize, theme, { color: theme.mutedText, source: block.source }));
        drawLines(cursor, lines, fontSize, theme, {
          color: theme.text,
          lineHeight: theme.lineHeight,
          xOffset: markerWidth,
          source: block.source
        }, mathMeasurements, mathRenderer, nativeMathMetrics, nativeMathProfile);
        cursor.y += 4;
      }
      cursor.y += 6;
      previousBlockKind = "list";
      continue;
    }

    if (block.type === "code") {
      const fontSize = theme.fontSize * 0.92;
      const lines = block.code.split("\n");
      const lineHeight = fontSize * 1.45;
      const height = lines.length * lineHeight + 18;
      ensure(height + 10);
      cursor.page.objects.push({
        type: "rect",
        x: cursor.x,
        y: cursor.y,
        width: cursor.contentWidth,
        height,
        fill: theme.codeBackground,
        stroke: theme.tableBorder,
        strokeWidth: 0.5,
        radius: 3,
        sourceSpan: block.source
      });
      lines.forEach((line, index) => {
        cursor.page.objects.push(textObject(line, cursor.x + 10, cursor.y + 12 + (index + 1) * lineHeight - 4, fontSize, theme, {
          color: theme.codeText,
          code: true,
          source: block.source
        }));
      });
      cursor.y += height + 12;
      previousBlockKind = "code";
      continue;
    }

    if (block.type === "table") {
      if (block.label) pushAnchor(cursor, block.label, block.source);
      if (block.labelNumber) {
        const label = applyCrossRefFormat(crossRef.table.captionFormat, { number: block.labelNumber, kind: "table", id: block.label });
        const fontSize = theme.fontSize * 0.9;
        ensure(fontSize * 1.4);
        cursor.page.objects.push(textObject(label, cursor.x, cursor.y + fontSize, fontSize, theme, {
          bold: true,
          color: theme.mutedText,
          source: block.source
        }));
        cursor.y += fontSize * 1.6;
      }
      cursor = drawTable(cursor, block, theme, ensure, advanceFlow, mathMeasurements, mathRenderer, nativeMathMetrics, nativeMathProfile);
      previousBlockKind = "table";
      continue;
    }

    if (block.type === "image") {
      const image = layoutImageBlock(block, cursor.contentWidth, theme);
      ensure(image.totalHeight + 12);
      const x = cursor.x + image.x;
      cursor.page.objects.push({
        type: "image",
        src: block.src,
        alt: block.alt,
        x,
        y: cursor.y,
        width: image.width,
        height: image.height,
        anchorId: block.label,
        sourceSpan: block.source
      });
      if (block.caption) {
        const caption = block.labelNumber ? `${applyCrossRefFormat(crossRef.figure.captionFormat, { number: block.labelNumber, kind: "figure", id: block.label })} ${block.caption}` : block.caption;
        drawCaption(cursor, caption, cursor.x, cursor.y + image.height + 6, cursor.contentWidth, image.captionFontSize, theme, mathMeasurements, mathRenderer, nativeMathMetrics, nativeMathProfile, layoutConfig, block.source);
      }
      cursor.y += image.totalHeight + 12;
      previousBlockKind = "image";
      continue;
    }

    if (block.type === "graphsx") {
      const graph = layoutGraphSXBlock(block, cursor.contentWidth, theme, nativeMathProfile);
      ensure(graph.totalHeight + 12);
      const x = cursor.x + graph.x;
      cursor.page.objects.push({
        type: "graphsx",
        source: block.source,
        svg: graph.svg,
        svgBody: graph.svgBody,
        viewBox: graph.viewBox,
        summary: graph.summary,
        displayList: graph.displayList,
        nativeMathProfile: graph.nativeMathProfile,
        x,
        y: cursor.y,
        width: graph.width,
        height: graph.height,
        warnings: graph.warnings,
        anchorId: block.label,
        sourceSpan: block.sourceSpan
      });
      if (block.caption) {
        const caption = block.labelNumber ? `${applyCrossRefFormat(crossRef.figure.captionFormat, { number: block.labelNumber, kind: "figure", id: block.label })} ${block.caption}` : block.caption;
        drawCaption(cursor, caption, cursor.x, cursor.y + graph.height + 6, cursor.contentWidth, graph.captionFontSize, theme, mathMeasurements, mathRenderer, nativeMathMetrics, nativeMathProfile, layoutConfig, block.sourceSpan);
      }
      cursor.y += graph.totalHeight + 12;
      previousBlockKind = "graphsx";
      continue;
    }

    if (block.type === "math") {
      const fontSize = theme.fontSize;
      const text = block.text.replace(/\s+/g, " ").trim();
      const measured = getMeasuredMath(mathMeasurements, text, true, fontSize, mathRenderer, nativeMathMetrics, nativeMathProfile);
      const width = Math.min(cursor.contentWidth, measured?.width ?? Math.max(cursor.contentWidth * 0.35, measureText(text, {
        fontSize,
        fontFamily: theme.fontFamily,
        monoFontFamily: theme.monoFontFamily,
        italic: true
      }) * 1.15));
      const height = measured?.height ?? fontSize * 3.2;
      ensure(height + 10);
      const mathObject = createMathObject({
        latex: text,
        displayMode: true,
        x: cursor.x + (cursor.contentWidth - width) / 2,
        y: cursor.y,
        width,
        height,
        fontSize,
        color: theme.text,
        mathRenderer,
        nativeMathMetrics,
        nativeMathProfile,
        nativeLayout: measured?.nativeLayout,
        anchorId: block.label,
        source: block.source
      });
      cursor.page.objects.push(mathObject);
      if (block.labelNumber) {
        const label = applyCrossRefFormat(crossRef.equation.captionFormat, { number: block.labelNumber, kind: "equation", id: block.label });
        const labelWidth = measureText(label, {
          fontSize,
          fontFamily: theme.fontFamily,
          monoFontFamily: theme.monoFontFamily
        });
        cursor.page.objects.push(textObject(
          label,
          cursor.x + cursor.contentWidth - labelWidth,
          cursor.y + height / 2 + fontSize * 0.35,
          fontSize,
          theme,
          { color: theme.text, source: block.source }
        ));
      }
      cursor.y += height + 12;
      previousBlockKind = "math";
      continue;
    }

    if (block.type === "rule") {
      ensure(20);
      cursor.page.objects.push({
        type: "line",
        x1: cursor.x,
        y1: cursor.y + 8,
        x2: cursor.x + cursor.contentWidth,
        y2: cursor.y + 8,
        stroke: theme.rule,
        strokeWidth: 1,
        sourceSpan: block.source
      });
      cursor.y += 24;
      previousBlockKind = "rule";
    }
  }

  return pages;
}

function paragraphIndent(layoutConfig: LayoutConfig, previousBlockKind: ParagraphSuppressAfter | undefined): number {
  const indent = Math.max(0, layoutConfig.paragraph.indent);
  if (!indent || !previousBlockKind) return 0;
  return layoutConfig.paragraph.suppressAfter.includes(previousBlockKind) ? 0 : indent;
}

function drawTitleMatter(
  cursor: Cursor,
  titleMatter: TitleMatter,
  theme: DocumentTheme,
  mathMeasurements: MathMeasurementMap | undefined,
  mathRenderer: MathRendererName,
  nativeMathMetrics: NativeMathMetrics | undefined,
  nativeMathProfile: NativeMathFontProfileName | undefined,
  layoutConfig: LayoutConfig,
  source?: SourceSpan
): void {
  const latexArticle = titleMatter.style === "latex-article";
  const revtex = titleMatter.style === "revtex";
  if (latexArticle) cursor.y += theme.fontSize * 9.5;
  if (revtex) cursor.y += theme.fontSize * 0.8;

  if (titleMatter.title?.length) {
    const fontSize = titleMatter.titleFontSize ?? headingSize(1, theme.fontSize, true, layoutConfig.headingFontSizes);
    const titleRuns = latexArticle ? titleMatter.title : titleMatter.title.map((run) => ({ ...run, bold: true }));
    const lines = breakRunsIntoLines(titleRuns, cursor.contentWidth, fontSize, theme, mathMeasurements, mathRenderer, nativeMathMetrics, nativeMathProfile, layoutConfig);
    drawLines(cursor, lines, fontSize, theme, {
      bold: !latexArticle,
      color: theme.text,
      lineHeight: 1.12,
      align: "center",
      maxWidth: cursor.contentWidth
    }, mathMeasurements, mathRenderer, nativeMathMetrics, nativeMathProfile);
    cursor.y += latexArticle ? theme.fontSize * 1.6 : revtex ? theme.fontSize * 1.8 : 8;
  }

  if (titleMatter.authors.length) {
    const fontSize = latexArticle || revtex ? theme.fontSize : theme.fontSize * 1.05;
    if (latexArticle || revtex) {
      const authorRuns = joinAuthorRuns(titleMatter.authors);
      const lines = breakRunsIntoLines(authorRuns, cursor.contentWidth, fontSize, theme, mathMeasurements, mathRenderer, nativeMathMetrics, nativeMathProfile, layoutConfig);
      drawLines(cursor, lines, fontSize, theme, {
        color: theme.text,
        lineHeight: 1.2,
        align: "center",
        maxWidth: cursor.contentWidth
      }, mathMeasurements, mathRenderer, nativeMathMetrics, nativeMathProfile);
    } else {
      for (const author of titleMatter.authors) {
        const lines = breakRunsIntoLines(author.runs, cursor.contentWidth, fontSize, theme, mathMeasurements, mathRenderer, nativeMathMetrics, nativeMathProfile, layoutConfig);
        drawLines(cursor, lines, fontSize, theme, {
          color: theme.mutedText,
          lineHeight: 1.25,
          align: "center",
          maxWidth: cursor.contentWidth
        }, mathMeasurements, mathRenderer, nativeMathMetrics, nativeMathProfile);
      }
    }
    cursor.y += latexArticle ? theme.fontSize * 0.6 : revtex ? theme.fontSize * 0.8 : 12;
  }

  if (titleMatter.affiliations.length) {
    const fontSize = theme.fontSize * 0.8;
    for (let index = 0; index < titleMatter.affiliations.length; index += 1) {
      const runs: InlineRun[] = [
        { text: String(index + 1), fontScale: 0.72, baselineShift: -0.36, nonBreak: true },
        { text: " ", nonBreak: true },
        ...titleMatter.affiliations[index]
      ];
      const lines = breakRunsIntoLines(runs, cursor.contentWidth, fontSize, theme, mathMeasurements, mathRenderer, nativeMathMetrics, nativeMathProfile, layoutConfig);
      drawLines(cursor, lines, fontSize, theme, {
        color: theme.text,
        lineHeight: 1.18,
        align: "center",
        maxWidth: cursor.contentWidth
      }, mathMeasurements, mathRenderer, nativeMathMetrics, nativeMathProfile);
    }
    cursor.y += revtex ? theme.fontSize * 0.9 : theme.fontSize * 0.7;
  }

  if (titleMatter.date?.length) {
    const fontSize = theme.fontSize;
    const lines = breakRunsIntoLines(titleMatter.date, cursor.contentWidth, fontSize, theme, mathMeasurements, mathRenderer, nativeMathMetrics, nativeMathProfile, layoutConfig);
    drawLines(cursor, lines, fontSize, theme, {
      color: theme.text,
      lineHeight: 1.2,
      align: "center",
      maxWidth: cursor.contentWidth
    }, mathMeasurements, mathRenderer, nativeMathMetrics, nativeMathProfile);
    cursor.y += latexArticle ? theme.fontSize * 2.7 : theme.fontSize;
  }

  if (titleMatter.abstract?.length) {
    const titleFontSize = latexArticle ? theme.fontSize : theme.fontSize * 0.95;
    const abstractFontSize = latexArticle ? theme.fontSize * 0.9 : theme.fontSize;
    if (titleMatter.abstractTitle) {
      const labelWidth = measureText(titleMatter.abstractTitle, {
        fontSize: titleFontSize,
        fontFamily: theme.fontFamily,
        monoFontFamily: theme.monoFontFamily,
        bold: true
      });
      cursor.page.objects.push(textObject(
        titleMatter.abstractTitle,
        cursor.x + cursor.contentWidth / 2 - labelWidth / 2,
        cursor.y + titleFontSize,
        titleFontSize,
        theme,
        { color: theme.text, bold: true }
      ));
      cursor.y += titleFontSize * (latexArticle ? 1.25 : 1.45);
    }
    const abstractSideInset = latexArticle
      ? theme.fontSize * 2.5
      : revtex
        ? theme.fontSize * 3.5
        : Math.max(0, (cursor.contentWidth - 420) / 2);
    const abstractWidth = Math.min(
      cursor.contentWidth,
      Math.max(theme.fontSize * 12, cursor.contentWidth - abstractSideInset * 2)
    );
    const abstractCursor = {
      ...cursor,
      x: cursor.x + (cursor.contentWidth - abstractWidth) / 2,
      contentWidth: abstractWidth
    };
    const lines = breakRunsIntoLines(titleMatter.abstract, abstractWidth, abstractFontSize, theme, mathMeasurements, mathRenderer, nativeMathMetrics, nativeMathProfile, layoutConfig);
    for (let index = 0; index < lines.length; index += 1) {
      drawLines(abstractCursor, [lines[index]], abstractFontSize, theme, {
        color: theme.text,
        lineHeight: theme.lineHeight,
        textAlign: index === lines.length - 1 ? "left" : layoutConfig.textAlign,
        maxWidth: abstractWidth
      }, mathMeasurements, mathRenderer, nativeMathMetrics, nativeMathProfile);
    }
    cursor.y = abstractCursor.y + (latexArticle ? theme.fontSize * 2.3 : revtex ? theme.fontSize * 2.4 : 18);
  }
}

function joinAuthorRuns(authors: TitleMatter["authors"]): InlineRun[] {
  return authors.flatMap((author, index) => [
    ...(index === 0 ? [] : [{ text: "        " }]),
    ...author.runs,
    ...(author.affiliationIndexes.length
      ? [{ text: author.affiliationIndexes.join(","), fontScale: 0.72, baselineShift: -0.36, nonBreak: true }]
      : [])
  ]);
}

function sectionHeadingRuns(
  block: Extract<LayoutBlock, { type: "heading" }>,
  crossRef: CrossRefConfig,
  headingStyle: LayoutConfig["headingStyle"] = "default"
): InlineRun[] {
  const runs = headingStyle === "revtex" ? uppercaseRuns(block.runs) : block.runs;
  if (!block.labelNumber) return runs;
  const prefix = applyCrossRefFormat(crossRef.section.captionFormat, {
    number: block.labelNumber,
    kind: "section",
    id: block.label
  });
  if (!prefix) return runs;
  return [
    {
      text: headingStyle === "revtex"
        ? `${prefix}   `
        : /\s$/.test(prefix) ? prefix : `${prefix} `
    },
    ...runs
  ];
}

function uppercaseRuns(runs: InlineRun[]): InlineRun[] {
  return runs.map((run) => run.math ? run : { ...run, text: run.text.toUpperCase() });
}

function drawCaption(
  cursor: Cursor,
  caption: string,
  x: number,
  y: number,
  width: number,
  fontSize: number,
  theme: DocumentTheme,
  mathMeasurements: MathMeasurementMap | undefined,
  mathRenderer: MathRendererName,
  nativeMathMetrics: NativeMathMetrics | undefined,
  nativeMathProfile: NativeMathFontProfileName | undefined,
  layoutConfig: LayoutConfig,
  source?: SourceSpan
): void {
  const captionCursor = {
    ...cursor,
    x,
    y,
    contentWidth: width
  };
  const lines = breakRunsIntoLines(flattenInline(parseInline(caption)), width, fontSize, theme, mathMeasurements, mathRenderer, nativeMathMetrics, nativeMathProfile, layoutConfig);
  if (lines.length <= 1) {
    drawLines(captionCursor, lines, fontSize, theme, {
      color: theme.text,
      lineHeight: theme.lineHeight,
      align: "center",
      maxWidth: width,
      source
    }, mathMeasurements, mathRenderer, nativeMathMetrics, nativeMathProfile);
    return;
  }
  lines.forEach((line, index) => {
    drawLines(captionCursor, [line], fontSize, theme, {
      color: theme.text,
      lineHeight: theme.lineHeight,
      maxWidth: width,
      textAlign: index === lines.length - 1 ? "left" : "justify",
      source
    }, mathMeasurements, mathRenderer, nativeMathMetrics, nativeMathProfile);
  });
}

function estimateCaptionHeight(caption: string | undefined, width: number, fontSize: number, theme: DocumentTheme): number {
  if (!caption) return 0;
  const measuredWidth = measureText(caption, {
    fontSize,
    fontFamily: theme.fontFamily,
    monoFontFamily: theme.monoFontFamily
  });
  const lineCount = Math.max(1, Math.ceil(measuredWidth / Math.max(1, width)));
  return 6 + lineCount * fontSize * theme.lineHeight;
}

function layoutImageBlock(
  block: Extract<LayoutBlock, { type: "image" }>,
  contentWidth: number,
  theme: DocumentTheme
): { x: number; width: number; height: number; totalHeight: number; captionFontSize: number; captionWidth: number } {
  const fallbackRatio = 16 / 9;
  const requestedWidth = resolveImageLength(block.width, contentWidth);
  const requestedHeight = resolveImageLength(block.height, contentWidth);
  let width = requestedWidth ?? Math.min(contentWidth, 420);
  let height = requestedHeight ?? width / fallbackRatio;

  if (requestedWidth !== undefined && requestedHeight !== undefined) {
    const boxRatio = requestedWidth / requestedHeight;
    if (boxRatio > fallbackRatio) {
      height = requestedHeight;
      width = height * fallbackRatio;
    } else {
      width = requestedWidth;
      height = width / fallbackRatio;
    }
  } else if (requestedHeight !== undefined) {
    height = requestedHeight;
    width = height * fallbackRatio;
  }

  width = Math.min(width, contentWidth);
  height = Math.max(1, height);

  const align = block.align ?? "center";
  const x = align === "right" ? contentWidth - width : align === "center" ? (contentWidth - width) / 2 : 0;
  const captionFontSize = theme.fontSize * 0.86;
  const captionWidth = block.caption
    ? Math.min(width, measureText(block.caption, {
        fontSize: captionFontSize,
        fontFamily: theme.fontFamily,
        monoFontFamily: theme.monoFontFamily
      }))
    : 0;
  const totalHeight = height + estimateCaptionHeight(block.caption, contentWidth, captionFontSize, theme);
  return { x, width, height, totalHeight, captionFontSize, captionWidth };
}

function resolveImageLength(length: { value: number; unit: "px" | "percent" } | undefined, contentWidth: number): number | undefined {
  if (!length) return undefined;
  return length.unit === "percent" ? contentWidth * length.value / 100 : length.value;
}

function layoutGraphSXBlock(
  block: Extract<LayoutBlock, { type: "graphsx" }>,
  contentWidth: number,
  theme: DocumentTheme,
  nativeMathProfile?: NativeMathFontProfileName
): {
  x: number;
  width: number;
  height: number;
  totalHeight: number;
  captionFontSize: number;
  captionWidth: number;
  svg: string;
  svgBody: string;
  viewBox: string;
  summary: string;
  displayList: ReturnType<typeof renderGraphSX>["displayList"];
  nativeMathProfile: NativeMathFontProfileName;
  warnings: string[];
} {
  const profile = nativeMathProfile ?? "openmath";
  const artifact = renderGraphSX(block.source, theme, profile);
  const requestedWidth = resolveImageLength(block.width, contentWidth);
  const width = requestedWidth === undefined ? artifact.width : Math.min(contentWidth, requestedWidth);
  const scale = artifact.width > 0 ? width / artifact.width : 1;
  const height = Math.max(1, artifact.height * scale);
  const align = block.align ?? "center";
  const x = align === "right" ? contentWidth - width : align === "center" ? (contentWidth - width) / 2 : 0;
  const warnings = requestedWidth === undefined && artifact.width > contentWidth
    ? [`GraphSX natural width ${formatWarningNumber(artifact.width)} exceeds content width ${formatWarningNumber(contentWidth)}. Add width=100% to fit.`]
    : [];
  const captionFontSize = theme.fontSize * 0.86;
  const captionWidth = block.caption
    ? Math.min(width, measureText(block.caption, {
        fontSize: captionFontSize,
        fontFamily: theme.fontFamily,
        monoFontFamily: theme.monoFontFamily
      }))
    : 0;
  const totalHeight = height + estimateCaptionHeight(block.caption, contentWidth, captionFontSize, theme);
  return {
    x,
    width,
    height,
    totalHeight,
    captionFontSize,
    captionWidth,
    svg: artifact.svg,
    svgBody: artifact.svgBody,
    viewBox: artifact.viewBox,
    summary: artifact.summary,
    displayList: artifact.displayList,
    nativeMathProfile: profile,
    warnings
  };
}

function formatWarningNumber(value: number): string {
  return Number(value.toFixed(1)).toString();
}

function drawLines(
  cursor: Cursor,
  lines: LayoutLine[],
  fontSize: number,
  theme: DocumentTheme,
  options: { color: string; bold?: boolean; lineHeight: number; xOffset?: number; align?: "left" | "center" | "right"; maxWidth?: number; textAlign?: "left" | "justify"; source?: SourceSpan },
  mathMeasurements?: MathMeasurementMap,
  mathRenderer: MathRendererName = "katex-raster",
  nativeMathMetrics?: NativeMathMetrics,
  nativeMathProfile?: NativeMathFontProfileName
) {
  for (const line of lines) {
    const alignOffset = options.align === "center" && options.maxWidth !== undefined
      ? Math.max(0, (options.maxWidth - line.width) / 2)
      : options.align === "right" && options.maxWidth !== undefined
        ? Math.max(0, options.maxWidth - line.width)
        : 0;
    let x = cursor.x + (options.xOffset ?? 0) + alignOffset;
    const justifyExtra = options.textAlign === "justify" && options.maxWidth !== undefined
      ? Math.max(0, options.maxWidth - line.width)
      : 0;
    const stretchCount = justifyExtra > 0 ? countStretchOpportunities(line.runs) : 0;
    const stretch = stretchCount > 0 ? justifyExtra / stretchCount : 0;
    const baseline = cursor.y + fontSize;
    let pendingText: Extract<DisplayObject, { type: "text" }> | undefined;
    let pendingKey = "";
    const flushText = () => {
      if (pendingText) cursor.page.objects.push(pendingText);
      pendingText = undefined;
      pendingKey = "";
    };
    for (const run of line.runs) {
      if (run.math) {
        flushText();
        const runFontSize = fontSize * (run.fontScale ?? 1);
        const latex = run.text.trim();
        const measured = getMeasuredMath(mathMeasurements, latex, false, runFontSize, mathRenderer, nativeMathMetrics, nativeMathProfile);
        const width = measured?.width ?? measureInlineMathBoxWidth(latex, runFontSize, theme);
        const advance = measured?.advance ?? measureInlineMathAdvance(latex, runFontSize, theme);
        const height = measured?.height ?? runFontSize * options.lineHeight;
        const y = isMathJaxRenderer(mathRenderer)
          ? cursor.y
          : measured?.baseline !== undefined
            ? baseline - measured.baseline
            : cursor.y + Math.max(0, (height - (measured?.height ?? height)) / 2) - runFontSize * 0.12;
        cursor.page.objects.push(createMathObject({
          latex,
          displayMode: false,
          x,
          y,
          width,
          height,
          advance,
          fontSize: runFontSize,
          color: run.link ? theme.link : run.color ?? options.color,
          mathRenderer,
          nativeMathMetrics,
          nativeMathProfile,
          nativeLayout: measured?.nativeLayout,
          source: options.source
        }));
        x += advance;
        continue;
      }
      const font = run.code ? theme.monoFontFamily : theme.fontFamily;
      const runFontSize = fontSize * (run.fontScale ?? 1);
      const textWidth = measureText(run.text, {
        fontSize: runFontSize,
        fontFamily: theme.fontFamily,
        monoFontFamily: theme.monoFontFamily,
        ...run,
        bold: options.bold || run.bold
      });
      const stretchedWidth = textWidth + stretch * countStretchOpportunities([run]);
      const textObject: Extract<DisplayObject, { type: "text" }> = {
        type: "text",
        text: run.text,
        x,
        y: baseline + fontSize * (run.baselineShift ?? 0),
        width: stretchedWidth,
        fontSize: runFontSize,
        fontFamily: font,
        color: run.link ? theme.link : run.color ?? options.color,
        bold: options.bold || run.bold,
        italic: run.italic || run.math,
        link: run.link,
        sourceSpan: options.source
      };
      const textKey = [
        textObject.fontFamily,
        textObject.fontSize,
        textObject.color,
        textObject.bold ? "b" : "",
        textObject.italic ? "i" : "",
        run.nonBreak ? "nb" : "",
        textObject.link ?? ""
      ].join("\u0000");
      if (pendingText && pendingKey === textKey) {
        pendingText.text += run.text;
        pendingText.width = (pendingText.width ?? 0) + stretchedWidth;
      } else {
        flushText();
        pendingText = textObject;
        pendingKey = textKey;
      }
      x += stretchedWidth;
    }
    flushText();
    cursor.y += Math.max(line.height, fontSize * options.lineHeight);
  }
}

function countStretchOpportunities(runs: InlineRun[]): number {
  return runs.reduce((count, run) => {
    if (run.math || run.code) return count;
    return count + (run.text.match(/ +/g) ?? []).length;
  }, 0);
}

function measureInlineMathBoxWidth(text: string, fontSize: number, theme: DocumentTheme): number {
  return estimateInlineMathWidth(text, fontSize, theme) + fontSize * 0.35;
}

function measureInlineMathAdvance(text: string, fontSize: number, theme: DocumentTheme): number {
  return estimateInlineMathWidth(text, fontSize, theme) + fontSize * 0.08;
}

function estimateInlineMathWidth(text: string, fontSize: number, theme: DocumentTheme): number {
  let width = 0;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (char === "\\") {
      const command = text.slice(index).match(/^\\[a-zA-Z]+/);
      if (command?.[0] === "\\frac") {
        const numerator = readLatexGroup(text, index + command[0].length);
        const denominator = numerator ? readLatexGroup(text, numerator.end + 1) : undefined;
        if (numerator && denominator) {
          width += Math.max(
            estimateInlineMathWidth(numerator.value, fontSize * 0.86, theme),
            estimateInlineMathWidth(denominator.value, fontSize * 0.86, theme)
          ) + fontSize * 0.5;
          index = denominator.end;
          continue;
        }
      }

      if (command) {
        width += measureInlineMathText(commandToText(command[0]), fontSize, theme);
        index += command[0].length - 1;
        continue;
      }
    }

    if (char === "^" || char === "_") {
      const script = readLatexScript(text, index + 1);
      width += estimateInlineMathWidth(script.value, fontSize * 0.68, theme);
      index = script.end;
      continue;
    }

    if (char === "{" || char === "}") continue;

    if (/^[=+\-]$/.test(char)) {
      width += measureInlineMathText(` ${char} `, fontSize, theme);
      continue;
    }

    width += measureInlineMathText(char, fontSize, theme);
  }
  return width;
}

function measureInlineMathText(text: string, fontSize: number, theme: DocumentTheme): number {
  return measureText(text, {
    fontSize,
    fontFamily: theme.fontFamily,
    monoFontFamily: theme.monoFontFamily,
    italic: true
  });
}

function createMathObject(options: {
  latex: string;
  displayMode: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  advance?: number;
  fontSize: number;
  color: string;
  mathRenderer: MathRendererName;
  nativeMathMetrics?: NativeMathMetrics;
  nativeMathProfile?: NativeMathFontProfileName;
  nativeLayout?: ReturnType<typeof layoutNativeMath>;
  anchorId?: string;
  source?: SourceSpan;
}): Extract<DisplayObject, { type: "math" }> {
  if (isMathJaxRenderer(options.mathRenderer)) {
    const artifact = getCachedMathJaxSvgArtifact(options.latex, options.displayMode, options.fontSize, options.color);
    const y = options.displayMode ? options.y : options.y + options.fontSize - artifact.baseline;
    return {
      type: "math",
      renderer: options.mathRenderer,
      latex: options.latex,
      html: "",
      svg: artifact.svg,
      svgBody: artifact.body,
      viewBox: artifact.viewBox,
      displayMode: options.displayMode,
      x: options.x,
      y,
      width: artifact.width,
      height: artifact.height,
      advance: options.advance ?? artifact.width,
      baseline: artifact.baseline,
      fontSize: options.fontSize,
      color: options.color,
      anchorId: options.anchorId,
      sourceSpan: options.source
    };
  }

  if (isNativeMathRenderer(options.mathRenderer)) {
    const profile = options.nativeMathProfile ?? nativeMathProfileForRenderer(options.mathRenderer);
    const nativeMetrics = options.nativeMathMetrics ?? (options.mathRenderer === "native-openmath" ? getDefaultOpenMathMetricsForProfile(profile) : defaultNativeMathMetrics);
    const layout = options.nativeLayout ?? layoutNativeMath(options.latex, options.displayMode, options.fontSize, nativeMetrics, profile);
    const y = options.displayMode ? options.y : options.y;
    return {
      type: "math",
      renderer: options.mathRenderer,
      latex: options.latex,
      html: "",
      svg: "",
      displayMode: options.displayMode,
      x: options.x,
      y,
      width: layout.width,
      height: layout.height,
      advance: options.advance ?? layout.advance,
      baseline: layout.baseline,
      fontSize: options.fontSize,
      color: options.color,
      nativeMetrics,
      nativeMathProfile: profile,
      nativeLayout: layout,
      anchorId: options.anchorId,
      sourceSpan: options.source
    };
  }

  const html = renderKatex(options.latex, options.displayMode);
  return {
    type: "math",
    renderer: options.mathRenderer,
    latex: options.latex,
    html,
    svg: renderKatexSvg({
      latex: options.latex,
      html,
      displayMode: options.displayMode,
      width: options.width,
      height: options.height,
      fontSize: options.fontSize,
      color: options.color
    }),
    displayMode: options.displayMode,
    x: options.x,
    y: options.y,
    width: options.width,
    height: options.height,
    advance: options.advance,
    fontSize: options.fontSize,
    color: options.color,
    anchorId: options.anchorId,
    sourceSpan: options.source
  };
}

function isMathJaxRenderer(renderer: MathRendererName): boolean {
  return renderer === "mathjax-vector" || renderer === "mathjax-glyph";
}

function readLatexScript(text: string, start: number): { value: string; end: number } {
  const group = readLatexGroup(text, start);
  if (group) return group;
  return { value: text[start] ?? "", end: start };
}

function readLatexGroup(text: string, start: number): { value: string; end: number } | undefined {
  if (text[start] !== "{") return undefined;
  let depth = 0;
  for (let index = start; index < text.length; index += 1) {
    if (text[index] === "{") depth += 1;
    if (text[index] === "}") depth -= 1;
    if (depth === 0) return { value: text.slice(start + 1, index), end: index };
  }
  return undefined;
}

function commandToText(command: string): string {
  const commands: Record<string, string> = {
    "\\alpha": "a",
    "\\beta": "b",
    "\\gamma": "g",
    "\\delta": "d",
    "\\theta": "th",
    "\\lambda": "l",
    "\\mu": "m",
    "\\pi": "p",
    "\\sigma": "s",
    "\\cdot": " · ",
    "\\times": " x ",
    "\\int": "∫"
  };
  return commands[command] ?? command.slice(1);
}

function textObject(
  text: string,
  x: number,
  y: number,
  fontSize: number,
  theme: DocumentTheme,
  options: { color: string; bold?: boolean; italic?: boolean; code?: boolean; source?: SourceSpan }
): DisplayObject {
  return {
    type: "text",
    text,
    x,
    y,
    fontSize,
    fontFamily: options.code ? theme.monoFontFamily : theme.fontFamily,
    color: options.color,
    bold: options.bold,
    italic: options.italic,
    sourceSpan: options.source
  };
}

function pushAnchor(cursor: Cursor, anchorId: string, source?: SourceSpan): void {
  cursor.page.objects.push({
    type: "rect",
    x: cursor.x,
    y: cursor.y,
    width: 1,
    height: 1,
    fill: "none",
    stroke: "none",
    strokeWidth: 0,
    anchorId,
    sourceSpan: source
  });
}

function drawTable(
  cursor: Cursor,
  block: Extract<LayoutBlock, { type: "table" }>,
  theme: DocumentTheme,
  ensure: (height: number) => Cursor,
  advanceFlow: (from: Cursor) => Cursor,
  mathMeasurements?: MathMeasurementMap,
  mathRenderer: MathRendererName = "katex-raster",
  nativeMathMetrics?: NativeMathMetrics,
  nativeMathProfile?: NativeMathFontProfileName
): Cursor {
  const table = layoutTable(block, cursor.contentWidth, theme, mathMeasurements, mathRenderer, nativeMathMetrics, nativeMathProfile);
  const header = table.rows[0];
  const bodyRows = table.rows.slice(1);
  const spannedRowHeight = (start: number, span: number) =>
    table.rows.slice(start, start + span).reduce((sum, row) => sum + row.height, 0);
  const drawRow = (row: typeof table.rows[number], rowIndex: number, y: number) => {
    for (const cell of row.cells) {
      const x = cursor.x + cell.x;
      const height = spannedRowHeight(rowIndex, cell.rowSpan);
      cursor.page.objects.push({
        type: "rect",
        x,
        y,
        width: cell.width,
        height,
        fill: row.header ? theme.tableHeaderBackground : theme.pageBackground,
        stroke: theme.tableBorder,
        strokeWidth: 0.7,
        sourceSpan: block.source
      });
      const cellCursor = {
        ...cursor,
        x: x + table.paddingX,
        y: y + table.paddingY,
        contentWidth: Math.max(0, cell.width - table.paddingX * 2)
      };
      drawLines(cellCursor, cell.lines, table.fontSize, theme, {
        color: theme.text,
        bold: row.header,
        lineHeight: theme.lineHeight,
        align: cell.align,
        maxWidth: cellCursor.contentWidth,
        source: block.source
      }, mathMeasurements, mathRenderer, nativeMathMetrics, nativeMathProfile);
    }
  };

  cursor = ensure(header.height + 12);
  drawRow(header, 0, cursor.y);
  cursor.y += header.height;
  for (let index = 0; index < bodyRows.length;) {
    const rowIndex = index + 1;
    const groupEnd = tableRowSpanGroupEnd(table.rows, rowIndex);
    const groupRows = table.rows.slice(rowIndex, groupEnd + 1);
    const groupHeight = groupRows.reduce((sum, row) => sum + row.height, 0);
    if (cursor.y + groupHeight > cursor.bottom) {
      cursor = advanceFlow(cursor);
      drawRow(header, 0, cursor.y);
      cursor.y += header.height;
    }
    for (let absoluteRow = rowIndex; absoluteRow <= groupEnd; absoluteRow += 1) {
      const row = table.rows[absoluteRow];
      drawRow(row, absoluteRow, cursor.y);
      cursor.y += row.height;
    }
    index = groupEnd;
  }
  cursor.y += 14;
  return cursor;
}

function tableRowSpanGroupEnd(rows: ReturnType<typeof layoutTable>["rows"], startRow: number): number {
  let endRow = startRow;
  for (let rowIndex = startRow; rowIndex <= endRow && rowIndex < rows.length; rowIndex += 1) {
    for (const cell of rows[rowIndex].cells) {
      endRow = Math.max(endRow, rowIndex + cell.rowSpan - 1);
    }
  }
  return Math.min(endRow, rows.length - 1);
}
