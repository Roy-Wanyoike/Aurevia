import { defineConfig, devices } from "@playwright/test";

// ---------------------------------------------------------------------------
// Aurevia E2E test configuration (Issue #120).
//
// Spins up the Next.js dev server (`bun run dev`) on http://localhost:3000
// if one isn't already running, then runs the Playwright suite under
// `tests/e2e/`. `reuseExistingServer: true` means we attach to the already
// running sandbox dev server instead of starting a duplicate process and
// racing for the port.
//
// Chromium-only by design — Firefox/WebKit coverage isn't worth the CI matrix
// cost for a single-tenant operator-facing dashboard.
//
// Traces are captured on the first retry only — keeps the artifact payload
// small while still giving us a forensic trail for flakes.
// ---------------------------------------------------------------------------

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  // Single worker — the Next.js dev server has an in-process rate limiter
  // (src/lib/aurevia/rate-limit.ts) that returns 429 when 4+ browser contexts
  // hammer /api/v1/* in parallel during the dashboard tests. Running
  // sequentially trades 4s of wall-clock time for a flake-free suite.
  workers: 1,
  retries: 1,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "bun run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
