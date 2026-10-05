import type { NextConfig } from "next";

/*
 * Two deployment targets, one config.
 *
 * `output: "standalone"` emits a self-contained server for the Docker image.
 * Vercel does NOT want it: it builds its own serverless output, and the
 * standalone tree is then a second copy of the app that is traced, uploaded
 * and never run — slower builds for nothing. `VERCEL` is set by the platform
 * on every build there, so the switch needs no flag of our own.
 */
const onVercel = process.env.VERCEL === "1";

const nextConfig: NextConfig = {
  ...(onVercel ? {} : { output: "standalone" as const }),

  // The version banner is free information for anyone probing the deployment.
  poweredByHeader: false,

  // Stack traces in production would be readable, at the cost of shipping a
  // map of the whole client bundle to every visitor. The trade is not worth
  // it for an internal CRM.
  productionBrowserSourceMaps: false,

  experimental: {
    /*
     * Load only the modules actually used from these.
     *
     * `lucide-react` is on the framework's default list already; drei is not,
     * and it is the expensive one — a barrel of ~200 helpers of which the
     * Playground scene uses four.
     */
    optimizePackageImports: ["@react-three/drei"],
  },

  async headers() {
    return [
      {
        /*
         * No Cache-Control rule for /_next/static here on purpose.
         *
         * Next already serves those immutable for a year, and overriding it
         * earns a build warning because the same rule then applies in dev,
         * where the files very much do change.
         */
        source: "/:path*",
        headers: [
          // The API is the only origin this app talks to, and it is same-site
          // or explicitly CORS'd. Nothing here needs to be framed by anyone.
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
