import 'server-only'

import { desc, eq } from 'drizzle-orm'
import { db } from './index'
import { user } from './schema'

export interface AdminUserRow {
  id: string
  name: string
  email: string
  role: string | null
  approved: boolean
  createdAt: Date
}

/** Whether a user is approved to use the app (invite gate). */
export async function isUserApproved(userId: string): Promise<boolean> {
  const rows = await db
    .select({ approved: user.approved })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1)
  return rows[0]?.approved === true
}

/** All users for the admin panel, newest first. */
export async function listUsersForAdmin(): Promise<AdminUserRow[]> {
  return db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      approved: user.approved,
      createdAt: user.createdAt,
    })
    .from(user)
    .orderBy(desc(user.createdAt))
}

/** Approve or revoke a user (admin action). Returns whether a row changed. */
export async function setUserApproved(userId: string, approved: boolean): Promise<boolean> {
  const rows = await db
    .update(user)
    .set({ approved })
    .where(eq(user.id, userId))
    .returning({ id: user.id })
  return rows.length > 0
}
