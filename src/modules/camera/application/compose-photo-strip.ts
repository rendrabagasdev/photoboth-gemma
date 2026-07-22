import type { PhotoFrame } from '../../frames/domain/photo-frame'
import {
  TEMPLATE_HEIGHT,
  TEMPLATE_WIDTH,
  clampPhotoTransform,
  defaultPhotoTransforms,
  templateSlots,
  type PhotoTransform,
  type TemplateSlot,
} from '../domain/template-layout'

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Foto gagal dimuat.'))
    image.src = source
  })
}

function drawPositionedPhoto(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  slot: TemplateSlot,
  inputTransform: PhotoTransform,
): void {
  const transform = clampPhotoTransform(inputTransform)
  const imageRatio = image.width / image.height
  const slotRatio = slot.width / slot.height
  let baseWidth = slot.width
  let baseHeight = slot.height

  if (imageRatio > slotRatio) {
    baseWidth = slot.height * imageRatio
  } else {
    baseHeight = slot.width / imageRatio
  }

  const width = baseWidth * transform.scale
  const height = baseHeight * transform.scale
  const centerX = slot.x + slot.width / 2 + transform.offsetX * slot.width
  const centerY = slot.y + slot.height / 2 + transform.offsetY * slot.height

  context.save()
  context.beginPath()
  context.rect(slot.x, slot.y, slot.width, slot.height)
  context.clip()
  context.drawImage(image, centerX - width / 2, centerY - height / 2, width, height)
  context.restore()
}

function drawPresetTemplate(context: CanvasRenderingContext2D, frame: PhotoFrame): void {
  context.strokeStyle = frame.accent
  context.lineWidth = 20

  templateSlots.forEach((slot) => {
    context.strokeRect(slot.x - 10, slot.y - 10, slot.width + 20, slot.height + 20)
  })

  context.fillStyle = frame.accent
  context.fillRect(0, TEMPLATE_HEIGHT - 132, TEMPLATE_WIDTH, 132)

  context.fillStyle = frame.accentSoft
  context.beginPath()
  context.arc(105, 95, 145, 0, Math.PI * 2)
  context.fill()
}

export async function composePhotoStrip(
  photos: string[],
  frame: PhotoFrame,
  transforms: PhotoTransform[] = defaultPhotoTransforms,
): Promise<Blob> {
  if (photos.length !== 3) {
    throw new Error('Tiga foto diperlukan untuk membuat hasil akhir.')
  }

  const canvas = document.createElement('canvas')
  canvas.width = TEMPLATE_WIDTH
  canvas.height = TEMPLATE_HEIGHT
  const context = canvas.getContext('2d')

  if (!context) {
    throw new Error('Perangkat tidak mendukung pemrosesan foto.')
  }

  context.fillStyle = frame.accentSoft
  context.fillRect(0, 0, TEMPLATE_WIDTH, TEMPLATE_HEIGHT)

  const images = await Promise.all(photos.map(loadImage))
  images.forEach((image, index) => {
    const slot = templateSlots[index]
    const transform = transforms[index] ?? defaultPhotoTransforms[index]
    if (slot && transform) drawPositionedPhoto(context, image, slot, transform)
  })

  if (frame.imageBlob) {
    const overlayUrl = URL.createObjectURL(frame.imageBlob)
    try {
      const overlay = await loadImage(overlayUrl)
      context.drawImage(overlay, 0, 0, TEMPLATE_WIDTH, TEMPLATE_HEIGHT)
    } finally {
      URL.revokeObjectURL(overlayUrl)
    }
  } else {
    drawPresetTemplate(context, frame)
  }

  context.fillStyle = '#171711'
  context.font = '900 76px Arial, sans-serif'
  context.textAlign = 'center'
  context.fillText('TOBFEST', TEMPLATE_WIDTH / 2, 1535)

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error('Hasil foto gagal dibuat.'))
      },
      'image/jpeg',
      0.94,
    )
  })
}
