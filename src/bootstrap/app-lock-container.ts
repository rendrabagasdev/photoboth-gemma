import { env } from '../config/env'
import { UnlockApp } from '../modules/app-lock/application/use-cases/unlock-app'
import { EnvPinProvider } from '../modules/app-lock/infrastructure/config/env-pin-provider'
import { JwtLockTokenServices } from '../modules/app-lock/infrastructure/security/jwt-lock-token-services'

const tokenService = new JwtLockTokenServices(env.appLock.token)

export const appLockContainer = {
  unlockApp: new UnlockApp(new EnvPinProvider(env.appLock.pin), tokenService),
  tokenService,
}
