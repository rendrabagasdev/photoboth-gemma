import type { LivePhotoClip } from '../../sessions/domain/booth-session'

const BEFORE_SHUTTER_MS = 1_500
const AFTER_SHUTTER_MS = 1_500

const preferredMimeTypes = [
  'video/mp4;codecs=h264',
  'video/mp4',
]

export type LivePhotoCapture = {
  photo: string
  livePhoto?: LivePhotoClip
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds))
}

function selectMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined
  return preferredMimeTypes.find((mimeType) => MediaRecorder.isTypeSupported(mimeType))
}

export async function captureLivePhoto(
  stream: MediaStream | undefined,
  captureStill: () => string | null,
  onShutter: () => void,
): Promise<LivePhotoCapture> {
  let recorder: MediaRecorder | undefined
  let stopped: Promise<void> | undefined
  const chunks: BlobPart[] = []

  if (stream && typeof MediaRecorder !== 'undefined') {
    try {
      const mimeType = selectMimeType()
      if (!mimeType) throw new Error('Perekaman MP4 tidak didukung.')
      recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: 4_000_000,
      })
      stopped = new Promise((resolve, reject) => {
        if (!recorder) return resolve()
        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) chunks.push(event.data)
        }
        recorder.onstop = () => resolve()
        recorder.onerror = () => reject(new Error('Live Photo gagal direkam.'))
      })
      recorder.start()
    } catch {
      recorder = undefined
      stopped = undefined
    }
  }

  await wait(BEFORE_SHUTTER_MS)
  const photo = captureStill()
  if (!photo) {
    if (recorder?.state === 'recording') recorder.stop()
    throw new Error('Foto gagal diambil.')
  }
  onShutter()
  await wait(AFTER_SHUTTER_MS)

  if (!recorder || !stopped) return { photo }

  if (recorder.state === 'recording') recorder.stop()
  try {
    await stopped
  } catch {
    return { photo }
  }

  const mimeType = recorder.mimeType || chunks.find((chunk) => chunk instanceof Blob)?.type || 'video/mp4'
  const videoBlob = new Blob(chunks, { type: mimeType })
  if (videoBlob.size === 0) return { photo }

  return {
    photo,
    livePhoto: {
      videoBlob,
      mimeType,
      durationMs: BEFORE_SHUTTER_MS + AFTER_SHUTTER_MS,
    },
  }
}
