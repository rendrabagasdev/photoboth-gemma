import type { PhotoFrame } from '../../frames/domain/photo-frame'
import {
  TEMPLATE_HEIGHT,
  TEMPLATE_WIDTH,
  clampPhotoTransform,
  defaultPhotoTransforms,
  resolveTemplateLayout,
  resolveFrameSlots,
  type PhotoTransform,
  type TemplateSlot,
} from '../domain/template-layout'
import { drawFrameDecorations } from './draw-frame-decoration'
import { roundedRectPath } from '../../../shared/canvas/rounded-rect'

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
  const offsetX = transform.offsetX * slot.width
  const offsetY = transform.offsetY * slot.height

  context.save()
  context.translate(slot.x + slot.width / 2, slot.y + slot.height / 2)
  context.rotate(((slot.rotation ?? 0) * Math.PI) / 180)
  roundedRectPath(
    context,
    -slot.width / 2,
    -slot.height / 2,
    slot.width,
    slot.height,
    slot.borderRadius,
  )
  context.clip()
  context.drawImage(image, offsetX - width / 2, offsetY - height / 2, width, height)
  context.restore()
}

export async function composePhotoStrip(
  photos: string[],
  frame: PhotoFrame,
  transforms: PhotoTransform[] = defaultPhotoTransforms,
): Promise<Blob> {
  const layout = resolveTemplateLayout(frame.layoutId)
  const slots = resolveFrameSlots(frame)
  if (photos.length !== slots.length) {
    throw new Error(`${slots.length} foto diperlukan untuk membuat hasil akhir.`)
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
    const slot = slots[index]
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
  }

  if (frame.kind === 'preset') {
    drawFrameDecorations(context, frame)

    context.fillStyle = '#171711'
    context.font = `900 ${layout.brand.fontSize}px Arial, sans-serif`
    context.textAlign = 'center'
    context.fillText(layout.brand.text, layout.brand.x, layout.brand.y)
    context.font = `500 ${layout.copyright.fontSize}px Arial, sans-serif`
    context.textAlign = 'right'
    context.fillText(
      layout.copyright.text,
      layout.copyright.x,
      layout.copyright.y,
    )
  }

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
