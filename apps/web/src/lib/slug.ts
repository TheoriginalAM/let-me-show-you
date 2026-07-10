import { customAlphabet } from 'nanoid'

// URL-safe, lowercase-alphanumeric alphabet for share slugs.
const nano = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 8)

/** Generate a unique 8-character share slug for `videos.share_slug`. */
export function generateShareSlug(): string {
  return nano()
}
