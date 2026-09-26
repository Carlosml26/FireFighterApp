import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  expect: { timeout: 12000 },
  use: {
    baseURL: "http://127.0.0.1:4320",
    viewport: { width: 1440, height: 1000 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: {
      args: [
        "--use-fake-device-for-media-stream",
        "--use-fake-ui-for-media-stream",
      ],
    },
  },
  webServer: {
    command: "node src/http-server.js",
    url: "http://127.0.0.1:4320/health",
    env: { PORT: "4320", DB_PATH: ":memory:", TRAINING: "1" },
    reuseExistingServer: false,
  },
});
