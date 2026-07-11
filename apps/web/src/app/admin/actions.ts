'use server'

import { revalidatePath } from 'next/cache'
import { getCurrentUser } from '@/lib/current-user'
import { setUserApproved } from '@/db/users'

async function requireAdmin(): Promise<void> {
  const user = await getCurrentUser()
  if (!user || user.role !== 'admin') throw new Error('Forbidden')
}

/** Approve a user (admin only). Bound to a form per row. */
export async function approveUserAction(userId: string): Promise<void> {
  await requireAdmin()
  await setUserApproved(userId, true)
  revalidatePath('/admin')
}

/** Revoke a user's approval (admin only). */
export async function revokeUserAction(userId: string): Promise<void> {
  await requireAdmin()
  await setUserApproved(userId, false)
  revalidatePath('/admin')
}
