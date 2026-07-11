/** Base URL of the Let Me Show You web API (override with LMSY_API_URL in dev). */
export const API_BASE_URL = (process.env.LMSY_API_URL ?? 'http://localhost:3000').replace(
  /\/+$/,
  '',
)
