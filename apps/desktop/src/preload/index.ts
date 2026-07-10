import { contextBridge, ipcRenderer } from 'electron'

/**
 * The API surface exposed to the renderer as `window.lmsy`.
 * Because `contextIsolation` is enabled, this is the ONLY channel the
 * renderer has to the main process — it cannot touch Node directly.
 */
const api = {
  ping: (): Promise<string> => ipcRenderer.invoke('ping'),
  platform: process.platform,
}

try {
  contextBridge.exposeInMainWorld('lmsy', api)
} catch (error) {
  console.error('[preload] failed to expose API:', error)
}
