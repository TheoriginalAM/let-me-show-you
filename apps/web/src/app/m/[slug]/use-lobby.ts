'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useDataChannel, useRoomContext } from '@livekit/components-react'
import { ConnectionState, RoomEvent, type Participant } from 'livekit-client'
import type { LobbyGuest } from '@/db/meetings'
import { getPrefs } from './_lib/prefs'
import { playChime } from './_lib/sounds'
import { enforceGuestAccess, listLobby } from './actions'

const LOBBY_POLL_MS = 4000
/** Minimum gap between back-to-back lobby re-fetches. */
const REFRESH_SPACING_MS = 1000

/**
 * Host-only: who's waiting in the lobby, kept fresh by polling plus the server's
 * 'lobby' pings. Also re-removes any guest who was removed but reconnects, and
 * chimes + badges the tab title when someone new is waiting.
 */
export function useLobby(slug: string, roomName: string, enabled: boolean) {
  const [guests, setGuests] = useState<LobbyGuest[]>([])
  /** The room's lobby setting as the server last reported it (null until known). */
  const [lobbyEnabled, setLobbyEnabled] = useState<boolean | null>(null)
  const room = useRoomContext()
  const inFlight = useRef(false)
  const again = useRef(false)
  const seen = useRef(new Set<string>())

  // Coalesced: at most one fetch in flight plus one trailing re-fetch. Next runs
  // a page's server actions one at a time, so a pile of these would queue up
  // behind (and delay) Mute/Remove/Stop.
  const refresh = useCallback(async () => {
    if (!enabled) return
    if (inFlight.current) {
      again.current = true
      return
    }
    inFlight.current = true
    try {
      do {
        again.current = false
        const res = await listLobby(slug)
        if (res.ok) {
          setGuests(res.guests)
          setLobbyEnabled(res.lobbyEnabled)
        }
        if (again.current) await new Promise((r) => setTimeout(r, REFRESH_SPACING_MS))
      } while (again.current)
    } catch {
      // transient: the next poll catches up
    } finally {
      inFlight.current = false
    }
  }, [slug, enabled])

  useEffect(() => {
    if (!enabled) return
    void refresh()
    const id = setInterval(() => void refresh(), LOBBY_POLL_MS)
    return () => clearInterval(id)
  }, [refresh, enabled])

  // Only trust the server's own pings (participants' messages carry a sender).
  useDataChannel('lobby', (msg) => {
    if (!msg.from) void refresh()
  })

  // Chime for newcomers.
  useEffect(() => {
    const fresh = guests.filter((g) => !seen.current.has(g.id))
    guests.forEach((g) => seen.current.add(g.id))
    if (fresh.length && getPrefs().sounds) playChime('knock')
  }, [guests])

  // "(2) Weekly sync" in the tab title while people wait.
  useEffect(() => {
    if (!enabled) return
    const base = roomName
    document.title = guests.length ? `(${guests.length}) ${base}` : base
    return () => {
      document.title = base
    }
  }, [guests.length, roomName, enabled])

  // A removed guest reconnecting with a token they still hold: take them out
  // again. Guests already present when we connect don't raise
  // ParticipantConnected, so also sweep once connected.
  useEffect(() => {
    if (!enabled) return
    const check = (p: Participant): void => {
      if (p.identity.startsWith('g_')) void enforceGuestAccess(slug, p.identity).catch(() => undefined)
    }
    const sweep = (): void => room.remoteParticipants.forEach(check)
    room.on(RoomEvent.ParticipantConnected, check)
    room.on(RoomEvent.Connected, sweep)
    if (room.state === ConnectionState.Connected) sweep()
    return () => {
      room.off(RoomEvent.ParticipantConnected, check)
      room.off(RoomEvent.Connected, sweep)
    }
  }, [room, slug, enabled])

  return { guests, lobbyEnabled, refresh }
}
