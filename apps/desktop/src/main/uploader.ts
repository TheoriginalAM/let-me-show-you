import { createReadStream, statSync } from 'fs'
import { request as httpsRequest } from 'https'
import { clipboard } from 'electron'
import type { CreateUploadResponse } from '@lmsy/shared'
import type { StartUploadPayload, UploadStatus, WorkspacesResult } from '../shared/ipc'
import { API_BASE_URL } from './config'
import { loadToken } from './token-store'

/** Fetch the signed-in user's workspaces for the upload picker. Null if signed out. */
export async function fetchWorkspaces(): Promise<WorkspacesResult | null> {
  const token = loadToken()
  if (!token) return null
  try {
    const res = await fetch(`${API_BASE_URL}/api/workspaces`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return null
    return (await res.json()) as WorkspacesResult
  } catch {
    return null
  }
}

type Emit = (status: UploadStatus) => void

function status(phase: UploadStatus['phase'], extra: Partial<UploadStatus> = {}): UploadStatus {
  return { phase, progress: 0, shareUrl: null, message: null, ...extra }
}

/** PUT the file to the Mux direct-upload URL, streaming with progress. */
function putFile(
  url: string,
  filePath: string,
  onProgress: (fraction: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const total = statSync(filePath).size
    const req = httpsRequest(
      url,
      { method: 'PUT', headers: { 'Content-Type': 'video/mp4', 'Content-Length': total } },
      (res) => {
        let body = ''
        res.on('data', (chunk) => (body += chunk))
        res.on('end', () => {
          const code = res.statusCode ?? 0
          if (code >= 200 && code < 300) resolve()
          else reject(new Error(`Mux rejected the upload (${code})`))
        })
      },
    )
    req.on('error', reject)

    let sent = 0
    const stream = createReadStream(filePath)
    stream.on('data', (chunk) => {
      sent += chunk.length
      onProgress(total > 0 ? sent / total : 0)
    })
    stream.on('error', (err) => {
      req.destroy()
      reject(err)
    })
    stream.pipe(req)
  })
}

/**
 * Full upload flow: create a Mux direct upload via our API (Bearer token), PUT
 * the MP4 straight to Mux (bytes never touch our server), then copy the share
 * URL to the clipboard. The local file is never touched.
 */
export async function runUpload(payload: StartUploadPayload, emit: Emit): Promise<void> {
  const token = loadToken()
  if (!token) {
    emit(status('error', { message: 'Please sign in first (Settings).' }))
    return
  }

  emit(status('creating'))
  try {
    const res = await fetch(`${API_BASE_URL}/api/videos/create-upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        title: payload.title,
        password: payload.password ?? null,
        workspaceId: payload.workspaceId ?? null,
      }),
    })
    if (res.status === 401) throw new Error('Your session expired — sign in again.')
    if (!res.ok) throw new Error(`Could not create upload (${res.status})`)
    const { uploadUrl, shareUrl } = (await res.json()) as CreateUploadResponse

    emit(status('uploading', { progress: 0 }))
    await putFile(uploadUrl, payload.filePath, (fraction) => {
      emit(status('uploading', { progress: fraction }))
    })

    clipboard.writeText(shareUrl)
    emit(status('done', { progress: 1, shareUrl }))
  } catch (error) {
    emit(status('error', { message: error instanceof Error ? error.message : String(error) }))
  }
}
