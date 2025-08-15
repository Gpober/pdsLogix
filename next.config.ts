/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  outputFileTracingRoot: process.cwd(),
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    domains: ["bdtmsfbhaztukqppnhdk.supabase.co", "lh3.googleusercontent.com"],
  },
  // Ensure build outputs go to correct locations
  distDir: ".next",
  // Prevent creation of root-level directories
}

module.exports = nextConfig
