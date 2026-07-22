import type { FrameRepository } from './frame-repository'
import { defaultFrames, type PhotoFrame } from '../domain/photo-frame'

export type AddFrameInput = {
  name: string
  imageBlob: Blob
  isActive: boolean
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
      throw new Error('Frame harus berupa file PNG transparan.')
    }

    if (input.imageBlob.size > 10 * 1024 * 1024) {
      throw new Error('Ukuran frame maksimal 10 MB.')
    }

    const bitmap = await createImageBitmap(input.imageBlob)
    const ratio = bitmap.width / bitmap.height
    bitmap.close()

    if (Math.abs(ratio - 2 / 3) > 0.01) {
      throw new Error('Template penuh harus berukuran 4R portrait, yaitu 1200 × 1800 px.')
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
      orientation: 'portrait',
      accent: '#ff5a36',
      accentSoft: '#ffe5db',
      imageBlob: input.imageBlob,
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
