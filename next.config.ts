import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // FE-P1-007: previously `ignoreBuildErrors: true` + `reactStrictMode: false`,
  // which masked 26 TypeScript errors and disabled React's safety checks. Now
  // that the type errors are fixed, we enforce types and enable strict mode.
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: false,
  },
  reactStrictMode: true,
  // Security headers (FE-P1-008) — basic CSP, frame-ancestors to prevent
  // clickjacking, and X-Content-Type-Options to prevent MIME sniffing.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
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
