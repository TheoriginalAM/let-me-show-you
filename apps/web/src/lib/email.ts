import 'server-only'

import { APP_NAME } from '@lmsy/shared'

const FROM_EMAIL = process.env.EMAIL_FROM ?? 'noreply@letmeshowyou.com.au'
const SENDGRID_URL = 'https://api.sendgrid.com/v3/mail/send'

interface SendArgs {
  to: string
  subject: string
  html: string
  text: string
}

/**
 * Send one transactional email via the SendGrid v3 API. Returns whether it was
 * accepted. Never throws; a failed send should not break the calling flow
 * (signup, approval, etc.). No-ops with a warning if SENDGRID_API_KEY is unset.
 */
export async function sendEmail({ to, subject, html, text }: SendArgs): Promise<boolean> {
  const key = process.env.SENDGRID_API_KEY
  if (!key) {
    console.warn(`[email] SENDGRID_API_KEY not set, skipped "${subject}" to ${to}`)
    return false
  }
  try {
    const res = await fetch(SENDGRID_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: FROM_EMAIL, name: APP_NAME },
        subject,
        // SendGrid requires text/plain BEFORE text/html.
        content: [
          { type: 'text/plain', value: text },
          { type: 'text/html', value: html },
        ],
      }),
    })
    if (!res.ok) {
      console.error(`[email] SendGrid ${res.status}: ${await res.text().catch(() => '')}`)
      return false
    }
    return true
  } catch (error) {
    console.error('[email] send failed:', error)
    return false
  }
}
