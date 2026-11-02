import type { Metadata } from 'next'
import { Anybody, Caveat, Fraunces, Hanken_Grotesk, Nunito } from 'next/font/google'
import { APP_DOMAIN, APP_NAME } from '@lmsy/shared'
import './globals.css'

// Display: Anybody's width axis lets the brand go wide and loud.
const anybody = Anybody({
  subsets: ['latin'],
  axes: ['wdth'],
  variable: '--font-anybody',
  display: 'swap',
})
const hanken = Hanken_Grotesk({
  subsets: ['latin'],
  variable: '--font-hanken',
  display: 'swap',
})
// Hand-written notes on the marketing page, and two heading styles businesses
// can pick for their own pages. Fetched only where a page uses them.
const caveat = Caveat({
  subsets: ['latin'],
  variable: '--font-caveat',
  display: 'swap',
  preload: false,
})
const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-fraunces',
  display: 'swap',
  preload: false,
})
const nunito = Nunito({
  subsets: ['latin'],
  variable: '--font-nunito',
  display: 'swap',
  preload: false,
})

const description =
  'Record your screen and send one link, meet clients in your own branded room, and let them book a time. Show, don’t tell.'

export const metadata: Metadata = {
  metadataBase: new URL(`https://${APP_DOMAIN}`),
  title: {
    default: `${APP_NAME}: show, don’t tell`,
    template: `%s · ${APP_NAME}`,
  },
  description,
  applicationName: APP_NAME,
  openGraph: {
    type: 'website',
    siteName: APP_NAME,
    title: `${APP_NAME}: show, don’t tell`,
    description,
    url: '/',
  },
  twitter: {
    card: 'summary_large_image',
    title: `${APP_NAME}: show, don’t tell`,
    description,
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const fonts = [anybody, hanken, caveat, fraunces, nunito].map((f) => f.variable).join(' ')
  return (
    <html lang="en" className={fonts}>
      <body className="min-h-screen bg-canvas font-sans text-ink antialiased">
        <div className="atmosphere" aria-hidden />
        {children}
      </body>
    </html>
  )
}
