import type { PinProvider } from '../ports/pin-provider'
import type { TokenServices } from '../ports/token-services'
import { InvalidPinError } from '../errors/invalid-pin-error'

export class UnlockApp {
  private readonly pinProvider: PinProvider
  private readonly tokenService: TokenServices

  constructor(pinProvider: PinProvider, tokenService: TokenServices) {
    this.pinProvider = pinProvider
    this.tokenService = tokenService
  }

  async execute(inputPin: string): Promise<string> {
    const correctPin = this.pinProvider.getPin()

    if (inputPin !== correctPin) {
      throw new InvalidPinError()
    }

    return this.tokenService.generate()
  }
}
