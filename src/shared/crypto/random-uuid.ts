function fallbackRandomBytes(): Uint8Array {
  const bytes = new Uint8Array(16)
  const cryptoApi = globalThis.crypto
  if (typeof cryptoApi?.getRandomValues === 'function') {
    cryptoApi.getRandomValues(bytes)
    return bytes
  }

  // ID ini hanya dipakai untuk identitas lokal/idempotency, bukan token rahasia.
  // Fallback terakhir menjaga aplikasi tetap berjalan pada WebView sangat lama.
  let seed = Date.now() ^ Math.floor((globalThis.performance?.now() ?? 0) * 1_000)
  for (let index = 0; index < bytes.length; index += 1) {
    seed = (seed * 1_664_525 + 1_013_904_223) >>> 0
    bytes[index] = (seed >>> 16) ^ Math.floor(Math.random() * 256)
  }
  return bytes
}

export function createUuid(): string {
  const cryptoApi = globalThis.crypto
  if (typeof cryptoApi?.randomUUID === 'function') return cryptoApi.randomUUID()

  const bytes = fallbackRandomBytes()
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, '0'))
  return [
    hex.slice(0, 4).join(''),
    hex.slice(4, 6).join(''),
    hex.slice(6, 8).join(''),
    hex.slice(8, 10).join(''),
    hex.slice(10, 16).join(''),
  ].join('-')
}
