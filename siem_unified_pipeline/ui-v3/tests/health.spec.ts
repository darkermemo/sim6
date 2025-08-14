import { test, expect } from "@playwright/test";

test("health", async ({ page }) => {
  await page.goto("http://localhost:5183/ui/v3/health");
  await expect(page.locator("pre")).toContainText('"status"');
});


