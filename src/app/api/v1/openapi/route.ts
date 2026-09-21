// ---------------------------------------------------------------------------
// Aurevia OpenAPI 3.0 specification endpoint (Issue #119).
//
// GET /api/v1/openapi — returns the Aurevia API contract as a JSON document.
//
// This is a hand-curated, schema-light OpenAPI 3.0.3 spec that documents the
// primary surface area of the /api/v1 route tree. It's intentionally not
// auto-derived from Zod schemas or route handlers — the goal is to have a
// single, source-of-truth description that the interactive API docs page
// (`/api-docs`, rendered via the Scalar CDN bundle) can consume without a
// build step.
//
// `force-dynamic` because the spec is derived from `routes` catalog state
// that may shift between requests (e.g. feature flags); we never want Next.js
// to bake a stale copy into the static export.
//
// Auth: every endpoint except `/health`, `/metrics`, and `/openapi` expects
// an `x-api-key` header OR a NextAuth session cookie. The spec surfaces both
// via the `apiKey` security scheme so consumers know what to send.
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/aurevia/auth/check";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  const spec = {
    openapi: "3.0.3",
    info: {
      title: "Aurevia API",
      version: "1.0.0",
      description:
        "Market Intelligence Infrastructure API — markets, assets, signals, backtests, portfolio, risk, ML, and realtime streaming.",
      contact: { name: "Aurevia Engineering", url: "https://aurevia.io" },
      license: { name: "MIT" },
    },
    servers: [{ url: "/api/v1", description: "Aurevia API v1" }],
    tags: [
      { name: "Markets", description: "Tradeable universe + live quotes" },
      { name: "Assets", description: "Single-asset detail + indicators" },
      { name: "Signals", description: "Strategy signal feed + scanner" },
      { name: "Backtests", description: "Run + inspect historical backtests" },
      { name: "Portfolio", description: "Paper-trading portfolio state" },
      { name: "Risk", description: "Risk profile + circuit breaker" },
      { name: "ML", description: "Model registry + predictions" },
      { name: "Brokers", description: "Connected broker adapters" },
      { name: "User", description: "Current authenticated user" },
      { name: "Organizations", description: "Tenant + membership management" },
      { name: "Realtime", description: "SSE / WebSocket streaming endpoints" },
      { name: "System", description: "Health, metrics, observability" },
    ],
    paths: {
      "/markets": {
        get: {
          summary: "List all assets with quotes",
          tags: ["Markets"],
          responses: {
            "200": {
              description: "OK",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      assets: { type: "array", items: { type: "object" } },
                      total: { type: "integer" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/assets/{symbol}": {
        get: {
          summary: "Get asset detail with indicators",
          tags: ["Assets"],
          parameters: [
            {
              name: "symbol",
              in: "path",
              required: true,
              schema: { type: "string" },
              description: "Ticker symbol, e.g. AAPL",
            },
          ],
          responses: { "200": { description: "OK" } },
        },
      },
      "/signals": {
        get: {
          summary: "List signals",
          tags: ["Signals"],
          parameters: [
            {
              name: "symbol",
              in: "query",
              required: false,
              schema: { type: "string" },
            },
            {
              name: "strategy",
              in: "query",
              required: false,
              schema: { type: "string" },
            },
          ],
          responses: { "200": { description: "OK" } },
        },
        post: {
          summary: "Scan universe for new signals",
          tags: ["Signals"],
          responses: { "200": { description: "OK" } },
        },
      },
      "/backtests": {
        get: {
          summary: "List backtests",
          tags: ["Backtests"],
          responses: { "200": { description: "OK" } },
        },
        post: {
          summary: "Run backtest",
          tags: ["Backtests"],
          responses: { "200": { description: "OK" } },
        },
      },
      "/portfolio": {
        get: {
          summary: "Get portfolio state",
          tags: ["Portfolio"],
          responses: { "200": { description: "OK" } },
        },
      },
      "/risk": {
        get: {
          summary: "Get risk profile",
          tags: ["Risk"],
          responses: { "200": { description: "OK" } },
        },
      },
      "/health": {
        get: {
          summary: "Health check",
          tags: ["System"],
          responses: { "200": { description: "OK" } },
        },
      },
      "/ml": {
        get: {
          summary: "List ML models",
          tags: ["ML"],
          responses: { "200": { description: "OK" } },
        },
        post: {
          summary: "Run prediction",
          tags: ["ML"],
          responses: { "200": { description: "OK" } },
        },
      },
      "/brokers": {
        get: {
          summary: "List brokers",
          tags: ["Brokers"],
          responses: { "200": { description: "OK" } },
        },
      },
      "/user": {
        get: {
          summary: "Get current user",
          tags: ["User"],
          responses: { "200": { description: "OK" } },
        },
      },
      "/organizations": {
        get: {
          summary: "List organizations",
          tags: ["Organizations"],
          responses: { "200": { description: "OK" } },
        },
      },
      "/stream": {
        get: {
          summary: "SSE streaming endpoint",
          tags: ["Realtime"],
          responses: {
            "200": { description: "text/event-stream" },
          },
        },
      },
      "/metrics": {
        get: {
          summary: "Prometheus metrics",
          tags: ["System"],
          responses: { "200": { description: "text/plain" } },
        },
      },
    },
    components: {
      securitySchemes: {
        apiKey: {
          type: "apiKey",
          in: "header",
          name: "x-api-key",
          description: "Server-issued API key (also accepts NextAuth session cookie).",
        },
      },
    },
    security: [{ apiKey: [] }],
  };

  return NextResponse.json(spec, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
    },
  });
}
