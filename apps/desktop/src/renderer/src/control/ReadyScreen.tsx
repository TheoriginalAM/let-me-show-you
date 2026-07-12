import { useState } from 'react'
import { formatDuration } from '@lmsy/shared'
import { useRecorderStore } from '../store'

const MIN_PASSWORD_LENGTH = 4

export function ReadyScreen() {
  const result = useRecorderStore((s) => s.status.result)
  const auth = useRecorderStore((s) => s.auth)
  const upload = useRecorderStore((s) => s.upload)
  const [title, setTitle] = useState('')
  const [withPassword, setWithPassword] = useState(false)
  const [password, setPassword] = useState('')

  if (!result) return null

  const defaultTitle = result.fileName.replace(/\.mp4$/i, '')
  const uploading = upload.phase === 'creating' || upload.phase === 'uploading'
  const pwTooShort = withPassword && password.length > 0 && password.length < MIN_PASSWORD_LENGTH
  const canUpload =
    auth.signedIn && !uploading && (!withPassword || password.length >= MIN_PASSWORD_LENGTH)

  function beginUpload(): void {
    if (!result || !canUpload) return
    void window.recorder.startUpload({
      filePath: result.filePath,
      title: title.trim() || defaultTitle,
      password: withPassword && password ? password : null,
    })
  }

  return (
    <div className="ready">
      <div className="ready-scroll">
        <div className="ready-check">✓</div>
        <h2 className="ready-title">Recording ready</h2>

        {result.thumbnailDataUrl ? (
          <img className="ready-thumb" src={result.thumbnailDataUrl} alt="Recording preview" />
        ) : null}

        <div className="ready-sub">{formatDuration(result.durationSeconds)} · saved locally</div>

        {upload.phase === 'done' ? (
          <div className="upload-done">
            <div className="upload-done-label">✓ Link copied!</div>
            <div className="upload-url" title={upload.shareUrl ?? ''}>
              {upload.shareUrl}
            </div>
          </div>
        ) : upload.phase === 'error' ? (
          <p className="signin-error">{upload.message}</p>
        ) : uploading ? (
          <div className="upload-progress">
            <div className="progress-track">
              <div
                className="progress-fill"
                style={{
                  width: `${Math.round((upload.phase === 'uploading' ? upload.progress : 0) * 100)}%`,
                }}
              />
            </div>
            <div className="progress-pct">
              {upload.phase === 'creating'
                ? 'Preparing upload…'
                : `Uploading ${Math.round(upload.progress * 100)}%`}
            </div>
          </div>
        ) : auth.signedIn ? (
          <div className="upload-fields">
            <div>
              <label className="ufield-label">Title</label>
              <input
                className="uinput no-drag"
                placeholder={defaultTitle}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                autoFocus
              />
            </div>
            <label className="pw-toggle no-drag">
              <input
                type="checkbox"
                checked={withPassword}
                onChange={(e) => setWithPassword(e.target.checked)}
              />
              Protect with a password
            </label>
            {withPassword ? (
              <div>
                <input
                  className="uinput no-drag"
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <div className="pw-hint">
                  {pwTooShort
                    ? `Use at least ${MIN_PASSWORD_LENGTH} characters`
                    : '🔒 Viewers must enter this to watch'}
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="ready-sub">
            Sign in to upload &amp; share — your recording is saved locally.
          </p>
        )}
      </div>

      <div className="ready-footer">
        {upload.phase === 'done' ? (
          <button
            className="btn-record no-drag"
            onClick={() => upload.shareUrl && void window.recorder.openExternalUrl(upload.shareUrl)}
          >
            Open in browser
          </button>
        ) : upload.phase === 'error' ? (
          <button className="btn-record no-drag" onClick={() => void window.recorder.retryUpload()}>
            Retry upload
          </button>
        ) : uploading ? (
          <button className="btn-record no-drag" disabled>
            Uploading…
          </button>
        ) : auth.signedIn ? (
          <button className="btn-record no-drag" disabled={!canUpload} onClick={beginUpload}>
            Upload &amp; share
          </button>
        ) : (
          <button className="btn-record no-drag" onClick={() => void window.recorder.signIn()}>
            Sign in to share
          </button>
        )}

        <div className="ready-actions">
          <button
            className="btn-secondary no-drag"
            onClick={() =>
              void window.recorder.revealInFinder(result.filePath).catch(console.error)
            }
          >
            Reveal in Finder
          </button>
          <button className="btn-ghost no-drag" onClick={() => void window.recorder.dismissResult()}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
