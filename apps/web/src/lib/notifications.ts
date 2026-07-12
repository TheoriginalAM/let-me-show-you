import 'server-only'

import { APP_DOMAIN } from '@lmsy/shared'
// Relative imports so this stays resolvable from the Better Auth config graph.
import { listAdminEmails } from '../db/users'
import { sendEmail } from './email'
import {
  adminSignupAlertEmail,
  approvalEmail,
  approvedEmail,
  commentReplyEmail,
  newCommentEmail,
  workspaceInviteEmail,
} from './email-templates'

/** Email every admin that a new (pending) user just signed up. Best-effort. */
export async function notifyAdminsOfSignup(u: {
  name?: string | null
  email: string
}): Promise<void> {
  const admins = await listAdminEmails()
  if (admins.length === 0) return
  const { subject, html, text } = adminSignupAlertEmail({
    name: u.name ?? u.email,
    email: u.email,
    adminUrl: `https://${APP_DOMAIN}/admin`,
  })
  await Promise.all(admins.map((to) => sendEmail({ to, subject, html, text })))
}

/** Email a user that their account was approved. Best-effort. */
export async function notifyUserApproved(u: { name: string; email: string }): Promise<void> {
  const { subject, html, text } = approvedEmail({
    name: u.name,
    loginUrl: `https://${APP_DOMAIN}/login`,
  })
  await sendEmail({ to: u.email, subject, html, text })
}

/** Email someone that they've been invited to a workspace. Returns whether it sent. */
export async function notifyWorkspaceInvite(opts: {
  email: string
  workspaceName: string
  inviterName: string
  url: string
}): Promise<boolean> {
  const { subject, html, text } = workspaceInviteEmail({
    workspaceName: opts.workspaceName,
    inviterName: opts.inviterName,
    url: opts.url,
  })
  return sendEmail({ to: opts.email, subject, html, text })
}

/** Email a commenter that someone replied to them. Returns whether it sent. */
export async function notifyCommentReply(opts: {
  email: string
  replierName: string
  videoTitle: string
  body: string
  url: string
}): Promise<boolean> {
  const { subject, html, text } = commentReplyEmail({
    replierName: opts.replierName,
    videoTitle: opts.videoTitle,
    body: opts.body,
    url: opts.url,
  })
  return sendEmail({ to: opts.email, subject, html, text })
}

/** Email a video owner that a client approved / requested changes. Returns whether it sent. */
export async function notifyApproval(opts: {
  ownerEmail: string
  approverName: string
  status: 'approved' | 'changes'
  videoTitle: string
  note: string | null
  url: string
}): Promise<boolean> {
  const { subject, html, text } = approvalEmail({
    approverName: opts.approverName,
    status: opts.status,
    videoTitle: opts.videoTitle,
    note: opts.note,
    url: opts.url,
  })
  return sendEmail({ to: opts.ownerEmail, subject, html, text })
}

/** Email a video owner that someone left a comment on their recording. Best-effort. */
export async function notifyOwnerOfComment(opts: {
  ownerEmail: string
  videoTitle: string
  authorName: string
  body: string
  shareUrl: string
}): Promise<void> {
  const { subject, html, text } = newCommentEmail({
    authorName: opts.authorName,
    videoTitle: opts.videoTitle,
    body: opts.body,
    shareUrl: opts.shareUrl,
  })
  await sendEmail({ to: opts.ownerEmail, subject, html, text })
}
