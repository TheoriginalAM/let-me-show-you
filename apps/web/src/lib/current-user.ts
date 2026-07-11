import 'server-only'

import { headers } from 'next/headers'
import { auth } from './auth'
import { isUserApproved } from '@/db/users'

export interface CurrentUser {
  id: string
  name: string
  email: string
  role: string
  approved: boolean
}

/**
 * The signed-in user enriched with role (admin plugin) and approval status, or
 * null if there is no valid session. Used by the gated server components.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return null
  const u = session.user as {
    id: string
    name?: string | null
    email: string
    role?: string | null
  }
  return {
    id: u.id,
    name: u.name ?? u.email,
    email: u.email,
    role: u.role ?? 'user',
    approved: await isUserApproved(u.id),
  }
}
