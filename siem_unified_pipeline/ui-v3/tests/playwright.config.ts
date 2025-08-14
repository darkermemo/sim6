import { defineConfig } from "@playwright/test";

export default defineConfig({
  webServer: {
    command: "npm run dev",
    url: "http://localhost:5183/ui/v3/",
    reuseExistingServer: true,
    timeout: 120_000,
  },
  testDir: "./tests",
});


