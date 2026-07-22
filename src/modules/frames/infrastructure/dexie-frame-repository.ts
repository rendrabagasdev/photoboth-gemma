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
    const count = await this.database.frames.count()
    if (count === 0) {
      await this.database.frames.bulkPut(frames)
    }
  }
}
