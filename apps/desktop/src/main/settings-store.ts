import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import type { GuardrailConfig, WebcamConfig, WebcamShape, WebcamSize } from '../shared/ipc'

/**
 * Tiny non-secret settings persisted as JSON in userData. (Secrets like the API
 * token live in token-store.ts, encrypted via safeStorage.)
 */
interface Settings {
  onboardingComplete?: boolean
  webcamShape?: WebcamShape
  webcamSize?: WebcamSize
  countdownSeconds?: number
  autoStopMinutes?: number
}

const DEFAULT_WEBCAM: WebcamConfig = { shape: 'square', size: 'large' }
// A 3-second countdown by default (expected for screen recorders); auto-stop off.
const DEFAULT_GUARDRAILS: GuardrailConfig = { countdownSeconds: 3, autoStopMinutes: 0 }
const ALLOWED_COUNTDOWN = [0, 3, 5, 10]
const ALLOWED_AUTOSTOP = [0, 5, 10, 15, 30, 60]

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

export function getWebcamConfig(): WebcamConfig {
  const s = read()
  return {
    shape: s.webcamShape ?? DEFAULT_WEBCAM.shape,
    size: s.webcamSize ?? DEFAULT_WEBCAM.size,
  }
}

export function setWebcamShape(shape: WebcamShape): void {
  write({ ...read(), webcamShape: shape })
}

export function setWebcamSize(size: WebcamSize): void {
  write({ ...read(), webcamSize: size })
}

export function getGuardrails(): GuardrailConfig {
  const s = read()
  const countdownSeconds = ALLOWED_COUNTDOWN.includes(s.countdownSeconds ?? -1)
    ? (s.countdownSeconds as number)
    : DEFAULT_GUARDRAILS.countdownSeconds
  const autoStopMinutes = ALLOWED_AUTOSTOP.includes(s.autoStopMinutes ?? -1)
    ? (s.autoStopMinutes as number)
    : DEFAULT_GUARDRAILS.autoStopMinutes
  return { countdownSeconds, autoStopMinutes }
}

export function setGuardrails(config: GuardrailConfig): GuardrailConfig {
  // Snap incoming values to the allowed presets so a bad payload can't persist.
  const countdownSeconds = ALLOWED_COUNTDOWN.includes(config.countdownSeconds)
    ? config.countdownSeconds
    : DEFAULT_GUARDRAILS.countdownSeconds
  const autoStopMinutes = ALLOWED_AUTOSTOP.includes(config.autoStopMinutes)
    ? config.autoStopMinutes
    : DEFAULT_GUARDRAILS.autoStopMinutes
  write({ ...read(), countdownSeconds, autoStopMinutes })
  return { countdownSeconds, autoStopMinutes }
}
