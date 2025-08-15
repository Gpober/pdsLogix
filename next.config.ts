/** @type {import('next').NextConfig} */
const supabaseDomain = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : undefined

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
    domains: [supabaseDomain, "lh3.googleusercontent.com"].filter(Boolean),
  },
  // Ensure build outputs go to correct locations
  distDir: ".next",
  // Prevent creation of root-level directories
}

module.exports = nextConfig
