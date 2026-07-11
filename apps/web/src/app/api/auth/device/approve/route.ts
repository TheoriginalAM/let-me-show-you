import { NextResponse } from 'next/server'
import { getAuthedUserId } from '@/lib/api-auth'
import { approveDeviceCode } from '@/db/tokens'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  // Browser flow — must be a signed-in session.
  const userId = await getAuthedUserId(request)
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await request.json().catch(() => ({}))) as { userCode?: unknown }
  const userCode = typeof body.userCode === 'string' ? body.userCode.trim().toUpperCase() : ''
  if (!userCode) {
    return NextResponse.json({ error: 'Missing code' }, { status: 400 })
  }

  const approved = await approveDeviceCode(userCode, userId)
  if (!approved) {
    return NextResponse.json({ error: 'Invalid or expired code' }, { status: 400 })
  }
  return NextResponse.json({ ok: true })
}
