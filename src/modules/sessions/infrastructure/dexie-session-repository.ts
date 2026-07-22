import type { SessionRepository } from '../application/session-repository'
import type { BoothSession } from '../domain/booth-session'
import type { BoothDatabase } from '../../../shared/infrastructure/booth-database'

export class DexieSessionRepository implements SessionRepository {
  private readonly database: BoothDatabase

  constructor(database: BoothDatabase) {
    this.database = database
  }

  async save(session: BoothSession): Promise<void> {
    await this.database.sessions.put(session)
  }

  async recent(limit: number): Promise<BoothSession[]> {
    return this.database.sessions.orderBy('createdAt').reverse().limit(limit).toArray()
  }

  async clearCompleted(): Promise<void> {
    const completed = await this.database.sessions
      .filter((session) => session.status === 'completed' || session.status === 'cancelled')
      .primaryKeys()
    await this.database.sessions.bulkDelete(completed)
  }
}
