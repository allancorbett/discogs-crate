import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The default bottom-left badge sits directly on top of the "Pick one for
  // me" button, which makes the primary action awkward to use in development.
  devIndicators: {
    position: "bottom-right",
  },

  // Nothing gains from advertising the framework and version to a scanner.
  poweredByHeader: false,
};

export default nextConfig;
