import { test, expect } from "@playwright/test";

// ---------------------------------------------------------------------------
// Aurevia API smoke tests (Issue #120).
//
// Uses Playwright's `request` fixture (no browser) to assert the four most
// load-bearing v1 endpoints respond with the expected shape. Catches
// regressions to the OpenAPI spec, the health snapshot, the markets universe,
// and the Prometheus exposition format.
// ---------------------------------------------------------------------------

test("GET /api/v1/health returns ok", async ({ request }) => {
  const res = await request.get("/api/v1/health");
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  expect(body.status).toBe("ok");
  expect(body.tradingMode).toBe("PAPER");
});

test("GET /api/v1/markets returns assets", async ({ request }) => {
  const res = await request.get("/api/v1/markets");
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  expect(body.assets.length).toBeGreaterThan(0);
});

test("GET /api/v1/metrics returns prometheus format", async ({ request }) => {
  const res = await request.get("/api/v1/metrics");
  expect(res.ok()).toBeTruthy();
  const text = await res.text();
  expect(text).toContain("# TYPE");
});

test("GET /api/v1/openapi returns spec", async ({ request }) => {
  const res = await request.get("/api/v1/openapi");
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  expect(body.openapi).toBe("3.0.3");
});
