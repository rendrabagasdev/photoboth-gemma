export type FrameOrientation = 'portrait'
export type FrameKind = 'preset' | 'uploaded'
export type FramePresetStyle = 'clean' | 'stripe' | 'dots' | 'ticket'
export type PhotoLayoutId = 'full' | 'lower' | 'editorial' | 'inset' | 'staggered' | 'tilted'

export type PhotoFrame = {
  id: string
  name: string
  description: string
  kind: FrameKind
  presetStyle?: FramePresetStyle
  layoutId?: PhotoLayoutId
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
    presetStyle: 'clean',
    layoutId: 'full',
    orientation: 'portrait',
    accent: '#ff5a36',
    accentSoft: '#ffd8e2',
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
    presetStyle: 'stripe',
    layoutId: 'lower',
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
    presetStyle: 'dots',
    layoutId: 'editorial',
    orientation: 'portrait',
    accent: '#3974ff',
    accentSoft: '#e3ebff',
    isActive: true,
    isDefault: false,
    sortOrder: 2,
    createdAt: '2026-07-22T00:00:00.000Z',
    updatedAt: '2026-07-22T00:00:00.000Z',
  },
  {
    id: 'mono-ticket',
    name: 'Mono Ticket',
    description: 'Gaya tiket festival dengan garis putus-putus.',
    kind: 'preset',
    presetStyle: 'ticket',
    layoutId: 'inset',
    orientation: 'portrait',
    accent: '#383832',
    accentSoft: '#f0eee8',
    isActive: true,
    isDefault: false,
    sortOrder: 3,
    createdAt: '2026-07-22T00:00:00.000Z',
    updatedAt: '2026-07-22T00:00:00.000Z',
  },
  {
    id: 'coral-cascade',
    name: 'Coral Cascade',
    description: 'Susunan foto berselang-seling kiri dan kanan.',
    kind: 'preset',
    presetStyle: 'clean',
    layoutId: 'staggered',
    orientation: 'portrait',
    accent: '#ff5a36',
    accentSoft: '#ffd8e2',
    isActive: true,
    isDefault: false,
    sortOrder: 4,
    createdAt: '2026-07-22T00:00:00.000Z',
    updatedAt: '2026-07-22T00:00:00.000Z',
  },
  {
    id: 'violet-tilt',
    name: 'Violet Tilt',
    description: 'Tiga foto miring dengan komposisi dinamis.',
    kind: 'preset',
    presetStyle: 'clean',
    layoutId: 'tilted',
    orientation: 'portrait',
    accent: '#7657d7',
    accentSoft: '#ebe5ff',
    isActive: true,
    isDefault: false,
    sortOrder: 5,
    createdAt: '2026-07-22T00:00:00.000Z',
    updatedAt: '2026-07-22T00:00:00.000Z',
  },
]
