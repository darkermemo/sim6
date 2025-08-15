import { test, expect, request } from "@playwright/test";

test("app loads and shows AppShell", async ({ page }) => {
  await page.goto("./"); // trailing slash handled by baseURL
  await expect(page.getByTestId("appshell")).toBeVisible();
});

test("health endpoint returns ok", async ({ request }) => {
  const res = await request.get("http://127.0.0.1:9999/api/v2/health");
  expect(res.ok()).toBeTruthy();
  const json = await res.json();
  expect(json.status).toBeDefined();
});
