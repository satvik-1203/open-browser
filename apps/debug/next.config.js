const BROWSER_SERVER_URL =
  process.env.BROWSER_SERVER_URL ?? "http://localhost:3001";

/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/browser/:path*",
        destination: `${BROWSER_SERVER_URL}/browser/:path*`,
      },
    ];
  },
};

export default nextConfig;
