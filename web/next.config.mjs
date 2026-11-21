const isExport = process.env.NEXT_OUTPUT === 'export'
const apiTarget = process.env.API_PROXY_TARGET ?? 'http://127.0.0.1:4000'

/** @type {import('next').NextConfig} */
const nextConfig = {
  ...(isExport ? { output: 'export' } : {}),
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    unoptimized: true
  },
  ...(isExport
    ? {}
    : {
        // In development the Next dev server proxies /api to the Express server,
        // so the browser only ever talks to a single origin.
        async rewrites() {
          return [
            {
              source: '/api/:path*',
              destination: `${apiTarget}/api/:path*`
            }
          ]
        }
      })
}

export default nextConfig
