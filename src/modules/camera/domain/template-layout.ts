import type { PhotoFrame, PhotoLayoutId } from '../../frames/domain/photo-frame'

// One photobooth strip: half of a 4R portrait sheet at 300 DPI.
export const TEMPLATE_WIDTH = 600
export const TEMPLATE_HEIGHT = 1800
export const PRINT_WIDTH = 1200
export const PRINT_HEIGHT = 1800

export type TemplateText = {
  x: number
  y: number
  fontSize: number
  text: string
}

export type TemplateSlot = {
  x: number
  y: number
  width: number
  height: number
  rotation?: number
  borderRadius?: number
}

export type TemplateLayout = {
  id: PhotoLayoutId
  name: string
  slots: TemplateSlot[]
  brand: TemplateText
  copyright: TemplateText
}

export type PhotoTransform = {
  offsetX: number
  offsetY: number
  scale: number
}

const copyright = (y: number): TemplateText => ({
  x: 560,
  y,
  fontSize: 18,
  text: '© 2026 TOBFEST',
})

export const templateLayoutOptions: TemplateLayout[] = [
  {
    id: 'full',
    name: 'Frame 4',
    slots: [
      { x: 100, y: 30, width: 400, height: 500 },
      { x: 100, y: 550, width: 400, height: 500 },
      { x: 100, y: 1070, width: 400, height: 500 },
    ],
    brand: { x: 300, y: 1620, fontSize: 40, text: 'TOBFEST PHOTO BOOTH' },
    copyright: copyright(1680),
  },
  {
    id: 'lower',
    name: 'Frame 5',
    slots: [
      { x: 132, y: 320, width: 384, height: 480 },
      { x: 42, y: 810, width: 384, height: 480 },
      { x: 132, y: 1300, width: 384, height: 480 },
    ],
    brand: { x: 300, y: 165, fontSize: 40, text: 'TOBFEST PHOTO BOOTH' },
    copyright: copyright(225),
  },
  {
    id: 'editorial',
    name: 'Frame 6',
    slots: [
      { x: 0, y: 30, width: 360, height: 450 },
      { x: 120, y: 500, width: 360, height: 450 },
      { x: 240, y: 970, width: 360, height: 450 },
    ],
    brand: { x: 300, y: 1530, fontSize: 40, text: 'TOBFEST PHOTO BOOTH' },
    copyright: copyright(1590),
  },
  {
    id: 'inset',
    name: 'Frame 7',
    slots: [
      { x: 100, y: 60, width: 400, height: 500 },
      { x: 100, y: 580, width: 400, height: 500 },
      { x: 100, y: 1100, width: 400, height: 500 },
    ],
    brand: { x: 300, y: 1640, fontSize: 40, text: 'TOBFEST PHOTO BOOTH' },
    copyright: copyright(1700),
  },
  {
    id: 'staggered',
    name: 'Frame 8',
    slots: [
      { x: 0, y: 50, width: 360, height: 450 },
      { x: 240, y: 520, width: 360, height: 450 },
      { x: 0, y: 990, width: 360, height: 450 },
    ],
    brand: { x: 300, y: 1570, fontSize: 40, text: 'TOBFEST PHOTO BOOTH' },
    copyright: copyright(1630),
  },
  {
    id: 'tilted',
    name: 'Frame 9',
    slots: [
      { x: 45, y: 80, width: 360, height: 450, rotation: -6.03 },
      { x: 195, y: 600, width: 360, height: 450, rotation: 7.5 },
      { x: 70, y: 1120, width: 360, height: 450, rotation: -3 },
    ],
    brand: { x: 300, y: 1650, fontSize: 40, text: 'TOBFEST PHOTO BOOTH' },
    copyright: copyright(1710),
  },
  {
    id: 'double',
    name: '2 Foto',
    slots: [
      { x: 70, y: 90, width: 460, height: 610 },
      { x: 70, y: 990, width: 460, height: 610 },
    ],
    brand: { x: 300, y: 1680, fontSize: 40, text: 'TOBFEST PHOTO BOOTH' },
    copyright: copyright(1735),
  },
]

export const TEMPLATE_BRAND = templateLayoutOptions[0].brand
export const TEMPLATE_COPYRIGHT = templateLayoutOptions[0].copyright
export const templateSlots = templateLayoutOptions[0].slots

export function resolveTemplateLayout(layoutId?: PhotoLayoutId): TemplateLayout {
  return templateLayoutOptions.find((layout) => layout.id === layoutId) ?? templateLayoutOptions[0]
}

export function resolveTemplateSlots(layoutId?: PhotoLayoutId): TemplateSlot[] {
  return resolveTemplateLayout(layoutId).slots
}

export function resolveFrameSlots(
  frame: Pick<PhotoFrame, 'customSlots' | 'layoutId'>,
  forcedCount?: number,
): TemplateSlot[] {
  const customSlots = frame.customSlots?.length ? frame.customSlots : undefined
  if (customSlots) return customSlots

  const configuredCount = Math.max(1, Number.isFinite(forcedCount) ? forcedCount ?? 4 : resolveConfiguredPhotoCount())

  const layoutSlots = resolveTemplateSlots(frame.layoutId)
  if (layoutSlots.length === configuredCount) {
    return layoutSlots
  }

  return buildGeneratedGridSlots(configuredCount)
}

export function resolveConfiguredPhotoCount(): number {
  const raw = import.meta.env.VITE_PHOTO_COUNT ?? import.meta.env.PHOTO_BOOTH_SHOT_COUNT ?? '4'
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed)) return 4
  return Math.min(6, Math.max(1, parsed))
}

function buildGeneratedGridSlots(count: number): TemplateSlot[] {
  if (count <= 1) {
    return [{ x: 60, y: 120, width: 480, height: 1560 }]
  }

  if (count === 2) {
    return [
      { x: 70, y: 90, width: 460, height: 610 },
      { x: 70, y: 990, width: 460, height: 610 },
    ]
  }

  if (count === 3) {
    return [
      { x: 110, y: 90, width: 380, height: 420 },
      { x: 110, y: 560, width: 380, height: 420 },
      { x: 110, y: 1030, width: 380, height: 420 },
    ]
  }

  if (count === 4) {
    return [
      { x: 80, y: 110, width: 440, height: 520 },
      { x: 80, y: 640, width: 440, height: 520 },
      { x: 80, y: 1170, width: 440, height: 520 },
      { x: 80, y: 1700, width: 440, height: 520 },
    ]
  }

  if (count === 5) {
    return [
      { x: 80, y: 60, width: 440, height: 330 },
      { x: 80, y: 430, width: 440, height: 330 },
      { x: 80, y: 800, width: 440, height: 330 },
      { x: 80, y: 1170, width: 440, height: 330 },
      { x: 80, y: 1540, width: 440, height: 330 },
    ]
  }

  return [
    { x: 60, y: 50, width: 220, height: 260 },
    { x: 320, y: 50, width: 220, height: 260 },
    { x: 60, y: 330, width: 220, height: 260 },
    { x: 320, y: 330, width: 220, height: 260 },
    { x: 60, y: 610, width: 220, height: 260 },
    { x: 320, y: 610, width: 220, height: 260 },
  ]
}

export const defaultPhotoTransforms: PhotoTransform[] = Array.from(
  { length: resolveConfiguredPhotoCount() },
  () => ({
    offsetX: 0,
    offsetY: 0,
    scale: 1.12,
  }),
)

export function clampPhotoTransform(transform: PhotoTransform): PhotoTransform {
  const scale = Math.min(1.8, Math.max(1, transform.scale))
  const maxOffset = (scale - 1) / 2

  return {
    scale,
    offsetX: Math.min(maxOffset, Math.max(-maxOffset, transform.offsetX)),
    offsetY: Math.min(maxOffset, Math.max(-maxOffset, transform.offsetY)),
  }
}
