import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'

/**
 * Tiny non-secret settings persisted as JSON in userData. (Secrets like the API
 * token live in token-store.ts, encrypted via safeStorage.)
 */
interface Settings {
  onboardingComplete?: boolean
}

function settingsPath(): string {
  return join(app.getPath('userData'), 'settings.json')
}

function read(): Settings {
  try {
    const path = settingsPath()
    if (!existsSync(path)) return {}
    return JSON.parse(readFileSync(path, 'utf8')) as Settings
  } catch {
    return {}
  }
}

function write(settings: Settings): void {
  try {
    writeFileSync(settingsPath(), JSON.stringify(settings, null, 2), 'utf8')
  } catch (error) {
    console.error('[settings] write failed:', error)
  }
}

export function getOnboardingComplete(): boolean {
  return read().onboardingComplete === true
}

export function setOnboardingComplete(value: boolean): void {
  write({ ...read(), onboardingComplete: value })
}
