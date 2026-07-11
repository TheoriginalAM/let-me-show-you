import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'
import { VIDEO_STATUSES } from '@lmsy/shared'

// Better Auth's generated tables (user, session, account, verification).
export * from './auth-schema'
import { user } from './auth-schema'

/** Video processing states — kept in sync with `@lmsy/shared`'s VIDEO_STATUSES. */
export const videoStatus = pgEnum('video_status', VIDEO_STATUSES)

/** Screen recordings owned by a Better Auth user. */
export const videos = pgTable(
  'videos',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
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
  // Serves the dashboard's hot path: WHERE owner_id = ? ORDER BY created_at DESC.
  (table) => [index('videos_owner_id_created_at_idx').on(table.ownerId, table.createdAt.desc())],
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
export type ApiTokenRow = typeof apiTokens.$inferSelect
export type DeviceCodeRow = typeof deviceCodes.$inferSelect
