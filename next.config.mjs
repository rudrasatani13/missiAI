import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare'

if (process.env.NODE_ENV === 'development' && process.env.ENABLE_CF_DEV === '1') {
  await initOpenNextCloudflareForDev()
}

// Ensure Clerk has a valid publishable key at build time so static prerendering doesn't crash
// when run in environments without it (like Cloudflare Pages or CI)
if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
  // Use a base64 encoded dummy string that parses as valid publishable key regex
  // It has to look like a valid test key (pk_test_ + base64)
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = 'pk_test_Y2xlcmsuZGV2ZWxvcGVycy5hcHBzZWMuY28k'
}

const isProduction = process.env.NODE_ENV === 'production'

const trustedScriptSources = [
  "'self'",
  "'unsafe-inline'",
  ...(isProduction ? [] : ["'unsafe-eval'"]),
  'blob:',
  'https://static.cloudflareinsights.com',
  'https://clerk.missi.space',
  'https://*.clerk.com',
  'https://*.clerk.accounts.dev',
  'https://*.clerk.dev',
].join(' ')

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  `script-src ${trustedScriptSources}`,
  `script-src-elem ${trustedScriptSources}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob:",
  "connect-src 'self' https: wss:",
  "worker-src 'self' blob:",
  "frame-src 'self' https://clerk.missi.space https://*.clerk.com https://*.clerk.accounts.dev https://*.clerk.dev",
  "manifest-src 'self'",
  ...(isProduction ? ['upgrade-insecure-requests'] : []),
].join('; ')

/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: false,
  },
  images: {
    unoptimized: true,
  },
  // ─── Security headers applied to all responses ──────────────────────────────
  // These complement the middleware-level headers and cover static assets, pages,
  // and any response that bypasses the middleware matcher.
  headers: async () => [
    {
      source: '/(.*)',
      headers: [
        { key: 'Content-Security-Policy', value: contentSecurityPolicy },
        { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
        { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
        { key: 'Origin-Agent-Cluster', value: '?1' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'X-Permitted-Cross-Domain-Policies', value: 'none' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'X-DNS-Prefetch-Control', value: 'on' },
        {
          key: 'Strict-Transport-Security',
          value: 'max-age=63072000; includeSubDomains; preload',
        },
        {
          key: 'Permissions-Policy',
          value: 'camera=(), microphone=(self), geolocation=(), interest-cohort=(), payment=(), usb=(), serial=(), bluetooth=()',
        },
      ],
    },
  ],
  experimental: {
    optimizePackageImports: [
      'lucide-react',
      'recharts',
      '@radix-ui/react-accordion',
      '@radix-ui/react-alert-dialog',
      '@radix-ui/react-aspect-ratio',
      '@radix-ui/react-avatar',
      '@radix-ui/react-checkbox',
      '@radix-ui/react-collapsible',
      '@radix-ui/react-context-menu',
      '@radix-ui/react-dialog',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-hover-card',
      '@radix-ui/react-label',
      '@radix-ui/react-menubar',
      '@radix-ui/react-navigation-menu',
      '@radix-ui/react-popover',
      '@radix-ui/react-progress',
      '@radix-ui/react-radio-group',
      '@radix-ui/react-scroll-area',
      '@radix-ui/react-select',
      '@radix-ui/react-separator',
      '@radix-ui/react-slider',
      '@radix-ui/react-switch',
      '@radix-ui/react-tabs',
      '@radix-ui/react-toast',
      '@radix-ui/react-toggle',
      '@radix-ui/react-toggle-group',
      '@radix-ui/react-tooltip',
      'date-fns',
      'sonner',
      'vaul',
      'cmdk',
      'embla-carousel-react',
      '@clerk/nextjs',
      'zod',
    ],
  },
  serverExternalPackages: ['three'],
}

export default nextConfig