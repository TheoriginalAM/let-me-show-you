import type { IconName } from '@/components/brand/icons'

export type SectionId = 'recordings' | 'meetings' | 'booking' | 'branding' | 'team'

/** The dashboard's areas, each with its own highlighter colour. */
export const SECTIONS: Record<
  SectionId,
  { href: string; label: string; color: string; icon: IconName; ownerOnly?: boolean }
> = {
  recordings: {
    href: '/dashboard',
    label: 'Recordings',
    color: 'var(--color-hl-pink)',
    icon: 'recordings',
  },
  meetings: {
    href: '/dashboard/rooms',
    label: 'Meeting rooms',
    color: 'var(--color-hl-sky)',
    icon: 'meetings',
  },
  booking: {
    href: '/dashboard/booking',
    label: 'Booking',
    color: 'var(--color-hl-green)',
    icon: 'booking',
  },
  branding: {
    href: '/dashboard/branding',
    label: 'Branding',
    color: 'var(--color-hl-yellow)',
    icon: 'branding',
    ownerOnly: true,
  },
  team: {
    href: '/dashboard/workspace',
    label: 'Business & team',
    color: 'var(--color-hl-orange)',
    icon: 'team',
    ownerOnly: true,
  },
}
