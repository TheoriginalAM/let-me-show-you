/** Public base URL of this web app (no trailing slash) — used for device-flow URLs. */
export function appBaseUrl(): string {
  const url = process.env.APP_URL ?? process.env.BETTER_AUTH_URL ?? 'http://localhost:3000'
  return url.replace(/\/+$/, '')
}
