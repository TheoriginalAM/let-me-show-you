import { APP_DOMAIN, APP_NAME } from '@lmsy/shared'

// Palette mirrors the site (near-black canvas, violet accent, muted text).
const CANVAS = '#08080c'
const CARD = '#101019'
const HEADER = '#0c0c14'
const BORDER = 'rgba(255,255,255,0.08)'
const BORDER_SOFT = 'rgba(255,255,255,0.06)'
const INK = '#f6f6fb'
const MUTED = '#9c9cb4'
const FAINT = '#6a6a80'
const ACCENT = '#6d6df5'
const ACCENT_LINK = '#8b8bf6'
const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif,'Apple Color Emoji','Segoe UI Emoji'"

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

/** Dark, brand-matched, email-client-safe layout (table + inline styles). */
function layout(opts: {
  preview: string
  heading: string
  body: string
  cta?: { label: string; url: string }
  footNote?: string
}): string {
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark"></head>
<body style="margin:0;padding:0;background:${CANVAS};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(opts.preview)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CANVAS};">
    <tr><td align="center" style="padding:36px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:${CARD};border:1px solid ${BORDER};border-radius:16px;overflow:hidden;">
        <tr><td style="padding:24px 30px;background:${HEADER};border-bottom:1px solid ${BORDER_SOFT};">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td style="padding-right:10px;vertical-align:middle;">
              <div style="width:26px;height:26px;border-radius:7px;background:${ACCENT};color:#ffffff;font-size:11px;text-align:center;line-height:26px;">&#9654;</div>
            </td>
            <td style="vertical-align:middle;color:${INK};font-family:${FONT};font-size:15px;font-weight:700;letter-spacing:0.01em;">${APP_NAME}</td>
          </tr></table>
        </td></tr>
        <tr><td style="padding:36px 30px;font-family:${FONT};">
          <h1 style="margin:0 0 14px;color:${INK};font-size:21px;font-weight:700;letter-spacing:-0.01em;line-height:1.25;">${opts.heading}</h1>
          <div style="color:${MUTED};font-size:15px;line-height:1.62;">${opts.body}</div>
          ${
            opts.cta
              ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0 4px;"><tr><td style="border-radius:11px;background:${ACCENT};box-shadow:0 8px 24px -8px rgba(109,109,245,0.7);">
                  <a href="${opts.cta.url}" style="display:inline-block;padding:13px 28px;color:#ffffff;font-family:${FONT};font-size:15px;font-weight:600;text-decoration:none;border-radius:11px;">${opts.cta.label}</a>
                </td></tr></table>`
              : ''
          }
          ${opts.footNote ? `<p style="margin:24px 0 0;color:${FAINT};font-size:12.5px;line-height:1.5;">${opts.footNote}</p>` : ''}
        </td></tr>
        <tr><td style="padding:18px 30px;border-top:1px solid ${BORDER_SOFT};font-family:${FONT};font-size:12px;color:${FAINT};">
          ${APP_NAME} &middot; <a href="https://${APP_DOMAIN}" style="color:${ACCENT_LINK};text-decoration:none;">${APP_DOMAIN}</a>
        </td></tr>
      </table>
      <p style="margin:16px 0 0;color:${FAINT};font-family:${FONT};font-size:11px;letter-spacing:0.02em;">Show, don&rsquo;t tell.</p>
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
