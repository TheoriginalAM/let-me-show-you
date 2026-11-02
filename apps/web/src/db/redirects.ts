import 'server-only'

import { and, desc, eq, ne, notInArray, sql } from 'drizzle-orm'
import { db } from './index'
import { slugRedirects } from './schema'

/**
 * Old public addresses. When someone renames a room, calendar or booking page
 * link, the old one keeps leading to the same place, so links already sent to
 * clients still land. Another business can't take an address that's still
 * someone's old link; the owner can take it back.
 */
export type RedirectKind = 'room' | 'calendar' | 'business'

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]
type Executor = typeof db | Tx

/** How many old addresses each room, calendar or business keeps. */
const KEEP_PER_TARGET = 5

/**
 * Serialise link changes touching these slugs (transaction-scoped), so a
 * business can't take an address in the moment another is giving it up.
 */
export async function lockSlugs(
  exec: Tx,
  kind: RedirectKind,
  scope: string,
  slugs: string[],
): Promise<void> {
  for (const slug of [...new Set(slugs)].sort()) {
    await exec.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`slug:${kind}:${scope}:${slug}`}))`,
    )
  }
}

/** The id an old address now leads to, or null. */
export async function resolveRedirect(
  kind: RedirectKind,
  scope: string,
  slug: string,
): Promise<string | null> {
  const rows = await db
    .select({ targetId: slugRedirects.targetId })
    .from(slugRedirects)
    .where(
      and(
        eq(slugRedirects.kind, kind),
        eq(slugRedirects.scope, scope),
        eq(slugRedirects.oldSlug, slug),
      ),
    )
    .limit(1)
  return rows[0]?.targetId ?? null
}

/** Whether another business still owns `slug` as an old address. */
export async function slugHeldElsewhere(
  kind: RedirectKind,
  scope: string,
  slug: string,
  workspaceId: string,
  exec: Executor = db,
): Promise<boolean> {
  const rows = await exec
    .select({ id: slugRedirects.id })
    .from(slugRedirects)
    .where(
      and(
        eq(slugRedirects.kind, kind),
        eq(slugRedirects.scope, scope),
        eq(slugRedirects.oldSlug, slug),
        ne(slugRedirects.workspaceId, workspaceId),
      ),
    )
    .limit(1)
  return rows.length > 0
}

/**
 * After a rename: send `oldSlug` to the target, and free `newSlug` if it was one
 * of this business's own old addresses.
 */
export async function rememberOldSlug(
  exec: Executor,
  r: {
    kind: RedirectKind
    scope: string
    oldSlug: string
    newSlug: string
    targetId: string
    workspaceId: string
  },
): Promise<void> {
  await exec
    .delete(slugRedirects)
    .where(
      and(
        eq(slugRedirects.kind, r.kind),
        eq(slugRedirects.scope, r.scope),
        eq(slugRedirects.oldSlug, r.newSlug),
        eq(slugRedirects.workspaceId, r.workspaceId),
      ),
    )
  if (r.oldSlug === r.newSlug) return
  await exec
    .insert(slugRedirects)
    .values({
      kind: r.kind,
      scope: r.scope,
      oldSlug: r.oldSlug,
      targetId: r.targetId,
      workspaceId: r.workspaceId,
    })
    .onConflictDoUpdate({
      target: [slugRedirects.kind, slugRedirects.scope, slugRedirects.oldSlug],
      set: { targetId: r.targetId, workspaceId: r.workspaceId },
      // Never take over another business's old address.
      setWhere: eq(slugRedirects.workspaceId, r.workspaceId),
    })
  // Keep only the latest few, so renaming can't hoard addresses.
  const keep = exec
    .select({ id: slugRedirects.id })
    .from(slugRedirects)
    .where(eq(slugRedirects.targetId, r.targetId))
    .orderBy(desc(slugRedirects.createdAt))
    .limit(KEEP_PER_TARGET)
  await exec
    .delete(slugRedirects)
    .where(and(eq(slugRedirects.targetId, r.targetId), notInArray(slugRedirects.id, keep)))
}

/** Drop the old addresses of something that was deleted. */
export async function forgetRedirects(targetId: string): Promise<void> {
  await db.delete(slugRedirects).where(eq(slugRedirects.targetId, targetId))
}
