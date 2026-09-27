import type { MetadataRoute } from 'next'
import { APP_DOMAIN } from '@lmsy/shared'

export default function robots(): MetadataRoute.Robots {
  const base = `https://${APP_DOMAIN}`
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Keep private/authed and machine routes out of the index. Meeting rooms
      // (/m/) stay crawlable so chat apps can show a link preview; each room
      // page is noindex, so none of them end up in search results.
      disallow: ['/dashboard', '/api/', '/device'],
    },
    sitemap: `${base}/sitemap.xml`,
    host: base,
  }
}
