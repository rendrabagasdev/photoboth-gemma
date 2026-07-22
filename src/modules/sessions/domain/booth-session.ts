export type BoothSessionStatus =
  | 'selecting-frame'
  | 'capturing'
  | 'reviewing'
  | 'processing'
  | 'completed'
  | 'cancelled'
  | 'failed'

export type LivePhotoClip = {
  videoBlob: Blob
  mimeType: string
  durationMs: number
}

export type BoothSession = {
  id: string
  status: BoothSessionStatus
  frameId: string | null
  photos: string[]
  livePhotos: Array<LivePhotoClip | undefined>
  finalImage?: Blob
  printStatus: 'not-requested' | 'queued' | 'printed' | 'failed'
  createdAt: string
  completedAt: string | null
}

export function createBoothSession(): BoothSession {
  return {
    id: crypto.randomUUID(),
    status: 'selecting-frame',
    frameId: null,
    photos: [],
    livePhotos: [],
    printStatus: 'not-requested',
    createdAt: new Date().toISOString(),
    completedAt: null,
  }
}
