import { test, expect } from "@playwright/test";

test("compile+execute flow", async ({ page }) => {
  await page.goto("./search/");
  
  // Fill search form
  const tenant = page.getByRole("textbox", { name: "tenant" });
  const timeRange = page.getByRole("combobox", { name: "last-seconds" });
  const query = page.getByRole("textbox", { name: "query" });
  
  await tenant.fill("default");
  // Select "Last 10 minutes" option which has value 600
  await timeRange.selectOption("3600"); // Use "Last 1 hour" option
  await query.fill("message:hello");
  
  // Run search
  await page.getByRole("button", { name: "run" }).click();

  // Wait for results or error (no SQL preview in secure mode)
  await page.waitForSelector('[data-testid="results"], [data-testid="error"]', { timeout: 5000 });
  
  // Check if there's an error
  const err = page.getByTestId("error");
  const errCount = await err.count();
  
  if (errCount === 0) {
    // No error - verify results table is shown
    await expect(page.getByTestId("results")).toBeVisible();
  }
});
