import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, PDFRef } from "pdf-lib";
import type { PagedDisplayList } from "../../src/core/display-list/displayTypes";

export type ParitySummary = {
  displayList: string;
  displayListJson: string;
  fontStreams: string[];
  contentStreams: string[];
};

export async function summarizeParity(layout: PagedDisplayList, bytes: Uint8Array): Promise<ParitySummary> {
  const pdf = await PDFDocument.load(bytes);
  const fontStreams: string[] = [];
  const contentStreams: string[] = [];

  for (const [, value] of pdf.context.enumerateIndirectObjects()) {
    if (!(value instanceof PDFDict)) continue;
    for (const key of ["FontFile", "FontFile2", "FontFile3"]) {
      const candidate = value.get(PDFName.of(key));
      const stream = candidate instanceof PDFRef ? pdf.context.lookup(candidate) : candidate;
      if (stream instanceof PDFRawStream) fontStreams.push(fnv1a(stream.getContents()));
    }
  }

  for (const page of pdf.getPages()) {
    const contents = page.node.get(PDFName.of("Contents"));
    for (const stream of resolveStreams(pdf, contents)) contentStreams.push(fnv1a(stream.getContents()));
  }

  const comparable = JSON.stringify({
    ...layout,
    theme: { ...layout.theme, fontFaceCss: undefined },
    pages: layout.pages.map(({ fontFaceCss: _fontFaceCss, ...page }) => page)
  });
  return {
    displayList: fnv1a(comparable),
    displayListJson: comparable,
    fontStreams: [...new Set(fontStreams)].sort(),
    contentStreams
  };
}

function resolveStreams(pdf: PDFDocument, value: unknown): PDFRawStream[] {
  if (value instanceof PDFRawStream) return [value];
  if (value instanceof PDFRef) {
    const resolved = pdf.context.lookup(value);
    return resolved instanceof PDFRawStream ? [resolved] : [];
  }
  if (value instanceof PDFArray) {
    const streams: PDFRawStream[] = [];
    for (let index = 0; index < value.size(); index += 1) {
      streams.push(...resolveStreams(pdf, value.get(index)));
    }
    return streams;
  }
  if (value instanceof PDFDict) return [];
  return [];
}

function fnv1a(value: string | Uint8Array): string {
  let hash = 0x811c9dc5;
  if (typeof value === "string") {
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }
  } else {
    for (const byte of value) {
      hash ^= byte;
      hash = Math.imul(hash, 0x01000193);
    }
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}
