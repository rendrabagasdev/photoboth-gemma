import type { PhotoLayoutId } from '../../frames/domain/photo-frame'

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
      { x: 0, y: 27, width: 600, height: 450 },
      { x: 0, y: 496, width: 600, height: 450 },
      { x: 0, y: 965, width: 600, height: 450 },
    ],
    brand: { x: 300, y: 1620, fontSize: 40, text: 'TOBFEST PHOTO BOOTH' },
    copyright: copyright(1680),
  },
  {
    id: 'lower',
    name: 'Frame 5',
    slots: [
      { x: 0, y: 378, width: 600, height: 450 },
      { x: 0, y: 849, width: 600, height: 450 },
      { x: 0, y: 1320, width: 600, height: 450 },
    ],
    brand: { x: 300, y: 165, fontSize: 40, text: 'TOBFEST PHOTO BOOTH' },
    copyright: copyright(225),
  },
  {
    id: 'editorial',
    name: 'Frame 6',
    slots: [
      { x: 0, y: 27, width: 600, height: 450 },
      { x: 0, y: 519, width: 516, height: 387 },
      { x: 84, y: 948, width: 516, height: 387 },
    ],
    brand: { x: 300, y: 1530, fontSize: 40, text: 'TOBFEST PHOTO BOOTH' },
    copyright: copyright(1590),
  },
  {
    id: 'inset',
    name: 'Frame 7',
    slots: [
      { x: 48, y: 143, width: 504, height: 378 },
      { x: 48, y: 612, width: 504, height: 378 },
      { x: 48, y: 1081, width: 504, height: 378 },
    ],
    brand: { x: 300, y: 1640, fontSize: 40, text: 'TOBFEST PHOTO BOOTH' },
    copyright: copyright(1700),
  },
  {
    id: 'staggered',
    name: 'Frame 8',
    slots: [
      { x: 0, y: 90, width: 519, height: 389 },
      { x: 81, y: 538, width: 519, height: 389 },
      { x: 0, y: 986, width: 519, height: 389 },
    ],
    brand: { x: 300, y: 1570, fontSize: 40, text: 'TOBFEST PHOTO BOOTH' },
    copyright: copyright(1630),
  },
  {
    id: 'tilted',
    name: 'Frame 9',
    slots: [
      { x: 15, y: 119, width: 450, height: 338, rotation: -6.03 },
      { x: 100, y: 634, width: 450, height: 338, rotation: 9.37 },
      { x: 61, y: 1137, width: 450, height: 338, rotation: -3 },
    ],
    brand: { x: 300, y: 1650, fontSize: 40, text: 'TOBFEST PHOTO BOOTH' },
    copyright: copyright(1710),
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
