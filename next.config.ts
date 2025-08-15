/** @type {import('next').NextConfig} */
const supabaseUrlEnv =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const supabaseDomain = supabaseUrlEnv
  ? new URL(supabaseUrlEnv).hostname
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
