import 'server-only'

import { and, eq, gt } from 'drizzle-orm'
import { db } from './index'
import { apiTokens, deviceCodes } from './schema'

/** Resolve a token hash to its owner's user id, touching `last_used_at`. */
export async function resolveApiToken(tokenHash: string): Promise<string | null> {
  const rows = await db
    .select({ id: apiTokens.id, userId: apiTokens.userId })
    .from(apiTokens)
    .where(eq(apiTokens.tokenHash, tokenHash))
    .limit(1)
  const row = rows[0]
  if (!row) return null
  await db
    .update(apiTokens)
    .set({ lastUsedAt: new Date().toISOString() })
    .where(eq(apiTokens.id, row.id))
  return row.userId
}

export async function createApiToken(
  userId: string,
  tokenHash: string,
  name: string,
): Promise<void> {
  await db.insert(apiTokens).values({ userId, tokenHash, name })
}

// ---- Device authorization codes ----

export async function createDeviceCode(input: {
  deviceCode: string
  userCode: string
  expiresAt: string
}): Promise<void> {
  await db.insert(deviceCodes).values(input)
}

/** Approve a pending, unexpired device code for `userId`. Returns whether it matched. */
export async function approveDeviceCode(userCode: string, userId: string): Promise<boolean> {
  const rows = await db
    .update(deviceCodes)
    .set({ approved: true, userId })
    .where(
      and(eq(deviceCodes.userCode, userCode), gt(deviceCodes.expiresAt, new Date().toISOString())),
    )
    .returning({ id: deviceCodes.id })
  return rows.length > 0
}

export async function getDeviceCode(
  deviceCode: string,
): Promise<{ approved: boolean; userId: string | null; expiresAt: string } | null> {
  const rows = await db
    .select({
      approved: deviceCodes.approved,
      userId: deviceCodes.userId,
      expiresAt: deviceCodes.expiresAt,
    })
    .from(deviceCodes)
    .where(eq(deviceCodes.deviceCode, deviceCode))
    .limit(1)
  return rows[0] ?? null
}

export async function deleteDeviceCode(deviceCode: string): Promise<void> {
  await db.delete(deviceCodes).where(eq(deviceCodes.deviceCode, deviceCode))
}
