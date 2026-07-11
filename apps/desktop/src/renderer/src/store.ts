import { create } from 'zustand'
import type {
  AuthState,
  CaptureSource,
  MediaPermissions,
  RecordingStatus,
  SignInStatus,
  UploadStatus,
} from '@shared/ipc'

export interface DeviceOption {
  deviceId: string
  label: string
}

const idleStatus: RecordingStatus = {
  state: 'idle',
  startedAt: null,
  accumulatedMs: 0,
  progress: 0,
  result: null,
  error: null,
}

const idleUpload: UploadStatus = { phase: 'idle', progress: 0, shareUrl: null, message: null }
const idleSignIn: SignInStatus = {
  phase: 'idle',
  userCode: null,
  verificationUri: null,
  message: null,
}

interface RecorderStore {
  permissions: MediaPermissions | null
  sources: CaptureSource[]
  loadingSources: boolean
  selectedSourceId: string | null
  mics: DeviceOption[]
  cameras: DeviceOption[]
  selectedMicId: string | null
  selectedCameraId: string | null // null = camera off
  status: RecordingStatus
  auth: AuthState
  signIn: SignInStatus
  upload: UploadStatus

  setPermissions: (permissions: MediaPermissions) => void
  setSources: (sources: CaptureSource[]) => void
  setLoadingSources: (loading: boolean) => void
  selectSource: (id: string) => void
  setDevices: (mics: DeviceOption[], cameras: DeviceOption[]) => void
  selectMic: (id: string | null) => void
  selectCamera: (id: string | null) => void
  setStatus: (status: RecordingStatus) => void
  setAuth: (auth: AuthState) => void
  setSignIn: (signIn: SignInStatus) => void
  setUpload: (upload: UploadStatus) => void
}

export const useRecorderStore = create<RecorderStore>((set) => ({
  permissions: null,
  sources: [],
  loadingSources: false,
  selectedSourceId: null,
  mics: [],
  cameras: [],
  selectedMicId: null,
  selectedCameraId: null,
  status: idleStatus,
  auth: { signedIn: false },
  signIn: idleSignIn,
  upload: idleUpload,

  setPermissions: (permissions) => set({ permissions }),
  setSources: (sources) =>
    set((state) => ({
      sources,
      selectedSourceId:
        state.selectedSourceId && sources.some((s) => s.id === state.selectedSourceId)
          ? state.selectedSourceId
          : (sources.find((s) => s.type === 'screen')?.id ?? sources[0]?.id ?? null),
    })),
  setLoadingSources: (loadingSources) => set({ loadingSources }),
  selectSource: (selectedSourceId) => set({ selectedSourceId }),
  setDevices: (mics, cameras) =>
    set((state) => ({
      mics,
      cameras,
      selectedMicId:
        state.selectedMicId && mics.some((m) => m.deviceId === state.selectedMicId)
          ? state.selectedMicId
          : (mics[0]?.deviceId ?? null),
      selectedCameraId: cameras.some((c) => c.deviceId === state.selectedCameraId)
        ? state.selectedCameraId
        : null,
    })),
  selectMic: (selectedMicId) => set({ selectedMicId }),
  selectCamera: (selectedCameraId) => set({ selectedCameraId }),
  setStatus: (status) => set({ status }),
  setAuth: (auth) => set({ auth }),
  setSignIn: (signIn) => set({ signIn }),
  setUpload: (upload) => set({ upload }),
}))
