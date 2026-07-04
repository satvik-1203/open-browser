const SERVER_URL = process.env.SERVER_URL ?? "http://localhost:3001";

/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [{ source: "/api/browser/:path*", destination: `${SERVER_URL}/browser/:path*` }];
  },
};

export default nextConfig;
