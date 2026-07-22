// 4R portrait: 4 × 6 inch at 300 DPI.
export const TEMPLATE_WIDTH = 1200
export const TEMPLATE_HEIGHT = 1800

export type TemplateSlot = {
  x: number
  y: number
  width: number
  height: number
}

export type PhotoTransform = {
  offsetX: number
  offsetY: number
  scale: number
}

export const templateSlots: TemplateSlot[] = [
  { x: 220, y: 15, width: 760, height: 570 },
  { x: 220, y: 615, width: 760, height: 570 },
  { x: 220, y: 1215, width: 760, height: 570 },
]

export const defaultPhotoTransforms: PhotoTransform[] = templateSlots.map(() => ({
  offsetX: 0,
  offsetY: 0,
  scale: 1.12,
}))

export function clampPhotoTransform(transform: PhotoTransform): PhotoTransform {
  const scale = Math.min(1.8, Math.max(1, transform.scale))
  const maxOffset = (scale - 1) / 2

  return {
    scale,
    offsetX: Math.min(maxOffset, Math.max(-maxOffset, transform.offsetX)),
    offsetY: Math.min(maxOffset, Math.max(-maxOffset, transform.offsetY)),
  }
}
