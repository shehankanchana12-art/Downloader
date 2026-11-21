import type { Metadata, Viewport } from 'next'

import './globals.css'

export const metadata: Metadata = {
  title: 'Clipfetch — Download video & audio from any link',
  description:
    'Paste a link from YouTube, TikTok, Instagram, X, Facebook, Vimeo, Reddit and 1,700+ other sites. Save MP4 video or MP3 audio — no ads, no popups, no tracking.',
  applicationName: 'Clipfetch',
  robots: { index: true, follow: true }
}

export const viewport: Viewport = {
  themeColor: '#070709',
  width: 'device-width',
  initialScale: 1
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-ink-950 font-sans text-zinc-200 antialiased">{children}</body>
    </html>
  )
}
