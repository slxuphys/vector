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

const sizes: Record<PageSizeName, { width: number; height: number }> = {
  a4: { width: 595.28, height: 841.89 },
  letter: { width: 612, height: 792 }
};

export function createPageConfig(
  size: PageSizeName = "letter",
  margin = 72
): PageConfig {
  const pageSize = sizes[size];
  return {
    size,
    width: pageSize.width,
    height: pageSize.height,
    margin: {
      top: margin,
      right: margin,
      bottom: margin,
      left: margin
    }
  };
}
