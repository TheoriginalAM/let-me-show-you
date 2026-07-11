import { useEffect, useState } from 'react'
import type { PermissionTarget } from '@shared/ipc'
import { useRecorderStore } from '../store'

const PERMISSION_LABELS: Record<PermissionTarget, string> = {
  screen: 'Screen Recording',
  microphone: 'Microphone',
  camera: 'Camera',
}
const PERMISSION_TARGETS: PermissionTarget[] = ['screen', 'microphone', 'camera']

/**
 * First-run wizard: sign in → grant permissions → make your first recording.
 * Reads auth/permission state from the store (kept fresh by ControlPanel) and
 * drives the same IPC actions the rest of the app uses.
 */
export function Onboarding({ onRecheck }: { onRecheck: () => void }) {
  const auth = useRecorderStore((s) => s.auth)
  const signIn = useRecorderStore((s) => s.signIn)
  const permissions = useRecorderStore((s) => s.permissions)
  const [step, setStep] = useState(0)

  const waiting = signIn.phase === 'starting' || signIn.phase === 'waiting'
  const screenGranted = permissions?.screen === 'granted'

  // Once signed in on the first step, advance to permissions automatically.
  useEffect(() => {
    if (step === 0 && auth.signedIn) setStep(1)
  }, [auth.signedIn, step])

  function finish(): void {
    void window.recorder.completeOnboarding()
    useRecorderStore.getState().setOnboardingComplete(true)
  }

  return (
    <div className="onboard">
      <div className="onboard-dots">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={`onboard-dot ${i === step ? 'active' : ''} ${i < step ? 'done' : ''}`}
          />
        ))}
      </div>

      {step === 0 ? (
        <div className="onboard-step">
          <div className="onboard-logo">▶</div>
          <h2 className="onboard-title">Welcome to Let Me Show You</h2>
          <p className="onboard-body">
            Record your screen with voiceover and share it with a single link.
          </p>
          {auth.signedIn ? (
            <>
              <p className="onboard-ok">Signed in ✓</p>
              <button className="btn-record no-drag" onClick={() => setStep(1)}>
                Next
              </button>
            </>
          ) : waiting ? (
            <div className="signin-waiting">
              <span className="proc-spinner" />
              <div className="signin-waiting-text">
                <div>Approve this device in your browser…</div>
                {signIn.userCode ? <div className="signin-code">{signIn.userCode}</div> : null}
              </div>
              <button
                className="btn-ghost no-drag"
                onClick={() => void window.recorder.cancelSignIn()}
              >
                Cancel
              </button>
            </div>
          ) : (
            <>
              {signIn.phase === 'error' && signIn.message ? (
                <p className="signin-error">{signIn.message}</p>
              ) : null}
              <button className="btn-record no-drag" onClick={() => void window.recorder.signIn()}>
                Sign in
              </button>
              <button className="btn-ghost no-drag" onClick={() => setStep(1)}>
                I’ll sign in later
              </button>
            </>
          )}
        </div>
      ) : step === 1 ? (
        <div className="onboard-step">
          <div className="onboard-logo">🔒</div>
          <h2 className="onboard-title">Grant permissions</h2>
          <p className="onboard-body">
            Screen Recording is required. Microphone and Camera are optional — for voiceover and a
            webcam bubble.
          </p>
          <ul className="perm-list">
            {PERMISSION_TARGETS.map((target) => {
              const granted = permissions?.[target] === 'granted'
              return (
                <li key={target} className="perm-row">
                  <span>
                    {PERMISSION_LABELS[target]}
                    {target === 'screen' ? ' · required' : ''}
                  </span>
                  <span className="perm-row-actions">
                    <span className={`badge badge-${permissions?.[target] ?? 'unknown'}`}>
                      {granted ? 'Allowed' : 'Set up'}
                    </span>
                    {!granted ? (
                      <button
                        className="btn-mini no-drag"
                        onClick={() =>
                          void window.recorder.openPrivacySettings(target).catch(console.error)
                        }
                      >
                        Open
                      </button>
                    ) : null}
                  </span>
                </li>
              )
            })}
          </ul>
          <button className="btn-ghost no-drag" onClick={onRecheck}>
            Re-check
          </button>
          <button
            className="btn-record no-drag"
            disabled={!screenGranted}
            onClick={() => setStep(2)}
          >
            {screenGranted ? 'Next' : 'Allow Screen Recording to continue'}
          </button>
        </div>
      ) : (
        <div className="onboard-step">
          <div className="onboard-logo">🎬</div>
          <h2 className="onboard-title">You’re all set</h2>
          <p className="onboard-body">
            Pick a screen or window, add your mic, and hit record. Signed-in recordings get a
            shareable link automatically.
          </p>
          <button className="btn-record no-drag" onClick={finish}>
            Make your first recording
          </button>
        </div>
      )}

      <button className="btn-ghost onboard-skip no-drag" onClick={finish}>
        Skip setup
      </button>
    </div>
  )
}
