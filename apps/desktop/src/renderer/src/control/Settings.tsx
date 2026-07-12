import type { GuardrailConfig } from '@shared/ipc'
import { useRecorderStore } from '../store'

const COUNTDOWN_OPTIONS = [
  { value: 0, label: 'Off' },
  { value: 3, label: '3s' },
  { value: 5, label: '5s' },
  { value: 10, label: '10s' },
]
const AUTOSTOP_OPTIONS = [
  { value: 0, label: 'Off' },
  { value: 5, label: '5 min' },
  { value: 10, label: '10 min' },
  { value: 15, label: '15 min' },
  { value: 30, label: '30 min' },
  { value: 60, label: '60 min' },
]

export function Settings({ onClose }: { onClose: () => void }) {
  const auth = useRecorderStore((s) => s.auth)
  const signIn = useRecorderStore((s) => s.signIn)
  const guardrails = useRecorderStore((s) => s.guardrails)

  const waiting = signIn.phase === 'starting' || signIn.phase === 'waiting'

  function saveGuardrails(patch: Partial<GuardrailConfig>): void {
    const next = { ...guardrails, ...patch }
    useRecorderStore.getState().setGuardrails(next)
    void window.recorder.setGuardrails(next).then((saved) => {
      useRecorderStore.getState().setGuardrails(saved)
    })
  }

  return (
    <div className="settings">
      <div className="settings-block">
        <div className="settings-title">Account</div>
        <div className="settings-sub">
          {auth.signedIn
            ? 'Signed in — you can upload & share recordings.'
            : 'Sign in to upload recordings and get shareable links.'}
        </div>
      </div>

      {auth.signedIn ? (
        <button className="btn-secondary no-drag" onClick={() => void window.recorder.signOut()}>
          Sign out
        </button>
      ) : waiting ? (
        <div className="signin-waiting">
          <span className="proc-spinner" />
          <div className="signin-waiting-text">
            <div>Approve this device in your browser…</div>
            {signIn.userCode ? <div className="signin-code">{signIn.userCode}</div> : null}
          </div>
          <button className="btn-ghost no-drag" onClick={() => void window.recorder.cancelSignIn()}>
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
        </>
      )}

      <div className="settings-block">
        <div className="settings-title">Recording guardrails</div>
        <div className="settings-sub">A countdown before capture, and a safety auto-stop.</div>

        <div className="settings-row">
          <span className="settings-row-label">Countdown</span>
          <div className="seg no-drag">
            {COUNTDOWN_OPTIONS.map((o) => (
              <button
                key={o.value}
                className={`seg-btn ${guardrails.countdownSeconds === o.value ? 'active' : ''}`}
                onClick={() => saveGuardrails({ countdownSeconds: o.value })}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        <div className="settings-row">
          <span className="settings-row-label">Auto-stop after</span>
          <select
            className="uinput settings-select no-drag"
            value={guardrails.autoStopMinutes}
            onChange={(e) => saveGuardrails({ autoStopMinutes: Number(e.target.value) })}
          >
            {AUTOSTOP_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <button className="btn-ghost no-drag" onClick={onClose}>
        Back
      </button>
    </div>
  )
}
