import type { DocumentTheme } from "../theme/themeTypes";
import { measureText } from "./measureText";

export type ReferenceListStyle = {
  markerGap: number;
  entryGap: number;
  blockGap: number;
};

export const defaultReferenceListStyle: ReferenceListStyle = {
  markerGap: 4,
  entryGap: 4,
  blockGap: 6
};

export function referenceMarker(number: number): string {
  return `[${number}]`;
}

export function referenceMarkerWidth(marker: string, fontSize: number, theme: DocumentTheme): number {
  return measureText(marker, {
    fontSize,
    fontFamily: theme.fontFamily,
    monoFontFamily: theme.monoFontFamily
  }) + defaultReferenceListStyle.markerGap;
}
