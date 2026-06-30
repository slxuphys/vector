import type { DisplayPage, PagedDisplayList } from "./displayTypes";
import type { PageConfig } from "../layout/pageConfig";
import type { DocumentTheme } from "../theme/themeTypes";

export function buildDisplayList(
  pages: DisplayPage[],
  page: PageConfig,
  theme: DocumentTheme
): PagedDisplayList {
  const themedPages = theme.fontFaceCss
    ? pages.map((displayPage) => ({ ...displayPage, fontFaceCss: theme.fontFaceCss }))
    : pages;
  return { pages: themedPages, page, theme };
}
