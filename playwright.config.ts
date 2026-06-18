import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  webServer: {
    command: "npm run dev -- --port 4195",
    url: "http://127.0.0.1:4195",
    reuseExistingServer: true
  },
  use: {
    baseURL: "http://127.0.0.1:4195",
    trace: "on-first-retry"
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } }
  ]
});
