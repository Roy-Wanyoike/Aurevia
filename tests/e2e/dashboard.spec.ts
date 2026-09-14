import { test, expect } from "@playwright/test";

// ---------------------------------------------------------------------------
// Aurevia dashboard E2E smoke tests (Issue #120).
//
// beforeEach injects `aurevia:onboarded=true` into localStorage via
// `addInitScript` so the onboarding redirect (issue #121) doesn't fire —
// these tests need to land directly on the dashboard.
//
// `addInitScript` runs in the page context BEFORE any other script on every
// navigation, so the localStorage entry is present before the page.tsx
// mount effect reads it.
// ---------------------------------------------------------------------------

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem("aurevia:onboarded", "true");
    } catch {
      // ignore — private mode / quota errors shouldn't break tests
    }
  });
});

test("dashboard renders with market data", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("h2").first()).toContainText("Market Intelligence");
});

test("navigate to markets view", async ({ page }) => {
  await page.goto("/");
  await page.click('button:has-text("Markets")');
  await expect(page.locator("h1")).toHaveText("Markets");
});

test("navigate to signals view", async ({ page }) => {
  await page.goto("/");
  await page.click('button:has-text("Signals")');
  await expect(page.locator("h1")).toHaveText("Signals");
});

test("command palette opens with Cmd+K", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Control+k");
  await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 5000 });
});
