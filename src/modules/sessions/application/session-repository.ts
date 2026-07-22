import type { BoothSession } from '../domain/booth-session'

export interface SessionRepository {
  save(session: BoothSession): Promise<void>
  recent(limit: number): Promise<BoothSession[]>
  clearCompleted(): Promise<void>
}
