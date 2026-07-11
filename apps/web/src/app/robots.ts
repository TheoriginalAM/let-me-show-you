import type { MetadataRoute } from 'next'
import { APP_DOMAIN } from '@lmsy/shared'

export default function robots(): MetadataRoute.Robots {
  const base = `https://${APP_DOMAIN}`
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Keep private/authed and machine routes out of the index.
      disallow: ['/dashboard', '/api/', '/device'],
    },
    sitemap: `${base}/sitemap.xml`,
    host: base,
  }
}
