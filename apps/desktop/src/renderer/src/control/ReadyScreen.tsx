import { useState } from 'react'
import { formatDuration } from '@lmsy/shared'
import { useRecorderStore } from '../store'

export function ReadyScreen() {
  const result = useRecorderStore((s) => s.status.result)
  const auth = useRecorderStore((s) => s.auth)
  const upload = useRecorderStore((s) => s.upload)
  const [titleMode, setTitleMode] = useState(false)
  const [title, setTitle] = useState('')

  if (!result) return null

  const defaultTitle = result.fileName.replace(/\.mp4$/i, '')

  function beginUpload(): void {
    if (!result) return
    void window.recorder.startUpload({
      filePath: result.filePath,
      title: title.trim() || defaultTitle,
    })
  }

  return (
    <div className="ready">
      <div className="ready-check">✓</div>
      <h2 className="ready-title">Recording ready</h2>

      {result.thumbnailDataUrl ? (
        <img className="ready-thumb" src={result.thumbnailDataUrl} alt="Recording preview" />
      ) : null}

      <div className="ready-meta">
        <div className="ready-name" title={result.fileName}>
          {result.fileName}
        </div>
        <div className="ready-sub">{formatDuration(result.durationSeconds)} · saved locally</div>
        <div className="ready-path" title={result.filePath}>
          {result.filePath}
        </div>
      </div>

      {upload.phase === 'done' ? (
        <div className="upload-done">
          <div className="upload-done-label">✓ Link copied!</div>
          <div className="upload-url" title={upload.shareUrl ?? ''}>
            {upload.shareUrl}
          </div>
          <button
            className="btn-secondary no-drag"
            onClick={() => upload.shareUrl && void window.recorder.openExternalUrl(upload.shareUrl)}
          >
            Open in browser
          </button>
        </div>
      ) : upload.phase === 'creating' || upload.phase === 'uploading' ? (
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
      ) : upload.phase === 'error' ? (
        <div className="upload-error">
          <p className="signin-error">{upload.message}</p>
          <button className="btn-record no-drag" onClick={() => void window.recorder.retryUpload()}>
            Retry upload
          </button>
        </div>
      ) : titleMode ? (
        <div className="upload-title">
          <input
            className="no-drag"
            placeholder={defaultTitle}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
          />
          <button className="btn-record no-drag" onClick={beginUpload}>
            Upload &amp; share
          </button>
        </div>
      ) : auth.signedIn ? (
        <button className="btn-record no-drag" onClick={() => setTitleMode(true)}>
          Upload &amp; share
        </button>
      ) : (
        <div className="upload-signin">
          <button className="btn-record no-drag" onClick={() => void window.recorder.signIn()}>
            Sign in to share
          </button>
          <p className="ready-sub">Signs you in via your browser.</p>
        </div>
      )}

      <div className="ready-actions">
        <button
          className="btn-secondary no-drag"
          onClick={() => void window.recorder.revealInFinder(result.filePath).catch(console.error)}
        >
          Reveal in Finder
        </button>
        <button className="btn-ghost no-drag" onClick={() => void window.recorder.dismissResult()}>
          Done
        </button>
      </div>
    </div>
  )
}
