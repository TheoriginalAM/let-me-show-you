import { randomBytes } from 'crypto'
import { NextResponse } from 'next/server'
import type { DeviceStartResponse } from '@lmsy/shared'
import { appBaseUrl } from '@/lib/config'
import { createDeviceCode } from '@/db/tokens'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const EXPIRES_SECONDS = 600
const INTERVAL_SECONDS = 3

// Unambiguous alphabet (no 0/O/1/I/L) formatted like `WXYZ-2345`.
const USER_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
function makeUserCode(): string {
  const block = (): string =>
    Array.from(randomBytes(4))
      .map((byte) => USER_CODE_ALPHABET[byte % USER_CODE_ALPHABET.length])
      .join('')
  return `${block()}-${block()}`
}

export async function POST() {
  const deviceCode = randomBytes(32).toString('base64url')
  const userCode = makeUserCode()
  const expiresAt = new Date(Date.now() + EXPIRES_SECONDS * 1000).toISOString()
  await createDeviceCode({ deviceCode, userCode, expiresAt })

  const base = appBaseUrl()
  const response: DeviceStartResponse = {
    deviceCode,
    userCode,
    verificationUri: `${base}/device`,
    verificationUriComplete: `${base}/device?code=${encodeURIComponent(userCode)}`,
    intervalSeconds: INTERVAL_SECONDS,
    expiresInSeconds: EXPIRES_SECONDS,
  }
  return NextResponse.json(response)
}
