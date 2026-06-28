import type { Metadata } from 'next'
import '../index.css'

export const metadata: Metadata = {
  title: 'Shama - Poetry Companion',
  description: 'An industrial modular console for South Asian poetry.',
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
