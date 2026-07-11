import type { MetadataRoute } from 'next'
import { APP_DOMAIN, buildShareUrl } from '@lmsy/shared'
import { listPublicVideoSlugs } from '@/db/queries'

// Cached and revalidated hourly so crawler hits don't scan the videos table on
// every request; new public videos still surface within the window. Guarded so
// a DB hiccup still returns the static marketing pages.
export const revalidate = 3600

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = `https://${APP_DOMAIN}`
  const staticPages: MetadataRoute.Sitemap = [
    { url: `${base}/`, changeFrequency: 'weekly', priority: 1 },
    { url: `${base}/login`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${base}/signup`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${base}/download`, changeFrequency: 'monthly', priority: 0.6 },
  ]

  let videoPages: MetadataRoute.Sitemap = []
  try {
    const rows = await listPublicVideoSlugs()
    videoPages = rows.map((row) => ({
      url: buildShareUrl(row.slug),
      lastModified: new Date(row.createdAt),
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    }))
  } catch (error) {
    console.error('[sitemap] failed to list public videos:', error)
  }

  return [...staticPages, ...videoPages]
}
