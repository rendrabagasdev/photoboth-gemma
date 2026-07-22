import type { PinProvider } from '../../application/ports/pin-provider'

export class EnvPinProvider implements PinProvider {
  private readonly pin: string

  constructor(pin: string) {
    this.pin = pin
  }

  getPin(): string {
    return this.pin
  }
}
