import { useEffect, useState } from 'react'
import { formatDuration } from '@lmsy/shared'
import type { Workspace } from '@shared/ipc'
import { useRecorderStore } from '../store'
import { VideoEditor } from './VideoEditor'

const MIN_PASSWORD_LENGTH = 4

export function ReadyScreen() {
  const result = useRecorderStore((s) => s.status.result)
  const auth = useRecorderStore((s) => s.auth)
  const upload = useRecorderStore((s) => s.upload)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [withPassword, setWithPassword] = useState(false)
  const [password, setPassword] = useState('')
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [workspaceId, setWorkspaceId] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)

  // Load the signed-in user's workspaces so they can pick where this uploads.
  useEffect(() => {
    if (!auth.signedIn) return
    let active = true
    void window.recorder.listWorkspaces().then((res) => {
      if (!active || !res) return
      setWorkspaces(res.workspaces)
      setWorkspaceId((prev) => prev ?? res.activeId ?? res.workspaces[0]?.id ?? null)
    })
    return () => {
      active = false
    }
  }, [auth.signedIn])

  if (!result) return null

  // The trim/cut editor takes over the whole panel; on apply/cancel it swaps back.
  if (editing) {
    return <VideoEditor result={result} onClose={() => setEditing(false)} />
  }

  const defaultTitle = result.fileName
    .replace(/\.mp4$/i, '')
    .replace(/ \(edited\)( \(\d+\))?$/i, '')
  const uploading = upload.phase === 'creating' || upload.phase === 'uploading'
  const pwTooShort = withPassword && password.length > 0 && password.length < MIN_PASSWORD_LENGTH
  const canUpload =
    auth.signedIn && !uploading && (!withPassword || password.length >= MIN_PASSWORD_LENGTH)

  function beginUpload(): void {
    if (!result || !canUpload) return
    void window.recorder.startUpload({
      filePath: result.filePath,
      title: title.trim() || defaultTitle,
      description: description.trim() || null,
      password: withPassword && password ? password : null,
      workspaceId,
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

        {upload.phase === 'idle' && (
          <button className="btn-secondary no-drag ready-edit" onClick={() => setEditing(true)}>
            ✂ Trim &amp; cut
          </button>
        )}

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
            <div>
              <label className="ufield-label">Description (optional)</label>
              <textarea
                className="uinput no-drag"
                placeholder="Shown under the video on its share page"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                maxLength={2000}
                style={{ resize: 'vertical' }}
              />
            </div>
            {workspaces.length > 1 && (
              <div>
                <label className="ufield-label">Workspace</label>
                <select
                  className="uinput no-drag"
                  value={workspaceId ?? ''}
                  onChange={(e) => setWorkspaceId(e.target.value)}
                >
                  {workspaces.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
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
