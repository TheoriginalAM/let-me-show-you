import { existsSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { app, safeStorage } from 'electron'

/** The API token is encrypted at rest with the OS keychain via safeStorage. */
function tokenPath(): string {
  return join(app.getPath('userData'), 'auth.bin')
}

export function loadToken(): string | null {
  try {
    const path = tokenPath()
    if (!existsSync(path) || !safeStorage.isEncryptionAvailable()) return null
    const token = safeStorage.decryptString(readFileSync(path))
    return token || null
  } catch {
    return null
  }
}

export function saveToken(token: string): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('OS secure storage is unavailable, cannot store the sign-in token')
  }
  writeFileSync(tokenPath(), safeStorage.encryptString(token))
}

export function clearToken(): void {
  try {
    rmSync(tokenPath(), { force: true })
  } catch {
    // ignore
  }
}

export function hasToken(): boolean {
  return loadToken() !== null
}
