import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { VIDEO_STATUSES } from '@lmsy/shared'

// Better Auth's generated tables (user, session, account, verification).
export * from './auth-schema'
import { user } from './auth-schema'

/** Video processing states — kept in sync with `@lmsy/shared`'s VIDEO_STATUSES. */
export const videoStatus = pgEnum('video_status', VIDEO_STATUSES)

/**
 * A workspace groups recordings + branding for one business/team. Users can
 * belong to several (their own businesses, or teams they were invited to).
 */
export const workspaces = pgTable('workspaces', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  // Branding for this workspace's public share pages (moved off `user`).
  brandName: text('brand_name'),
  brandLogo: text('brand_logo'), // data URL (resized client-side)
  brandColor: text('brand_color'), // accent hex, e.g. #8b8bf6
  brandTagline: text('brand_tagline'), // short line shown under the brand name
  brandLogoSize: text('brand_logo_size'), // 'small' | 'medium' | 'large' (null = medium)
  brandCtaLabel: text('brand_cta_label'), // optional call-to-action button label
  brandCtaUrl: text('brand_cta_url'), // optional call-to-action button URL
  createdByUserId: text('created_by_user_id').references(() => user.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
    .notNull()
    .defaultNow(),
})

/** Workspace roles: an owner manages the workspace + members; members record/upload. */
export const workspaceRole = pgEnum('workspace_role', ['owner', 'member'])

/** Which users belong to which workspaces, and their role. */
export const workspaceMembers = pgTable(
  'workspace_members',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    role: workspaceRole('role').notNull().default('member'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('workspace_members_ws_user_idx').on(table.workspaceId, table.userId),
    index('workspace_members_user_idx').on(table.userId),
  ],
)

/** Pending email invitations to a workspace (login-free acceptance via token). */
export const workspaceInvites = pgTable(
  'workspace_invites',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    role: workspaceRole('role').notNull().default('member'),
    token: text('token').notNull().unique(),
    invitedByUserId: text('invited_by_user_id').references(() => user.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'string' }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true, mode: 'string' }),
  },
  (table) => [index('workspace_invites_workspace_id_idx').on(table.workspaceId)],
)

/** Screen recordings owned by a Better Auth user. */
export const videos = pgTable(
  'videos',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    // The workspace this recording belongs to (access is by workspace membership).
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    // Optional description shown under the video on its share page.
    description: text('description'),
    status: videoStatus('status').notNull().default('uploading'),
    muxAssetId: text('mux_asset_id'),
    muxPlaybackId: text('mux_playback_id'),
    durationSeconds: integer('duration_seconds'),
    shareSlug: text('share_slug').notNull().unique(),
    isPublic: boolean('is_public').notNull().default(true),
    passwordHash: text('password_hash'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // The dashboard's hot path is now per-workspace: WHERE workspace_id = ? ORDER BY created_at DESC.
    index('videos_workspace_id_created_at_idx').on(table.workspaceId, table.createdAt.desc()),
    index('videos_owner_id_created_at_idx').on(table.ownerId, table.createdAt.desc()),
  ],
)

/** Individual view events for basic per-video analytics. */
export const videoViews = pgTable(
  'video_views',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    videoId: uuid('video_id')
      .notNull()
      .references(() => videos.id, { onDelete: 'cascade' }),
    viewedAt: timestamp('viewed_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
    viewerIpHash: text('viewer_ip_hash'),
  },
  // Indexes the join/lookup column and speeds up cascade deletes from videos.
  (table) => [index('video_views_video_id_idx').on(table.videoId)],
)

/**
 * Public, login-free comments on a shared video (a lightweight thread for client
 * feedback). Anyone who can view the share can post a name + comment; cascades
 * away with the video.
 */
export const videoComments = pgTable(
  'video_comments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    videoId: uuid('video_id')
      .notNull()
      .references(() => videos.id, { onDelete: 'cascade' }),
    authorName: text('author_name').notNull(),
    body: text('body').notNull(),
    // Salted IP hash for rate-limiting/abuse triage only (never shown).
    authorIpHash: text('author_ip_hash'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
  },
  // Serves the share page's thread render: WHERE video_id = ? ORDER BY created_at.
  (table) => [index('video_comments_video_id_created_at_idx').on(table.videoId, table.createdAt)],
)

/** In-app notifications shown in a user's inbox (new comment, member joined, etc.). */
export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    type: text('type').notNull(), // 'comment' | 'member_joined' | ...
    title: text('title').notNull(),
    body: text('body'),
    linkPath: text('link_path'), // same-origin relative path to open
    read: boolean('read').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('notifications_user_id_created_at_idx').on(table.userId, table.createdAt.desc()),
  ],
)

/** Long-lived bearer tokens for the desktop app — stored hashed, never plaintext. */
export const apiTokens = pgTable(
  'api_tokens',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    name: text('name').notNull().default('Desktop'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true, mode: 'string' }),
  },
  (table) => [index('api_tokens_user_id_idx').on(table.userId)],
)

/** Transient device-authorization codes (OAuth device-grant style). */
export const deviceCodes = pgTable(
  'device_codes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    deviceCode: text('device_code').notNull().unique(),
    userCode: text('user_code').notNull().unique(),
    // Set once a signed-in user approves the code in the browser.
    userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
    approved: boolean('approved').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'string' }).notNull(),
  },
  (table) => [index('device_codes_user_code_idx').on(table.userCode)],
)

export type VideoRow = typeof videos.$inferSelect
export type NewVideoRow = typeof videos.$inferInsert
export type VideoViewRow = typeof videoViews.$inferSelect
export type NewVideoViewRow = typeof videoViews.$inferInsert
export type VideoCommentRow = typeof videoComments.$inferSelect
export type NewVideoCommentRow = typeof videoComments.$inferInsert
export type WorkspaceRow = typeof workspaces.$inferSelect
export type NewWorkspaceRow = typeof workspaces.$inferInsert
export type WorkspaceMemberRow = typeof workspaceMembers.$inferSelect
export type WorkspaceInviteRow = typeof workspaceInvites.$inferSelect
export type WorkspaceRole = (typeof workspaceRole.enumValues)[number]
export type ApiTokenRow = typeof apiTokens.$inferSelect
export type DeviceCodeRow = typeof deviceCodes.$inferSelect
