import { redirect } from 'next/navigation'
import { unreadNotificationCount } from '@/db/app-notifications'
import { getActiveWorkspaceId, getWorkspaceForMember, listWorkspacesForUser } from '@/db/workspaces'
import { getCurrentUser } from '@/lib/current-user'
import { DashboardShell } from './shell'

export const dynamic = 'force-dynamic'

/** The dashboard frame: your businesses, the sections, and your account. */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  if (!user.approved) redirect('/pending')

  const [workspaces, activeId, unread] = await Promise.all([
    listWorkspacesForUser(user.id),
    getActiveWorkspaceId(user.id),
    unreadNotificationCount(user.id),
  ])
  const active = workspaces.find((w) => w.id === activeId) ?? workspaces[0] ?? null
  const ws = active ? await getWorkspaceForMember(user.id, active.id) : null

  return (
    <DashboardShell
      user={{ name: user.name, email: user.email, isAdmin: user.role === 'admin' }}
      workspaces={workspaces.map((w) => ({ id: w.id, name: w.name, role: w.role }))}
      activeId={active?.id ?? null}
      activeLogo={ws?.brand.logo ?? null}
      activeColor={ws?.brand.color ?? null}
      unread={unread}
    >
      {children}
    </DashboardShell>
  )
}
