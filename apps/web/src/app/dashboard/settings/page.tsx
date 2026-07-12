import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { getCurrentUser } from '@/lib/current-user'
import { getActiveWorkspaceId, listWorkspacesForUser } from '@/db/workspaces'
import { AccountSettings } from './account'
import { WorkspacesPanel } from './workspaces-panel'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Settings' }

export default async function SettingsPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  if (!user.approved) redirect('/pending')

  const workspaces = await listWorkspacesForUser(user.id)
  const activeId = await getActiveWorkspaceId(user.id)

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-10 px-4 py-10 sm:px-6">
      <header className="rise flex flex-col gap-3">
        <Link href="/dashboard" className="text-sm text-faint transition hover:text-ink">
          ← Your recordings
        </Link>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Settings</h1>
      </header>

      <div className="rise">
        <AccountSettings name={user.name} email={user.email} />
      </div>

      <div className="rise border-t border-line pt-10">
        <WorkspacesPanel workspaces={workspaces} activeId={activeId} />
      </div>
    </main>
  )
}
