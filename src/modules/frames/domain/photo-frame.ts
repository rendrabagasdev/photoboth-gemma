export type FrameOrientation = 'portrait'
export type FrameKind = 'preset' | 'uploaded'
export type FramePresetStyle = 'clean' | 'stripe' | 'dots' | 'ticket'
export type PhotoLayoutId = 'full' | 'lower' | 'editorial' | 'inset' | 'staggered' | 'tilted' | 'double'

export type FramePhotoSlot = {
  x: number
  y: number
  width: number
  height: number
  rotation?: number
  borderRadius?: number
}

export type PhotoFrame = {
  id: string
  name: string
  description: string
  kind: FrameKind
  presetStyle?: FramePresetStyle
  layoutId?: PhotoLayoutId
  customSlots?: FramePhotoSlot[]
  orientation: FrameOrientation
  accent: string
  accentSoft: string
  imageBlob?: Blob
  isActive: boolean
  isDefault: boolean
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export const defaultFrames: PhotoFrame[] = [
  {
    id: 'double-feature',
    name: 'Double Feature',
    description: 'Dua foto besar dengan ruang desain di bagian tengah.',
    kind: 'preset',
    presetStyle: 'clean',
    layoutId: 'double',
    orientation: 'portrait',
    accent: '#e73f82',
    accentSoft: '#f9d5e5',
    isActive: true,
    isDefault: true,
    sortOrder: 0,
    createdAt: '2026-07-22T00:00:00.000Z',
    updatedAt: '2026-07-22T00:00:00.000Z',
  },
]
