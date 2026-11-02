import { APP_DOMAIN, APP_NAME } from '@lmsy/shared'
import { onColor, pressedEdge, readableOnWhite } from './brand-theme'

// Palette mirrors the site: a light lilac canvas, white card with an ink
// outline, ink text, one electric blue-violet.
const CANVAS = '#f4f3fb'
const CARD = '#ffffff'
const HEADER = '#f6f5fc' // quote boxes and soft panels
const OUTLINE = '#17132b'
const BORDER_SOFT = '#e3e0f0'
const INK = '#17132b'
const MUTED = '#524d69'
const FAINT = '#696482'
const ACCENT = '#4f3cff'
const ACCENT_LINK = '#3a27f0'
const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif,'Apple Color Emoji','Segoe UI Emoji'"

/** Whose email this is: Let Me Show You, or a business (booking emails). */
export interface EmailBrand {
  name: string
  /** An absolute image URL (emails can't show inline data). */
  logoUrl: string | null
  accent: string
  /** Business emails say who sent them on their behalf. */
  business: boolean
}

export const LMSY_EMAIL_BRAND: EmailBrand = {
  name: APP_NAME,
  logoUrl: `https://${APP_DOMAIN}/brand/mark.png`,
  accent: ACCENT,
  business: false,
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name
}

function brandHeader(brand: EmailBrand): string {
  const name = escapeHtml(brand.name)
  if (brand.business && brand.logoUrl) {
    return `<img src="${escapeHtml(brand.logoUrl)}" alt="${name}" height="40" style="display:block;height:40px;width:auto;max-width:220px;border:0;">`
  }
  const mark = brand.logoUrl
    ? `<img src="${escapeHtml(brand.logoUrl)}" alt="" width="30" height="30" style="display:block;width:30px;height:30px;border:0;border-radius:8px;">`
    : `<div style="width:30px;height:30px;border-radius:8px;background:${brand.accent};color:${onColor(brand.accent) === '#ffffff' ? '#ffffff' : INK};font-family:${FONT};font-size:14px;font-weight:800;text-align:center;line-height:30px;">${escapeHtml(brand.name.charAt(0).toUpperCase())}</div>`
  return `<table role="presentation" cellpadding="0" cellspacing="0"><tr>
    <td style="padding-right:10px;vertical-align:middle;">${mark}</td>
    <td style="vertical-align:middle;color:${INK};font-family:${FONT};font-size:16px;font-weight:800;letter-spacing:-0.01em;">${name}</td>
  </tr></table>`
}

/** Light, brand-matched, email-client-safe layout (table + inline styles). */
function layout(opts: {
  preview: string
  heading: string
  body: string
  cta?: { label: string; url: string }
  footNote?: string
  brand?: EmailBrand
}): string {
  const brand = opts.brand ?? LMSY_EMAIL_BRAND
  const button = brand.accent
  const buttonText = onColor(button) === '#ffffff' ? '#ffffff' : INK
  const footer = brand.business
    ? `Sent for ${escapeHtml(brand.name)} by ${APP_NAME}`
    : `${APP_NAME} &middot; <a href="https://${APP_DOMAIN}" style="color:${ACCENT_LINK};text-decoration:none;">${APP_DOMAIN}</a>`
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"></head>
<body style="margin:0;padding:0;background:${CANVAS};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(opts.preview)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CANVAS};">
    <tr><td align="center" style="padding:36px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:500px;background:${CARD};border:2px solid ${OUTLINE};border-radius:18px;overflow:hidden;">
        <tr><td style="padding:22px 30px;border-bottom:1px solid ${BORDER_SOFT};">${brandHeader(brand)}</td></tr>
        <tr><td style="padding:32px 30px 34px;font-family:${FONT};">
          <h1 style="margin:0 0 14px;color:${INK};font-size:23px;font-weight:800;letter-spacing:-0.02em;line-height:1.2;">${opts.heading}</h1>
          <div style="color:${MUTED};font-size:15px;line-height:1.62;">${opts.body}</div>
          ${
            opts.cta
              ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0 4px;"><tr><td style="border-radius:12px;background:${button};border-bottom:3px solid ${pressedEdge(button)};">
                  <a href="${opts.cta.url}" style="display:inline-block;padding:13px 28px;color:${buttonText};font-family:${FONT};font-size:15px;font-weight:700;text-decoration:none;border-radius:12px;">${opts.cta.label}</a>
                </td></tr></table>`
              : ''
          }
          ${opts.footNote ? `<p style="margin:24px 0 0;color:${FAINT};font-size:12.5px;line-height:1.5;">${opts.footNote}</p>` : ''}
        </td></tr>
        <tr><td style="padding:16px 30px;background:${HEADER};border-top:1px solid ${BORDER_SOFT};font-family:${FONT};font-size:12px;color:${FAINT};">${footer}</td></tr>
      </table>
      ${brand.business ? '' : `<p style="margin:16px 0 0;color:${FAINT};font-family:${FONT};font-size:11px;">Show, don&rsquo;t tell.</p>`}
    </td></tr>
  </table>
</body>
</html>`
}

export function magicLinkEmail(url: string) {
  return {
    subject: `Your ${APP_NAME} sign-in link`,
    html: layout({
      preview: `Your secure sign-in link for ${APP_NAME}.`,
      heading: `Sign in to ${APP_NAME}`,
      body: 'Tap the button below to sign in. For your security, this link signs in one time only and expires shortly.',
      cta: { label: 'Sign in', url },
      footNote: "Didn't try to sign in? You can safely ignore this email and nothing will happen.",
    }),
    text: `Sign in to ${APP_NAME}\n\n${url}\n\nThis link signs in one time only and expires shortly. If you didn't request it, you can ignore this email.`,
  }
}

export function adminSignupAlertEmail(opts: { name: string; email: string; adminUrl: string }) {
  return {
    subject: `New signup waiting for your approval`,
    html: layout({
      preview: `${opts.name} just signed up and needs approval.`,
      heading: 'Someone new signed up',
      body: `<strong style="color:${INK};">${escapeHtml(opts.name)}</strong> (${escapeHtml(opts.email)}) just created an account. They cannot record or share anything until you approve them.`,
      cta: { label: 'Review in admin', url: opts.adminUrl },
    }),
    text: `${opts.name} (${opts.email}) just signed up and is waiting for your approval.\n\nReview them here: ${opts.adminUrl}`,
  }
}

export function newCommentEmail(opts: {
  authorName: string
  videoTitle: string
  body: string
  shareUrl: string
}) {
  return {
    subject: `New comment on "${opts.videoTitle}"`,
    html: layout({
      preview: `${opts.authorName} left a comment on ${opts.videoTitle}.`,
      heading: 'New comment on your recording',
      body: `<strong style="color:${INK};">${escapeHtml(opts.authorName)}</strong> commented on <strong style="color:${INK};">${escapeHtml(opts.videoTitle)}</strong>:<div style="margin:16px 0 0;padding:14px 16px;background:${HEADER};border:1px solid ${BORDER_SOFT};border-radius:10px;color:${INK};font-size:14px;line-height:1.55;white-space:pre-wrap;">${escapeHtml(opts.body)}</div>`,
      cta: { label: 'View the thread', url: opts.shareUrl },
    }),
    text: `${opts.authorName} commented on "${opts.videoTitle}":\n\n${opts.body}\n\nView the thread: ${opts.shareUrl}`,
  }
}

export function resetPasswordEmail(url: string) {
  return {
    subject: `Reset your ${APP_NAME} password`,
    html: layout({
      preview: `Reset your ${APP_NAME} password.`,
      heading: 'Reset your password',
      body: 'Tap the button below to choose a new password. If you did not request this, you can ignore this email and your password stays the same.',
      cta: { label: 'Reset password', url },
      footNote: 'For your security, this link expires shortly.',
    }),
    text: `Reset your ${APP_NAME} password:\n\n${url}\n\nIf you did not request this, you can ignore this email.`,
  }
}

export function commentReplyEmail(opts: {
  replierName: string
  videoTitle: string
  body: string
  url: string
}) {
  return {
    subject: `${opts.replierName} replied to your comment`,
    html: layout({
      preview: `${opts.replierName} replied on ${opts.videoTitle}.`,
      heading: 'You have a reply',
      body: `<strong style="color:${INK};">${escapeHtml(opts.replierName)}</strong> replied to your comment on <strong style="color:${INK};">${escapeHtml(opts.videoTitle)}</strong>:<div style="margin:16px 0 0;padding:14px 16px;background:${HEADER};border:1px solid ${BORDER_SOFT};border-radius:10px;color:${INK};font-size:14px;line-height:1.55;white-space:pre-wrap;">${escapeHtml(opts.body)}</div>`,
      cta: { label: 'View the thread', url: opts.url },
    }),
    text: `${opts.replierName} replied to your comment on "${opts.videoTitle}":\n\n${opts.body}\n\nView the thread: ${opts.url}`,
  }
}

export function approvalEmail(opts: {
  approverName: string
  status: 'approved' | 'changes'
  videoTitle: string
  note: string | null
  url: string
}) {
  const approved = opts.status === 'approved'
  const verb = approved ? 'approved' : 'requested changes on'
  return {
    subject: approved
      ? `${opts.approverName} approved "${opts.videoTitle}"`
      : `${opts.approverName} requested changes on "${opts.videoTitle}"`,
    html: layout({
      preview: `${opts.approverName} ${verb} ${opts.videoTitle}.`,
      heading: approved ? 'Approved' : 'Changes requested',
      body: `<strong style="color:${INK};">${escapeHtml(opts.approverName)}</strong> ${verb} <strong style="color:${INK};">${escapeHtml(opts.videoTitle)}</strong>.${
        opts.note
          ? `<div style="margin:16px 0 0;padding:14px 16px;background:${HEADER};border:1px solid ${BORDER_SOFT};border-radius:10px;color:${INK};font-size:14px;line-height:1.55;white-space:pre-wrap;">${escapeHtml(opts.note)}</div>`
          : ''
      }`,
      cta: { label: 'Open the recording', url: opts.url },
    }),
    text: `${opts.approverName} ${verb} "${opts.videoTitle}".${opts.note ? `\n\nNote: ${opts.note}` : ''}\n\n${opts.url}`,
  }
}

export function workspaceInviteEmail(opts: {
  workspaceName: string
  inviterName: string
  url: string
}) {
  return {
    subject: `You're invited to ${opts.workspaceName} on ${APP_NAME}`,
    html: layout({
      preview: `${opts.inviterName} invited you to ${opts.workspaceName}.`,
      heading: `Join ${escapeHtml(opts.workspaceName)}`,
      body: `<strong style="color:${INK};">${escapeHtml(opts.inviterName)}</strong> invited you to collaborate in the <strong style="color:${INK};">${escapeHtml(opts.workspaceName)}</strong> workspace on ${APP_NAME}. Accept to see and add recordings there.`,
      cta: { label: 'Accept invite', url: opts.url },
      footNote: "If you weren't expecting this, you can safely ignore this email.",
    }),
    text: `${opts.inviterName} invited you to ${opts.workspaceName} on ${APP_NAME}.\n\nAccept: ${opts.url}`,
  }
}

export function meetingInviteEmail(opts: {
  inviterName: string
  roomName: string
  workspaceName: string
  url: string
}) {
  return {
    subject: `${opts.inviterName} invited you to a video meeting`,
    html: layout({
      preview: `Join ${opts.roomName} with ${opts.inviterName}.`,
      heading: `Join ${escapeHtml(opts.roomName)}`,
      body: `<strong style="color:${INK};">${escapeHtml(opts.inviterName)}</strong> from <strong style="color:${INK};">${escapeHtml(opts.workspaceName)}</strong> invited you to a video meeting. It runs in your browser, so there's nothing to install.`,
      cta: { label: 'Join meeting', url: opts.url },
      footNote: 'Open the link at meeting time. The host may need to let you in.',
    }),
    text: `${opts.inviterName} from ${opts.workspaceName} invited you to a video meeting (${opts.roomName}).\n\nJoin: ${opts.url}`,
  }
}

export function approvedEmail(opts: { name: string; loginUrl: string }) {
  return {
    subject: `You're approved. Welcome to ${APP_NAME}`,
    html: layout({
      preview: `Your ${APP_NAME} account is ready.`,
      heading: `You're in, ${escapeHtml(firstName(opts.name))}`,
      body: `Your ${APP_NAME} account has been approved. You can now sign in, record your screen with voiceover, and share it with anyone using a single link.`,
      cta: { label: 'Sign in and record', url: opts.loginUrl },
    }),
    text: `You're in, ${firstName(opts.name)}.\n\nYour ${APP_NAME} account has been approved. Sign in and start recording: ${opts.loginUrl}`,
  }
}

/** Label/value rows for booking details (email-safe table). */
function detailRows(rows: [string, string | null | undefined][]): string {
  const body = rows
    .filter(([, v]) => v)
    .map(
      ([label, value]) =>
        `<tr><td style="padding:6px 14px 6px 0;color:${FAINT};font-size:13px;vertical-align:top;white-space:nowrap;">${escapeHtml(label)}</td><td style="padding:6px 0;color:${INK};font-size:14px;line-height:1.5;">${escapeHtml(String(value)).replace(/\n/g, '<br>')}</td></tr>`,
    )
    .join('')
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:18px 0 0;border-top:1px solid ${BORDER_SOFT};padding-top:8px;">${body}</table>`
}

function textRows(rows: [string, string | null | undefined][]): string {
  return rows
    .filter(([, v]) => v)
    .map(([label, value]) => `${label}: ${value}`)
    .join('\n')
}

/** To the client who booked: it's confirmed (or moved), with join + manage links. */
export function bookingConfirmedEmail(opts: {
  guestName: string
  businessName: string
  title: string
  when: string
  duration: string
  hostName: string | null
  joinUrl: string
  manageUrl: string
  googleUrl: string
  rescheduled: boolean
  message: string | null
  brand: EmailBrand
}) {
  const rows: [string, string | null][] = [
    ['What', opts.title],
    ['When', opts.when],
    ['Length', opts.duration],
    [
      'With',
      opts.hostName && opts.hostName !== opts.businessName
        ? `${opts.hostName}, ${opts.businessName}`
        : opts.businessName,
    ],
    ['Where', 'Video call in your browser (link below)'],
  ]
  const verb = opts.rescheduled ? 'moved' : 'booked'
  const link = readableOnWhite(opts.brand.accent)
  const note = opts.message
    ? `<div style="margin:18px 0 0;padding:14px 16px;background:${HEADER};border-left:4px solid ${opts.brand.accent};border-radius:10px;color:${INK};font-size:14.5px;line-height:1.55;white-space:pre-wrap;">${escapeHtml(opts.message)}</div>`
    : ''
  return {
    subject: `${opts.rescheduled ? 'Updated' : 'Confirmed'}: ${opts.title} with ${opts.businessName}`,
    html: layout({
      preview: `${opts.when}. ${opts.title} with ${opts.businessName}.`,
      heading: `You're ${verb}, ${escapeHtml(firstName(opts.guestName))}`,
      body: `Your ${escapeHtml(opts.title)} with <strong style="color:${INK};">${escapeHtml(opts.businessName)}</strong> is ${opts.rescheduled ? 'now' : 'confirmed'}. A calendar invite is attached.${note}${detailRows(rows)}<p style="margin:18px 0 0;font-size:13.5px;"><a href="${escapeHtml(opts.googleUrl)}" style="color:${link};text-decoration:none;font-weight:600;">Add to Google Calendar</a> &middot; <a href="${opts.manageUrl}" style="color:${link};text-decoration:none;font-weight:600;">Reschedule or cancel</a></p>`,
      cta: { label: 'Join the call', url: opts.joinUrl },
      brand: opts.brand,
      footNote:
        'Open the join link at meeting time. It runs in your browser, so there is nothing to install. The host will let you in.',
    }),
    text: `You're ${verb}, ${firstName(opts.guestName)}.${opts.message ? `\n\n${opts.message}` : ''}\n\n${textRows(rows)}\n\nJoin: ${opts.joinUrl}\nReschedule or cancel: ${opts.manageUrl}`,
  }
}

/** To the host: someone booked (or moved) a time with them. */
export function bookingHostEmail(opts: {
  hostName: string
  businessName: string
  title: string
  when: string
  guestName: string
  guestEmail: string
  notes: string | null
  answers: { label: string; value: string }[]
  previousWhen: string | null
  joinUrl: string
  dashboardUrl: string
}) {
  const rows: [string, string | null][] = [
    ['What', opts.title],
    ['When', opts.when],
    ['Was', opts.previousWhen],
    ['Who', `${opts.guestName} (${opts.guestEmail})`],
    ['Notes', opts.notes],
    ...opts.answers.map((a): [string, string] => [a.label, a.value]),
    ['Business', opts.businessName],
  ]
  const moved = Boolean(opts.previousWhen)
  return {
    subject: `${moved ? 'Rescheduled' : 'New booking'}: ${opts.guestName}, ${opts.when}`,
    html: layout({
      preview: `${opts.guestName} ${moved ? 'moved' : 'booked'} ${opts.title}.`,
      heading: moved
        ? `${escapeHtml(opts.guestName)} moved their booking`
        : `New booking from ${escapeHtml(opts.guestName)}`,
      body: `Hi ${escapeHtml(firstName(opts.hostName))}, ${moved ? 'a booking has a new time' : 'you have a new booking'}. A calendar invite is attached.${detailRows(rows)}<p style="margin:18px 0 0;font-size:13.5px;"><a href="${opts.dashboardUrl}" style="color:${ACCENT_LINK};text-decoration:none;">See all bookings</a></p>`,
      cta: { label: 'Open the meeting room', url: opts.joinUrl },
      footNote: 'Reply to this email to reach them directly.',
    }),
    text: `${moved ? 'Rescheduled booking' : 'New booking'}.\n\n${textRows(rows)}\n\nRoom: ${opts.joinUrl}\nAll bookings: ${opts.dashboardUrl}`,
  }
}

/** To either side: a booking was cancelled. */
export function bookingCancelledEmail(opts: {
  recipientName: string
  businessName: string
  title: string
  when: string
  cancelledBy: string
  reason: string | null
  rebookUrl: string | null
  /** The business's look when emailing its client; Let Me Show You's for the host. */
  brand?: EmailBrand
}) {
  const rows: [string, string | null][] = [
    ['What', opts.title],
    ['When', opts.when],
    ['Cancelled by', opts.cancelledBy],
    ['Reason', opts.reason],
  ]
  return {
    subject: `Cancelled: ${opts.title}, ${opts.when}`,
    html: layout({
      preview: `${opts.title} on ${opts.when} was cancelled.`,
      heading: 'Booking cancelled',
      body: `Hi ${escapeHtml(firstName(opts.recipientName))}, this booking with <strong style="color:${INK};">${escapeHtml(opts.businessName)}</strong> has been cancelled, and the meeting link no longer works.${detailRows(rows)}`,
      cta: opts.rebookUrl ? { label: 'Book a new time', url: opts.rebookUrl } : undefined,
      brand: opts.brand,
    }),
    text: `Booking cancelled.\n\n${textRows(rows)}${opts.rebookUrl ? `\n\nBook a new time: ${opts.rebookUrl}` : ''}`,
  }
}

/** To the client: their call is tomorrow, or in an hour. */
export function bookingReminderEmail(opts: {
  guestName: string
  businessName: string
  title: string
  when: string
  hostName: string | null
  joinUrl: string
  soon: 'day' | 'hour'
  brand: EmailBrand
}) {
  const lead = opts.soon === 'hour' ? 'starts in about an hour' : 'is coming up tomorrow'
  const rows: [string, string | null][] = [
    ['What', opts.title],
    ['When', opts.when],
    [
      'With',
      opts.hostName && opts.hostName !== opts.businessName
        ? `${opts.hostName}, ${opts.businessName}`
        : opts.businessName,
    ],
  ]
  return {
    subject: `${opts.soon === 'hour' ? 'In an hour' : 'Tomorrow'}: ${opts.title} with ${opts.businessName}`,
    html: layout({
      preview: `Your ${opts.title} ${lead}. ${opts.when}.`,
      heading: `See you ${opts.soon === 'hour' ? 'soon' : 'tomorrow'}, ${escapeHtml(firstName(opts.guestName))}`,
      body: `Your ${escapeHtml(opts.title)} with <strong style="color:${INK};">${escapeHtml(opts.businessName)}</strong> ${lead}.${detailRows(rows)}<p style="margin:18px 0 0;font-size:13.5px;">Can&rsquo;t make it? Use the reschedule link in your booking confirmation email.</p>`,
      cta: { label: 'Join the call', url: opts.joinUrl },
      footNote:
        'The link opens in your browser, so there is nothing to install. The host will let you in.',
      brand: opts.brand,
    }),
    text: `Your ${opts.title} with ${opts.businessName} ${lead}.\n\n${textRows(rows)}\n\nJoin: ${opts.joinUrl}\nTo reschedule or cancel, use the link in your booking confirmation email.`,
  }
}
