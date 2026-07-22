import type { SessionRepository } from './session-repository'
import { createBoothSession, type BoothSession } from '../domain/booth-session'

export class SessionService {
  private readonly repository: SessionRepository

  constructor(repository: SessionRepository) {
    this.repository = repository
  }

  async start(): Promise<BoothSession> {
    const session = createBoothSession()
    await this.repository.save(session)
    return session
  }

  async save(session: BoothSession): Promise<void> {
    await this.repository.save(session)
  }

  recent(limit = 12): Promise<BoothSession[]> {
    return this.repository.recent(limit)
  }

  clearCompleted(): Promise<void> {
    return this.repository.clearCompleted()
  }
}
