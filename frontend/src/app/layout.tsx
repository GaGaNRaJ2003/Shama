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
      <body>
        {children}
      </body>
    </html>
  )
}
