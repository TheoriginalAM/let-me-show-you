'use server'

import { revalidatePath } from 'next/cache'
import { createRoom, deleteRoom, getRoomForMember, renameRoom, setRoomLobby } from '@/db/meetings'
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
