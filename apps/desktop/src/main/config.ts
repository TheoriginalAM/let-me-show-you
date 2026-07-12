import { app } from 'electron'

/**
 * Base URL of the Let Me Show You web API. Packaged builds talk to production;
 * `pnpm dev` talks to a local web server. Override either with LMSY_API_URL.
 */
const DEFAULT_API_URL = app.isPackaged ? 'https://letmeshowyou.com.au' : 'http://localhost:3000'

export const API_BASE_URL = (process.env.LMSY_API_URL ?? DEFAULT_API_URL).replace(/\/+$/, '')
