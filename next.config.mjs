/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  // Self-contained server build for the Azure container image.
  output: "standalone",
  // The SDK lazy-requires node:child_process and reads its own package.json; keep it unbundled.
  serverExternalPackages: ["videodb"],
};

export default nextConfig;
