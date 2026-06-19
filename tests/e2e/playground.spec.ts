import { expect, test } from "@playwright/test";

test("renders editor and svg pages", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "SVG Markdown Preview" })).toBeVisible();
  await expect(page.locator("svg.svg-md-page-svg").first()).toBeVisible({ timeout: 15000 });
  await expect(page.locator("svg.svg-md-page-svg text").first()).toBeVisible();
  await expect(page.locator(".svg-md-katex").first()).toBeVisible();
  await expect.poll(async () => {
    return page.locator(".svg-md-katex").first().evaluate((element) => element.getBoundingClientRect().height);
  }).toBeLessThan(80);
  await expect.poll(async () => {
    return page.locator(".svg-md-katex").first().evaluate((element) => element.innerHTML.includes("data:font/woff2"));
  }).toBe(true);

  await expect.poll(async () => {
    return page.locator(".svg-md-preview-pane").evaluate((element) => getComputedStyle(element).overflowY);
  }).toBe("auto");
});

test("switches to the long example", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Example").selectOption("long");
  await expect(page.locator("svg.svg-md-page-svg").first()).toBeVisible({ timeout: 15000 });
  await expect.poll(async () => {
    return page.locator(".svg-md-preview").evaluate((element) => Number(element.getAttribute("data-page-count")));
  }).toBeGreaterThanOrEqual(10);
  await expect.poll(async () => page.locator("svg.svg-md-page-svg").count()).toBeLessThan(10);
});

test("switches main text to TeX font", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Font").selectOption("tex");
  await expect(page.locator("svg.svg-md-page-svg text").first()).toHaveAttribute("font-family", /KaTeX_Main/);
});

test("downloads the current PDF", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("svg.svg-md-page-svg").first()).toBeVisible({ timeout: 15000 });

  await expect(page.getByLabel("Raster math")).not.toBeChecked();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PDF" }).click();
  await expect(page.getByRole("button", { name: "Generating PDF" })).toBeVisible();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toBe("document.pdf");
});
