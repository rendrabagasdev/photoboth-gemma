export class InvalidPinError extends Error {
  constructor() {
    super('PIN salah. Silakan coba lagi.')
    this.name = 'InvalidPinError'
  }
}
