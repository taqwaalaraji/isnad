import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

const nextConfig: NextConfig = {
  // A self-contained server for the Docker image (deploy/web.Dockerfile).
  output: "standalone",
  cacheComponents: true,
  poweredByHeader: false,
  async headers() {
    return [
      // The app can't be framed (clickjacking)...
      { source: "/:path*", headers: [...securityHeaders, { key: "Content-Security-Policy", value: "frame-ancestors 'self'" }] },
      // ...but public evidence pages can be embedded under a newsroom's story.
      { source: "/:locale/n/:slug", headers: [...securityHeaders, { key: "Content-Security-Policy", value: "frame-ancestors *" }] },
    ];
  },
  // Local Supabase also allows 127.0.0.1; the dev server must serve its resources there too.
  allowedDevOrigins: ["127.0.0.1"],
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
