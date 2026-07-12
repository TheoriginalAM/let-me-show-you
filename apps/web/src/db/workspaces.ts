import 'server-only'

import { randomBytes } from 'node:crypto'
import { and, asc, count, eq, gt, isNull } from 'drizzle-orm'
import { getMux } from '../lib/mux'
import { createNotifications, ownerIdsForWorkspace } from './app-notifications'
import { db } from './index'
import {
  user,
  videos,
  workspaceInvites,
  workspaceMembers,
  workspaces,
  type WorkspaceRole,
} from './schema'

export interface WorkspaceSummary {
  id: string
  name: string
  role: WorkspaceRole
}

export interface WorkspaceMemberInfo {
  userId: string
  name: string
  email: string
  role: WorkspaceRole
  joinedAt: string
}

export interface WorkspaceInviteInfo {
  id: string
  email: string
  role: WorkspaceRole
  createdAt: string
  expiresAt: string
}

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000

// ---------------------------------------------------------------------------
// Membership + active workspace
// ---------------------------------------------------------------------------

/** All workspaces a user belongs to (with their role), oldest membership first. */
export async function listWorkspacesForUser(userId: string): Promise<WorkspaceSummary[]> {
  return db
    .select({ id: workspaces.id, name: workspaces.name, role: workspaceMembers.role })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
    .where(eq(workspaceMembers.userId, userId))
    .orderBy(asc(workspaceMembers.createdAt))
}

/** The caller's role in a workspace, or null if they are not a member. */
export async function memberRole(
  userId: string,
  workspaceId: string,
): Promise<WorkspaceRole | null> {
  const rows = await db
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.userId, userId), eq(workspaceMembers.workspaceId, workspaceId)))
    .limit(1)
  return rows[0]?.role ?? null
}

/**
 * The user's active workspace id, self-healing: if the stored one is missing or
 * they're no longer a member, fall back to their first membership and persist it.
 * Returns null only if the user belongs to no workspaces.
 */
export async function getActiveWorkspaceId(userId: string): Promise<string | null> {
  const rows = await db
    .select({ active: user.activeWorkspaceId, name: user.name })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1)
  if (!rows[0]) return null
  const active = rows[0].active
  if (active && (await memberRole(userId, active))) return active

  // Stale/empty pointer — repoint to the first workspace they belong to.
  const first = await db
    .select({ id: workspaceMembers.workspaceId })
    .from(workspaceMembers)
    .where(eq(workspaceMembers.userId, userId))
    .orderBy(asc(workspaceMembers.createdAt))
    .limit(1)
  const fallback = first[0]?.id ?? null
  if (!fallback) {
    // No workspace at all (a new signup whose provisioning hook didn't run) —
    // create a default now so recording + upload always works.
    const created = await createWorkspace(userId, rows[0].name || 'My workspace')
    return created.id
  }
  await db.update(user).set({ activeWorkspaceId: fallback }).where(eq(user.id, userId))
  return fallback
}

/** Ensure a user has at least one workspace (called on signup). Idempotent. */
export async function ensureUserHasWorkspace(userId: string, displayName: string): Promise<void> {
  const existing = await db
    .select({ id: workspaceMembers.id })
    .from(workspaceMembers)
    .where(eq(workspaceMembers.userId, userId))
    .limit(1)
  if (existing.length === 0) {
    await createWorkspace(userId, displayName || 'My workspace')
  }
}

/** Switch the user's active workspace. Fails (returns false) if not a member. */
export async function setActiveWorkspace(userId: string, workspaceId: string): Promise<boolean> {
  if (!(await memberRole(userId, workspaceId))) return false
  await db.update(user).set({ activeWorkspaceId: workspaceId }).where(eq(user.id, userId))
  return true
}

// ---------------------------------------------------------------------------
// Workspace CRUD
// ---------------------------------------------------------------------------

/** Create a workspace owned by the user and make it their active one. */
export async function createWorkspace(userId: string, name: string): Promise<{ id: string }> {
  const cleanName = name.trim().slice(0, 80) || 'New workspace'
  const [ws] = await db
    .insert(workspaces)
    .values({ name: cleanName, createdByUserId: userId })
    .returning({ id: workspaces.id })
  await db
    .insert(workspaceMembers)
    .values({ workspaceId: ws!.id, userId, role: 'owner' })
  await db.update(user).set({ activeWorkspaceId: ws!.id }).where(eq(user.id, userId))
  return { id: ws!.id }
}

/** Rename a workspace. Owner-only. */
export async function renameWorkspace(
  userId: string,
  workspaceId: string,
  name: string,
): Promise<boolean> {
  if ((await memberRole(userId, workspaceId)) !== 'owner') return false
  const cleanName = name.trim().slice(0, 80)
  if (!cleanName) return false
  await db.update(workspaces).set({ name: cleanName }).where(eq(workspaces.id, workspaceId))
  return true
}

/**
 * Delete a workspace (cascades its videos/members/invites). Owner-only, and
 * refused if it's the user's only workspace (they must keep at least one).
 * Users whose active workspace was this one are re-pointed lazily.
 */
export async function deleteWorkspace(userId: string, workspaceId: string): Promise<boolean> {
  if ((await memberRole(userId, workspaceId)) !== 'owner') return false
  const mine = await listWorkspacesForUser(userId)
  if (mine.length <= 1) return false
  // Delete this workspace's Mux assets before the DB cascade removes the video
  // rows, otherwise the assets are orphaned upstream and keep billing.
  const assets = await db
    .select({ muxAssetId: videos.muxAssetId })
    .from(videos)
    .where(eq(videos.workspaceId, workspaceId))
  for (const a of assets) {
    if (!a.muxAssetId) continue
    try {
      await getMux().video.assets.delete(a.muxAssetId)
    } catch (error) {
      // Best-effort in bulk: log and continue so one bad asset can't block delete.
      console.error('[workspace] mux asset delete failed:', error)
    }
  }
  // Null out any active pointer to this workspace first (no FK to do it for us).
  await db
    .update(user)
    .set({ activeWorkspaceId: null })
    .where(eq(user.activeWorkspaceId, workspaceId))
  await db.delete(workspaces).where(eq(workspaces.id, workspaceId))
  return true
}

export interface WorkspaceBrand {
  name: string | null
  logo: string | null
  color: string | null
  tagline: string | null
  logoSize: string | null
  ctaLabel: string | null
  ctaUrl: string | null
}

export interface WorkspaceMeta {
  id: string
  name: string
  brand: WorkspaceBrand
}

/** Workspace name + branding, for a member. Null if missing or not a member. */
export async function getWorkspaceForMember(
  userId: string,
  workspaceId: string,
): Promise<(WorkspaceMeta & { role: WorkspaceRole }) | null> {
  const role = await memberRole(userId, workspaceId)
  if (!role) return null
  const rows = await db
    .select({
      id: workspaces.id,
      name: workspaces.name,
      brandName: workspaces.brandName,
      brandLogo: workspaces.brandLogo,
      brandColor: workspaces.brandColor,
      brandTagline: workspaces.brandTagline,
      brandLogoSize: workspaces.brandLogoSize,
      brandCtaLabel: workspaces.brandCtaLabel,
      brandCtaUrl: workspaces.brandCtaUrl,
    })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1)
  const w = rows[0]
  if (!w) return null
  return {
    id: w.id,
    name: w.name,
    role,
    brand: {
      name: w.brandName,
      logo: w.brandLogo,
      color: w.brandColor,
      tagline: w.brandTagline,
      logoSize: w.brandLogoSize,
      ctaLabel: w.brandCtaLabel,
      ctaUrl: w.brandCtaUrl,
    },
  }
}

/** Set a workspace's branding (pass nulls to clear). Owner-only. */
export async function setWorkspaceBrand(
  userId: string,
  workspaceId: string,
  brand: WorkspaceBrand,
): Promise<boolean> {
  if ((await memberRole(userId, workspaceId)) !== 'owner') return false
  await db
    .update(workspaces)
    .set({
      brandName: brand.name,
      brandLogo: brand.logo,
      brandColor: brand.color,
      brandTagline: brand.tagline,
      brandLogoSize: brand.logoSize,
      brandCtaLabel: brand.ctaLabel,
      brandCtaUrl: brand.ctaUrl,
    })
    .where(eq(workspaces.id, workspaceId))
  return true
}

// ---------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------

/** Members of a workspace (name/email/role), for a member of it. */
export async function listMembers(workspaceId: string): Promise<WorkspaceMemberInfo[]> {
  return db
    .select({
      userId: workspaceMembers.userId,
      name: user.name,
      email: user.email,
      role: workspaceMembers.role,
      joinedAt: workspaceMembers.createdAt,
    })
    .from(workspaceMembers)
    .innerJoin(user, eq(workspaceMembers.userId, user.id))
    .where(eq(workspaceMembers.workspaceId, workspaceId))
    .orderBy(asc(workspaceMembers.createdAt))
}

/** Remove a member. Owner-only; can't remove the last owner. */
export async function removeMember(
  actingUserId: string,
  workspaceId: string,
  memberUserId: string,
): Promise<boolean> {
  if ((await memberRole(actingUserId, workspaceId)) !== 'owner') return false
  // Don't strand the workspace ownerless.
  const target = await memberRole(memberUserId, workspaceId)
  if (target === 'owner') {
    const owners = await db
      .select({ n: count() })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.role, 'owner')))
    if (Number(owners[0]?.n ?? 0) <= 1) return false
  }
  await db
    .delete(workspaceMembers)
    .where(
      and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, memberUserId)),
    )
  return true
}

// ---------------------------------------------------------------------------
// Invites
// ---------------------------------------------------------------------------

/**
 * Create (or refresh) an invite for an email. Owner-only. Returns the token to
 * embed in the invite link. Skips if the email already belongs to a member.
 */
export async function createInvite(
  actingUserId: string,
  workspaceId: string,
  email: string,
  role: WorkspaceRole,
): Promise<{ token: string } | { error: string }> {
  if ((await memberRole(actingUserId, workspaceId)) !== 'owner') {
    return { error: 'Only an owner can invite people.' }
  }
  const cleanEmail = email.trim().toLowerCase()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cleanEmail)) return { error: 'Enter a valid email.' }

  // Already a member? (match by the user's email)
  const existing = await db
    .select({ id: workspaceMembers.userId })
    .from(workspaceMembers)
    .innerJoin(user, eq(workspaceMembers.userId, user.id))
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(user.email, cleanEmail)))
    .limit(1)
  if (existing.length) return { error: 'That person is already a member.' }

  // Replace any prior pending invite for this email + workspace.
  await db
    .delete(workspaceInvites)
    .where(
      and(
        eq(workspaceInvites.workspaceId, workspaceId),
        eq(workspaceInvites.email, cleanEmail),
        isNull(workspaceInvites.acceptedAt),
      ),
    )
  const token = randomBytes(24).toString('base64url')
  await db.insert(workspaceInvites).values({
    workspaceId,
    email: cleanEmail,
    role,
    token,
    invitedByUserId: actingUserId,
    expiresAt: new Date(Date.now() + INVITE_TTL_MS).toISOString(),
  })
  return { token }
}

/** Pending (unaccepted, unexpired) invites for a workspace. */
export async function listInvites(workspaceId: string): Promise<WorkspaceInviteInfo[]> {
  return db
    .select({
      id: workspaceInvites.id,
      email: workspaceInvites.email,
      role: workspaceInvites.role,
      createdAt: workspaceInvites.createdAt,
      expiresAt: workspaceInvites.expiresAt,
    })
    .from(workspaceInvites)
    .where(
      and(
        eq(workspaceInvites.workspaceId, workspaceId),
        isNull(workspaceInvites.acceptedAt),
        gt(workspaceInvites.expiresAt, new Date().toISOString()),
      ),
    )
    .orderBy(asc(workspaceInvites.createdAt))
}

/** Revoke a pending invite. Owner-only. */
export async function revokeInvite(
  actingUserId: string,
  workspaceId: string,
  inviteId: string,
): Promise<boolean> {
  if ((await memberRole(actingUserId, workspaceId)) !== 'owner') return false
  await db
    .delete(workspaceInvites)
    .where(and(eq(workspaceInvites.id, inviteId), eq(workspaceInvites.workspaceId, workspaceId)))
  return true
}

export interface InviteDetail {
  workspaceId: string
  workspaceName: string
  email: string
  role: WorkspaceRole
  invitedByName: string | null
}

/** Look up a live (pending, unexpired) invite by token, for the accept page. */
export async function getInviteByToken(token: string): Promise<InviteDetail | null> {
  const rows = await db
    .select({
      workspaceId: workspaceInvites.workspaceId,
      workspaceName: workspaces.name,
      email: workspaceInvites.email,
      role: workspaceInvites.role,
      acceptedAt: workspaceInvites.acceptedAt,
      expiresAt: workspaceInvites.expiresAt,
      invitedByName: user.name,
    })
    .from(workspaceInvites)
    .innerJoin(workspaces, eq(workspaceInvites.workspaceId, workspaces.id))
    .leftJoin(user, eq(workspaceInvites.invitedByUserId, user.id))
    .where(eq(workspaceInvites.token, token))
    .limit(1)
  const r = rows[0]
  // Compare as timestamps: the DB returns "YYYY-MM-DD HH:MM:SS+00" (space), not the
  // ISO "T…Z" form, so a lexicographic string compare misfires on the final day.
  if (!r || r.acceptedAt || new Date(r.expiresAt).getTime() <= Date.now()) return null
  return {
    workspaceId: r.workspaceId,
    workspaceName: r.workspaceName,
    email: r.email,
    role: r.role,
    invitedByName: r.invitedByName,
  }
}

/**
 * Accept an invite as the signed-in user. Requires the user's email to match the
 * invited email (invites are per-person). Adds membership (idempotent), marks the
 * invite accepted, and makes it the active workspace. Returns the workspace id.
 */
export async function acceptInvite(
  token: string,
  userId: string,
  userEmail: string,
): Promise<{ ok: true; workspaceId: string } | { ok: false; error: string }> {
  const invite = await getInviteByToken(token)
  if (!invite) return { ok: false, error: 'This invite is invalid or has expired.' }
  if (invite.email !== userEmail.trim().toLowerCase()) {
    return { ok: false, error: `This invite was sent to ${invite.email}. Sign in with that email to accept.` }
  }
  // Add membership if not already present.
  const alreadyMember = Boolean(await memberRole(userId, invite.workspaceId))
  if (!alreadyMember) {
    await db
      .insert(workspaceMembers)
      .values({ workspaceId: invite.workspaceId, userId, role: invite.role })
  }
  await db
    .update(workspaceInvites)
    .set({ acceptedAt: new Date().toISOString() })
    .where(eq(workspaceInvites.token, token))
  await db.update(user).set({ activeWorkspaceId: invite.workspaceId }).where(eq(user.id, userId))

  // Notify the workspace's owners that someone joined.
  if (!alreadyMember) {
    const owners = await ownerIdsForWorkspace(invite.workspaceId)
    await createNotifications(
      owners.filter((id) => id !== userId),
      {
        type: 'member_joined',
        title: `New member in ${invite.workspaceName}`,
        body: `${userEmail} joined the workspace.`,
        linkPath: '/dashboard/workspace',
      },
    ).catch((error) => console.error('[invite] join notification failed:', error))
  }
  return { ok: true, workspaceId: invite.workspaceId }
}

// ---------------------------------------------------------------------------
// Video authorization
// ---------------------------------------------------------------------------

/** True if the user is a member of the workspace that owns `videoId`. */
export async function userCanAccessVideo(userId: string, videoId: string): Promise<boolean> {
  const rows = await db
    .select({ id: workspaceMembers.id })
    .from(videos)
    .innerJoin(workspaceMembers, eq(videos.workspaceId, workspaceMembers.workspaceId))
    .where(and(eq(videos.id, videoId), eq(workspaceMembers.userId, userId)))
    .limit(1)
  return rows.length > 0
}
