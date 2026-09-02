import type { LivePhotoClip } from '../../sessions/domain/booth-session'
import { normalizeLiveMimeType, fixMp4Duration } from '../domain/live-photo-media'

const BEFORE_SHUTTER_MS = 2_000
const AFTER_SHUTTER_MS = 2_000

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
  let recordingStartedAt: number | undefined
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
      recordingStartedAt = performance.now()
    } catch {
      recorder = undefined
      stopped = undefined
      recordingStartedAt = undefined
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
  // Panjang klip diukur dari jarak start–stop perekam, bukan dari jeda yang
  // direncanakan, karena `wait` dapat meleset saat perangkat sedang sibuk.
  const recordedMs = recordingStartedAt === undefined
    ? undefined
    : Math.round(performance.now() - recordingStartedAt)
  try {
    await stopped
  } catch {
    return { photo }
  }

  const mimeType = normalizeLiveMimeType(
    recorder.mimeType || chunks.find((chunk) => chunk instanceof Blob)?.type,
  )
  const rawBlob = new Blob(chunks, { type: mimeType })
  if (rawBlob.size === 0) return { photo }
  const videoBlob = await fixMp4Duration(rawBlob)

  return {
    photo,
    livePhoto: {
      videoBlob,
      mimeType,
      durationMs: recordedMs ?? BEFORE_SHUTTER_MS + AFTER_SHUTTER_MS,
    },
  }
}
