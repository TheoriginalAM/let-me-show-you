import Link from 'next/link'
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
import { BrandingForm } from '../branding/branding-form'
import { Members } from './members'
import { DeleteWorkspace, RenameWorkspace } from './meta'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Workspace settings' }

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
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-10 px-4 py-10 sm:px-6">
      <header className="rise flex flex-col gap-3">
        <Link href="/dashboard" className="text-sm text-faint transition hover:text-ink">
          ← Your recordings
        </Link>
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Workspace settings</h1>
          <p className="mt-1 text-sm text-muted">
            Manage <span className="text-ink">{workspace.name}</span> — its name, branding, and
            members.
          </p>
        </div>
      </header>

      <section className="rise flex flex-col gap-3">
        <h2 className="font-display text-lg font-semibold tracking-tight text-ink">Name</h2>
        <RenameWorkspace name={workspace.name} />
      </section>

      <section className="rise flex flex-col gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold tracking-tight text-ink">Branding</h2>
          <p className="mt-1 max-w-md text-sm text-muted">
            Your logo, name, and colour appear on this workspace&rsquo;s public share pages instead
            of Let Me Show You.
          </p>
        </div>
        <BrandingForm initial={workspace.brand} fallbackName={workspace.name} />
      </section>

      <div className="rise">
        <Members members={members} invites={invites} currentUserId={user.id} />
      </div>

      <div className="rise">
        <DeleteWorkspace canDelete={canDelete} />
      </div>
    </main>
  )
}
