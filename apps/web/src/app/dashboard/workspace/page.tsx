import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { getCurrentUser } from '@/lib/current-user'
import {
  getActiveWorkspaceId,
  getWorkspaceForMember,
  listInvites,
  listMembers,
  listWorkspacesForUser,
} from '@/db/workspaces'
import { Members } from './members'
import { PageHeader } from '../page-header'
import { DeleteWorkspace, RenameWorkspace } from './meta'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Business & team' }

export default async function WorkspacePage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  if (!user.approved) redirect('/pending')

  const workspaceId = await getActiveWorkspaceId(user.id)
  const workspace = workspaceId ? await getWorkspaceForMember(user.id, workspaceId) : null
  // Settings are owner-only; members manage recordings from the dashboard.
  if (!workspace || workspace.role !== 'owner') redirect('/dashboard')

  const [members, invites, allWorkspaces] = await Promise.all([
    listMembers(workspace.id),
    listInvites(workspace.id),
    listWorkspacesForUser(user.id),
  ])
  const canDelete = allWorkspaces.length > 1

  return (
    <div className="flex w-full max-w-3xl flex-col gap-10">
      <PageHeader
        section="team"
        title="Business & team"
        description={
          <>
            The name of <span className="font-semibold text-ink">{workspace.name}</span> in your
            dashboard, and who can record, host and take bookings for it.
          </>
        }
      />

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-lg font-extrabold tracking-tight text-ink">Name</h2>
        <RenameWorkspace name={workspace.name} />
      </section>

      <Members members={members} invites={invites} currentUserId={user.id} />

      <DeleteWorkspace canDelete={canDelete} />
    </div>
  )
}
