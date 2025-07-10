/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export', // Yeh line zaroori hai for static export (Cloudflare Pages)
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig