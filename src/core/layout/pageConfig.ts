export type PageSizeName = "a4" | "letter";

export type PageConfig = {
  size: PageSizeName;
  width: number;
  height: number;
  margin: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
};

export type PageMargins = PageConfig["margin"];
export type PageMarginInput = number | Partial<PageMargins>;

const sizes: Record<PageSizeName, { width: number; height: number }> = {
  a4: { width: 595.28, height: 841.89 },
  letter: { width: 612, height: 792 }
};

export function createPageConfig(
  size: PageSizeName = "letter",
  margin: PageMarginInput = 72
): PageConfig {
  const pageSize = sizes[size];
  const margins = normalizeMargins(margin);
  return {
    size,
    width: pageSize.width,
    height: pageSize.height,
    margin: margins
  };
}

function normalizeMargins(margin: PageMarginInput): PageMargins {
  if (typeof margin === "number") {
    return {
      top: margin,
      right: margin,
      bottom: margin,
      left: margin
    };
  }
  const fallback = 72;
  return {
    top: margin.top ?? fallback,
    right: margin.right ?? fallback,
    bottom: margin.bottom ?? fallback,
    left: margin.left ?? fallback
  };
}
