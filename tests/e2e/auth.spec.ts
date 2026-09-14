import { test, expect } from "@playwright/test";

// ---------------------------------------------------------------------------
// Aurevia auth-flow smoke tests (Issue #120).
//
// These do NOT exercise actual credential submission — they assert the three
// auth pages render with the expected input affordances so we catch layout
// regressions, broken imports, and missing routes early.
//
// The signin / register / forgot-password pages are publicly reachable (no
// session required) so no auth bootstrap is needed.
// ---------------------------------------------------------------------------

test("sign-in page renders", async ({ page }) => {
  await page.goto("/auth/signin");
  await expect(page.locator("h1")).toContainText("Sign in");
});

test("register page renders", async ({ page }) => {
  await page.goto("/auth/register");
  await expect(page.locator("h1")).toContainText("Create your Aurevia");
});

test("forgot-password page renders", async ({ page }) => {
  await page.goto("/auth/forgot-password");
  await expect(page.locator("input[type=email]")).toBeVisible();
});
