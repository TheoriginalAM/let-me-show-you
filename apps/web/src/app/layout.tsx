import type { Metadata } from 'next'
import { APP_DOMAIN, APP_NAME } from '@lmsy/shared'
import './globals.css'

const description =
  'Record your screen with voiceover and share it with clients as a single link. Show, don’t tell.'

export const metadata: Metadata = {
  metadataBase: new URL(`https://${APP_DOMAIN}`),
  title: {
    default: `${APP_NAME} — Show, don’t tell`,
    template: `%s — ${APP_NAME}`,
  },
  description,
  applicationName: APP_NAME,
  openGraph: {
    type: 'website',
    siteName: APP_NAME,
    title: `${APP_NAME} — Show, don’t tell`,
    description,
    url: '/',
  },
  twitter: {
    card: 'summary_large_image',
    title: `${APP_NAME} — Show, don’t tell`,
    description,
  },
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
