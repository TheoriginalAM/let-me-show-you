import { shell } from 'electron'
import type { DevicePollResponse, DeviceStartResponse } from '@lmsy/shared'
import type { SignInStatus } from '../shared/ipc'
import { API_BASE_URL } from './config'
import { saveToken } from './token-store'

type Emit = (status: SignInStatus) => void

let cancelled = false
let running = false

function status(phase: SignInStatus['phase'], extra: Partial<SignInStatus> = {}): SignInStatus {
  return { phase, userCode: null, verificationUri: null, message: null, ...extra }
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

export function cancelSignIn(): void {
  cancelled = true
}

/**
 * OAuth device-grant style sign-in: start the flow, open the browser for the
 * user to approve, then poll until a long-lived API token is issued (stored
 * encrypted). Progress is reported via `emit`.
 */
export async function runSignIn(emit: Emit): Promise<boolean> {
  if (running) return false
  running = true
  cancelled = false
  emit(status('starting'))

  try {
    const startRes = await fetch(`${API_BASE_URL}/api/auth/device/start`, { method: 'POST' })
    if (!startRes.ok) throw new Error(`Could not start sign-in (${startRes.status})`)
    const start = (await startRes.json()) as DeviceStartResponse

    await shell.openExternal(start.verificationUriComplete)
    emit(status('waiting', { userCode: start.userCode, verificationUri: start.verificationUri }))

    const deadline = Date.now() + start.expiresInSeconds * 1000
    const intervalMs = Math.max(1000, start.intervalSeconds * 1000)

    while (Date.now() < deadline) {
      if (cancelled) {
        emit(status('idle'))
        return false
      }
      await sleep(intervalMs)
      if (cancelled) {
        emit(status('idle'))
        return false
      }

      const pollRes = await fetch(`${API_BASE_URL}/api/auth/device/poll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceCode: start.deviceCode }),
      })
      if (pollRes.status === 410) throw new Error('The sign-in code expired — please try again.')
      if (!pollRes.ok) continue

      const poll = (await pollRes.json()) as DevicePollResponse
      if (poll.status === 'approved') {
        saveToken(poll.token)
        emit(status('success'))
        return true
      }
      // still pending → keep polling
    }
    throw new Error('Sign-in timed out — please try again.')
  } catch (error) {
    emit(status('error', { message: error instanceof Error ? error.message : String(error) }))
    return false
  } finally {
    running = false
  }
}
