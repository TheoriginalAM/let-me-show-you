import type { Metadata } from 'next'
import { Bricolage_Grotesque, Hanken_Grotesk } from 'next/font/google'
import { APP_DOMAIN, APP_NAME } from '@lmsy/shared'
import './globals.css'

const display = Bricolage_Grotesque({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
})
const sans = Hanken_Grotesk({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
})

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
    <html lang="en" className={`${display.variable} ${sans.variable}`}>
      <body className="min-h-screen bg-canvas font-sans text-ink antialiased">
        <div className="atmosphere" aria-hidden />
        {children}
        <div className="grain" aria-hidden />
      </body>
    </html>
  )
}
