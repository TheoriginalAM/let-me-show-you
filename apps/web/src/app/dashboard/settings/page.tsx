import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { getCurrentUser } from '@/lib/current-user'
import { getActiveWorkspaceId, listWorkspacesForUser } from '@/db/workspaces'
import { AccountSettings } from './account'
import { WorkspacesPanel } from './workspaces-panel'
import { PageHeader } from '../page-header'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Settings' }

export default async function SettingsPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  if (!user.approved) redirect('/pending')

  const workspaces = await listWorkspacesForUser(user.id)
  const activeId = await getActiveWorkspaceId(user.id)

  return (
    <div className="flex w-full max-w-2xl flex-col gap-10">
      <PageHeader
        title="Your account"
        description="Your name, email and password, and the businesses you belong to."
      />

      <div className="rise">
        <AccountSettings name={user.name} email={user.email} />
      </div>

      <div className="rise border-t border-line pt-10">
        <WorkspacesPanel workspaces={workspaces} activeId={activeId} />
      </div>
    </div>
  )
}
