import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on("console", msg => { 
    if (msg.type() === "error") errors.push(msg.text()); 
  });
  
  page.on("response", async resp => {
    const url = resp.url();
    const status = resp.status();
    if (url.includes("/api/") && status >= 400 && ![409,429].includes(status)) {
      throw new Error(`Network error ${status} on ${url}`);
    }
  });
  
  (page as any)._errors = errors;
});

test("basic page loading and no console errors", async ({ page }) => {
  const routes = [
    "/ui/app/search", 
    "/ui/app/alerts", 
    "/ui/app/rules", 
    "/ui/app/rule-packs", 
    "/ui/app/admin/tenants", 
    "/ui/app/admin/log-sources", 
    "/ui/app/admin/parsers", 
    "/ui/app/agents"
  ];
  
  for (const route of routes) {
    console.log(`Testing page: ${route}`);
    
    try {
      await page.goto(route);
      await page.waitForLoadState("networkidle");
      
      // Basic check that page loaded
      expect(page.url()).toContain(route);
      
    } catch (error) {
      console.error(`Failed to test ${route}:`, error);
      throw error;
    }
  }
  
  // Check for console errors across all pages
  const errors = (page as any)._errors as string[];
  expect(errors, "No console errors across all pages").toEqual([]);
  
  console.log("✅ All pages loaded successfully with no console errors");
});

test("keyboard navigation and focus management", async ({ page }) => {
  await page.goto("/ui/app/search");
  await page.waitForLoadState("networkidle");
  
  // Test tab navigation
  await page.keyboard.press("Tab");
  const firstFocusable = await page.evaluate(() => document.activeElement?.tagName);
  expect(firstFocusable).toBeTruthy();
  
  // Test arrow key navigation in search results
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  
  // Ensure focus is visible
  const focusVisible = await page.evaluate(() => {
    const active = document.activeElement;
    if (!active) return false;
    
    const style = window.getComputedStyle(active);
    return style.outline !== 'none' || style.boxShadow !== 'none';
  });
  
  expect(focusVisible, "Focus should be visually indicated").toBe(true);
});

test("screen reader compatibility", async ({ page }) => {
  await page.goto("/ui/app/alerts");
  await page.waitForLoadState("networkidle");
  
  // Check for proper ARIA labels
  const hasAriaLabels = await page.evaluate(() => {
    const interactiveElements = document.querySelectorAll('button, input, select, [role="button"]');
    if (interactiveElements.length === 0) return 1.0; // No elements to test
    
    let labeledCount = 0;
    
    interactiveElements.forEach(el => {
      const hasLabel = el.hasAttribute('aria-label') || 
                      el.hasAttribute('aria-labelledby') ||
                      el.hasAttribute('title') ||
                      el.querySelector('label');
      if (hasLabel) labeledCount++;
    });
    
    return labeledCount / interactiveElements.length;
  });
  
  // At least 80% of interactive elements should have labels
  expect(hasAriaLabels, "Most interactive elements should have accessibility labels").toBeGreaterThan(0.8);
});

test("basic page structure and content", async ({ page }) => {
  await page.goto("/ui/app/rules");
  await page.waitForLoadState("networkidle");
  
  // Check that page has basic structure
  const hasHeader = await page.evaluate(() => {
    return document.querySelector('h1, h2, h3') !== null;
  });
  
  expect(hasHeader, "Page should have heading elements").toBe(true);
  
  // Check for basic content
  const hasContent = await page.evaluate(() => {
    return document.body.textContent && document.body.textContent.length > 100;
  });
  
  expect(hasContent, "Page should have substantial content").toBe(true);
});
