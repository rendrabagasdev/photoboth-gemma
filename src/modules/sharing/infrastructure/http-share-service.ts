import type { ShareService, SharedResult, ShareUpload } from '../application/share-service'

export class HttpShareService implements ShareService {
  private readonly baseUrl: string

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl
  }

  async publish(sessionId: string, upload: ShareUpload): Promise<SharedResult> {
    const form = new FormData()
    form.append('sessionId', sessionId)
    form.append('photo', upload.photo, `tobfest-${sessionId.slice(0, 8)}.jpg`)
    const extension = upload.live.type.includes('mp4') ? 'mp4' : 'webm'
    form.append('live', upload.live, `tobfest-live-${sessionId.slice(0, 8)}.${extension}`)

    const response = await fetch(`${this.baseUrl}/api/shares`, { method: 'POST', body: form })
    if (!response.ok) throw new Error('QR gagal dibuat.')
    return response.json() as Promise<SharedResult>
  }

  async destroy(id: string, destroyToken: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/shares/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { 'x-share-token': destroyToken },
    })
    if (!response.ok && response.status !== 404) throw new Error('Hasil gagal dihapus.')
  }
}
