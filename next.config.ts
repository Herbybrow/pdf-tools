import type { NextConfig } from "next";

// Next.js 16 blocks cross-origin requests to dev-only assets (HMR, dynamic import
// chunks) by default -- necessary for a phone on the same Wi-Fi to load /scan-mobile
// and its JS at all when the frontend is opted into LAN binding (see start-nssf-suite
// / README for the "scan from your phone" opt-in). Only takes effect when the user
// has explicitly set this env var; it does nothing for the default 127.0.0.1-only setup.
const allowedDevOrigins = process.env.NSSF_LAN_HOST ? [process.env.NSSF_LAN_HOST] : undefined;

const nextConfig: NextConfig = {
  // Keeps Next.js from regenerating AGENTS.md/CLAUDE.md on every dev/build run.
  agentRules: false,
  allowedDevOrigins,
  // Hides the dev-mode build-activity indicator (the small overlay badge) -- purely
  // cosmetic during local development, no effect on production builds.
  devIndicators: false,
};

export default nextConfig;
