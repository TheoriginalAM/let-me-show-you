'use server'

import { revalidatePath } from 'next/cache'
import {
  createRoom,
  deleteRoom,
  getRoomForMember,
  renameRoom,
  setRoomLobby,
  updateRoomSettings,
  type RoomSettingsInput,
} from '@/db/meetings'
import { getActiveWorkspaceId } from '@/db/workspaces'
import { getCurrentUser } from '@/lib/current-user'
import { livekitRoomName, meetingsConfigured, roomService } from '@/lib/livekit'
import { stopMeetingRecording } from '@/lib/meeting-recording'

type Result = { ok: true } | { ok: false; error: string }

async function me() {
  const user = await getCurrentUser()
  return user?.approved ? user : null
}

export async function createRoomAction(name: string): Promise<Result> {
  const user = await me()
  if (!user) return { ok: false, error: 'Not signed in.' }
  const workspaceId = await getActiveWorkspaceId(user.id)
  if (!workspaceId) return { ok: false, error: 'No workspace.' }
  const room = await createRoom(user.id, workspaceId, String(name ?? ''))
  if (!room) return { ok: false, error: 'Could not create the room.' }
  revalidatePath('/dashboard/rooms')
  return { ok: true }
}

export async function renameRoomAction(roomId: string, name: string): Promise<Result> {
  const user = await me()
  if (!user) return { ok: false, error: 'Not signed in.' }
  const ok = await renameRoom(user.id, String(roomId), String(name ?? ''))
  if (!ok) return { ok: false, error: 'Could not rename the room.' }
  revalidatePath('/dashboard/rooms')
  return { ok: true }
}

const IMAGE_DATA_URL = /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Save a room's name, link and look. */
export async function updateRoomAction(roomId: string, input: RoomSettingsInput): Promise<Result> {
  const user = await me()
  if (!user) return { ok: false, error: 'Not signed in.' }
  if (!UUID_RE.test(String(roomId))) return { ok: false, error: 'Room not found.' }
  const image = input?.backgroundImage
  if (typeof image === 'string' && (!IMAGE_DATA_URL.test(image) || image.length > 1_200_000)) {
    return { ok: false, error: 'That backdrop photo is too large or not an image.' }
  }
  const res = await updateRoomSettings(user.id, String(roomId), {
    name: String(input?.name ?? ''),
    slug: String(input?.slug ?? ''),
    welcomeMessage: input?.welcomeMessage == null ? null : String(input.welcomeMessage),
    accentColor: input?.accentColor == null ? null : String(input.accentColor),
    background: input?.background == null ? null : String(input.background),
    backgroundImage: image === undefined ? undefined : image,
  })
  if (res === 'forbidden') return { ok: false, error: 'Room not found.' }
  if (res === 'invalid-name') return { ok: false, error: 'Give the room a name.' }
  if (res === 'invalid-link') {
    return { ok: false, error: 'Links are 3 to 50 lowercase letters, numbers and dashes.' }
  }
  if (res === 'taken') return { ok: false, error: 'That link is taken. Try another.' }
  revalidatePath('/dashboard/rooms')
  return { ok: true }
}

export async function setLobbyAction(roomId: string, enabled: boolean): Promise<Result> {
  const user = await me()
  if (!user) return { ok: false, error: 'Not signed in.' }
  const ok = await setRoomLobby(user.id, String(roomId), Boolean(enabled))
  if (!ok) return { ok: false, error: 'Could not update the room.' }
  revalidatePath('/dashboard/rooms')
  return { ok: true }
}

export async function deleteRoomAction(roomId: string): Promise<Result> {
  const user = await me()
  if (!user) return { ok: false, error: 'Not signed in.' }
  const room = await getRoomForMember(user.id, String(roomId))
  if (!room) return { ok: false, error: 'Room not found.' }
  if (meetingsConfigured()) {
    // Finish any recording (so it still lands in the workspace), then end the call.
    await stopMeetingRecording(room.id).catch(() => undefined)
    await roomService()
      .deleteRoom(livekitRoomName(room.id))
      .catch(() => undefined) // no live call
  }
  await deleteRoom(user.id, room.id)
  revalidatePath('/dashboard/rooms')
  return { ok: true }
}
