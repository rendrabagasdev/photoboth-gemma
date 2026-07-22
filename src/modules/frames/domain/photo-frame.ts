export type FrameOrientation = 'portrait'
export type FrameKind = 'preset' | 'uploaded'

export type PhotoFrame = {
  id: string
  name: string
  description: string
  kind: FrameKind
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
    id: 'tobfest-pop',
    name: 'TOBFest Pop',
    description: 'Enerjik, cerah, dan penuh warna festival.',
    kind: 'preset',
    orientation: 'portrait',
    accent: '#ff5a36',
    accentSoft: '#ffe5db',
    isActive: true,
    isDefault: true,
    sortOrder: 0,
    createdAt: '2026-07-22T00:00:00.000Z',
    updatedAt: '2026-07-22T00:00:00.000Z',
  },
  {
    id: 'lime-wave',
    name: 'Lime Wave',
    description: 'Segar dengan sentuhan hijau elektrik.',
    kind: 'preset',
    orientation: 'portrait',
    accent: '#b8f43d',
    accentSoft: '#efffc9',
    isActive: true,
    isDefault: false,
    sortOrder: 1,
    createdAt: '2026-07-22T00:00:00.000Z',
    updatedAt: '2026-07-22T00:00:00.000Z',
  },
  {
    id: 'blue-hour',
    name: 'Blue Hour',
    description: 'Biru malam untuk hasil yang lebih tenang.',
    kind: 'preset',
    orientation: 'portrait',
    accent: '#3974ff',
    accentSoft: '#e3ebff',
    isActive: true,
    isDefault: false,
    sortOrder: 2,
    createdAt: '2026-07-22T00:00:00.000Z',
    updatedAt: '2026-07-22T00:00:00.000Z',
  },
]
