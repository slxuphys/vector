import { expect, test } from "@playwright/test";

test("renders editor and svg pages", async ({ page }) => {
  await page.goto("/lab");
  await expect(page.getByRole("heading", { name: "Vector Lab" })).toBeVisible();
  await expect(page.locator("svg.svg-md-page-svg").first()).toBeVisible({ timeout: 15000 });
  await expect(page.locator("svg.svg-md-page-svg text").first()).toBeVisible();
  await expect(page.getByLabel("Math", { exact: true })).toHaveValue("native-openmath");
  await expect(page.getByLabel("Math", { exact: true }).locator("option")).toHaveCount(3);

  await expect.poll(async () => {
    return page.locator(".svg-md-preview-pane").evaluate((element) => getComputedStyle(element).overflowY);
  }).toBe("auto");
});

test("switches to the long example", async ({ page }) => {
  await page.goto("/lab");
  await page.getByLabel("Example").selectOption("long");
  await expect(page.locator("svg.svg-md-page-svg").first()).toBeVisible({ timeout: 15000 });
  await expect.poll(async () => {
    return page.locator(".svg-md-preview").evaluate((element) => Number(element.getAttribute("data-page-count")));
  }).toBeGreaterThanOrEqual(10);
  await expect.poll(async () => page.locator("svg.svg-md-page-svg").count()).toBeLessThan(10);
});

test("switches to the 100 page stress example", async ({ page }) => {
  await page.goto("/lab");
  await page.getByLabel("Example").selectOption("hundred");
  await expect(page.locator("svg.svg-md-page-svg").first()).toBeVisible({ timeout: 30000 });
  await expect.poll(async () => {
    return page.locator(".svg-md-preview").evaluate((element) => Number(element.getAttribute("data-page-count")));
  }, { timeout: 30000 }).toBeGreaterThanOrEqual(100);
  await expect.poll(async () => page.locator("svg.svg-md-page-svg").count()).toBeLessThan(10);
});

test("switches main text to TeX font", async ({ page }) => {
  await page.goto("/lab");
  await page.getByLabel("Example").selectOption("short");
  await page.getByLabel("Math", { exact: true }).selectOption("native");
  await page.getByLabel("Font", { exact: true }).selectOption("tex");
  await expect(page.locator("svg.svg-md-page-svg text").first()).toHaveAttribute("font-family", /KaTeX_Main/);
});

test("switches math to KaTeX raster reference", async ({ page }) => {
  await page.goto("/lab");
  await page.getByLabel("Example").selectOption("short");
  await page.getByLabel("Math", { exact: true }).selectOption("katex-raster");
  await expect(page.locator(".svg-md-katex").first()).toBeVisible({ timeout: 15000 });
  await expect.poll(async () => {
    return page.locator(".svg-md-katex").first().evaluate((element) => element.getBoundingClientRect().height);
  }).toBeLessThan(80);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PDF" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("document.pdf");
});

test("switches math to native KaTeX-font engine", async ({ page }) => {
  await page.goto("/lab");
  await page.getByLabel("Example").selectOption("short");
  await page.getByLabel("Math", { exact: true }).selectOption("native");
  await expect(page.locator("svg.svg-md-page-svg text").first()).toBeVisible({ timeout: 15000 });
  await expect(page.getByLabel("Native PDF")).toBeChecked();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PDF" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("document.pdf");
});

test("downloads the current PDF", async ({ page }) => {
  await page.goto("/lab");
  await expect(page.locator("svg.svg-md-page-svg").first()).toBeVisible({ timeout: 15000 });

  await expect(page.getByLabel("Native PDF")).toBeChecked();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PDF" }).click();
  await expect(page.getByRole("button", { name: "Generating PDF" })).toBeVisible();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toBe("document.pdf");
});
