import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The default bottom-left badge sits directly on top of the "Pick one for
  // me" button, which makes the primary action awkward to use in development.
  devIndicators: {
    position: "bottom-right",
  },
};

export default nextConfig;
