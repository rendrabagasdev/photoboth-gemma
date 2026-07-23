import type { FrameRepository } from './frame-repository'
import { defaultFrames, type FramePhotoSlot, type PhotoFrame } from '../domain/photo-frame'
import { roundedRectPath } from '../../../shared/canvas/rounded-rect'

const FRAME_WIDTH = 600
const FRAME_HEIGHT = 1800

function createFrameOverlay(
  bitmap: ImageBitmap,
  slots: FramePhotoSlot[],
): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = FRAME_WIDTH
  canvas.height = FRAME_HEIGHT
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Perangkat tidak mendukung editor frame.')

  context.drawImage(bitmap, 0, 0, FRAME_WIDTH, FRAME_HEIGHT)
  context.globalCompositeOperation = 'destination-out'
  context.fillStyle = '#000000'
  slots.forEach((slot) => {
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
    context.fill()
    context.restore()
  })
  context.globalCompositeOperation = 'source-over'

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error('Frame gagal diproses.')),
      'image/png',
    )
  })
}

export type AddFrameInput = {
  name: string
  imageBlob: Blob
  isActive: boolean
  customSlots: FramePhotoSlot[]
}

export class FrameService {
  private readonly repository: FrameRepository

  constructor(repository: FrameRepository) {
    this.repository = repository
  }

  async initialize(): Promise<void> {
    await this.repository.seed(defaultFrames)
  }

  async list(): Promise<PhotoFrame[]> {
    const frames = await this.repository.list()
    return frames.sort((a, b) => a.sortOrder - b.sortOrder)
  }

  async listActive(): Promise<PhotoFrame[]> {
    const frames = await this.list()
    return frames.filter((frame) => frame.isActive)
  }

  async add(input: AddFrameInput): Promise<PhotoFrame> {
    if (!input.name.trim()) {
      throw new Error('Nama frame wajib diisi.')
    }

    if (input.imageBlob.type !== 'image/png') {
      throw new Error('Frame harus berupa file PNG.')
    }

    if (input.imageBlob.size > 10 * 1024 * 1024) {
      throw new Error('Ukuran frame maksimal 10 MB.')
    }

    if (input.customSlots.length < 1 || input.customSlots.length > 6) {
      throw new Error('Tambahkan 1 sampai 6 area foto pada frame.')
    }

    const slotsValid = input.customSlots.every((slot) => (
      Number.isFinite(slot.x)
      && Number.isFinite(slot.y)
      && Number.isFinite(slot.width)
      && Number.isFinite(slot.height)
      && slot.x >= 0
      && slot.y >= 0
      && slot.width >= 120
      && slot.height >= 90
      && slot.x + slot.width <= 600
      && slot.y + slot.height <= 1800
      && (slot.borderRadius ?? 0) >= 0
      && (slot.borderRadius ?? 0) <= Math.min(slot.width, slot.height) / 2
    ))
    if (!slotsValid) {
      throw new Error('Area foto harus berada di dalam kanvas frame.')
    }

    const bitmap = await createImageBitmap(input.imageBlob)
    let imageBlob: Blob
    try {
      imageBlob = await createFrameOverlay(bitmap, input.customSlots)
    } finally {
      bitmap.close()
    }

    const frames = await this.list()
    const duplicate = frames.some(
      (frame) => frame.name.toLowerCase() === input.name.trim().toLowerCase(),
    )

    if (duplicate) {
      throw new Error('Nama frame sudah digunakan.')
    }

    const now = new Date().toISOString()
    const frame: PhotoFrame = {
      id: crypto.randomUUID(),
      name: input.name.trim(),
      description: 'Frame buatan operator.',
      kind: 'uploaded',
      layoutId: 'full',
      customSlots: input.customSlots.map((slot) => ({ ...slot })),
      orientation: 'portrait',
      accent: '#ff5a36',
      accentSoft: '#ffe5db',
      imageBlob,
      isActive: input.isActive,
      isDefault: frames.length === 0,
      sortOrder: frames.length,
      createdAt: now,
      updatedAt: now,
    }

    await this.repository.save(frame)
    return frame
  }

  async setActive(frame: PhotoFrame, isActive: boolean): Promise<void> {
    if (!isActive) {
      const activeFrames = await this.listActive()
      if (activeFrames.length === 1 && activeFrames[0]?.id === frame.id) {
        throw new Error('Minimal satu frame harus tetap aktif.')
      }
    }

    await this.repository.save({
      ...frame,
      isActive,
      updatedAt: new Date().toISOString(),
    })
  }

  async setDefault(frame: PhotoFrame): Promise<void> {
    const frames = await this.list()
    await Promise.all(
      frames.map((item) =>
        this.repository.save({
          ...item,
          isDefault: item.id === frame.id,
          isActive: item.id === frame.id ? true : item.isActive,
          updatedAt: new Date().toISOString(),
        }),
      ),
    )
  }

  async remove(frame: PhotoFrame): Promise<void> {
    if (frame.kind === 'preset') {
      throw new Error('Frame bawaan tidak dapat dihapus.')
    }

    const activeFrames = await this.listActive()
    if (frame.isActive && activeFrames.length === 1) {
      throw new Error('Aktifkan frame lain sebelum menghapus frame ini.')
    }

    await this.repository.remove(frame.id)
  }
}
