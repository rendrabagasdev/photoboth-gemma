import type { PhotoFrame } from '../domain/photo-frame'

export interface FrameRepository {
  list(): Promise<PhotoFrame[]>
  save(frame: PhotoFrame): Promise<void>
  remove(id: string): Promise<void>
  seed(frames: PhotoFrame[]): Promise<void>
}
