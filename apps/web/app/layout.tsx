import type { Metadata } from 'next'
import { APP_NAME } from '@lmsy/shared'
import './globals.css'

export const metadata: Metadata = {
  title: `${APP_NAME} — Share what you see`,
  description: 'Record your screen and share it with a link. letmeshowyou.com.au',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-neutral-900 antialiased dark:bg-neutral-950 dark:text-neutral-50">
        {children}
      </body>
    </html>
  )
}
