// Runs once when the server starts (Next.js instrumentation hook).
export async function register(): Promise<void> {
  // Node server only (this branch is compiled out of the edge build).
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./instrumentation-node')
  }
}
