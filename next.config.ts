import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // FE-P1-007: previously `ignoreBuildErrors: true` + `reactStrictMode: false`,
  // which masked 26 TypeScript errors and disabled React's safety checks. Now
  // that the type errors are fixed, we enforce types and enable strict mode.
  typescript: {
    ignoreBuildErrors: false,
  },
  reactStrictMode: true,
  // Security headers (FE-P1-008 + issue #66) — CSP + frame-ancestors to
  // prevent clickjacking + XSS-based credential exfiltration. The CSP is
  // deliberately permissive on 'connect-src' (allows wss + the major market-
  // data / broker endpoints) because the app makes live websocket + REST
  // calls to those hosts. Tighten once nonce-based CSP is wired up.
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
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: https:",
              "font-src 'self' data:",
              // wss for aurevia-stream + https for market data + broker APIs.
              "connect-src 'self' ws: wss: https:",
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
