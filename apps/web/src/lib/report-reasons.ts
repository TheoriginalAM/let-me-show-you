// Why someone reported a share link. No imports: the share page's form and the
// server both use it. Stored as the key; the label is what people see.

export const REPORT_REASONS = {
  spam: 'Spam or a scam',
  harmful: 'Harmful or abusive',
  private: 'Private information',
  copyright: 'Copyright',
  other: 'Something else',
} as const

export type ReportReason = keyof typeof REPORT_REASONS

/** Most a reporter can write in the details box. */
export const MAX_REPORT_DETAILS = 1000

export function isReportReason(value: unknown): value is ReportReason {
  return typeof value === 'string' && Object.hasOwn(REPORT_REASONS, value)
}

export function reportReasonLabel(reason: string): string {
  return isReportReason(reason) ? REPORT_REASONS[reason] : reason
}
