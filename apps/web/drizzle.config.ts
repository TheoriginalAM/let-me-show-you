import { config } from 'dotenv'
import { defineConfig } from 'drizzle-kit'

// drizzle-kit runs outside Next, so load env from .env.local explicitly.
config({ path: '.env.local' })

const url = process.env.DATABASE_URL
if (!url) {
  throw new Error('DATABASE_URL is not set — add it to apps/web/.env.local')
}

// Ensure TLS for hosted providers (Railway) when the URL does not specify it.
const isLocal = /@(localhost|127\.0\.0\.1|\[::1\])(:|\/)/.test(url)
const dbUrl =
  isLocal || url.includes('sslmode=')
    ? url
    : `${url}${url.includes('?') ? '&' : '?'}sslmode=require`

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: dbUrl },
})
