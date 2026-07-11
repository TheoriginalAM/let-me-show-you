import { useRecorderStore } from '../store'

export function Settings({ onClose }: { onClose: () => void }) {
  const auth = useRecorderStore((s) => s.auth)
  const signIn = useRecorderStore((s) => s.signIn)

  const waiting = signIn.phase === 'starting' || signIn.phase === 'waiting'

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

      <button className="btn-ghost no-drag" onClick={onClose}>
        Back
      </button>
    </div>
  )
}
