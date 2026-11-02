import { useEffect, useState } from 'react'

/** Shown in Meetings/Calendar when the app isn't signed in to an account. */
export function SignedOutNote({ what }: { what: string }) {
  const [waiting, setWaiting] = useState(false)
  const [code, setCode] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(
    () =>
      window.recorder.onSignInStatus((s) => {
        setWaiting(s.phase === 'starting' || s.phase === 'waiting')
        setCode(s.userCode)
        setError(s.phase === 'error' ? (s.message ?? 'Sign-in failed. Try again.') : null)
      }),
    [],
  )

  return (
    <div className="side-empty">
      <p className="side-empty-title">Sign in to see your {what}</p>
      <p className="side-empty-body">
        Your rooms and bookings come from your Let Me Show You account.
      </p>
      {waiting ? (
        <div className="signin-waiting">
          <div className="signin-waiting-text">
            Confirm in your browser
            {code && <div className="signin-code">{code}</div>}
          </div>
          <button className="btn-ghost no-drag" onClick={() => void window.recorder.cancelSignIn()}>
            Cancel
          </button>
        </div>
      ) : (
        <button className="btn-secondary no-drag" onClick={() => void window.recorder.signIn()}>
          Sign in
        </button>
      )}
      {error && <p className="signin-error">{error}</p>}
    </div>
  )
}
