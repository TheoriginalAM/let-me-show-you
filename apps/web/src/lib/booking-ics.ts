// Calendar invites (.ics, RFC 5545) for bookings. A REQUEST adds or moves the
// event in the guest's calendar; a CANCEL with the same UID and a higher
// SEQUENCE removes it.

function icsDate(instant: number): string {
  return new Date(instant).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

function escapeText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

/** Quote a parameter value (CN="..."); quotes aren't allowed inside, so drop them. */
function paramValue(s: string): string {
  return `"${s.replace(/["\r\n]/g, '')}"`
}

/** Lines longer than 75 octets continue on the next line after a space. */
function fold(line: string): string {
  const bytes = new TextEncoder().encode(line)
  if (bytes.length <= 75) return line
  const out: string[] = []
  let current = ''
  let size = 0
  for (const ch of line) {
    const n = new TextEncoder().encode(ch).length
    if (size + n > (out.length ? 74 : 75)) {
      out.push(current)
      current = ''
      size = 0
    }
    current += ch
    size += n
  }
  out.push(current)
  return out.join('\r\n ')
}

export interface IcsEvent {
  method: 'REQUEST' | 'CANCEL'
  uid: string
  sequence: number
  start: number
  end: number
  title: string
  description: string
  url: string
  organizer: { name: string; email: string }
  attendee: { name: string; email: string }
}

export function buildIcs(e: IcsEvent): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Let Me Show You//Bookings//EN',
    'CALSCALE:GREGORIAN',
    `METHOD:${e.method}`,
    'BEGIN:VEVENT',
    `UID:${e.uid}`,
    `SEQUENCE:${e.sequence}`,
    `DTSTAMP:${icsDate(Date.now())}`,
    `DTSTART:${icsDate(e.start)}`,
    `DTEND:${icsDate(e.end)}`,
    `SUMMARY:${escapeText(e.title)}`,
    `DESCRIPTION:${escapeText(e.description)}`,
    `LOCATION:${escapeText(e.url)}`,
    `URL:${e.url}`,
    `ORGANIZER;CN=${paramValue(e.organizer.name)}:mailto:${e.organizer.email}`,
    `ATTENDEE;CN=${paramValue(e.attendee.name)};ROLE=REQ-PARTICIPANT;PARTSTAT=${
      e.method === 'CANCEL' ? 'DECLINED' : 'ACCEPTED'
    };RSVP=FALSE:mailto:${e.attendee.email}`,
    `STATUS:${e.method === 'CANCEL' ? 'CANCELLED' : 'CONFIRMED'}`,
    'TRANSP:OPAQUE',
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  return lines.map(fold).join('\r\n') + '\r\n'
}

/** A "add to Google Calendar" link for the same event. */
export function googleCalendarUrl(e: Pick<IcsEvent, 'start' | 'end' | 'title' | 'description' | 'url'>): string {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: e.title,
    dates: `${icsDate(e.start)}/${icsDate(e.end)}`,
    details: `${e.description}\n\n${e.url}`,
    location: e.url,
  })
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}
