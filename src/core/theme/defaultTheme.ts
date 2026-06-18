import type { DocumentTheme } from "./themeTypes";

export const defaultTheme: DocumentTheme = {
  pageBackground: "#ffffff",
  text: "#1f2933",
  mutedText: "#667085",
  rule: "#ccd3dc",
  codeText: "#172033",
  codeBackground: "#f3f6f8",
  tableHeaderBackground: "#eef3f7",
  tableBorder: "#cfd7df",
  link: "#145ea8",
  fontFamily: "Arial, Helvetica, sans-serif",
  monoFontFamily: "Consolas, Monaco, monospace",
  fontSize: 12,
  lineHeight: 1.45
};

export const darkTheme: DocumentTheme = {
  ...defaultTheme,
  pageBackground: "#111827",
  text: "#f3f4f6",
  mutedText: "#aeb8c5",
  rule: "#374151",
  codeText: "#f9fafb",
  codeBackground: "#1f2937",
  tableHeaderBackground: "#243244",
  tableBorder: "#465466",
  link: "#7ab7ff"
};
