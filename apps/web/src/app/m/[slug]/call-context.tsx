'use client'

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useChat, type ReceivedChatMessage } from '@livekit/components-react'
import type { MeetingBrand } from './_lib/brand'

const MAX_CHAT_CHARS = 4000

/**
 * Decoder for the legacy chat topic, which accepts raw packets from anyone in
 * the call. The default one throws on bad JSON, and a throw there stops chat
 * for the rest of the call, so anything malformed is dropped instead.
 */
const CHAT_OPTS: Parameters<typeof useChat>[0] = {
  messageDecoder: (payload) => {
    try {
      const m = JSON.parse(new TextDecoder().decode(payload)) as Record<string, unknown>
      if (typeof m?.message !== 'string' || !m.message.trim()) throw new Error('empty')
      return {
        id: typeof m.id === 'string' ? m.id.slice(0, 64) : crypto.randomUUID(),
        timestamp: typeof m.timestamp === 'number' && Number.isFinite(m.timestamp) ? m.timestamp : Date.now(),
        message: m.message.slice(0, MAX_CHAT_CHARS),
        type: 'chatMessage',
      }
    } catch {
      return { id: '', timestamp: 0, message: '', type: 'chatMessage', ignoreLegacy: true }
    }
  },
}

export type Panel = 'people' | 'chat' | null
export type MediaStarting = { audio: boolean; video: boolean }
export type LayoutMode = 'auto' | 'grid' | 'speaker'

export interface Notice {
  id: number
  text: string
  tone: 'info' | 'warn' | 'error' | 'success'
  action?: { label: string; run: () => void }
}

interface CallState {
  slug: string
  roomName: string
  brand: MeetingBrand
  role: 'host' | 'guest'
  /** The guest's secret key (for their own server actions). Never sent anywhere else. */
  guestKey: string
  panel: Panel
  setPanel: (panel: Panel) => void
  togglePanel: (panel: Exclude<Panel, null>) => void
  layout: LayoutMode
  setLayout: (mode: LayoutMode) => void
  /** Pinned tile key (`identity:source`), local to this viewer. */
  pinned: string | null
  setPinned: (key: string | null) => void
  settingsOpen: boolean
  setSettingsOpen: (open: boolean) => void
  lobbyEnabled: boolean
  setLobbyEnabled: (on: boolean) => void
  /**
   * The mic/camera being switched on as the call starts. Until they're live the
   * buttons ignore taps, or a tap would start a second, un-mutable capture.
   */
  mediaStarting: MediaStarting
  setMediaStarting: (update: (cur: MediaStarting) => MediaStarting) => void
  notices: Notice[]
  notify: (text: string, tone?: Notice['tone'], action?: Notice['action']) => void
  dismiss: (id: number) => void
  chat: {
    messages: ReceivedChatMessage[]
    send: (text: string) => Promise<void>
    unread: number
    isSending: boolean
  }
  /** The host chose "End call for everyone" (so the ended screen says so). */
  markEndedByMe: () => void
  /** Ending the call failed: a later disconnect isn't "ended by me". */
  unmarkEndedByMe: () => void
  endedByMe: () => boolean
}

const Ctx = createContext<CallState | null>(null)

export function useCall(): CallState {
  const v = useContext(Ctx)
  if (!v) throw new Error('useCall must be used inside <CallProvider>')
  return v
}

let noticeId = 0

export function CallProvider({
  slug,
  roomName,
  brand,
  role,
  guestKey,
  initialLobby,
  initialMediaStarting,
  endedByMeRef,
  children,
}: {
  slug: string
  roomName: string
  brand: MeetingBrand
  role: 'host' | 'guest'
  guestKey: string
  initialLobby: boolean
  initialMediaStarting: MediaStarting
  endedByMeRef: { current: boolean }
  children: ReactNode
}) {
  const [panel, setPanel] = useState<Panel>(null)
  const [layout, setLayout] = useState<LayoutMode>('auto')
  const [pinned, setPinned] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [lobbyEnabled, setLobbyEnabled] = useState(initialLobby)
  const [mediaStarting, setMediaStarting] = useState(initialMediaStarting)
  const [notices, setNotices] = useState<Notice[]>([])
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>())

  const dismiss = useCallback((id: number) => {
    setNotices((n) => n.filter((x) => x.id !== id))
    const t = timers.current.get(id)
    if (t) clearTimeout(t)
    timers.current.delete(id)
  }, [])

  const notify = useCallback(
    (text: string, tone: Notice['tone'] = 'info', action?: Notice['action']) => {
      const id = ++noticeId
      // At most three at once; newest last.
      setNotices((n) => [...n.filter((x) => x.text !== text), { id, text, tone, action }].slice(-3))
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), action ? 9000 : 5000),
      )
    },
    [dismiss],
  )

  // Chat lives here (not in the panel) so history and the unread count survive
  // the panel opening and closing.
  const { chatMessages, send, isSending } = useChat(CHAT_OPTS)
  const [readCount, setReadCount] = useState(0)
  const unread = panel === 'chat' ? 0 : Math.max(0, chatMessages.length - readCount)
  if (panel === 'chat' && readCount !== chatMessages.length) setReadCount(chatMessages.length)

  const sendChat = useCallback(
    async (text: string) => {
      await send(text)
    },
    [send],
  )

  const togglePanel = useCallback(
    (p: Exclude<Panel, null>) => setPanel((cur) => (cur === p ? null : p)),
    [],
  )

  const value = useMemo<CallState>(
    () => ({
      slug,
      roomName,
      brand,
      role,
      guestKey,
      panel,
      setPanel,
      togglePanel,
      layout,
      setLayout,
      pinned,
      setPinned,
      settingsOpen,
      setSettingsOpen,
      lobbyEnabled,
      setLobbyEnabled,
      mediaStarting,
      setMediaStarting,
      notices,
      notify,
      dismiss,
      chat: { messages: chatMessages, send: sendChat, unread, isSending },
      markEndedByMe: () => {
        endedByMeRef.current = true
      },
      unmarkEndedByMe: () => {
        endedByMeRef.current = false
      },
      endedByMe: () => endedByMeRef.current,
    }),
    [
      slug,
      roomName,
      brand,
      role,
      guestKey,
      panel,
      togglePanel,
      layout,
      pinned,
      settingsOpen,
      lobbyEnabled,
      mediaStarting,
      notices,
      notify,
      dismiss,
      chatMessages,
      sendChat,
      unread,
      isSending,
      endedByMeRef,
    ],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
