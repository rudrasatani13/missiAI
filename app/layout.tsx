import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'missiAI',
  description: 'The Next Gen AI Assistant',
  generator: 'missiAI Platform',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
