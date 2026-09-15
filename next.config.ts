import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  output: "standalone",
  // Issue #134 / SEC-002 — Next.js 16.3.x tightened Turbopack's workspace-root
  // inference. In our monorepo-style layout (mini-services/, python/, src/),
  // Turbopack occasionally infers /home/z/my-project/src/app as the root and
  // fails with "couldn't find the Next.js package". Setting turbopack.root
  // explicitly to the project root resolves it.
  turbopack: {
    root: path.resolve(__dirname),
  },
  // FE-P1-007: previously `ignoreBuildErrors: true` + `reactStrictMode: false`,
  // which masked 26 TypeScript errors and disabled React's safety checks. Now
  // that the type errors are fixed, we enforce types and enable strict mode.
  typescript: {
    ignoreBuildErrors: false,
  },
  reactStrictMode: true,
  // Security headers (FE-P1-008 + issue #66) — CSP + frame-ancestors to
  // prevent clickjacking + XSS-based credential exfiltration. The CSP is
  // deliberately permissive on 'connect-src' (allows wss + ws + http + https
  // + the major market-data / broker endpoints) because the app makes live
  // websocket + REST calls to those hosts, including local broker gateways
  // (IBKR Client Portal on http://localhost:5000). 'unsafe-inline' on
  // script-src is required by Next.js 16's RSC payload + Turbopack HMR —
  // tighten once nonce-based CSP is wired up.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              // Next.js 16 + Turbopack need inline scripts for HMR + RSC payloads.
              // cdn.jsdelivr.net is whitelisted for the Scalar API reference bundle
              // loaded by /api-docs (issue #119) — avoids vendoring a 2MB JS bundle
              // into the app. Tighten once we self-host Scalar as an npm dep.
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net",
              "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
              // blob: covers client-side image blob URLs (charts, exported PNGs).
              // https: covers remote branding / market-data chart thumbnails.
              "img-src 'self' data: blob: https:",
              "font-src 'self' data:",
              // wss for aurevia-stream + https for market data + broker APIs +
              // http for local broker gateways (IBKR Client Portal on :5000).
              "connect-src 'self' ws: wss: http: https:",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join("; "),
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
