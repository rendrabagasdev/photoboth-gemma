import type { FrameRepository } from '../application/frame-repository'
import type { PhotoFrame } from '../domain/photo-frame'
import type { BoothDatabase } from '../../../shared/infrastructure/booth-database'

export class DexieFrameRepository implements FrameRepository {
  private readonly database: BoothDatabase

  constructor(database: BoothDatabase) {
    this.database = database
  }

  list(): Promise<PhotoFrame[]> {
    return this.database.frames.toArray()
  }

  async save(frame: PhotoFrame): Promise<void> {
    await this.database.frames.put(frame)
  }

  async remove(id: string): Promise<void> {
    await this.database.frames.delete(id)
  }

  async seed(frames: PhotoFrame[]): Promise<void> {
    const existingFrames = await this.database.frames.toArray()
    const existingById = new Map(existingFrames.map((frame) => [frame.id, frame]))
    const presetIds = new Set(frames.map((frame) => frame.id))
    const hasSurvivingDefault = existingFrames.some((frame) => (
      frame.isDefault && (frame.kind === 'uploaded' || presetIds.has(frame.id))
    ))
    const stalePresetIds = existingFrames
      .filter((frame) => frame.kind === 'preset' && !presetIds.has(frame.id))
      .map((frame) => frame.id)
    const presetFrames = frames.map((frame) => {
      const existing = existingById.get(frame.id)
      if (!existing) return frame
      return {
        ...frame,
        ...existing,
        kind: 'preset' as const,
        presetStyle: frame.presetStyle,
        layoutId: frame.layoutId,
        isDefault: existing.isDefault || (!hasSurvivingDefault && frame.isDefault),
        sortOrder: frame.sortOrder,
      }
    })
    await this.database.transaction('rw', this.database.frames, async () => {
      if (stalePresetIds.length) await this.database.frames.bulkDelete(stalePresetIds)
      await this.database.frames.bulkPut(presetFrames)
    })
  }
}
