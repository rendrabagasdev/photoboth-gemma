export type ShareUpload = {
  photo: Blob
  live: Blob
}

export type SharedResult = {
  id: string
  downloadUrl: string
  expiresAt: string
  destroyToken: string
}

export interface ShareService {
  publish(sessionId: string, upload: ShareUpload): Promise<SharedResult>
  destroy(id: string, destroyToken: string): Promise<void>
}
