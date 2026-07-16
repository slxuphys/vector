import { expect, test } from "@playwright/test";

test("renders editor and svg pages", async ({ page }) => {
  await page.goto("/lab");
  await expect(page.getByRole("heading", { name: "Vector Lab" })).toBeVisible();
  await expect(page.locator("svg.svg-md-page-svg").first()).toBeVisible({ timeout: 15000 });
  await expect(page.locator("svg.svg-md-page-svg text").first()).toBeVisible();

  await expect.poll(async () => {
    return page.locator(".svg-md-preview-pane").evaluate((element) => getComputedStyle(element).overflowY);
  }).toBe("auto");
});

test("opens the math-heavy example from the shared project", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByLabel("Choose project")).toContainText("Vector examples");
  await page.getByTitle("markdown/math-heavy.md").click();
  await expect(page.locator("svg.svg-md-page-svg").first()).toBeVisible({ timeout: 15000 });
  await expect.poll(async () => {
    return page.locator(".svg-md-preview").evaluate((element) => Number(element.getAttribute("data-page-count")));
  }).toBeGreaterThanOrEqual(1);
  await expect.poll(async () => page.locator("svg.svg-md-page-svg").count()).toBeLessThan(10);
});

test("opens the 100 page sample from the shared project", async ({ page }) => {
  await page.goto("/");
  await page.getByTitle("stress-tests").click();
  await page.getByTitle("stress-tests/hundred-pages.md").click();
  await expect(page.locator("svg.svg-md-page-svg").first()).toBeVisible({ timeout: 30000 });
  await expect.poll(async () => {
    return page.locator(".svg-md-preview").evaluate((element) => Number(element.getAttribute("data-page-count")));
  }, { timeout: 30000 }).toBeGreaterThanOrEqual(100);
  await expect.poll(async () => page.locator("svg.svg-md-page-svg").count()).toBeLessThan(10);
});

test("deletes a browser project without affecting examples", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New browser project" }).click();
  await page.getByRole("textbox", { name: "New browser project" }).fill("Disposable project");
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByLabel("Choose project")).toContainText("Disposable project");

  await page.getByLabel("Choose project").click();
  await page.getByRole("button", { name: "Delete project Disposable project" }).click();
  await expect(page.getByRole("alertdialog", { name: "Delete project" })).toBeVisible();
  await page.getByRole("button", { name: "Delete", exact: true }).click();

  await expect(page.getByLabel("Choose project")).toContainText("Vector examples");
  await page.getByLabel("Choose project").click();
  await expect(page.getByText("Disposable project", { exact: true })).toHaveCount(0);
});

test("switches the OpenType font profile", async ({ page }) => {
  await page.goto("/lab");
  await page.getByLabel("Font", { exact: true }).selectOption("libertinus");
  await expect(page.locator("svg.svg-md-page-svg text").first()).toBeVisible({ timeout: 15000 });
  await expect(page.locator("svg.svg-md-page-svg text").first()).toHaveAttribute("font-family", /Libertinus/);
});

test("captures diagnostics in the Console pane", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.removeItem("svg-md-debug-log-settings");
    window.localStorage.removeItem("vector-console-visible");
  });
  await page.goto("/lab");
  await page.getByRole("button", { name: "Show console" }).click();
  await expect(page.getByRole("region", { name: "Console" })).toBeVisible();

  await page.locator(".vector-console-filter").filter({ hasText: "Preview" }).click();
  await page.locator(".cm-content").click();
  await page.keyboard.type(" ");
  await expect(page.locator(".vector-console-entry").filter({ hasText: "[preview-update]" }).first()).toBeVisible({ timeout: 15000 });

  await page.getByRole("button", { name: "Clear console" }).click();
  await expect(page.locator(".vector-console-entry")).toHaveCount(0);
  await page.getByRole("button", { name: "Close console" }).click();
  await expect(page.getByRole("region", { name: "Console" })).toHaveCount(0);
});

test("downloads the current PDF", async ({ page }) => {
  await page.goto("/lab");
  await expect(page.locator("svg.svg-md-page-svg").first()).toBeVisible({ timeout: 15000 });

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PDF" }).click();
  await expect(page.getByRole("button", { name: "Generating PDF" })).toBeVisible();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toBe("document.pdf");
});
