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

/** Email addresses of all admins — recipients for new-signup alerts. */
export async function listAdminEmails(): Promise<string[]> {
  const rows = await db.select({ email: user.email }).from(user).where(eq(user.role, 'admin'))
  return rows.map((r) => r.email)
}

/** A user's name + email, for addressing them in an email. */
export async function getUserContact(
  userId: string,
): Promise<{ name: string; email: string } | null> {
  const rows = await db
    .select({ name: user.name, email: user.email })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1)
  return rows[0] ?? null
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

/** An owner's branding for their public share pages. All fields optional. */
export interface Brand {
  name: string | null
  logo: string | null
  color: string | null
}

/** The signed-in owner's current branding (for the settings page). */
export async function getUserBrand(userId: string): Promise<Brand> {
  const rows = await db
    .select({ name: user.brandName, logo: user.brandLogo, color: user.brandColor })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1)
  return rows[0] ?? { name: null, logo: null, color: null }
}

/** Update the owner's branding; pass null on a field to clear it. */
export async function setUserBrand(userId: string, brand: Brand): Promise<boolean> {
  const rows = await db
    .update(user)
    .set({ brandName: brand.name, brandLogo: brand.logo, brandColor: brand.color })
    .where(eq(user.id, userId))
    .returning({ id: user.id })
  return rows.length > 0
}
