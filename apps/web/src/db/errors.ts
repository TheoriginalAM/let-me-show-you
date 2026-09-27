/**
 * The Postgres error code behind a failed query. drizzle-orm wraps driver errors
 * in a DrizzleQueryError with the original on `.cause`, so `error.code` alone is
 * undefined (e.g. '23505' unique_violation lives at `error.cause.code`).
 */
export function pgErrorCode(error: unknown): string | undefined {
  const e = error as { code?: string; cause?: { code?: string } } | null | undefined
  return e?.cause?.code ?? e?.code
}
