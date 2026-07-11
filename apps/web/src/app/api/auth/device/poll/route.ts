import { NextResponse } from 'next/server'
import type { DevicePollResponse } from '@lmsy/shared'
import { generateApiToken, hashToken } from '@/lib/api-auth'
import { createApiToken, deleteDeviceCode, getDeviceCode } from '@/db/tokens'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { deviceCode?: unknown }
  const deviceCode = typeof body.deviceCode === 'string' ? body.deviceCode : ''
  if (!deviceCode) {
    return NextResponse.json({ error: 'Missing deviceCode' }, { status: 400 })
  }

  const record = await getDeviceCode(deviceCode)
  if (!record || new Date(record.expiresAt).getTime() < Date.now()) {
    if (record) await deleteDeviceCode(deviceCode).catch(() => undefined)
    return NextResponse.json({ error: 'expired' }, { status: 410 })
  }

  if (!record.approved || !record.userId) {
    const pending: DevicePollResponse = { status: 'pending' }
    return NextResponse.json(pending)
  }

  // Approved → mint a long-lived token once, then consume the device code.
  const token = generateApiToken()
  await createApiToken(record.userId, hashToken(token), 'Desktop app')
  await deleteDeviceCode(deviceCode).catch(() => undefined)

  const approved: DevicePollResponse = { status: 'approved', token }
  return NextResponse.json(approved)
}
