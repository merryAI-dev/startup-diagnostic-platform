import { defineConfig, devices } from "@playwright/test";
import { loadE2EEnv } from "./e2e/support/env";

const env = loadE2EEnv();
const baseURL = env.baseUrl || "http://127.0.0.1:4174";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 10 * 60 * 1000,
  expect: {
    timeout: 15_000,
  },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
  webServer: env.baseUrl
    ? undefined
    : {
        command: "npm run dev -- --host 0.0.0.0 --port 4174",
        url: baseURL,
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
