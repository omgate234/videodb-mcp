/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  // The SDK lazy-requires node:child_process and reads its own package.json; keep it unbundled.
  serverExternalPackages: ["videodb"],
};

export default nextConfig;
