import { create } from 'zustand'
import type {
  AreaRect,
  AuthState,
  CaptureSource,
  MediaPermissions,
  RecordingMode,
  RecordingStatus,
  SignInStatus,
  UpdateStatus,
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
const idleUpdate: UpdateStatus = { phase: 'idle', version: null }

interface RecorderStore {
  permissions: MediaPermissions | null
  mode: RecordingMode
  areaRect: AreaRect | null
  sources: CaptureSource[]
  loadingSources: boolean
  selectedSourceId: string | null
  mics: DeviceOption[]
  cameras: DeviceOption[]
  selectedMicId: string | null
  selectedCameraId: string | null // webcam OVERLAY device (screen/window/area); null = off
  cameraModeDeviceId: string | null // the camera RECORDED in camera-only mode
  status: RecordingStatus
  auth: AuthState
  signIn: SignInStatus
  upload: UploadStatus
  update: UpdateStatus
  /** null until the first-run flag has been read from main. */
  onboardingComplete: boolean | null

  setPermissions: (permissions: MediaPermissions) => void
  setMode: (mode: RecordingMode) => void
  setAreaRect: (rect: AreaRect | null) => void
  setSources: (sources: CaptureSource[]) => void
  setLoadingSources: (loading: boolean) => void
  selectSource: (id: string) => void
  setDevices: (mics: DeviceOption[], cameras: DeviceOption[]) => void
  selectMic: (id: string | null) => void
  selectCamera: (id: string | null) => void
  selectCameraModeDevice: (id: string) => void
  setStatus: (status: RecordingStatus) => void
  setAuth: (auth: AuthState) => void
  setSignIn: (signIn: SignInStatus) => void
  setUpload: (upload: UploadStatus) => void
  setUpdate: (update: UpdateStatus) => void
  setOnboardingComplete: (value: boolean) => void
}

export const useRecorderStore = create<RecorderStore>((set) => ({
  permissions: null,
  mode: 'screen',
  areaRect: null,
  sources: [],
  loadingSources: false,
  selectedSourceId: null,
  mics: [],
  cameras: [],
  selectedMicId: null,
  selectedCameraId: null,
  cameraModeDeviceId: null,
  status: idleStatus,
  auth: { signedIn: false },
  signIn: idleSignIn,
  upload: idleUpload,
  update: idleUpdate,
  onboardingComplete: null,

  setPermissions: (permissions) => set({ permissions }),
  setMode: (mode) => set({ mode }),
  setAreaRect: (areaRect) => set({ areaRect }),
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
      cameraModeDeviceId: cameras.some((c) => c.deviceId === state.cameraModeDeviceId)
        ? state.cameraModeDeviceId
        : null,
    })),
  selectMic: (selectedMicId) => set({ selectedMicId }),
  selectCamera: (selectedCameraId) => set({ selectedCameraId }),
  selectCameraModeDevice: (cameraModeDeviceId) => set({ cameraModeDeviceId }),
  setStatus: (status) =>
    set((state) => {
      const wasRecording = state.status.state === 'recording' || state.status.state === 'paused'
      const nowRecording = status.state === 'recording' || status.state === 'paused'
      // When a recording ends, revert the webcam overlay to off so it doesn't
      // silently carry into the next recording. The effect keyed on
      // selectedCameraId hides the bubble.
      return wasRecording && !nowRecording ? { status, selectedCameraId: null } : { status }
    }),
  setAuth: (auth) => set({ auth }),
  setSignIn: (signIn) => set({ signIn }),
  setUpload: (upload) => set({ upload }),
  setUpdate: (update) => set({ update }),
  setOnboardingComplete: (onboardingComplete) => set({ onboardingComplete }),
}))
