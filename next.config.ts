import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Another lockfile sits higher up in OneDrive, which makes Turbopack guess the
  // wrong workspace root — pin it to this project.
  turbopack: {
    root: path.resolve(import.meta.dirname),
  },
  images: {
    // Uploads go to Vercel Blob when deployed, so next/image has to be told
    // that host is allowed. Local uploads stay relative and need no entry.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.public.blob.vercel-storage.com",
        pathname: "/**",
      },
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "20mb",
    },
    // The admin upload forms post photo files to Server Actions, which the
    // proxy (middleware) also buffers for auth checks — its own limit
    // defaults to 10MB and would truncate uploads before they reach the
    // Server Action, so it must be raised to match bodySizeLimit above.
    proxyClientMaxBodySize: "20mb",
  },
};

export default nextConfig;
