/** @type {import('next').NextConfig} */

// ─── Prod build guard ────────────────────────────────────────────────────────
// NEXT_PUBLIC_* are baked at build time by webpack. If missing on Vercel,
// the bundle silently contains 'http://localhost:...' — so we fail the build.
if (process.env.NODE_ENV === 'production') {
  const required = ['NEXT_PUBLIC_BACKEND_URL', 'NEXT_PUBLIC_REPUTY_WEB_URL']
  for (const key of required) {
    if (!process.env[key]) {
      throw new Error(`[reputy-admin] Missing required env var: ${key}. Set it in Vercel dashboard.`)
    }
  }
}
// ─────────────────────────────────────────────────────────────────────────────

const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      '@': require('path').resolve(__dirname, './src'),
    }
    return config
  },

  // P1.1: Security headers for all pages
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'X-XSS-Protection', value: '0' },
          { key: 'Strict-Transport-Security', value: 'max-age=15552000; includeSubDomains' },
        ],
      },
      // Associated Domains — AASA doit être servi sans redirect, sans auth, Content-Type JSON
      {
        source: '/.well-known/apple-app-site-association',
        headers: [
          { key: 'Content-Type', value: 'application/json' },
          { key: 'Cache-Control', value: 'public, max-age=3600' },
        ],
      },
      {
        source: '/.well-known/assetlinks.json',
        headers: [
          { key: 'Content-Type', value: 'application/json' },
          { key: 'Cache-Control', value: 'public, max-age=3600' },
        ],
      },
    ];
  },
}

module.exports = nextConfig
