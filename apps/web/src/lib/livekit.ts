import 'server-only'

import { createHash } from 'node:crypto'
import { AccessToken, DataPacket_Kind, EgressClient, RoomServiceClient } from 'livekit-server-sdk'

interface LiveKitConfig {
  /** wss:// URL the browser connects to. */
  wsUrl: string
  /** https:// URL for the server APIs (room service, egress). */
  httpUrl: string
  apiKey: string
  apiSecret: string
}

/** LiveKit settings from the environment, or null if meetings aren't configured. */
export function livekitConfig(): LiveKitConfig | null {
  const wsUrl = process.env.LIVEKIT_URL?.trim()
  const apiKey = process.env.LIVEKIT_API_KEY?.trim()
  const apiSecret = process.env.LIVEKIT_API_SECRET?.trim()
  if (!wsUrl || !apiKey || !apiSecret) return null
  const httpUrl = wsUrl.replace(/^wss:/i, 'https:').replace(/^ws:/i, 'http:')
  return { wsUrl, httpUrl, apiKey, apiSecret }
}

export function meetingsConfigured(): boolean {
  return livekitConfig() !== null
}

function requireConfig(): LiveKitConfig {
  const config = livekitConfig()
  if (!config) throw new Error('LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET must be set')
  return config
}

let roomClient: RoomServiceClient | null = null
let egressClient: EgressClient | null = null

/** Server-side room controls (list/mute/remove participants, send data). */
export function roomService(): RoomServiceClient {
  if (roomClient) return roomClient
  const c = requireConfig()
  roomClient = new RoomServiceClient(c.httpUrl, c.apiKey, c.apiSecret)
  return roomClient
}

/** Server-side egress (recording) controls. */
export function egressService(): EgressClient {
  if (egressClient) return egressClient
  const c = requireConfig()
  egressClient = new EgressClient(c.httpUrl, c.apiKey, c.apiSecret)
  return egressClient
}

/** The LiveKit room name for one of our meeting rooms (stable per room). */
export function livekitRoomName(roomId: string): string {
  return `lmsy-${roomId}`
}

export type MeetingRole = 'host' | 'guest'

/** Participant identity for a signed-in workspace member (one seat per user). */
export function memberIdentity(userId: string): string {
  return `u_${userId}`
}

const GUEST_KEY_RE = /^[A-Za-z0-9_-]{16,64}$/

/**
 * Participant identity for a guest, derived from a random key that only their
 * browser holds. Knowing someone's identity (it's visible in the room) does not
 * reveal the key, so nobody can poll or rejoin as another guest.
 */
export function guestIdentity(roomId: string, guestKey: string): string | null {
  if (!GUEST_KEY_RE.test(guestKey)) return null
  const digest = createHash('sha256').update(`${roomId}:${guestKey}`).digest('hex')
  return `g_${digest.slice(0, 24)}`
}

/**
 * A short-lived join token. Once connected, LiveKit refreshes the session itself,
 * so the TTL only bounds how long the token can be used to (re)connect.
 */
export async function createJoinToken(opts: {
  roomId: string
  identity: string
  name: string
  role: MeetingRole
}): Promise<{ token: string; serverUrl: string }> {
  const c = requireConfig()
  const at = new AccessToken(c.apiKey, c.apiSecret, {
    identity: opts.identity,
    name: opts.name,
    // Short: the page connects straight away, and LiveKit refreshes a connected
    // session itself. A short TTL limits reuse of a token after removal.
    ttl: opts.role === 'host' ? '10m' : '5m',
    // Clients can't change their own attributes, so the role badge can't be faked.
    attributes: { role: opts.role },
  })
  at.addGrant({
    roomJoin: true,
    room: livekitRoomName(opts.roomId),
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
    canUpdateOwnMetadata: false,
  })
  return { token: await at.toJwt(), serverUrl: c.wsUrl }
}

/** When a room's live session began: epoch ms, 'none' (nobody in it), or 'unknown'. */
export type RoomStart = number | 'none' | 'unknown'

// Tiny per-process cache so a guest polling with an old admission can't turn
// into a stream of LiveKit API calls.
const startCache = new Map<string, { value: number | 'none'; at: number }>()
const START_CACHE_MS = 10_000

/**
 * When the current live session of a room began. A LiveKit room exists only
 * while occupied, so this tells one meeting apart from the next one in the same
 * room. 'unknown' means LiveKit couldn't be reached (don't treat it as "empty").
 */
export async function liveRoomStartedAt(roomId: string): Promise<RoomStart> {
  const hit = startCache.get(roomId)
  if (hit && Date.now() - hit.at < START_CACHE_MS) return hit.value
  try {
    const [room] = await roomService().listRooms([livekitRoomName(roomId)])
    const value = room
      ? Number(
          room.creationTimeMs && room.creationTimeMs > BigInt(0)
            ? room.creationTimeMs
            : room.creationTime * BigInt(1000),
        )
      : 'none'
    if (startCache.size > 1000) startCache.clear()
    startCache.set(roomId, { value, at: Date.now() })
    return value
  } catch {
    return 'unknown'
  }
}

/**
 * Send a small reliable message to everyone in the room (e.g. "someone is in the
 * lobby"). Best-effort: the LiveKit room only exists while people are in it.
 */
export async function signalRoom(roomId: string, topic: string, payload: object): Promise<void> {
  try {
    await roomService().sendData(
      livekitRoomName(roomId),
      new TextEncoder().encode(JSON.stringify(payload)),
      DataPacket_Kind.RELIABLE,
      { topic },
    )
  } catch {
    // Room not live yet, or LiveKit unreachable: hosts also poll, so ignore.
  }
}
