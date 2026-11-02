'use server'

import { APP_DOMAIN, buildShareUrl } from '@lmsy/shared'
import { getShareableVideoBySlug } from '@/db/queries'
import { addVideoReport, countRecentReportsByIp, countRecentReportsForVideo } from '@/db/reports'
import { listAdminEmails } from '@/db/users'
import { clientIpHash } from '@/lib/client-ip'
import { sendEmail } from '@/lib/email'
import { linkReportedEmail } from '@/lib/email-templates'
import { isReportReason, MAX_REPORT_DETAILS, reportReasonLabel } from '@/lib/report-reasons'

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
/** At most this many reports from one IP an hour, across every link. */
const RATE_MAX = 5
const RATE_WINDOW_MS = 60 * 60 * 1000
/** Admins get one email per link in this window; the rest wait in /admin. */
const ADMIN_EMAIL_DEBOUNCE_MS = 60 * 60 * 1000

export type ReportResult = { ok: true } | { ok: false; error: string }

/**
 * Report a share link to the admins. Re-resolves the slug server-side, checks
 * the input, drops honeypot hits, rate-limits by salted IP hash, stores the
 * report and emails the admins (once per link per hour) with a link to /admin.
 */
export async function reportLink(
  slug: string,
  input: { reason: string; details?: string; email?: string; website?: string },
): Promise<ReportResult> {
  // Honeypot: people never fill the hidden "website" field. Look successful so
  // a bot learns nothing, but store nothing.
  if (input?.website != null && String(input.website).trim() !== '') return { ok: true }

  const reason = input?.reason
  if (!isReportReason(reason)) return { ok: false, error: 'Choose a reason for your report.' }
  const details = String(input.details ?? '').trim()
  if (details.length > MAX_REPORT_DETAILS) {
    return { ok: false, error: `Keep the details under ${MAX_REPORT_DETAILS} characters.` }
  }
  const email = String(input.email ?? '')
    .trim()
    .toLowerCase()
  if (email && (email.length > 200 || !EMAIL_RE.test(email))) {
    return { ok: false, error: 'Check your email address, or leave it blank.' }
  }

  const video = await getShareableVideoBySlug(String(slug ?? ''))
  if (!video) return { ok: false, error: 'This recording is no longer available.' }

  const ipHash = await clientIpHash()
  if (ipHash) {
    const since = new Date(Date.now() - RATE_WINDOW_MS)
    if ((await countRecentReportsByIp(ipHash, since)) >= RATE_MAX) {
      return {
        ok: false,
        error: "You've sent several reports in the last hour. Please try again later.",
      }
    }
  }

  // Checked before saving, so the first report on a link always emails.
  const recentOnVideo = await countRecentReportsForVideo(
    video.id,
    new Date(Date.now() - ADMIN_EMAIL_DEBOUNCE_MS),
  )

  await addVideoReport({
    videoId: video.id,
    reason,
    details: details || null,
    reporterEmail: email || null,
    reporterIpHash: ipHash,
  })

  if (recentOnVideo === 0) {
    await notifyAdmins({
      videoTitle: video.title,
      businessName: video.brand.name || video.ownerName,
      reason: reportReasonLabel(reason),
      details: details || null,
      reporterEmail: email || null,
      shareUrl: buildShareUrl(slug),
    }).catch((error) => console.error('[reports] admin email failed:', error))
  }

  return { ok: true }
}

/** Email every admin about a new report. Awaited so it actually sends. */
async function notifyAdmins(opts: Omit<Parameters<typeof linkReportedEmail>[0], 'adminUrl'>) {
  const admins = await listAdminEmails()
  if (admins.length === 0) return
  const { subject, html, text } = linkReportedEmail({
    ...opts,
    adminUrl: `https://${APP_DOMAIN}/admin`,
  })
  await Promise.all(admins.map((to) => sendEmail({ to, subject, html, text })))
}
