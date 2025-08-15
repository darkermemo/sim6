import { test, expect } from "@playwright/test";

const BASE = process.env.E2E_BASE_URL ?? "http://127.0.0.1:5174/ui/v2/";

test("no runtime errors + compile/execute", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", e => errors.push(String(e)));

  await page.goto(BASE + "search");
  await expect(page.getByRole("heading", { name: "Search" })).toBeVisible();

  await page.getByLabel("Tenant").fill("default");
  await page.getByRole("textbox").fill('message:"hello"');

  await page.getByRole("button", { name: "Compile" }).click();
  await expect(page.getByText("SQL (server-generated)")).toBeVisible();

  await page.getByRole("button", { name: "Run" }).click();
  await expect(page.getByText(/^Results/)).toBeVisible();

  expect(errors).toEqual([]);
});


