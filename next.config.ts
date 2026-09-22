import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";
import path from "node:path";

const nextConfig: NextConfig = {
  // Anchors file tracing to this project when it's nested inside a larger workspace.
  outputFileTracingRoot: path.join(__dirname),
};

// Adds a service worker + manifest for installable/offline PWA support; disabled in dev
// so hot reload isn't fought by cached assets.
const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: true,
  workboxOptions: {
    disableDevLogs: true,
  },
});

export default withPWA(nextConfig);
