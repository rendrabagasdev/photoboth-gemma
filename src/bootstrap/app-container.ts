import { BoothDatabase } from '../shared/infrastructure/booth-database'
import { DexieFrameRepository } from '../modules/frames/infrastructure/dexie-frame-repository'
import { FrameService } from '../modules/frames/application/frame-service'
import { DexieSessionRepository } from '../modules/sessions/infrastructure/dexie-session-repository'
import { SessionService } from '../modules/sessions/application/session-service'
import { appLockContainer } from './app-lock-container'

const database = new BoothDatabase()

export const appContainer = {
  frameService: new FrameService(new DexieFrameRepository(database)),
  sessionService: new SessionService(new DexieSessionRepository(database)),
  unlockApp: appLockContainer.unlockApp,
  tokenService: appLockContainer.tokenService,
}

export type AppContainer = typeof appContainer
