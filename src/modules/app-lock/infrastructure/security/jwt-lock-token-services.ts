import type { TokenServices } from '../../application/ports/token-services'

export class JwtLockTokenServices implements TokenServices {
  private readonly token: string

  constructor(token: string) {
    this.token = token
  }

  async generate(): Promise<string> {
    return this.token
  }

  async verify(token: string): Promise<boolean> {
    return token === this.token
  }
}
