import type { PhotoFrame } from '../../frames/domain/photo-frame'
import type { LivePhotoClip } from '../../sessions/domain/booth-session'
import {
  TEMPLATE_HEIGHT,
  TEMPLATE_WIDTH,
  clampPhotoTransform,
  defaultPhotoTransforms,
  templateSlots,
  type PhotoTransform,
} from '../domain/template-layout'

const OUTPUT_SCALE = 0.5
const LIVE_DURATION_MS = 3_000

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Foto gagal dimuat.'))
    image.src = source
  })
}

function loadVideo(blob: Blob): Promise<{ video: HTMLVideoElement; url: string }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    video.preload = 'auto'
    video.onloadeddata = () => resolve({ video, url })
    video.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Live Photo gagal dimuat.'))
    }
    video.src = url
  })
}

function selectMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined
  return [
    'video/mp4;codecs=h264',
    'video/mp4',
  ].find((type) => MediaRecorder.isTypeSupported(type))
}

export async function composeLiveTemplate(
  photos: string[],
  livePhotos: Array<LivePhotoClip | undefined>,
  frame: PhotoFrame,
  transforms: PhotoTransform[] = defaultPhotoTransforms,
): Promise<Blob> {
  const fallback = livePhotos.find((clip) => clip?.videoBlob.size)?.videoBlob
  if (!fallback) throw new Error('Live Photo belum tersedia.')

  const canvas = document.createElement('canvas')
  canvas.width = TEMPLATE_WIDTH * OUTPUT_SCALE
  canvas.height = TEMPLATE_HEIGHT * OUTPUT_SCALE
  const context = canvas.getContext('2d')
  const stream = canvas.captureStream?.(24)
  const mimeType = selectMimeType()
  if (!context || !stream || !mimeType) return fallback

  const images = await Promise.all(photos.map(loadImage))
  const videoEntries = await Promise.all(livePhotos.map(async (clip) => {
    if (!clip) return undefined
    try {
      return await loadVideo(clip.videoBlob)
    } catch {
      return undefined
    }
  }))

  let overlay: HTMLImageElement | undefined
  let overlayUrl: string | undefined
  if (frame.imageBlob) {
    overlayUrl = URL.createObjectURL(frame.imageBlob)
    overlay = await loadImage(overlayUrl)
  }

  const draw = () => {
    context.fillStyle = frame.accentSoft
    context.fillRect(0, 0, canvas.width, canvas.height)

    templateSlots.forEach((sourceSlot, index) => {
      const slot = {
        x: sourceSlot.x * OUTPUT_SCALE,
        y: sourceSlot.y * OUTPUT_SCALE,
        width: sourceSlot.width * OUTPUT_SCALE,
        height: sourceSlot.height * OUTPUT_SCALE,
      }
      const media = videoEntries[index]?.video ?? images[index]
      const transform = clampPhotoTransform(transforms[index] ?? defaultPhotoTransforms[index])
      if (!media) return
      const mediaWidth = media instanceof HTMLVideoElement ? media.videoWidth : media.width
      const mediaHeight = media instanceof HTMLVideoElement ? media.videoHeight : media.height
      const mediaRatio = mediaWidth / mediaHeight
      const slotRatio = slot.width / slot.height
      let width = slot.width
      let height = slot.height
      if (mediaRatio > slotRatio) width = slot.height * mediaRatio
      else height = slot.width / mediaRatio
      width *= transform.scale
      height *= transform.scale
      const centerX = slot.x + slot.width / 2 + transform.offsetX * slot.width
      const centerY = slot.y + slot.height / 2 + transform.offsetY * slot.height

      context.save()
      context.beginPath()
      context.rect(slot.x, slot.y, slot.width, slot.height)
      context.clip()
      if (media instanceof HTMLVideoElement) {
        context.translate(centerX, 0)
        context.scale(-1, 1)
        context.drawImage(media, -width / 2, centerY - height / 2, width, height)
      } else {
        context.drawImage(media, centerX - width / 2, centerY - height / 2, width, height)
      }
      context.restore()
    })

    if (overlay) {
      context.drawImage(overlay, 0, 0, canvas.width, canvas.height)
    } else {
      context.strokeStyle = frame.accent
      context.lineWidth = 10
      templateSlots.forEach((slot) => context.strokeRect(
        (slot.x - 10) * OUTPUT_SCALE,
        (slot.y - 10) * OUTPUT_SCALE,
        (slot.width + 20) * OUTPUT_SCALE,
        (slot.height + 20) * OUTPUT_SCALE,
      ))
      context.fillStyle = frame.accent
      context.fillRect(0, canvas.height - 66, canvas.width, 66)
      context.fillStyle = '#171711'
      context.font = '900 32px Arial, sans-serif'
      context.fillText('TOBFEST', 35, canvas.height - 21)
    }
  }

  const chunks: BlobPart[] = []
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 3_000_000 })
  const stopped = new Promise<void>((resolve, reject) => {
    recorder.ondataavailable = (event) => {
      if (event.data.size) chunks.push(event.data)
    }
    recorder.onstop = () => resolve()
    recorder.onerror = () => reject(new Error('Versi live gagal dibuat.'))
  })

  try {
    await Promise.all(videoEntries.map(async (entry) => {
      if (!entry) return
      entry.video.currentTime = 0
      await entry.video.play()
    }))
    recorder.start(250)
    const startedAt = performance.now()
    await new Promise<void>((resolve) => {
      const render = (time: number) => {
        draw()
        if (time - startedAt >= LIVE_DURATION_MS) resolve()
        else requestAnimationFrame(render)
      }
      requestAnimationFrame(render)
    })
    recorder.stop()
    await stopped
    return chunks.length ? new Blob(chunks, { type: mimeType }) : fallback
  } catch {
    if (recorder.state === 'recording') recorder.stop()
    return fallback
  } finally {
    videoEntries.forEach((entry) => {
      entry?.video.pause()
      if (entry) URL.revokeObjectURL(entry.url)
    })
    if (overlayUrl) URL.revokeObjectURL(overlayUrl)
    stream.getTracks().forEach((track) => track.stop())
  }
}
