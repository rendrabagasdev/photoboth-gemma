import Dexie, { type Table } from 'dexie'
import type { PhotoFrame } from '../../modules/frames/domain/photo-frame'
import type { BoothSession } from '../../modules/sessions/domain/booth-session'

export class BoothDatabase extends Dexie {
  frames!: Table<PhotoFrame, string>
  sessions!: Table<BoothSession, string>

  constructor() {
    super('tobfest-photobooth')
    this.version(1).stores({
      frames: 'id, isActive, isDefault, sortOrder, createdAt',
      sessions: 'id, status, createdAt, completedAt',
    })
  }
}
