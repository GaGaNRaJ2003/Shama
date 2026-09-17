import type { Metadata } from 'next'
import '../index.css'

export const metadata: Metadata = {
  title: 'Shama — a digital mehfil',
  description: 'Listen to, read and understand ghazals — poetry, music and context in one quiet room.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        {/* The stage's stand-in still, fetched alongside the scripts. */}
        <link rel="preload" as="image" href="/stage-poster.webp" type="image/webp" fetchPriority="high" />
      </head>
      <body>
        {children}
      </body>
    </html>
  )
}
