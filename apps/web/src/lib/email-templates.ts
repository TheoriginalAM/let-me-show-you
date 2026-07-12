import { APP_DOMAIN, APP_NAME } from '@lmsy/shared'

const ACCENT = '#6d6df5'

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

/** Shared, email-client-safe branded layout (inline styles + table layout). */
function layout(opts: {
  heading: string
  body: string
  cta?: { label: string; url: string }
  footNote?: string
}): string {
  return `<!doctype html><html><body style="margin:0;background:#f4f4f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1a1a24;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:480px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(20,20,40,0.08);">
        <tr><td style="background:#0a0a0f;padding:22px 28px;">
          <span style="color:#ffffff;font-size:16px;font-weight:700;letter-spacing:0.01em;">▶&nbsp;${APP_NAME}</span>
        </td></tr>
        <tr><td style="padding:32px 28px;">
          <h1 style="margin:0 0 12px;font-size:20px;font-weight:700;color:#14141c;">${opts.heading}</h1>
          <div style="font-size:15px;line-height:1.55;color:#4a4a5a;">${opts.body}</div>
          ${
            opts.cta
              ? `<div style="margin:26px 0 6px;"><a href="${opts.cta.url}" style="display:inline-block;background:${ACCENT};color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:10px;">${opts.cta.label}</a></div>`
              : ''
          }
          ${opts.footNote ? `<p style="margin:20px 0 0;font-size:12.5px;color:#9a9aab;">${opts.footNote}</p>` : ''}
        </td></tr>
        <tr><td style="padding:18px 28px;border-top:1px solid #ececf2;font-size:12px;color:#9a9aab;">
          ${APP_NAME} · <a href="https://${APP_DOMAIN}" style="color:#9a9aab;text-decoration:underline;">${APP_DOMAIN}</a>
        </td></tr>
      </table>
    </td></tr>
  </table></body></html>`
}

export function magicLinkEmail(url: string) {
  return {
    subject: `Your ${APP_NAME} sign-in link`,
    html: layout({
      heading: `Sign in to ${APP_NAME}`,
      body: 'Click the button below to sign in. This link works once and expires shortly.',
      cta: { label: 'Sign in', url },
      footNote: "If you didn't request this, you can safely ignore this email.",
    }),
    text: `Sign in to ${APP_NAME}:\n${url}\n\nThis link works once and expires shortly. If you didn't request it, ignore this email.`,
  }
}

export function adminSignupAlertEmail(opts: { name: string; email: string; adminUrl: string }) {
  return {
    subject: `New signup awaiting approval — ${opts.email}`,
    html: layout({
      heading: 'Someone new signed up',
      body: `<strong>${escapeHtml(opts.name)}</strong> (${escapeHtml(opts.email)}) just created an account and is waiting for your approval.`,
      cta: { label: 'Review in admin', url: opts.adminUrl },
    }),
    text: `${opts.name} (${opts.email}) signed up and is awaiting approval.\nReview: ${opts.adminUrl}`,
  }
}

export function approvedEmail(opts: { name: string; loginUrl: string }) {
  return {
    subject: `You're approved — welcome to ${APP_NAME}`,
    html: layout({
      heading: `You're in, ${escapeHtml(firstName(opts.name))}`,
      body: `Your ${APP_NAME} account has been approved. You can now sign in, record your screen, and share recordings with a single link.`,
      cta: { label: 'Sign in', url: opts.loginUrl },
    }),
    text: `Your ${APP_NAME} account has been approved. Sign in: ${opts.loginUrl}`,
  }
}
