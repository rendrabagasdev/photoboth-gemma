export interface TokenServices {
  generate(): Promise<string>
  verify(token: string): Promise<boolean>
}
