'use server'

import { revalidatePath } from 'next/cache'
import { getCurrentUser } from '@/lib/current-user'
import { getUserContact, setUserApproved } from '@/db/users'
import { notifyUserApproved } from '@/lib/notifications'

async function requireAdmin(): Promise<void> {
  const user = await getCurrentUser()
  if (!user || user.role !== 'admin') throw new Error('Forbidden')
}

/** Approve a user (admin only). Bound to a form per row. */
export async function approveUserAction(userId: string): Promise<void> {
  await requireAdmin()
  const changed = await setUserApproved(userId, true)
  if (changed) {
    // Best-effort "you're approved" email; don't fail the action on a hiccup.
    const contact = await getUserContact(userId)
    if (contact) {
      await notifyUserApproved(contact).catch((error) =>
        console.error('[notify] approval email failed:', error),
      )
    }
  }
  revalidatePath('/admin')
}

/** Revoke a user's approval (admin only). */
export async function revokeUserAction(userId: string): Promise<void> {
  await requireAdmin()
  await setUserApproved(userId, false)
  revalidatePath('/admin')
}
