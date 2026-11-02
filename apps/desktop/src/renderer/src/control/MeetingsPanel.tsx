import { useCallback, useEffect, useState } from 'react'
import type { DesktopRoom } from '@shared/ipc'
import { Icon } from '../brand'
import { SignedOutNote } from './SignedOutNote'

type Load =
  | { phase: 'loading' }
  | { phase: 'signed-out' }
  | { phase: 'error' }
  | { phase: 'ready'; rooms: DesktopRoom[]; manageUrl: string }

/** The user's meeting rooms. Calls open in the browser (already signed in there). */
export function MeetingsPanel({ signedIn }: { signedIn: boolean }) {
  const [load, setLoad] = useState<Load>({ phase: 'loading' })
  const [copied, setCopied] = useState<string | null>(null)

  const fetchRooms = useCallback(() => {
    if (!signedIn) {
      setLoad({ phase: 'signed-out' })
      return
    }
    setLoad({ phase: 'loading' })
    window.recorder
      .listRooms()
      .then((res) => setLoad(res ? { phase: 'ready', ...res } : { phase: 'error' }))
      .catch(() => setLoad({ phase: 'error' }))
  }, [signedIn])

  useEffect(fetchRooms, [fetchRooms])

  async function copy(room: DesktopRoom): Promise<void> {
    try {
      await navigator.clipboard.writeText(room.url)
      setCopied(room.id)
      setTimeout(() => setCopied((c) => (c === room.id ? null : c)), 1800)
    } catch {
      // Clipboard blocked: nothing else to do from here.
    }
  }

  if (load.phase === 'signed-out') return <SignedOutNote what="meeting rooms" />
  if (load.phase === 'loading') return <div className="picker-empty">Loading your rooms…</div>
  if (load.phase === 'error') {
    return (
      <div className="side-empty">
        <p className="side-empty-title">Couldn’t load your rooms</p>
        <p className="side-empty-body">Check your connection and try again.</p>
        <button className="btn-secondary no-drag" onClick={fetchRooms}>
          Try again
        </button>
      </div>
    )
  }

  const businesses = [...new Set(load.rooms.map((r) => r.businessName))]
  return (
    <div className="side-list">
      {load.rooms.length === 0 ? (
        <div className="side-empty">
          <p className="side-empty-title">No meeting rooms yet</p>
          <p className="side-empty-body">Create one on the website and it shows up here.</p>
        </div>
      ) : (
        businesses.map((biz) => (
          <section key={biz} className="side-group">
            {businesses.length > 1 && <h3 className="group-title">{biz}</h3>}
            {load.rooms
              .filter((r) => r.businessName === biz)
              .map((room) => (
                <article key={room.id} className="room-card">
                  <div className="room-card-text">
                    <span className="room-name">{room.name}</span>
                    <span className="room-url" title={room.url}>
                      {room.url.replace(/^https?:\/\//, '')}
                    </span>
                  </div>
                  <div className="room-actions">
                    <button className="btn-mini no-drag" onClick={() => void copy(room)}>
                      <Icon
                        name={copied === room.id ? 'check' : 'copy'}
                        size={13}
                        strokeWidth={2.2}
                      />
                      {copied === room.id ? 'Copied' : 'Copy link'}
                    </button>
                    <button
                      className="btn-go no-drag"
                      onClick={() => void window.recorder.openExternalUrl(room.url)}
                    >
                      Start
                    </button>
                  </div>
                </article>
              ))}
          </section>
        ))
      )}
      <button
        className="side-link no-drag"
        onClick={() => void window.recorder.openExternalUrl(load.manageUrl)}
      >
        Add or change rooms on the website
      </button>
    </div>
  )
}
