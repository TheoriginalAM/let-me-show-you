import { useEffect, useState } from 'react'
import {
  APP_NAME,
  APP_DOMAIN,
  buildShareUrl,
  type User,
  type Video,
  type ShareLink,
} from '@lmsy/shared'

function App() {
  const [ping, setPing] = useState<string>('…')

  useEffect(() => {
    // Exercise the secure preload bridge (contextIsolation is on).
    window.lmsy
      ?.ping()
      .then(setPing)
      .catch(() => setPing('unavailable'))
  }, [])

  const currentUser: Pick<User, 'displayName'> = { displayName: 'Demo Owner' }

  const draft: Pick<Video, 'title' | 'status'> = {
    title: 'Untitled recording',
    status: 'processing',
  }

  const lastShare: Pick<ShareLink, 'slug'> = { slug: 'demo123' }

  return (
    <div className="app">
      <main className="card">
        <p className="eyebrow">{APP_DOMAIN}</p>
        <h1>{APP_NAME}</h1>
        <p className="tagline">Desktop recorder — placeholder window.</p>

        <dl className="meta">
          <div>
            <dt>Signed in</dt>
            <dd>{currentUser.displayName}</dd>
          </div>
          <div>
            <dt>Platform</dt>
            <dd>{window.lmsy?.platform ?? 'unknown'}</dd>
          </div>
          <div>
            <dt>IPC ping</dt>
            <dd>{ping}</dd>
          </div>
          <div>
            <dt>Draft status</dt>
            <dd>{draft.status}</dd>
          </div>
        </dl>

        <p className="share">{buildShareUrl(lastShare.slug)}</p>
      </main>
    </div>
  )
}

export default App
