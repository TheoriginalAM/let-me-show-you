// Backdrops a business can give a meeting room: what guests see while they set
// up their camera and wait to be let in. No imports: used on both sides.

export interface RoomBackground {
  id: string
  label: string
  css: string
}

export const ROOM_BACKGROUNDS: RoomBackground[] = [
  {
    id: 'midnight',
    label: 'Midnight',
    css: 'radial-gradient(70% 60% at 20% 0%, rgb(79 60 255 / 0.45), transparent 70%), radial-gradient(60% 60% at 100% 100%, rgb(255 95 162 / 0.22), transparent 70%), #12101f',
  },
  {
    id: 'electric',
    label: 'Electric',
    css: 'linear-gradient(135deg, #4f3cff 0%, #8a3cff 45%, #ff5fa2 100%)',
  },
  {
    id: 'sunset',
    label: 'Sunset',
    css: 'linear-gradient(140deg, #ff8f2e 0%, #ff5fa2 55%, #8a3cff 100%)',
  },
  {
    id: 'lagoon',
    label: 'Lagoon',
    css: 'linear-gradient(135deg, #0b6bff 0%, #38bdff 45%, #2fd98a 100%)',
  },
  { id: 'citrus', label: 'Citrus', css: 'linear-gradient(135deg, #ffe14a 0%, #ff8f2e 100%)' },
  {
    id: 'forest',
    label: 'Forest',
    css: 'linear-gradient(160deg, #0f3d2e 0%, #126b4a 50%, #2fd98a 130%)',
  },
  { id: 'graphite', label: 'Graphite', css: 'linear-gradient(160deg, #2a2733 0%, #121016 100%)' },
]

export const DEFAULT_ROOM_BACKGROUND = 'midnight'

/** The CSS background for a room: its photo, a preset, or the default. */
export function roomBackgroundCss(
  background: string | null | undefined,
  imageUrl: string | null | undefined,
): string {
  if (background === 'image' && imageUrl) {
    return `linear-gradient(rgb(18 16 31 / 0.35), rgb(18 16 31 / 0.55)), url("${imageUrl}") center / cover no-repeat, #12101f`
  }
  const preset = ROOM_BACKGROUNDS.find((b) => b.id === background) ?? ROOM_BACKGROUNDS[0]!
  return preset.css
}

export function isRoomBackground(value: unknown): boolean {
  return value === 'image' || ROOM_BACKGROUNDS.some((b) => b.id === value)
}
